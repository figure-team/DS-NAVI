/**
 * 무결성 진단 + 자연순 정렬 단위 테스트 — critic 반영(C1/C2/M3/M4/M5).
 */
import { describe, it, expect } from 'vitest'
import { applyRequirements } from './apply-requirements.js'
import { natCmp, computeDiagnostics } from './validate.js'
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
