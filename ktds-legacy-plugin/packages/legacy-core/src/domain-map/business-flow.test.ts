import { describe, it, expect } from 'vitest'
import {
  applyFills,
  BusinessFlowSchema,
  DomainFillSchema,
  validateBusinessFlow,
  type BusinessFlow,
  type DomainFill,
} from './fill.js'
import { verifyFills } from './verify.js'
import { embedVerification } from './emit.js'
import { SKELETON_BLANK, type SkeletonReport } from './types.js'

// P4(WORK_MAP §5) — businessFlow: 스키마 인용 의무, 그래프 정합 검증, 부분 수용
// (실패 시 businessFlow 만 기각), verify 항목화, embed 장식(verdict/citations).

function skeleton(): SkeletonReport {
  return {
    schemaVersion: 1,
    gitCommit: null,
    stepCap: 8,
    nodes: [
      {
        id: 'domain:order',
        type: 'domain',
        name: 'order',
        summary: SKELETON_BLANK,
        tags: ['order'],
        complexity: 'simple',
        domainMeta: {},
      },
      {
        id: 'flow:POST /orders',
        type: 'flow',
        name: SKELETON_BLANK,
        summary: SKELETON_BLANK,
        tags: ['order'],
        complexity: 'simple',
        filePath: 'a/OrderCtrl.java',
        lineRange: [7, 7],
        domainMeta: { entryPoint: 'POST /orders', entryType: 'http' },
      },
      {
        id: 'flow:GET /members',
        type: 'flow',
        name: SKELETON_BLANK,
        summary: SKELETON_BLANK,
        tags: ['member'],
        complexity: 'simple',
        domainMeta: { entryPoint: 'GET /members', entryType: 'http' },
      },
    ],
    edges: [],
    stepSources: [],
    truncatedSteps: [],
  }
}

const CITE = { filePath: 'a/OrderCtrl.java', line: 7, snippet: 'public class OrderCtrl' }

function bf(): BusinessFlow {
  return {
    nodes: [
      { id: 's', kind: 'start', label: '시작' },
      { id: 'a1', kind: 'activity', label: '주문 접수', flowRef: 'flow:POST /orders', citations: [CITE] },
      { id: 'd1', kind: 'decision', label: '재고 있음?', citations: [CITE] },
      { id: 'e', kind: 'end', label: '종료' },
    ],
    edges: [
      { from: 's', to: 'a1' },
      { from: 'a1', to: 'd1' },
      { from: 'd1', to: 'e', label: 'YES' },
      { from: 'd1', to: 'a1', label: 'NO' },
    ],
  }
}

function orderFill(businessFlow?: BusinessFlow): DomainFill {
  return {
    schemaVersion: 1,
    domainId: 'domain:order',
    name: '주문',
    summary: { text: '주문 생성과 조회를 담당한다.', citations: [CITE] },
    entities: [],
    businessRules: [],
    crossDomainInteractions: [],
    flows: [],
    steps: [],
    ...(businessFlow ? { businessFlow } : {}),
  }
}

describe('businessFlow — 스키마(인용 의무)', () => {
  it('activity/decision 은 citations min 1, start/end 는 면제', () => {
    expect(() => BusinessFlowSchema.parse(bf())).not.toThrow()
    const noCite = bf()
    noCite.nodes[1] = { id: 'a1', kind: 'activity', label: '주문 접수' }
    expect(() => BusinessFlowSchema.parse(noCite)).toThrow()
  })

  it('DomainFillSchema: businessFlow 는 선택 — 없어도(v1 fill) 통과', () => {
    expect(() => DomainFillSchema.parse(orderFill())).not.toThrow()
    expect(() => DomainFillSchema.parse(orderFill(bf()))).not.toThrow()
  })
})

describe('businessFlow — 그래프 정합 검증', () => {
  const FLOWS = new Set(['flow:POST /orders'])

  it('정합 그래프는 위반 0건', () => {
    expect(validateBusinessFlow(bf(), FLOWS)).toEqual([])
  })

  it('중복 id·고아 노드·미실존 엣지 끝점·start/end 부재·유령 flowRef 를 전부 보고', () => {
    const bad: BusinessFlow = {
      nodes: [
        { id: 'a', kind: 'activity', label: '중복', citations: [CITE] },
        { id: 'a', kind: 'activity', label: '중복2', citations: [CITE] },
        { id: 'orphan', kind: 'activity', label: '고아', flowRef: 'flow:GET /ghost', citations: [CITE] },
      ],
      edges: [{ from: 'a', to: 'nowhere' }],
    }
    const errors = validateBusinessFlow(bad, FLOWS)
    expect(errors).toContain('duplicate-node-id: a')
    expect(errors).toContain('orphan-node: orphan')
    expect(errors).toContain('edge-to-unknown: nowhere')
    expect(errors).toContain('no-start-node')
    expect(errors).toContain('no-end-node')
    expect(errors).toContain('flowRef-unknown: orphan → flow:GET /ghost')
  })

  it('flowRef 는 도메인 밖 실존 flow 도 거부(도메인 스코프)', () => {
    const cross = bf()
    cross.nodes[1] = { ...cross.nodes[1], flowRef: 'flow:GET /members' }
    expect(validateBusinessFlow(cross, FLOWS)).toContain(
      'flowRef-unknown: a1 → flow:GET /members',
    )
  })

  it('decision 은 나가는 엣지 2+ 필수 — 분기 없는 판단 기각(리뷰 C1)', () => {
    const noBranch = bf()
    // d1 의 NO 분기 제거 → outgoing 1개
    noBranch.edges = noBranch.edges.filter((e) => !(e.from === 'd1' && e.to === 'a1'))
    expect(validateBusinessFlow(noBranch, FLOWS)).toContain(
      'decision-needs-branches: d1 (outgoing 1)',
    )
  })

  it('decision 의 나가는 엣지는 분기 라벨 필수(리뷰 C7)', () => {
    const unlabeled = bf()
    unlabeled.edges = unlabeled.edges.map((e) =>
      e.from === 'd1' && e.to === 'e' ? { from: e.from, to: e.to } : e,
    )
    expect(validateBusinessFlow(unlabeled, FLOWS)).toContain('decision-branch-unlabeled: d1')
  })

  it('사이클(재시도 루프)은 허용 — 정합 그래프로 통과', () => {
    // bf() 자체가 d1 →NO→ a1 루프를 포함하고 위반 0건(위 테스트) — 명문화용 재확인.
    expect(validateBusinessFlow(bf(), FLOWS)).toEqual([])
  })
})

describe('businessFlow — applyFills 부분 수용', () => {
  it('정합 통과 시 domainMeta.businessFlow 병합', () => {
    const { nodes, rejected } = applyFills(skeleton(), [orderFill(bf())])
    expect(rejected).toEqual([])
    const domain = nodes.find((n) => n.id === 'domain:order')!
    const merged = domain.domainMeta?.businessFlow as BusinessFlow
    expect(merged.nodes.map((n) => n.id)).toEqual(['s', 'a1', 'd1', 'e'])
    expect(merged.edges).toHaveLength(4)
  })

  it('정합 실패 시 businessFlow 만 기각 — 도메인 fill 나머지는 적용, 사유 표면화', () => {
    const bad = bf()
    bad.edges = [{ from: 's', to: 'ghost' }, ...bad.edges]
    const { nodes, rejected } = applyFills(skeleton(), [orderFill(bad)])
    expect(rejected).toHaveLength(1)
    expect(rejected[0].ref).toBe('domain:order#businessFlow')
    expect(rejected[0].kind).toBe('businessFlow') // 구조적 kind(리뷰 C5)
    expect(rejected[0].reason).toContain('edge-to-unknown: ghost')
    const domain = nodes.find((n) => n.id === 'domain:order')!
    expect(domain.domainMeta?.businessFlow).toBeUndefined()
    // 기각 사유가 그래프에 실려 대시보드가 "미채움"과 구별한다(리뷰 C2).
    expect(domain.domainMeta?.businessFlowRejected).toContain('edge-to-unknown: ghost')
    expect(domain.name).toBe('주문') // 부분 수용 — 도메인 채움은 유지
  })
})

describe('businessFlow — verify 항목화 + embed 장식', () => {
  it('인용 보유 노드만 businessFlow 항목으로 검증되고, 기각 도메인은 제외된다', async () => {
    const report = await verifyFills('/nonexistent-root', [orderFill(bf())], null)
    const refs = report.domains[0].items.map((i) => i.ref)
    expect(refs).toContain('domain:order#businessFlow[a1]')
    expect(refs).toContain('domain:order#businessFlow[d1]')
    expect(refs).not.toContain('domain:order#businessFlow[s]') // start 는 면제

    const excluded = await verifyFills(
      '/nonexistent-root',
      [orderFill(bf())],
      null,
      new Set(['domain:order']),
    )
    expect(excluded.domains[0].items.map((i) => i.ref)).not.toContain(
      'domain:order#businessFlow[a1]',
    )
  })

  it('embedVerification: bf 노드에 verdict/citations 장식, 카드 지표에서는 businessFlow 제외', async () => {
    const { nodes } = applyFills(skeleton(), [orderFill(bf())])
    // 실파일이 없으므로 전 인용 no-file → NEEDS_REVIEW — 장식 경로 검증엔 충분.
    const report = await verifyFills('/nonexistent-root', [orderFill(bf())], null)
    const embedded = embedVerification(nodes, report)
    const domain = embedded.find((n) => n.id === 'domain:order')!
    const merged = domain.domainMeta?.businessFlow as {
      nodes: Array<{ id: string; verdict?: string; citations?: Array<{ status: string }> }>
    }
    const a1 = merged.nodes.find((n) => n.id === 'a1')!
    expect(a1.verdict).toBe('NEEDS_REVIEW')
    expect(a1.citations?.[0].status).toBe('no-file')
    const start = merged.nodes.find((n) => n.id === 's')!
    expect(start.verdict).toBeUndefined() // 인용 면제 노드는 원본 유지
    // 카드 지표(ktdsClaims)에는 businessFlow 항목이 섞이지 않는다.
    const kinds = (domain.domainMeta?.ktdsClaims as Array<{ kind: string }>).map((c) => c.kind)
    expect(kinds).not.toContain('businessFlow')
  })
})
