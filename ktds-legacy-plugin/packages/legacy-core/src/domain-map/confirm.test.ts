import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAutoPlan,
  renameDomain,
  mergeDomains,
  moveRoot,
  excludeDomain,
  groupDomains,
  ungroupDomains,
  splitDomain,
  detectPlanDrift,
  planTable,
  parsePlanOps,
  applyOps,
  writeConfirmedPlan,
  readConfirmedPlan,
} from './confirm.js'
import { stableJson } from './persist.js'
import type { CandidatesReport, ConfirmedPlan } from './types.js'

/** 두 도메인(user/order) + 공용/모호/미해소를 갖는 합성 후보 보고. */
function sampleCandidates(): CandidatesReport {
  return {
    schemaVersion: 1,
    gitCommit: 'abc123',
    directoryDegenerate: null,
    candidates: [
      {
        key: 'order',
        roots: ['src/order/OrderController.java'],
        entryCount: 2,
        files: [{ relPath: 'src/order/OrderService.java', via: 'reachability' }],
      },
      {
        key: 'user',
        roots: ['src/user/UserController.java'],
        entryCount: 1,
        files: [{ relPath: 'src/user/UserService.java', via: 'reachability' }],
      },
    ],
    common: [],
    ambiguous: [],
    unresolved: [],
  }
}

describe('confirm — buildAutoPlan', () => {
  it('accepts candidates as-is; name defaults to key, aliasKeys empty', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(plan.decidedBy).toBe('auto')
    expect(plan.gitCommit).toBe('abc123')
    expect(plan.excludedKeys).toEqual([])
    expect(plan.domains.map((d) => d.key)).toEqual(['order', 'user'])
    for (const d of plan.domains) {
      expect(d.name).toBe(d.key)
      expect(d.aliasKeys).toEqual([])
    }
  })

  it('honors an explicit decidedBy', () => {
    const plan = buildAutoPlan(sampleCandidates(), 'jk@example.com')
    expect(plan.decidedBy).toBe('jk@example.com')
  })
})

describe('confirm — pure operations are immutable (new objects, key unchanged)', () => {
  it('renameDomain changes name only, keeps key, returns a new object', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = renameDomain(plan, 'user', 'Accounts')
    expect(next).not.toBe(plan)
    expect(plan.domains.find((d) => d.key === 'user')!.name).toBe('user') // 원본 불변
    const renamed = next.domains.find((d) => d.key === 'user')!
    expect(renamed.key).toBe('user')
    expect(renamed.name).toBe('Accounts')
  })

  it('renameDomain throws on unknown key', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(() => renameDomain(plan, 'nope', 'X')).toThrow(/unknown domain key/)
  })

  it('mergeDomains absorbs roots and records fromKey in aliasKeys', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = mergeDomains(plan, 'user', 'order')
    expect(next).not.toBe(plan)
    expect(plan.domains.map((d) => d.key)).toEqual(['order', 'user']) // 원본 불변
    expect(next.domains.map((d) => d.key)).toEqual(['order'])
    const order = next.domains[0]
    expect(order.roots).toEqual([
      'src/order/OrderController.java',
      'src/user/UserController.java',
    ])
    expect(order.aliasKeys).toEqual(['user'])
  })

  it('mergeDomains rejects self-merge and unknown keys', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(() => mergeDomains(plan, 'user', 'user')).toThrow(/itself/)
    expect(() => mergeDomains(plan, 'user', 'nope')).toThrow(/unknown domain key/)
  })

  it('moveRoot transfers a root to another domain (sorted)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = moveRoot(plan, 'src/user/UserController.java', 'order')
    expect(next).not.toBe(plan)
    expect(next.domains.find((d) => d.key === 'order')!.roots).toEqual([
      'src/order/OrderController.java',
      'src/user/UserController.java',
    ])
    // user 도메인은 마지막 루트가 빠져 사라진다.
    expect(next.domains.find((d) => d.key === 'user')).toBeUndefined()
  })

  it('excludeDomain removes the domain and records key in excludedKeys (sorted)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = excludeDomain(plan, 'user')
    expect(next).not.toBe(plan)
    expect(plan.excludedKeys).toEqual([]) // 원본 불변
    expect(next.domains.map((d) => d.key)).toEqual(['order'])
    expect(next.excludedKeys).toEqual(['user'])
  })
})

describe('confirm — detectPlanDrift', () => {
  it('detects added and removed roots vs fresh candidates (sorted)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const fresh = sampleCandidates()
    // order 루트 삭제(제거됨), 새 payment 후보 추가(추가됨).
    fresh.candidates = [
      {
        key: 'user',
        roots: ['src/user/UserController.java'],
        entryCount: 1,
        files: [],
      },
      {
        key: 'payment',
        roots: ['src/payment/PaymentController.java'],
        entryCount: 1,
        files: [],
      },
    ]
    const drift = detectPlanDrift(plan, fresh)
    expect(drift.removedRoots).toEqual(['src/order/OrderController.java'])
    expect(drift.addedRoots).toEqual(['src/payment/PaymentController.java'])
  })
})

describe('confirm — planTable returns deterministic data rows', () => {
  it('rows from candidates carry entryCount and fileCount (sorted by key)', () => {
    const rows = planTable(sampleCandidates())
    expect(rows).toEqual([
      { key: 'order', name: 'order', rootCount: 1, entryCount: 2, fileCount: 2 },
      { key: 'user', name: 'user', rootCount: 1, entryCount: 1, fileCount: 2 },
    ])
  })

  it('rows from a plan reflect renamed display names', () => {
    const plan = renameDomain(buildAutoPlan(sampleCandidates()), 'user', 'Accounts')
    const rows = planTable(plan)
    expect(rows.find((r) => r.key === 'user')!.name).toBe('Accounts')
  })
})

describe('confirm — write/read round-trip is stable', () => {
  it('writeConfirmedPlan then readConfirmedPlan returns equal plan; null if absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'confirm-'))
    try {
      expect(readConfirmedPlan(dir)).toBeNull()
      const plan: ConfirmedPlan = buildAutoPlan(sampleCandidates(), 'tester')
      const path = writeConfirmedPlan(dir, plan)
      expect(path).toMatch(/domain-plan\.confirmed\.json$/)
      const read = readConfirmedPlan(dir)
      expect(read).not.toBeNull()
      expect(stableJson(read)).toBe(stableJson(plan))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('confirm — parsePlanOps/applyOps (사람 게이트 보정 연산)', () => {
  it('merge/move/exclude/rename 을 순차 적용한다', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const ops = parsePlanOps([
      { op: 'merge', from: 'user', into: 'order' },
      { op: 'rename', key: 'order', name: '주문' },
    ])
    const next = applyOps(plan, ops)
    expect(next.domains.map((d) => d.key)).toEqual(['order'])
    expect(next.domains[0].name).toBe('주문')
    expect(next.domains[0].aliasKeys).toEqual(['user'])
    expect(next.domains[0].roots).toContain('src/user/UserController.java')
  })

  it('exclude 는 excludedKeys 에 감사 추적을 남긴다', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = applyOps(plan, [{ op: 'exclude', key: 'user' }])
    expect(next.domains.map((d) => d.key)).toEqual(['order'])
    expect(next.excludedKeys).toEqual(['user'])
  })

  it('형식 오류는 어떤 항목이 틀렸는지 식별 가능한 오류를 던진다', () => {
    expect(() => parsePlanOps([{ op: 'merge', from: 'a' }])).toThrow(/ops 형식 오류/)
    expect(() => parsePlanOps({ op: 'exclude', key: 'x' })).toThrow(/ops 형식 오류/)
  })

  it('존재하지 않는 key 는 몇 번째 연산인지 포함해 실패한다', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(() => applyOps(plan, [{ op: 'exclude', key: 'ghost' }])).toThrow(/ops\[0\] exclude/)
  })

  it('applyOps 는 입력 플랜을 변형하지 않는다(불변)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const before = stableJson(plan)
    applyOps(plan, [{ op: 'merge', from: 'user', into: 'order' }])
    expect(stableJson(plan)).toBe(before)
  })
})

describe('confirm — group/ungroup (DOMAIN_HIERARCHY)', () => {
  /** user/order 2도메인 플랜 위에 g:biz(user) 그룹을 얹은 시작점. */
  function groupedPlan(): ConfirmedPlan {
    return groupDomains(buildAutoPlan(sampleCandidates()), 'g:biz', '업무', ['user'])
  }

  it('group 은 정렬된 groups 필드를 만든다(key 순·memberKeys 사전순)', () => {
    const plan = groupDomains(buildAutoPlan(sampleCandidates()), 'g:biz', '업무', [
      'user',
      'order',
    ])
    expect(plan.groups).toEqual([{ key: 'g:biz', name: '업무', memberKeys: ['order', 'user'] }])
  })

  it('같은 op 재적용은 멱등이다(byte-identical)', () => {
    const once = groupDomains(buildAutoPlan(sampleCandidates()), 'g:biz', '업무', ['user'])
    const twice = groupDomains(once, 'g:biz', '업무', ['user'])
    expect(stableJson(twice)).toBe(stableJson(once))
  })

  it('재호출은 members 합집합 + name 갱신(upsert)', () => {
    const next = groupDomains(groupedPlan(), 'g:biz', '핵심 업무', ['order'])
    expect(next.groups).toEqual([
      { key: 'g:biz', name: '핵심 업무', memberKeys: ['order', 'user'] },
    ])
  })

  it('g: 접두 없는 키·미존재 member·빈 members 는 거부한다', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(() => groupDomains(plan, 'biz', '업무', ['user'])).toThrow(/must start with "g:"/)
    expect(() => groupDomains(plan, 'g:biz', '업무', ['ghost'])).toThrow(/unknown domain key/)
    expect(() => groupDomains(plan, 'g:biz', '업무', [])).toThrow(/at least one member/)
  })

  it('다른 그룹 소속 member 는 거부한다(한 도메인 최대 1그룹)', () => {
    expect(() => groupDomains(groupedPlan(), 'g:etc', '기타', ['user'])).toThrow(
      /already belongs to group "g:biz"/,
    )
  })

  it('ungroup 은 그룹만 없애고 도메인은 잔존, 마지막 그룹이면 필드를 생략한다', () => {
    const next = ungroupDomains(groupedPlan(), 'g:biz')
    expect(next.domains.map((d) => d.key)).toEqual(['order', 'user'])
    expect('groups' in next).toBe(false)
    expect(stableJson(next)).toBe(stableJson(buildAutoPlan(sampleCandidates())))
    expect(() => ungroupDomains(next, 'g:biz')).toThrow(/unknown group key/)
  })

  it('exclude 로 마지막 member 가 죽으면 그룹도 삭제된다(빈 그룹 금지)', () => {
    const next = excludeDomain(groupedPlan(), 'user')
    expect('groups' in next).toBe(false)
  })

  it('merge 로 사라진 from key 는 그룹에서 이탈한다', () => {
    const plan = groupDomains(groupedPlan(), 'g:biz', '업무', ['order'])
    const next = mergeDomains(plan, 'user', 'order')
    expect(next.groups).toEqual([{ key: 'g:biz', name: '업무', memberKeys: ['order'] }])
  })

  it('applyOps group/ungroup + parsePlanOps 형식 게이트', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const ops = parsePlanOps([
      { op: 'group', key: 'g:biz', name: '업무', members: ['user', 'order'] },
    ])
    const next = applyOps(plan, ops)
    expect(next.groups?.[0].memberKeys).toEqual(['order', 'user'])
    expect(() => parsePlanOps([{ op: 'group', key: 'g:x', name: 'x', members: [] }])).toThrow(
      /ops 형식 오류/,
    )
    expect(() => applyOps(next, [{ op: 'ungroup', key: 'g:ghost' }])).toThrow(
      /ops\[0\] ungroup/,
    )
  })

  it('groups 는 영속 round-trip 에서 보존되고, 없는 플랜은 그대로 유효하다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'confirm-groups-'))
    try {
      writeConfirmedPlan(dir, groupedPlan())
      const read = readConfirmedPlan(dir)
      expect(read?.groups).toEqual([{ key: 'g:biz', name: '업무', memberKeys: ['user'] }])
      writeConfirmedPlan(dir, buildAutoPlan(sampleCandidates()))
      expect('groups' in (readConfirmedPlan(dir) ?? {})).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/** egov 실측 형태의 3단 도메인 — uss/{ion,olh}/…/web/*Controller.java + 직속 루트. */
function deepPlan(): ConfirmedPlan {
  return {
    schemaVersion: 1,
    gitCommit: 'abc123',
    decidedBy: 'tester',
    domains: [
      {
        key: 'uss',
        name: '사용자지원',
        roots: [
          'src/egovframework/com/uss/ion/nts/web/NoticeController.java',
          'src/egovframework/com/uss/ion/wik/web/WikiController.java',
          'src/egovframework/com/uss/olh/faq/web/FaqController.java',
        ],
        aliasKeys: [],
      },
    ],
    excludedKeys: [],
  }
}

describe('confirm — splitDomain (자동 분류기가 굵게 잡은 경계 내리기)', () => {
  it('공통 prefix 아래 첫 분기 토큰으로 한 단계만 쪼갠다', () => {
    const next = splitDomain(deepPlan(), 'uss')
    expect(next.domains.map((d) => d.key)).toEqual(['uss.ion', 'uss.olh'])
    // 한 단계만 — ion 은 nts/wik 로 더 갈라지지 않고 통째로 남는다.
    expect(next.domains.find((d) => d.key === 'uss.ion')?.roots).toEqual([
      'src/egovframework/com/uss/ion/nts/web/NoticeController.java',
      'src/egovframework/com/uss/ion/wik/web/WikiController.java',
    ])
  })

  it('반복 적용으로 다음 단계를 내린다(깊이는 도메인마다 사람이 고른다)', () => {
    const next = splitDomain(splitDomain(deepPlan(), 'uss'), 'uss.ion')
    expect(next.domains.map((d) => d.key)).toEqual(['uss.ion.nts', 'uss.ion.wik', 'uss.olh'])
  })

  it('자식은 부모 key 를 alias 로 물려받지 않는다(skeleton alias 사상 모호성 차단)', () => {
    const next = splitDomain(deepPlan(), 'uss')
    expect(next.domains.every((d) => d.aliasKeys.length === 0)).toBe(true)
  })

  it('계층 디렉터리는 도메인이 되지 않고 부모 직속으로 남는다', () => {
    const plan = deepPlan()
    plan.domains[0].roots = [...plan.domains[0].roots, 'src/egovframework/com/uss/web/IndexController.java']
    const next = splitDomain(plan, 'uss')
    expect(next.domains.map((d) => d.key)).toEqual(['uss', 'uss.ion', 'uss.olh'])
    // 부모는 직속 루트만 남기고 생존 — web/ 이 uss.web 이 되지 않는다.
    expect(next.domains.find((d) => d.key === 'uss')?.roots).toEqual([
      'src/egovframework/com/uss/web/IndexController.java',
    ])
  })

  it('쪼갤 분기가 없으면 조용히 통과하지 않고 이유를 던진다', () => {
    const plan = deepPlan()
    plan.domains[0].roots = ['src/egovframework/com/cmm/web/A.java', 'src/egovframework/com/cmm/web/B.java']
    expect(() => splitDomain(plan, 'uss')).toThrow(/분할할 수 없습니다/)
  })

  it('갈라지지 않는 통과 세그먼트는 건너뛴다(egov ssi/syi 형태 — 자식 1개짜리 층 방지)', () => {
    const plan = deepPlan()
    plan.domains[0].roots = [
      'src/egovframework/com/ssi/syi/iis/web/A.java',
      'src/egovframework/com/ssi/syi/ims/web/B.java',
    ]
    // 공통 prefix 가 syi 까지 내려가므로 ssi.syi 라는 무의미한 1자식 층이 생기지 않고
    // 바로 분기 지점(iis/ims)에서 갈린다 — split 을 두 번 부를 필요가 없다.
    expect(splitDomain(plan, 'uss').domains.map((d) => d.key)).toEqual(['uss.iis', 'uss.ims'])
  })

  it('없는 key 는 오류', () => {
    expect(() => splitDomain(deepPlan(), 'nope')).toThrow(/unknown domain key/)
  })

  it('부모가 속한 상단도메인은 자식들이 승계한다', () => {
    const plan = groupDomains(deepPlan(), 'g:biz', '업무', ['uss'])
    const next = splitDomain(plan, 'uss')
    expect(next.groups).toEqual([{ key: 'g:biz', name: '업무', memberKeys: ['uss.ion', 'uss.olh'] }])
  })

  it('applyOps 로 ops 파일에서 재생된다(결정론 닻)', () => {
    const ops = parsePlanOps([{ op: 'split', key: 'uss' }, { op: 'rename', key: 'uss.ion', name: '통합게시' }])
    const next = applyOps(deepPlan(), ops)
    expect(next.domains.find((d) => d.key === 'uss.ion')?.name).toBe('통합게시')
  })
})
