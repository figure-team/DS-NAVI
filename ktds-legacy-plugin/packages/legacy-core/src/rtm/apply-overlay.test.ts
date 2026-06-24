/**
 * applyOverlay — 사람 검증/검수 입력 경로 단위 테스트(critic ⓐ: 시험결과·signoff·lifecycle 기록).
 */
import { describe, it, expect } from 'vitest'
import { applyOverlay } from './apply-overlay.js'
import { applyRequirements } from './apply-requirements.js'
import type { RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

function fn(id: string, hasImpl = true): RtmFunctionRow {
  const c = (v: string) => ({ value: v, confidence: 'CONFIRMED' as const, evidence: [{ file: 'X.java', line: 1 }] })
  return { id, featureId: 'FN', name: id, domainId: 'd1', domainName: 'd', entryPoint: c('POST /x'), implementation: hasImpl ? c('X') : { value: '', confidence: 'INFERRED', evidence: [] }, data: c(''), test: { value: '', confidence: 'UNVERIFIED', evidence: [] }, origin: 'AS_IS', state: hasImpl ? 'IMPLEMENTED' : 'PLANNED', requirementHistory: [], nfrTags: [], rules: [], deliverableRefs: [] }
}
function base(): RtmModel {
  return { schemaVersion: 2, gitCommit: null, domains: [{ id: 'd1', name: 'd', functionCount: 1 }], functions: [fn('f1'), fn('f2', false)], requirements: [] }
}
const req: RtmRequirement = {
  id: 'REQ-001', text: '요구 A', type: 'functional', nfrCategory: null, nfrScope: [], priority: 'HIGH', lifecycle: 'DEVELOPING',
  status: 'ACTIVE', supersedes: null, supersededBy: null, dependsOn: [], source: { kind: 'customer', raw: 'x' }, changeReq: null, signoff: null,
  acceptanceCriteria: [{ id: 'AC-1', text: '조건', kind: 'rule', fnIds: ['f1'], confidence: 'INFERRED', tests: [{ caseId: 'TC-1', result: 'UNTESTED', defectId: null }] }],
  changeset: { added: [], modified: ['f1'], removed: [], revived: [] },
}

describe('applyOverlay — 검증 스파인 입력 경로', () => {
  it('시험결과 PASS 기록 → AC 통과 + coverage.verified 반영', () => {
    const m = applyRequirements(base(), [req])
    expect(m.coverage!.requirements.verified).toBe(0)
    const out = applyOverlay(m, { _requirements: { 'REQ-001': { approver: 'qa', at: 'T', tests: { 'AC-1::TC-1': { result: 'PASS', defectId: null } } } } })
    expect(out.requirements[0].acceptanceCriteria[0].tests[0].result).toBe('PASS')
    expect(out.coverage!.requirements.verified).toBe(1)
    expect(out.coverage!.tests).toEqual({ total: 1, pass: 1, fail: 0, untested: 0 })
  })

  it('고객검수(signoff) + lifecycle 전이 기록', () => {
    const m = applyRequirements(base(), [req])
    const out = applyOverlay(m, { _requirements: { 'REQ-001': { approver: 'pm', at: 'T', lifecycle: 'DONE', signoff: { approved: true, by: '고객A', at: '2026-06-24' } } } })
    expect(out.requirements[0].lifecycle).toBe('DONE')
    expect(out.requirements[0].signoff).toEqual({ approved: true, by: '고객A', at: '2026-06-24' })
    expect(out.coverage!.requirements.signedOff).toBe(1)
    expect(out.coverage!.requirements.byLifecycle).toEqual({ DONE: 1 })
  })

  it('기능 셀 교정(R3) — test 셀 입력 시 검증으로 집계 + confirmed', () => {
    const out = applyOverlay(base(), { f1: { approver: 'kim', at: 'T', editedCells: { test: 'TC-LOGIN-01' } } })
    expect(out.functions.find((f) => f.id === 'f1')!.test.value).toBe('TC-LOGIN-01')
    expect(out.coverage!.functions.confirmed).toBe(1)
    expect(out.coverage!.gaps.unverified).not.toContain('f1') // 테스트 셀 채워짐
  })

  it('빈 오버레이는 무변경(coverage 보장)', () => {
    const out = applyOverlay(base(), {})
    expect(out.coverage).toBeDefined()
    expect(out.functions).toHaveLength(2)
  })
})
