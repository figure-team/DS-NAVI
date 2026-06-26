/**
 * applyRequirements(R4) — 현행 head 재계산·되살아남(revive)·고아·이력 단위 테스트(§1 불변규칙).
 */
import { describe, it, expect } from 'vitest'
import { applyRequirements } from './apply-requirements.js'
import type { RtmFunctionRow, RtmModel, RtmRequirement } from './types.js'

/** 구현 근거 보유 AS-IS 기능 행 1개(결제 처리). */
function fn(id: string, hasImpl = true): RtmFunctionRow {
  const cell = (v: string, conf: 'CONFIRMED' | 'INFERRED', ev: Array<{ file: string; line: number | null }>) => ({ value: v, confidence: conf, evidence: ev })
  return {
    id,
    featureId: 'FN-001',
    name: id,
    domainId: 'd1',
    domainName: '결제',
    entryPoint: cell('POST /pay', 'CONFIRMED', [{ file: 'P.java', line: 10 }]),
    implementation: hasImpl ? cell('Pay', 'CONFIRMED', [{ file: 'P.java', line: 10 }]) : cell('', 'INFERRED', []),
    data: cell('', 'INFERRED', []),
    test: { value: '', confidence: 'UNVERIFIED', evidence: [] },
    origin: 'AS_IS',
    state: hasImpl ? 'IMPLEMENTED' : 'PLANNED',
    requirementHistory: [],
  }
}

function model(fns: RtmFunctionRow[]): RtmModel {
  return { schemaVersion: 1, gitCommit: null, domains: [{ id: 'd1', name: '결제', functionCount: fns.length }], functions: fns, requirements: [] }
}

function req(id: string, status: 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN', changeset: Partial<RtmRequirement['changeset']>): RtmRequirement {
  return {
    id,
    text: id,
    status,
    supersedes: null,
    supersededBy: null,
    source: null,
    changeset: { added: [], modified: [], removed: [], revived: [], ...changeset },
  }
}

describe('applyRequirements (R4, §1 불변규칙)', () => {
  it('건드리지 않은 기능은 원본 상태/빈 이력 유지', () => {
    const out = applyRequirements(model([fn('f1')]), [req('REQ-001', 'ACTIVE', { modified: ['other'] })])
    expect(out.functions[0].state).toBe('IMPLEMENTED')
    expect(out.functions[0].requirementHistory).toEqual([])
    expect(out.requirements).toHaveLength(1)
  })

  it('이력은 건드린 요구사항만, 상태는 현행 head(최신) 동사로 — modify→CHANGED', () => {
    const reqs = [req('REQ-001', 'SUPERSEDED', { added: ['f1'] }), req('REQ-002', 'ACTIVE', { modified: ['f1'] })]
    const out = applyRequirements(model([fn('f1')]), reqs)
    expect(out.functions[0].requirementHistory).toEqual(['REQ-001', 'REQ-002'])
    expect(out.functions[0].state).toBe('CHANGED')
  })

  it('removed + 구현 보유 → ORPHANED(제거 대상, 파괴적 삭제 없음)', () => {
    const out = applyRequirements(model([fn('f1')]), [req('REQ-002', 'ACTIVE', { removed: ['f1'] })])
    expect(out.functions[0].state).toBe('ORPHANED')
  })

  it('REQ2 제거 → REQ3 되살림(revive): 최신=revived → IMPLEMENTED(되살아남)', () => {
    const reqs = [
      req('REQ-001', 'SUPERSEDED', { added: ['f1'] }),
      req('REQ-002', 'SUPERSEDED', { removed: ['f1'] }),
      req('REQ-003', 'ACTIVE', { revived: ['f1'] }),
    ]
    const out = applyRequirements(model([fn('f1')]), reqs)
    expect(out.functions[0].requirementHistory).toEqual(['REQ-001', 'REQ-002', 'REQ-003'])
    expect(out.functions[0].state).toBe('IMPLEMENTED')
  })

  it('철회(WITHDRAWN) → 현행 head 에서 제외, 기능 원복 + 이력은 감사용 보존', () => {
    // REQ-001(modified f1) 만 있는데 폐기 → head 없음 → 기능은 base(IMPLEMENTED)로 원복(CHANGED 아님).
    const out = applyRequirements(model([fn('f1')]), [req('REQ-001', 'WITHDRAWN', { modified: ['f1'] })])
    expect(out.functions[0].state).toBe('IMPLEMENTED')
    expect(out.functions[0].requirementHistory).toEqual(['REQ-001']) // 이력 보존
  })

  it('철회는 현행 head 에서만 빠짐 — 유효 후속이 있으면 그 동사가 head', () => {
    const reqs = [req('REQ-001', 'WITHDRAWN', { added: ['f1'] }), req('REQ-002', 'ACTIVE', { modified: ['f1'] })]
    const out = applyRequirements(model([fn('f1')]), reqs)
    expect(out.functions[0].state).toBe('CHANGED')
    expect(out.functions[0].requirementHistory).toEqual(['REQ-001', 'REQ-002'])
  })

  it('added + 구현 없음 → 신규 미구현(PLANNED, origin=TO_BE)', () => {
    const newFn = fn('f-new', false)
    const out = applyRequirements(model([]), [req('REQ-009', 'ACTIVE', { added: ['f-new'] })], [newFn])
    const row = out.functions.find((f) => f.id === 'f-new')!
    expect(row.state).toBe('PLANNED')
    expect(row.origin).toBe('TO_BE')
    expect(out.domains.find((d) => d.id === 'd1')?.functionCount).toBe(1)
  })

  it('결정론 — 동일 입력 byte-identical', () => {
    const reqs = [req('REQ-002', 'ACTIVE', { modified: ['f1'] }), req('REQ-001', 'SUPERSEDED', { added: ['f1'] })]
    const a = applyRequirements(model([fn('f1')]), reqs)
    const b = applyRequirements(model([fn('f1')]), reqs)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
