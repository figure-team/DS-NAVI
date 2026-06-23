/**
 * v2 확장 단위 테스트 — 인수조건(AC) 규칙 집계(①)·NFR 태그(②)·커버리지 롤업(⑥).
 */
import { describe, it, expect } from 'vitest'
import { applyRequirements } from './apply-requirements.js'
import { computeCoverage } from './coverage.js'
import { RtmModelSchema } from './types.js'
import type { RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

function fn(id: string, hasImpl: boolean): RtmFunctionRow {
  const c = (v: string, conf: 'CONFIRMED' | 'INFERRED', ev: Array<{ file: string; line: number | null }>) => ({ value: v, confidence: conf, evidence: ev })
  return {
    id, featureId: 'FN', name: id, domainId: 'd1', domainName: '결제',
    entryPoint: c('POST /x', 'CONFIRMED', [{ file: 'X.java', line: 1 }]),
    implementation: hasImpl ? c('X', 'CONFIRMED', [{ file: 'X.java', line: 1 }]) : c('', 'INFERRED', []),
    data: c('', 'INFERRED', []),
    test: { value: '', confidence: 'UNVERIFIED', evidence: [] },
    origin: 'AS_IS', state: hasImpl ? 'IMPLEMENTED' : 'PLANNED', requirementHistory: [],
    nfrTags: [], rules: [], deliverableRefs: [],
  }
}
function model(fns: RtmFunctionRow[]): RtmModel {
  return { schemaVersion: 2, gitCommit: null, domains: [{ id: 'd1', name: '결제', functionCount: fns.length }], functions: fns, requirements: [] }
}

const detailedReq: RtmRequirement = {
  id: 'REQ-001', text: '장바구니 추가 규칙', type: 'functional', nfrCategory: null, nfrScope: [],
  priority: 'HIGH', lifecycle: 'DEVELOPING', status: 'ACTIVE', supersedes: null, supersededBy: null, dependsOn: [],
  source: { kind: 'customer', raw: '장바구니...' }, changeReq: null, signoff: null,
  changeset: { added: ['f2'], modified: ['f1'], removed: [], revived: [] },
  acceptanceCriteria: [
    { id: 'AC-1', text: '있으면 +1', kind: 'branch', fnIds: ['f1'], confidence: 'INFERRED', tests: [{ caseId: 'TC-1', result: 'PASS', defectId: null }] },
    { id: 'AC-2', text: '재고없으면 불가', kind: 'precondition', fnIds: ['f1', 'f2'], confidence: 'INFERRED', tests: [{ caseId: 'TC-2', result: 'UNTESTED', defectId: null }] },
  ],
}

describe('RTM v2 — AC(①) · NFR(②) · coverage(⑥)', () => {
  it('AC 가 기능 rules 로 집계되고(현행), 여러 기능에 N:M 매핑', () => {
    const out = applyRequirements(model([fn('f1', true), fn('f2', false)]), [detailedReq])
    const f1 = out.functions.find((f) => f.id === 'f1')!
    const f2 = out.functions.find((f) => f.id === 'f2')!
    expect(f1.rules.map((r) => r.acId)).toEqual(['AC-1', 'AC-2'])
    expect(f2.rules.map((r) => r.acId)).toEqual(['AC-2'])
    expect(f1.rules[0].text).toBe('있으면 +1')
    expect(RtmModelSchema.safeParse(out).success).toBe(true)
  })

  it('NFR 요구는 nfrScope 기능에 nfrTags 로 횡단 부착', () => {
    const nfr: RtmRequirement = { ...detailedReq, id: 'REQ-NFR', type: 'nonfunctional', nfrCategory: 'performance', nfrScope: ['f1'], changeset: { added: [], modified: [], removed: [], revived: [] }, acceptanceCriteria: [] }
    const out = applyRequirements(model([fn('f1', true)]), [nfr])
    expect(out.functions[0].nfrTags).toEqual(['REQ-NFR'])
  })

  it('커버리지 롤업 — 요구/기능/테스트 집계 + 갭(미구현·미검증)', () => {
    const out = applyRequirements(model([fn('f1', true), fn('f2', false)]), [detailedReq])
    const cov = out.coverage!
    expect(cov.requirements.total).toBe(1)
    expect(cov.requirements.implemented).toBe(0) // f2 미구현이라 요구 전체 미구현
    expect(cov.requirements.verified).toBe(0) // AC-2 미통과
    expect(cov.requirements.byLifecycle).toEqual({ DEVELOPING: 1 })
    expect(cov.tests).toEqual({ total: 2, pass: 1, fail: 0, untested: 1 })
    expect(cov.gaps.unimplemented).toEqual(['REQ-001'])
    expect(cov.gaps.unverified).toContain('f1') // f1=CHANGED 인데 테스트 셀 빔
  })

  it('signoff 승인 시 검수 집계 + computeCoverage 직접 호출 동등', () => {
    const signed: RtmRequirement = { ...detailedReq, signoff: { approved: true, by: '고객A', at: '2026-06-23' } }
    const out = applyRequirements(model([fn('f1', true), fn('f2', true)]), [signed])
    expect(out.coverage!.requirements.signedOff).toBe(1)
    expect(out.coverage!.requirements.implemented).toBe(1) // f1·f2 모두 구현
    expect(computeCoverage(out)).toEqual(out.coverage)
  })
})
