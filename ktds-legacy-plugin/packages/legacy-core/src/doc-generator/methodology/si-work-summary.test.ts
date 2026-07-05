/**
 * si-실적요약보고서 빌더 테스트(W6) — 고정 WorkSummaryReport 주입.
 * 검증 축: 하이라이트 고정 문형(수집 사실만) · 커밋 행 근거 승계(머지는 [추정] 강등) ·
 * 진척 행 원장 근거 · null degrade([미확인] ≠ 0) · 근거 게이트(무근거 CONFIRMED 0).
 */
import { describe, it, expect } from 'vitest'
import type { WorkSummaryReport } from '../../work-summary/index.js'
import { enforceEvidence } from '../../evidence/index.js'
import type { DocInput } from '../builders/index.js'
import { buildSiWorkSummary } from './si-standard.js'

const BASE: DocInput = { nodes: [], edges: [] }

function fixtureReport(over?: Partial<WorkSummaryReport>): WorkSummaryReport {
  return {
    schemaVersion: 1,
    gitCommit: 'aaaa000000000000000000000000000000000000',
    range: {
      mode: 'weeks',
      rawArg: '1',
      fromIso: '2026-06-23T12:00:00.000Z',
      toIso: '2026-06-30T12:00:00.000Z',
      anchorSha: 'aaaa000000000000000000000000000000000000',
    },
    commits: [
      {
        sha: 'aaaa000000000000000000000000000000000000',
        dateIso: '2026-06-30T12:00:00Z',
        author: 'tester',
        subject: 'feat: a',
        isMerge: false,
        files: [{ path: 'src/a.java', added: 5, deleted: 1 }],
      },
      {
        sha: 'bbbb100000000000000000000000000000000000',
        dateIso: '2026-06-28T12:00:00Z',
        author: 'tester',
        subject: 'merge topic',
        isMerge: true,
        files: [],
      },
    ],
    totals: {
      commits: 2,
      mergeCommits: 1,
      authors: 1,
      files: 1,
      added: 5,
      deleted: 1,
      generated: { files: 0, added: 0, deleted: 0 },
    },
    modules: [
      { key: 'order', source: 'program-inventory', commits: 1, files: 1, linesChanged: 8, topFiles: ['src/a.java'] },
      { key: 'src', source: 'dir', commits: 1, files: 1, linesChanged: 6, topFiles: ['src/a.java'] },
    ],
    previous: null,
    rtmProgress: {
      functionsConfirmed: 2,
      scenariosConfirmed: 1,
      requirementsConfirmed: 0,
      functionsConfirmedIds: ['FN-a', 'FN-b'],
      scenariosConfirmedIds: ['TS-1'],
      requirementsConfirmedIds: [],
      confirmEvents: 4,
      editEvents: 1,
      auditlessEntities: 0,
      suspectEntities: 0,
      unparsableAt: 0,
    },
    docProgress: { submitted: 1, approved: 1, returned: 0, approvedDocs: ['si-기능명세서'], unparsableAt: 0 },
    meta: {
      gitAvailable: true,
      gitStatus: 'ok',
      prefix: '',
      moduleSource: 'dir',
      generatedPatterns: ['.understand-anything/'],
    },
    ...over,
  }
}

function section(docInput: DocInput, key: string) {
  const doc = buildSiWorkSummary(docInput)
  return doc.sections.find((s) => s.key === key)!
}

describe('buildSiWorkSummary', () => {
  it('workSummary 없음 → 현황 행(실행 안내), 표는 빈 상태(합성 금지)', () => {
    const hl = section(BASE, 'ws-highlight')
    expect(hl.table!.rows).toHaveLength(1)
    expect(hl.table!.rows[0].cells[1]).toContain('understand-report')
    expect(section(BASE, 'ws-commits').table!.rows).toHaveLength(0)
    expect(section(BASE, 'ws-progress').table!.rows).toHaveLength(0)
  })

  it('하이라이트: 수집 수치만 고정 문형에 끼운다(날조 0)', () => {
    const input = { ...BASE, workSummary: fixtureReport() }
    const rows = section(input, 'ws-highlight').table!.rows
    const byKey = new Map(rows.map((r) => [r.cells[0], r.cells[1]]))
    expect(byKey.get('기간')).toContain('최근 1주')
    expect(byKey.get('기간')).toContain('2026-06-23T12:00:00.000Z')
    expect(byKey.get('실적')).toBe('커밋 2건(작성자 1명, 머지 1건), 파일 1개 변경(+5/−1)')
    expect(byKey.get('변경 상위 모듈')).toBe('order(±8), src(±6)')
    expect(byKey.get('RTM 진척')).toBe('추정→확정 전환 3건(기능 2 · 시나리오 1 · 요구사항 0)')
    expect(byKey.get('문서 진척')).toBe('제출 1 · 승인 1 · 반려 0')
  })

  it('커밋 행: 파일 근거 승계 [확정], 머지(파일 근거 없음)는 [추정] 강등', () => {
    const input = { ...BASE, workSummary: fixtureReport() }
    const rows = section(input, 'ws-commits').table!.rows
    expect(rows).toHaveLength(2)
    expect(rows[0].cells[1]).toBe('aaaa0000') // sha 8자.
    expect(rows[0].confidence).toBe('CONFIRMED')
    expect(rows[0].evidence).toEqual([{ file: 'src/a.java', line: null }])
    expect(rows[1].cells[5]).toBe('머지')
    expect(rows[1].confidence).toBe('INFERRED')
    expect(rows[1].evidence).toEqual([])
  })

  it('다주 추이(W6-b): 직전 기간 대비 행 — 증감 파생 계산, previous 없으면 행 없음', () => {
    const noTrend = section({ ...BASE, workSummary: fixtureReport() }, 'ws-highlight')
    expect(noTrend.table!.rows.some((r) => r.cells[0] === '직전 기간 대비')).toBe(false)

    const withTrend = {
      ...BASE,
      workSummary: fixtureReport({
        previous: {
          fromIso: '2026-06-16T12:00:00.000Z',
          toIso: '2026-06-23T12:00:00.000Z',
          totals: {
            commits: 5,
            mergeCommits: 0,
            authors: 1,
            files: 4,
            added: 100,
            deleted: 20,
            generated: { files: 0, added: 0, deleted: 0 },
          },
          rtmProgress: {
            functionsConfirmed: 1,
            scenariosConfirmed: 0,
            requirementsConfirmed: 0,
            functionsConfirmedIds: ['FN-z'],
            scenariosConfirmedIds: [],
            requirementsConfirmedIds: [],
            confirmEvents: 1,
            editEvents: 0,
            auditlessEntities: 0,
            suspectEntities: 0,
            unparsableAt: 0,
          },
          docProgress: { submitted: 0, approved: 0, returned: 0, approvedDocs: [], unparsableAt: 0 },
        },
      }),
    }
    const hl = new Map(section(withTrend, 'ws-highlight').table!.rows.map((r) => [r.cells[0], r.cells[1]]))
    const trend = hl.get('직전 기간 대비')!
    expect(trend).toContain('커밋 5→2(-3)')
    expect(trend).toContain('실적 라인 120→6(-114)')
    expect(trend).toContain('RTM 전환 1→3(+2)')
    expect(trend).toContain('문서 승인 0→1(+1)')
    expect(trend).toContain('(2026-06-16T12:00:00.000Z ~ 2026-06-23T12:00:00.000Z]') // weeks (from,to].
  })

  it('다주 추이: 구버전 산출물(previous 키 부재)은 크래시 없이 행 생략(리뷰 T1)', () => {
    const stale = fixtureReport() as Record<string, unknown>
    delete stale.previous // raw JSON.parse 로드 경로의 구버전 형상 재현.
    const doc = buildSiWorkSummary({ ...BASE, workSummary: stale as never })
    const rows = doc.sections.find((s) => s.key === 'ws-highlight')!.table!.rows
    expect(rows.some((r) => r.cells[0] === '직전 기간 대비')).toBe(false)
  })

  it('다주 추이: 월간은 [from, to) 표기(리뷰 T2)', () => {
    const input = {
      ...BASE,
      workSummary: fixtureReport({
        range: { mode: 'month', rawArg: '2026-06', fromIso: '2026-06-01T00:00:00.000Z', toIso: '2026-07-01T00:00:00.000Z', anchorSha: null },
        previous: {
          fromIso: '2026-05-01T00:00:00.000Z',
          toIso: '2026-06-01T00:00:00.000Z',
          totals: { commits: 1, mergeCommits: 0, authors: 1, files: 1, added: 2, deleted: 0, generated: { files: 0, added: 0, deleted: 0 } },
          rtmProgress: null,
          docProgress: null,
        },
      }),
    }
    const hl = new Map(section(input, 'ws-highlight').table!.rows.map((r) => [r.cells[0], r.cells[1]]))
    expect(hl.get('직전 기간 대비')).toContain('[2026-05-01T00:00:00.000Z ~ 2026-06-01T00:00:00.000Z)')
  })

  it('모듈 행: 도메인 조인 = 파일 근거 승계 [확정], 디렉터리 버킷 = 귀속 자체가 [추정]', () => {
    const input = { ...BASE, workSummary: fixtureReport() }
    const rows = section(input, 'ws-modules').table!.rows
    expect(rows[0].cells[0]).toBe('order')
    expect(rows[0].confidence).toBe('CONFIRMED')
    expect(rows[0].evidence).toEqual([{ file: 'src/a.java', line: null }])
    expect(rows[1].cells[0]).toBe('src')
    expect(rows[1].confidence).toBe('INFERRED') // 파일 근거가 있어도 귀속이 관례 추정.
    expect(rows[1].evidence).toEqual([{ file: 'src/a.java', line: null }])
  })

  it('진척 행: 원장 파일을 근거로 승계(CONFIRMED)', () => {
    const input = { ...BASE, workSummary: fixtureReport() }
    const rows = section(input, 'ws-progress').table!.rows
    const fn = rows.find((r) => r.cells[0] === 'RTM 확정 전환(기능)')!
    expect(fn.cells[1]).toBe('2')
    expect(fn.cells[2]).toContain('FN-a, FN-b') // "무엇이 확정됐나" id 나열(리뷰 C4).
    expect(fn.confidence).toBe('CONFIRMED')
    expect(fn.evidence).toEqual([{ file: '.understand-anything/rtm-overrides.json', line: null }])
    const doc = rows.find((r) => r.cells[0] === '문서 제출/승인/반려')!
    expect(doc.cells[1]).toBe('1/1/0')
    expect(doc.evidence).toEqual([{ file: '.spec/docs/si-기능명세서.state.json', line: null }])
  })

  it('원장 null([미확인]) — 0 과 구분, range 모드는 사유 명시', () => {
    const input = {
      ...BASE,
      workSummary: fixtureReport({
        range: { mode: 'range', rawArg: 'A..B', fromIso: null, toIso: null, anchorSha: null },
        rtmProgress: null,
        docProgress: null,
      }),
    }
    const hl = new Map(section(input, 'ws-highlight').table!.rows.map((r) => [r.cells[0], r.cells[1]]))
    expect(hl.get('RTM 진척')).toContain('[미확인]')
    expect(hl.get('RTM 진척')).toContain('시각 윈도')
    const rows = section(input, 'ws-progress').table!.rows
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.cells[1] === '[미확인]')).toBe(true)
  })

  it('git 불가: 실적 [미확인] + shallow 사유 구분', () => {
    const input = {
      ...BASE,
      workSummary: fixtureReport({
        commits: [],
        totals: {
          commits: 0,
          mergeCommits: 0,
          authors: 0,
          files: 0,
          added: 0,
          deleted: 0,
          generated: { files: 0, added: 0, deleted: 0 },
        },
        modules: [],
        meta: {
          gitAvailable: false,
          gitStatus: 'shallow',
          prefix: '',
          moduleSource: 'dir',
          generatedPatterns: ['.understand-anything/'],
        },
      }),
    }
    const hl = new Map(section(input, 'ws-highlight').table!.rows.map((r) => [r.cells[0], r.cells[1]]))
    expect(hl.get('실적')).toContain('[미확인]')
    expect(hl.get('실적')).toContain('shallow')
  })

  it('생성물 분리 표기 + 하위 디렉터리 모드 캐비엇(리뷰 C1/C7)', () => {
    const input = {
      ...BASE,
      workSummary: fixtureReport({
        totals: {
          commits: 2,
          mergeCommits: 1,
          authors: 1,
          files: 1,
          added: 5,
          deleted: 1,
          generated: { files: 3, added: 13000, deleted: 10 },
        },
        meta: {
          gitAvailable: true,
          gitStatus: 'ok',
          prefix: 'examples/jpetstore-6/',
          moduleSource: 'dir',
          generatedPatterns: ['.understand-anything/'],
        },
      }),
    }
    const hl = new Map(section(input, 'ws-highlight').table!.rows.map((r) => [r.cells[0], r.cells[1]]))
    expect(hl.get('실적')).toContain('생성물/산출물 별도 3개(+13000/−10) — 실적 아님')
    const criteria = section(input, 'ws-criteria').table!.rows.map((r) => r.cells[0])
    expect(criteria).toContain('하위 디렉터리 모드') // 머지 과소 캐비엇(리뷰 C7).
    expect(criteria).toContain('실적 vs 생성물')
  })

  it('근거 게이트: 무근거 CONFIRMED 0(저장 차단 위반 없음)', () => {
    const doc = buildSiWorkSummary({ ...BASE, workSummary: fixtureReport() })
    expect(enforceEvidence(doc).violations).toEqual([])
  })

  it('byte 결정론 — 동일 입력 2회 직렬화 동일', () => {
    const input = { ...BASE, workSummary: fixtureReport() }
    expect(JSON.stringify(buildSiWorkSummary(input))).toBe(JSON.stringify(buildSiWorkSummary(input)))
  })
})
