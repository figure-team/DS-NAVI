/**
 * 무결성 진단 + 자연순 정렬 단위 테스트 — critic 반영(C1/C2/M3/M4/M5).
 */
import { describe, it, expect } from 'vitest'
import { applyRequirements } from './apply-requirements.js'
import { natCmp, computeDiagnostics, checkCellGrounding } from './validate.js'
import type { Confidence } from '../types.js'
import type { RtmFunctionRow, RtmModel } from './types.js'

function fn(id: string): RtmFunctionRow {
  const c = () => ({ value: 'X', confidence: 'CONFIRMED' as const, evidence: [{ file: 'X.java', line: 1 }] })
  return { id, featureId: 'FN', name: id, domainId: 'd1', domainName: 'd', entryPoint: c(), implementation: c(), data: c(), test: { value: '', confidence: 'UNVERIFIED', evidence: [] }, origin: 'AS_IS', state: 'IMPLEMENTED', requirementHistory: [], nfrTags: [], rules: [], deliverableRefs: [] }
}
function model(fns: RtmFunctionRow[]): RtmModel {
  return { schemaVersion: 2, gitCommit: null, domains: [{ id: 'd1', name: 'd', functionCount: fns.length }], functions: fns, requirements: [] }
}
function req(id: string, over: Record<string, unknown> = {}) {
  return { id, text: id, status: 'ACTIVE', supersedes: null, supersededBy: null, source: null, changeset: { added: [], modified: [], removed: [], revived: [] }, ...over }
}

describe('natCmp (M3) — 자연순 정렬', () => {
  it('REQ-2 < REQ-10 (사전순 역전 해소)', () => {
    expect(['REQ-10', 'REQ-2', 'REQ-1'].sort(natCmp)).toEqual(['REQ-1', 'REQ-2', 'REQ-10'])
  })
  it('현행 head 가 자연순 최신을 고른다 — REQ-10 modified 가 우선', () => {
    const reqs = [req('REQ-2', { changeset: { added: ['f1'], modified: [], removed: [], revived: [] } }), req('REQ-10', { changeset: { added: [], modified: ['f1'], removed: [], revived: [] } })]
    const out = applyRequirements(model([fn('f1')]), reqs as never)
    expect(out.functions[0].requirementHistory).toEqual(['REQ-2', 'REQ-10']) // 자연순
    expect(out.functions[0].state).toBe('CHANGED') // head=REQ-10(modified)
  })
})

describe('computeDiagnostics (C1/C2/M4/M5)', () => {
  it('댕글링 changeset/AC fnId → error(C1)', () => {
    const reqs = [req('REQ-1', { changeset: { added: ['ghost'], modified: [], removed: [], revived: [] }, acceptanceCriteria: [{ id: 'AC-1', text: 't', kind: 'rule', fnIds: ['ghost2'], confidence: 'INFERRED', tests: [] }] })]
    const out = applyRequirements(model([fn('f1')]), reqs as never)
    const codes = (out.diagnostics ?? []).map((d) => d.code)
    expect(codes).toContain('dangling-changeset-fn')
    expect(codes).toContain('dangling-ac-fn')
  })

  it('드롭된 요구사항 가시화(C2) — changeset 누락은 파싱 실패', () => {
    const bad = { id: 'REQ-BAD', text: 'x', status: 'ACTIVE', supersedes: null, supersededBy: null, source: null } // changeset 없음
    const out = applyRequirements(model([fn('f1')]), [bad] as never)
    expect((out.diagnostics ?? []).some((d) => d.code === 'req-dropped' && d.ref === 'REQ-BAD')).toBe(true)
    expect(out.requirements).toHaveLength(0)
  })

  it('중복 기능 id → error(M4)', () => {
    const diags = computeDiagnostics(model([fn('f1'), fn('f1')]))
    expect(diags.some((d) => d.code === 'dup-function-id')).toBe(true)
  })

  it('supersede 순환 → error(M5)', () => {
    const reqs = [req('REQ-1', { supersedes: 'REQ-2', supersededBy: 'REQ-2' }), req('REQ-2', { supersedes: 'REQ-1', supersededBy: 'REQ-1' })]
    const out = applyRequirements(model([fn('f1')]), reqs as never)
    expect((out.diagnostics ?? []).some((d) => d.code === 'supersede-cycle')).toBe(true)
  })

  it('AC.fnIds ⊄ changeset → warn', () => {
    const reqs = [req('REQ-1', { changeset: { added: ['f1'], modified: [], removed: [], revived: [] }, acceptanceCriteria: [{ id: 'AC-1', text: 't', kind: 'rule', fnIds: ['f1', 'f2'], confidence: 'INFERRED', tests: [] }] })]
    const out = applyRequirements(model([fn('f1'), fn('f2')]), reqs as never)
    expect((out.diagnostics ?? []).some((d) => d.code === 'ac-fn-not-in-changeset')).toBe(true)
  })
})

/**
 * P1c — ⑥ 재bake 표면(rtm-requirements.json 이 투영된 기능 셀)의 근거 게이트.
 * 규칙은 P1b(`intake-types.ts` `checkIntakeGrounding`) 재사용: 신규 제안=warn, 확정 단언=error.
 */
describe('checkCellGrounding (P1c) — ⑥ 표면 실재 대조', () => {
  const JPETSTORE_TABLES = ['ACCOUNT', 'SIGNON', 'PROFILE']
  /** data 셀만 바꾼 기능 행 — 나머지 축은 테이블 표기가 없는 값으로 둔다. */
  function dataFn(id: string, value: string, confidence: Confidence): RtmFunctionRow {
    const blank = { value: '-', confidence: 'INFERRED' as const, evidence: [] }
    return { ...fn(id), entryPoint: blank, implementation: blank, data: { value, confidence, evidence: [] } }
  }

  it('신규 테이블 + INFERRED → warn(통과) — 신규 제안 자체는 정당하다', () => {
    // jpetstore 실측값 그대로(functions[2,5].data.value).
    const m = model([dataFn('to-be:account/카카오-계정연동-자동가입', '(제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR)', 'INFERRED')])
    const diags = checkCellGrounding(m, { tables: JPETSTORE_TABLES })
    expect(diags).toHaveLength(1)
    expect(diags[0].level).toBe('warn')
    expect(diags[0].code).toBe('unknown-table')
    expect(diags[0].ref).toBe('to-be:account/카카오-계정연동-자동가입/data')
    expect(diags[0].message).toContain('OAUTH_ACCOUNT')
    // 실존 테이블은 걸리지 않는다.
    expect(diags[0].message).not.toContain('SIGNON')
  })

  it('신규 테이블 + CONFIRMED → error (net-new CONFIRMED 위반)', () => {
    const m = model([dataFn('f1', 'OAUTH_ACCOUNT(C)', 'CONFIRMED')])
    const diags = checkCellGrounding(m, { tables: JPETSTORE_TABLES })
    expect(diags).toHaveLength(1)
    expect(diags[0].level).toBe('error')
    expect(diags[0].message).toContain('net-new CONFIRMED 위반')
  })

  it('신규 테이블 + 본문 [확정] 태그 → error (confidence 컬럼 없이 단언하는 경로)', () => {
    const m = model([dataFn('f1', '[확정] OAUTH_ACCOUNT(C)', 'INFERRED')])
    expect(checkCellGrounding(m, { tables: JPETSTORE_TABLES })[0].level).toBe('error')
  })

  it('실존 테이블만 참조 → 무진단 (CONFIRMED AS-IS 셀 오탐 없음)', () => {
    const m = model([dataFn('f1', 'SIGNON(R) · ACCOUNT(R)', 'CONFIRMED')])
    expect(checkCellGrounding(m, { tables: JPETSTORE_TABLES })).toEqual([])
  })

  it('인벤토리 미주입 → 대조 생략(하위호환) — 기존 호출자 동작 불변', () => {
    const m = model([dataFn('f1', 'OAUTH_ACCOUNT(C)', 'CONFIRMED')])
    expect(checkCellGrounding(m)).toEqual([])
    expect(checkCellGrounding(m, {})).toEqual([])
  })

  it('entryPoint·implementation 축도 대조한다', () => {
    const cell = (value: string) => ({ value, confidence: 'INFERRED' as const, evidence: [] })
    const m = model([{ ...fn('f1'), entryPoint: cell('OAUTH_ACCOUNT(C)'), implementation: cell('GHOST_TBL(R)'), data: cell('-') }])
    expect(checkCellGrounding(m, { tables: JPETSTORE_TABLES }).map((d) => d.ref)).toEqual(['f1/entryPoint', 'f1/implementation'])
  })

  it('test 축은 대조하지 않는다 — 테이블 표기가 나올 자리가 아니다', () => {
    const m = model([{ ...dataFn('f1', '-', 'INFERRED'), test: { value: 'OAUTH_ACCOUNT(C)', confidence: 'CONFIRMED', evidence: [] } }])
    expect(checkCellGrounding(m, { tables: JPETSTORE_TABLES })).toEqual([])
  })

  it('산문 속 맨몸 대문자 토큰은 테이블로 보지 않는다 — 오탐이 error 로 직결되면 안 된다', () => {
    const m = model([dataFn('f1', 'OAuth 토큰을 API 로 받아 SIGNON 을 읽는다', 'CONFIRMED')])
    expect(checkCellGrounding(m, { tables: JPETSTORE_TABLES })).toEqual([])
  })

  it('같은 셀의 중복 표기는 1건으로 접는다', () => {
    const m = model([dataFn('f1', 'OAUTH_ACCOUNT(C) · OAUTH_ACCOUNT(R)', 'INFERRED')])
    expect(checkCellGrounding(m, { tables: JPETSTORE_TABLES })).toHaveLength(1)
  })

  it('결정론 — 같은 입력이면 같은 순서(재실행 byte-identical)', () => {
    const m = model([dataFn('f2', 'B_TBL(C)', 'CONFIRMED'), dataFn('f1', 'A_TBL(C)', 'INFERRED')])
    const a = checkCellGrounding(m, { tables: JPETSTORE_TABLES })
    expect(a).toEqual(checkCellGrounding(m, { tables: JPETSTORE_TABLES }))
    expect(a.map((d) => d.level)).toEqual(['error', 'warn']) // level 우선 정렬
  })
})
