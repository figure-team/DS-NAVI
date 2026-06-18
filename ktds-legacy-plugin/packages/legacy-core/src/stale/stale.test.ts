import { describe, it, expect } from 'vitest'
import type { GeneratedDoc } from '../doc-generator/types.js'
import { initialDocState, submitForReview, approve } from '../doc-state/index.js'
import type { DocState } from '../doc-state/index.js'
import { detectStaleClaims, incrementalReapproval, evidenceAnchor } from './stale.js'
import type { FingerprintMap } from './stale.js'

function doc(): GeneratedDoc {
  return {
    docId: 'doc-1',
    title: 'Doc',
    methodology: 'as-built',
    sections: [
      {
        heading: 'Z-section',
        claims: [
          {
            text: 'z-claim',
            confidence: 'CONFIRMED',
            evidence: [{ file: 'src/z.ts', line: 5 }],
            requiresHumanReview: false,
          },
        ],
      },
      {
        heading: 'A-section',
        claims: [
          {
            text: 'a-claim-1',
            confidence: 'CONFIRMED',
            evidence: [{ file: 'src/a.ts', line: 10 }],
            requiresHumanReview: false,
          },
          {
            text: 'a-claim-2',
            confidence: 'INFERRED',
            evidence: [{ file: 'src/b.ts', line: null }],
            requiresHumanReview: true,
          },
        ],
      },
    ],
  }
}

const prev: FingerprintMap = {
  'src/z.ts:5': 'h-z-1',
  'src/a.ts:10': 'h-a-1',
  'src/b.ts': 'h-b-1',
}

describe('evidenceAnchor', () => {
  it('uses file:line, or file when line is null', () => {
    expect(evidenceAnchor({ file: 'x.ts', line: 3 })).toBe('x.ts:3')
    expect(evidenceAnchor({ file: 'x.ts', line: null })).toBe('x.ts')
  })
})

describe('detectStaleClaims', () => {
  it('flags only claims whose evidence fingerprint changed', () => {
    const curr: FingerprintMap = { ...prev, 'src/a.ts:10': 'h-a-2' } // only a.ts changed
    const report = detectStaleClaims(doc(), prev, curr)
    expect(report.staleCount).toBe(1)
    expect(report.freshCount).toBe(2)
    expect(report.staleSections).toEqual([
      {
        section: 'A-section',
        staleClaims: [{ claim: 'a-claim-1', changedAnchors: ['src/a.ts:10'] }],
      },
    ])
  })

  it('treats all unchanged fingerprints as fresh (0 stale)', () => {
    const report = detectStaleClaims(doc(), prev, { ...prev })
    expect(report.staleCount).toBe(0)
    expect(report.freshCount).toBe(3)
    expect(report.staleSections).toEqual([])
  })

  it('sorts stale sections and claims deterministically', () => {
    const curr: FingerprintMap = {
      'src/z.ts:5': 'h-z-2',
      'src/a.ts:10': 'h-a-2',
      'src/b.ts': 'h-b-2',
    }
    const report = detectStaleClaims(doc(), prev, curr)
    expect(report.staleCount).toBe(3)
    expect(report.staleSections.map((s) => s.section)).toEqual(['A-section', 'Z-section'])
    expect(report.staleSections[0].staleClaims.map((c) => c.claim)).toEqual([
      'a-claim-1',
      'a-claim-2',
    ])
  })

  it('treats a removed anchor (undefined in curr) as changed', () => {
    const curr: FingerprintMap = { 'src/a.ts:10': 'h-a-1', 'src/b.ts': 'h-b-1' } // z removed
    const report = detectStaleClaims(doc(), prev, curr)
    expect(report.staleSections.map((s) => s.section)).toEqual(['Z-section'])
  })
})

// SI 표 문서(table.rows)도 1급 claim-unit 이므로 행 근거 앵커가 바뀌면 STALE 이어야 한다(AC-9).
function siDoc(): GeneratedDoc {
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
            {
              cells: ['API-002', 'GET', '/orders'],
              confidence: 'CONFIRMED',
              evidence: [{ file: 'src/web/OrderController.java', line: 60 }],
            },
          ],
        },
      },
    ],
  }
}

const siPrev: FingerprintMap = {
  'src/web/OrderController.java:42': 'h-1',
  'src/web/OrderController.java:60': 'h-2',
}

describe('detectStaleClaims — SI table rows (AC-9)', () => {
  it('flags a stale table row when its anchor fingerprint changes (label = first cell)', () => {
    const curr: FingerprintMap = { ...siPrev, 'src/web/OrderController.java:42': 'h-1b' }
    const report = detectStaleClaims(siDoc(), siPrev, curr)
    expect(report.staleCount).toBe(1)
    expect(report.freshCount).toBe(1)
    expect(report.staleSections).toEqual([
      {
        section: 'API 목록',
        staleClaims: [
          { claim: 'API-001', changedAnchors: ['src/web/OrderController.java:42'] },
        ],
      },
    ])
  })

  it('all rows fresh when no fingerprints change', () => {
    const report = detectStaleClaims(siDoc(), siPrev, { ...siPrev })
    expect(report.staleCount).toBe(0)
    expect(report.freshCount).toBe(2)
    expect(report.staleSections).toEqual([])
  })
})

function approved(): DocState {
  const reviewed = submitForReview(initialDocState('doc-1'), {
    by: 'rev',
    at: '2026-06-18T00:00:00.000Z',
  }).state
  return approve(reviewed, doc(), { by: 'mgr', at: '2026-06-18T01:00:00.000Z' }).state
}

describe('incrementalReapproval', () => {
  it('0 stale -> state unchanged, stays APPROVED, no audit event', () => {
    const state = approved()
    const report = detectStaleClaims(doc(), prev, { ...prev })
    const r = incrementalReapproval(state, report, {
      by: 'mgr',
      at: '2026-06-18T02:00:00.000Z',
    })
    expect(r.event).toBeNull()
    expect(r.state).toBe(state)
    expect(r.state.status).toBe('APPROVED')
    expect(r.state.approver).toBe('mgr')
  })

  it('>0 stale -> UNDER_REVIEW + audit lists stale sections (NOT a full re-approve)', () => {
    const state = approved()
    const curr: FingerprintMap = { ...prev, 'src/a.ts:10': 'h-a-2' }
    const report = detectStaleClaims(doc(), prev, curr)
    const r = incrementalReapproval(state, report, {
      by: 'mgr',
      at: '2026-06-18T02:00:00.000Z',
    })
    expect(r.state.status).toBe('UNDER_REVIEW')
    expect(r.state.approver).toBeNull()
    expect(r.event?.event).toBe('RETURNED')
    expect(r.event?.detail).toContain('A-section')
    expect(r.event?.detail).toContain('NOT a full re-approve')
    expect(r.state.audit.at(-1)).toBe(r.event)
    // input state untouched (pure)
    expect(state.status).toBe('APPROVED')
  })
})
