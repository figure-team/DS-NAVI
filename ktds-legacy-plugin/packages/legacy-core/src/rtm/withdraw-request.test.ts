/**
 * withdrawRequest(절차 B) — 요청 단위 폐기 cascade · 멱등 · notFound 단위 테스트.
 */
import { describe, it, expect } from 'vitest'
import { withdrawRequest } from './withdraw-request.js'
import type { RtmRequirement } from './types.js'

/** source.section(=요청ID)로 귀속된 요구사항 1건. */
function req(id: string, section: string, status: RtmRequirement['status'] = 'ACTIVE'): RtmRequirement {
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
    source: { kind: 'customer', raw: '원문', section },
    changeReq: null,
    signoff: null,
    acceptanceCriteria: [],
    changeset: { added: [], modified: [], removed: [], revived: [] },
  }
}

describe('withdrawRequest (절차 B)', () => {
  const reqs = [req('SFR-010', 'REQ-001'), req('SIR-002', 'REQ-001'), req('SFR-020', 'REQ-002')]

  it('요청 단위 동반 폐기 — REQ-001 의 하위 요구 전부 WITHDRAWN + changeReq', () => {
    const out = withdrawRequest(reqs, 'REQ-001', { crNo: 'CR-001', reason: '고객 취소', approver: '김PM' })
    expect(out.withdrawn).toEqual(['SFR-010', 'SIR-002'])
    expect(out.notFound).toBe(false)
    const byId = new Map(out.requirements.map((r) => [r.id, r]))
    expect(byId.get('SFR-010')?.status).toBe('WITHDRAWN')
    expect(byId.get('SIR-002')?.status).toBe('WITHDRAWN')
    expect(byId.get('SFR-010')?.changeReq).toEqual({ crNo: 'CR-001', reason: '고객 취소', approver: '김PM', effort: null })
    // 다른 요청(REQ-002)은 무관.
    expect(byId.get('SFR-020')?.status).toBe('ACTIVE')
    expect(byId.get('SFR-020')?.changeReq).toBeNull()
  })

  it('파괴적 삭제 없음 — 배열 길이·순서 보존', () => {
    const out = withdrawRequest(reqs, 'REQ-001', { crNo: 'CR-001' })
    expect(out.requirements.map((r) => r.id)).toEqual(['SFR-010', 'SIR-002', 'SFR-020'])
  })

  it('멱등 — 이미 폐기면 alreadyWithdrawn, 재기록 없음', () => {
    const once = withdrawRequest(reqs, 'REQ-001', { crNo: 'CR-001' })
    const twice = withdrawRequest(once.requirements, 'REQ-001', { crNo: 'CR-009' })
    expect(twice.withdrawn).toEqual([])
    expect(twice.alreadyWithdrawn).toEqual(['SFR-010', 'SIR-002'])
    // 최초 CR 유지(재기록 안 함).
    const byId = new Map(twice.requirements.map((r) => [r.id, r]))
    expect(byId.get('SFR-010')?.changeReq?.crNo).toBe('CR-001')
  })

  it('없는 요청 — notFound, 원본 불변', () => {
    const out = withdrawRequest(reqs, 'REQ-999', { crNo: 'CR-001' })
    expect(out.notFound).toBe(true)
    expect(out.withdrawn).toEqual([])
    expect(out.requirements.every((r) => r.status === 'ACTIVE')).toBe(true)
  })
})
