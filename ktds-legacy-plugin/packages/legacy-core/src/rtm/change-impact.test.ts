/**
 * computeChangeImpact(절차 B) — 영향 기능 분류·다운스트림 의존·AC·산출물·후속조치 단위 테스트.
 */
import { describe, it, expect } from 'vitest'
import { computeChangeImpact } from './change-impact.js'
import type { RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

function cell(hasEv: boolean) {
  return { value: hasEv ? 'X' : '', confidence: 'CONFIRMED' as const, evidence: hasEv ? [{ file: 'F.java', line: 1 }] : [] }
}
function fn(id: string, hasImpl: boolean, deliverableRefs: { docId: string; anchor?: string }[] = []): RtmFunctionRow {
  return {
    id,
    featureId: 'FN-001',
    name: id,
    domainId: 'd1',
    domainName: '도메인',
    entryPoint: cell(false),
    implementation: cell(hasImpl),
    data: cell(false),
    test: { value: '', confidence: 'UNVERIFIED', evidence: [] },
    origin: hasImpl ? 'AS_IS' : 'TO_BE',
    state: hasImpl ? 'IMPLEMENTED' : 'PLANNED',
    requirementHistory: [],
    nfrTags: [],
    rules: [],
    deliverableRefs,
  }
}
function req(
  id: string,
  section: string,
  status: RtmRequirement['status'],
  changeset: Partial<RtmRequirement['changeset']>,
  extra: Partial<RtmRequirement> = {},
): RtmRequirement {
  return {
    id,
    text: id,
    type: 'functional',
    nfrCategory: null,
    nfrScope: [],
    priority: 'MEDIUM',
    lifecycle: 'RECEIVED',
    status,
    supersedes: null,
    supersededBy: null,
    dependsOn: [],
    source: { kind: 'customer', raw: 'r', section },
    changeReq: null,
    signoff: null,
    acceptanceCriteria: [],
    changeset: { added: [], modified: [], removed: [], revived: [], ...changeset },
    ...extra,
  }
}

const model: RtmModel = {
  schemaVersion: 2,
  gitCommit: null,
  domains: [{ id: 'd1', name: '도메인', functionCount: 3 }],
  functions: [
    fn('to-be:auth/naver', false), // 미착수 TO-BE
    fn('order/checkout', true, [{ docId: 'doc:09_release', anchor: 's1' }]), // 구현 코드 존재
    fn('order/shared', true), // 다른 ACTIVE 요구도 사용
  ],
  requirements: [
    // 철회 대상 REQ-001 의 하위 요구 2건.
    req('SFR-010', 'REQ-001', 'ACTIVE', { added: ['to-be:auth/naver'] }, {
      acceptanceCriteria: [{ id: 'AC-1', text: '네이버 콜백', kind: 'rule', fnIds: ['to-be:auth/naver'], confidence: 'INFERRED', tests: [{ caseId: 'TC-1', result: 'UNTESTED', defectId: null }] }],
    }),
    req('SIR-002', 'REQ-001', 'ACTIVE', { modified: ['order/checkout', 'order/shared'] }),
    // 다른 요청 REQ-002 — order/shared 유지 + SFR-010 의존.
    req('SFR-030', 'REQ-002', 'ACTIVE', { modified: ['order/shared'] }, { dependsOn: ['SFR-010'] }),
  ],
}

describe('computeChangeImpact (절차 B)', () => {
  const rep = computeChangeImpact(model, 'REQ-001')

  it('대상 요구사항 — REQ-001 하위만(정렬)', () => {
    expect(rep.requirements.map((r) => r.id)).toEqual(['SFR-010', 'SIR-002'])
    expect(rep.requirements[0].category).toBe('SFR')
  })

  it('영향 기능 분류 — 미착수/회귀/타요구유지', () => {
    const byId = new Map(rep.functions.map((f) => [f.id, f]))
    expect(byId.get('to-be:auth/naver')?.classification).toBe('cancel-planned')
    expect(byId.get('order/checkout')?.classification).toBe('regression')
    expect(byId.get('order/shared')?.classification).toBe('retained-other-req')
  })

  it('다운스트림 의존 끊김 — SFR-030 dependsOn SFR-010', () => {
    expect(rep.downstreamDependents).toEqual([{ id: 'SFR-030', dependsOn: ['SFR-010'] }])
  })

  it('인수조건 + 후속조치 수집', () => {
    expect(rep.acceptanceCriteria).toEqual([{ reqId: 'SFR-010', acId: 'AC-1', text: '네이버 콜백', testCount: 1 }])
    expect(rep.deliverables).toEqual([{ docId: 'doc:09_release', anchor: 's1' }])
    expect(rep.followUps).toContain('회귀시험 수행 — 원복된 기능의 기존 동작 검증')
    expect(rep.followUps).toContain('의존 요구 재검토 — 끊긴 dependsOn 후속 요구사항 영향 확인')
  })

  it('결정론 — byte-identical 재실행', () => {
    expect(JSON.stringify(computeChangeImpact(model, 'REQ-001'))).toBe(JSON.stringify(rep))
  })
})
