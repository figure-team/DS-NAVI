import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GeneratedDoc } from '../doc-generator/types.js'
import { enforceEvidence } from '../evidence/enforce.js'
import {
  initialDocState,
  submitForReview,
  approve,
  returnForRevision,
  renderAuditLog,
} from './index.js'
import { writeDocState, readDocState, docStatePath } from './persist.js'

// ── fixtures ────────────────────────────────────────────────────────────────

/** 모든 CONFIRMED claim 이 근거를 갖고 INFERRED 비율 0 — 승인 가능. */
function groundedDoc(): GeneratedDoc {
  return {
    docId: 'doc-grounded',
    title: 'Grounded',
    methodology: 'as-built',
    sections: [
      {
        heading: 'A',
        claims: [
          {
            text: 'confirmed-with-evidence',
            confidence: 'CONFIRMED',
            evidence: [{ file: 'src/a.ts', line: 10 }],
            requiresHumanReview: false,
          },
          {
            text: 'confirmed-ai',
            confidence: 'CONFIRMED_AI',
            evidence: [{ file: 'src/b.ts', line: 20 }],
            requiresHumanReview: false,
          },
        ],
      },
    ],
  }
}

/** CONFIRMED claim 이 근거 0 — Rule A 위반(RETURNED 트리거). */
function confirmedNoEvidenceDoc(): GeneratedDoc {
  return {
    docId: 'doc-no-evidence',
    title: 'NoEvidence',
    methodology: 'as-built',
    sections: [
      {
        heading: 'Z-section',
        claims: [
          {
            text: 'z-confirmed-but-empty',
            confidence: 'CONFIRMED',
            evidence: [],
            requiresHumanReview: false,
          },
        ],
      },
      {
        heading: 'A-section',
        claims: [
          {
            text: 'a-confirmed-but-empty',
            confidence: 'CONFIRMED',
            evidence: [],
            requiresHumanReview: false,
          },
        ],
      },
    ],
  }
}

/** INFERRED 비율 > 0.6 (3/4) — Rule B inferredBlocked. */
function highInferredDoc(): GeneratedDoc {
  return {
    docId: 'doc-inferred',
    title: 'Inferred',
    methodology: 'as-built',
    sections: [
      {
        heading: 'A',
        claims: [
          {
            text: 'c',
            confidence: 'CONFIRMED',
            evidence: [{ file: 'src/a.ts', line: 1 }],
            requiresHumanReview: false,
          },
          { text: 'i1', confidence: 'INFERRED', evidence: [], requiresHumanReview: true },
          { text: 'i2', confidence: 'INFERRED', evidence: [], requiresHumanReview: true },
          { text: 'i3', confidence: 'INFERRED', evidence: [], requiresHumanReview: true },
        ],
      },
    ],
  }
}

/** SI 표 문서 — CONFIRMED 행이 근거 0(표 행 = 1급 claim-unit, AC-9 위반). */
function siConfirmedNoEvidenceDoc(): GeneratedDoc {
  return {
    docId: 'si-인터페이스정의서',
    title: 'SI 인터페이스정의서',
    methodology: 'si-standard',
    sections: [
      {
        heading: 'API 목록',
        claims: [],
        table: {
          columns: ['API_ID', 'HTTP', '경로'],
          rows: [
            { cells: ['API-001', 'POST', '/orders'], confidence: 'CONFIRMED', evidence: [] },
          ],
        },
      },
    ],
  }
}

/** SI 표 문서 — 모든 행이 근거 보유(grounded) -> 승인 가능. */
function siGroundedDoc(): GeneratedDoc {
  return {
    docId: 'si-인터페이스정의서',
    title: 'SI 인터페이스정의서',
    methodology: 'si-standard',
    sections: [
      {
        heading: 'API 목록',
        claims: [],
        table: {
          columns: ['API_ID', 'HTTP', '경로'],
          rows: [
            {
              cells: ['API-001', 'POST', '/orders'],
              confidence: 'CONFIRMED',
              evidence: [{ file: 'src/web/OrderController.java', line: 42 }],
            },
          ],
        },
      },
    ],
  }
}

// ── evidence enforcement ──────────────────────────────────────────────────────

describe('enforceEvidence', () => {
  it('flags CONFIRMED claim with zero evidence (Rule A, sorted)', () => {
    const v = enforceEvidence(confirmedNoEvidenceDoc())
    expect(v.ok).toBe(false)
    expect(v.violations).toHaveLength(2)
    // sorted by (section, claim): "A-section" before "Z-section"
    expect(v.violations.map((x) => x.section)).toEqual(['A-section', 'Z-section'])
    expect(v.violations[0].reason).toBe('confirmed-no-evidence')
    expect(v.inferredBlocked).toBe(false)
  })

  it('blocks approval when inferredRatio > 0.6 (Rule B)', () => {
    const v = enforceEvidence(highInferredDoc())
    expect(v.inferredRatio).toBeCloseTo(0.75)
    expect(v.inferredBlocked).toBe(true)
    expect(v.ok).toBe(false)
    expect(v.violations).toHaveLength(0)
  })

  it('ok when all CONFIRMED grounded and inferredRatio <= 0.6', () => {
    const v = enforceEvidence(groundedDoc())
    expect(v.ok).toBe(true)
    expect(v.violations).toHaveLength(0)
    expect(v.inferredBlocked).toBe(false)
  })

  it('flags a CONFIRMED SI table row with zero evidence (row = claim-unit, AC-9)', () => {
    const v = enforceEvidence(siConfirmedNoEvidenceDoc())
    expect(v.ok).toBe(false)
    expect(v.violations).toHaveLength(1)
    expect(v.violations[0]).toEqual({
      section: 'API 목록',
      claim: 'API-001', // 첫 셀이 결정론 행 라벨
      reason: 'confirmed-no-evidence',
    })
  })

  it('ok when all SI table rows are grounded', () => {
    const v = enforceEvidence(siGroundedDoc())
    expect(v.ok).toBe(true)
    expect(v.violations).toHaveLength(0)
  })
})

// ── approve gate ─────────────────────────────────────────────────────────────

describe('approve evidence gate', () => {
  it('CONFIRMED-no-evidence doc -> approve yields RETURNED (not APPROVED)', () => {
    const reviewed = submitForReview(initialDocState('doc-no-evidence'), {
      by: 'rev',
      at: '2026-06-18T00:00:00.000Z',
    }).state
    const r = approve(reviewed, confirmedNoEvidenceDoc(), {
      by: 'approver',
      at: '2026-06-18T01:00:00.000Z',
    })
    expect(r.state.status).toBe('RETURNED')
    expect(r.state.approver).toBeNull()
    expect(r.event.event).toBe('RETURNED')
    expect(r.event.detail).toContain('confirmed-no-evidence')
  })

  it('grounded doc -> approve yields APPROVED with approver + APPROVED audit', () => {
    const reviewed = submitForReview(initialDocState('doc-grounded'), {
      by: 'rev',
      at: '2026-06-18T00:00:00.000Z',
    }).state
    const r = approve(reviewed, groundedDoc(), {
      by: 'approver',
      at: '2026-06-18T01:00:00.000Z',
    })
    expect(r.state.status).toBe('APPROVED')
    expect(r.state.approver).toBe('approver')
    expect(r.event.event).toBe('APPROVED')
    expect(r.state.audit.at(-1)).toEqual({
      event: 'APPROVED',
      by: 'approver',
      at: '2026-06-18T01:00:00.000Z',
    })
  })

  it('SI doc with CONFIRMED row + 0 evidence -> approve yields RETURNED (AC-9)', () => {
    const reviewed = submitForReview(initialDocState('si-인터페이스정의서'), {
      by: 'rev',
      at: '2026-06-18T00:00:00.000Z',
    }).state
    const r = approve(reviewed, siConfirmedNoEvidenceDoc(), {
      by: 'approver',
      at: '2026-06-18T01:00:00.000Z',
    })
    expect(r.state.status).toBe('RETURNED')
    expect(r.state.approver).toBeNull()
    expect(r.event.detail).toContain('confirmed-no-evidence')
  })

  it('SI doc with grounded rows -> approve yields APPROVED', () => {
    const reviewed = submitForReview(initialDocState('si-인터페이스정의서'), {
      by: 'rev',
      at: '2026-06-18T00:00:00.000Z',
    }).state
    const r = approve(reviewed, siGroundedDoc(), {
      by: 'approver',
      at: '2026-06-18T01:00:00.000Z',
    })
    expect(r.state.status).toBe('APPROVED')
    expect(r.state.approver).toBe('approver')
  })

  it('inferredRatio > 0.6 -> inferredBlocked -> approve yields RETURNED', () => {
    const reviewed = submitForReview(initialDocState('doc-inferred'), {
      by: 'rev',
      at: '2026-06-18T00:00:00.000Z',
    }).state
    const r = approve(reviewed, highInferredDoc(), {
      by: 'approver',
      at: '2026-06-18T01:00:00.000Z',
    })
    expect(r.state.status).toBe('RETURNED')
    expect(r.event.detail).toContain('inferred-ratio')
  })
})

// ── lifecycle / transitions ──────────────────────────────────────────────────

describe('doc-state lifecycle', () => {
  it('DRAFT -> submit -> UNDER_REVIEW -> approve -> APPROVED with SUBMITTED then APPROVED audit', () => {
    const s0 = initialDocState('doc-grounded')
    expect(s0.status).toBe('DRAFT')
    const s1 = submitForReview(s0, { by: 'rev', at: '2026-06-18T00:00:00.000Z' }).state
    expect(s1.status).toBe('UNDER_REVIEW')
    const s2 = approve(s1, groundedDoc(), { by: 'mgr', at: '2026-06-18T02:00:00.000Z' }).state
    expect(s2.status).toBe('APPROVED')
    expect(s2.audit.map((e) => e.event)).toEqual(['SUBMITTED', 'APPROVED'])
    expect(s2.audit[0].by).toBe('rev')
    expect(s2.audit[0].at).toBe('2026-06-18T00:00:00.000Z')
    expect(s2.audit[1].by).toBe('mgr')
    expect(s2.audit[1].at).toBe('2026-06-18T02:00:00.000Z')
  })

  it('illegal transition: approve from DRAFT throws', () => {
    const s0 = initialDocState('doc-grounded')
    expect(() => approve(s0, groundedDoc(), { by: 'x', at: '2026-06-18T00:00:00.000Z' })).toThrow(
      /illegal transition from DRAFT/,
    )
  })

  it('illegal transition: submitForReview from APPROVED throws', () => {
    const approved = approve(
      submitForReview(initialDocState('doc-grounded'), { by: 'r', at: '2026-06-18T00:00:00.000Z' })
        .state,
      groundedDoc(),
      { by: 'm', at: '2026-06-18T01:00:00.000Z' },
    ).state
    expect(() => submitForReview(approved, { by: 'x', at: '2026-06-18T02:00:00.000Z' })).toThrow(
      /illegal transition from APPROVED/,
    )
  })

  it('returnForRevision -> RETURNED -> submitForReview again -> UNDER_REVIEW (re-review path)', () => {
    const reviewed = submitForReview(initialDocState('doc-grounded'), {
      by: 'rev',
      at: '2026-06-18T00:00:00.000Z',
    }).state
    const returned = returnForRevision(reviewed, {
      by: 'mgr',
      at: '2026-06-18T01:00:00.000Z',
      reason: 'needs more evidence',
    }).state
    expect(returned.status).toBe('RETURNED')
    expect(returned.audit.at(-1)?.detail).toBe('needs more evidence')
    const reReview = submitForReview(returned, { by: 'rev', at: '2026-06-18T02:00:00.000Z' }).state
    expect(reReview.status).toBe('UNDER_REVIEW')
    expect(reReview.audit.map((e) => e.event)).toEqual(['SUBMITTED', 'RETURNED', 'SUBMITTED'])
  })
})

// ── immutability ─────────────────────────────────────────────────────────────

describe('immutability', () => {
  it('transition functions return new objects, input unchanged', () => {
    const s0 = initialDocState('doc-grounded')
    const s1 = submitForReview(s0, { by: 'rev', at: '2026-06-18T00:00:00.000Z' }).state
    expect(s1).not.toBe(s0)
    expect(s0.status).toBe('DRAFT')
    expect(s0.audit).toHaveLength(0)
    expect(s1.audit).not.toBe(s0.audit)

    const s2 = approve(s1, groundedDoc(), { by: 'm', at: '2026-06-18T01:00:00.000Z' }).state
    expect(s2).not.toBe(s1)
    expect(s1.status).toBe('UNDER_REVIEW')
    expect(s1.approver).toBeNull()
    expect(s1.audit).toHaveLength(1)
  })
})

// ── determinism: render + persist ────────────────────────────────────────────

describe('determinism', () => {
  it('renderAuditLog deterministic given fixed at inputs', () => {
    const s = approve(
      submitForReview(initialDocState('doc-grounded'), { by: 'rev', at: '2026-06-18T00:00:00.000Z' })
        .state,
      groundedDoc(),
      { by: 'mgr', at: '2026-06-18T02:00:00.000Z' },
    ).state
    const expected =
      '2026-06-18T00:00:00.000Z SUBMITTED by rev\n' +
      '2026-06-18T02:00:00.000Z APPROVED by mgr\n'
    expect(renderAuditLog(s)).toBe(expected)
    expect(renderAuditLog(s)).toBe(renderAuditLog(s))
  })

  it('write/read DocState round-trip stable (byte-identical re-write)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ktds-doc-state-'))
    try {
      const state = approve(
        submitForReview(initialDocState('doc-grounded'), {
          by: 'rev',
          at: '2026-06-18T00:00:00.000Z',
        }).state,
        groundedDoc(),
        { by: 'mgr', at: '2026-06-18T02:00:00.000Z' },
      ).state

      const path = writeDocState(dir, 'doc-grounded', state)
      expect(path).toBe(docStatePath(dir, 'doc-grounded'))
      expect(existsSync(path)).toBe(true)

      const first = readFileSync(path, 'utf8')
      const round = readDocState(dir, 'doc-grounded')
      expect(round).toEqual(state)

      // re-write the read-back state -> byte-identical
      writeDocState(dir, 'doc-grounded', round!)
      expect(readFileSync(path, 'utf8')).toBe(first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('readDocState returns null when absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ktds-doc-state-'))
    try {
      expect(readDocState(dir, 'missing')).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
