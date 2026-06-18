import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAutoPlan,
  renameDomain,
  mergeDomains,
  moveRoot,
  excludeDomain,
  detectPlanDrift,
  planTable,
  writeConfirmedPlan,
  readConfirmedPlan,
} from './confirm.js'
import { stableJson } from './persist.js'
import type { CandidatesReport, ConfirmedPlan } from './types.js'

/** 두 도메인(user/order) + 공용/모호/미해소를 갖는 합성 후보 보고. */
function sampleCandidates(): CandidatesReport {
  return {
    schemaVersion: 1,
    gitCommit: 'abc123',
    directoryDegenerate: null,
    candidates: [
      {
        key: 'order',
        roots: ['src/order/OrderController.java'],
        entryCount: 2,
        files: [{ relPath: 'src/order/OrderService.java', via: 'reachability' }],
      },
      {
        key: 'user',
        roots: ['src/user/UserController.java'],
        entryCount: 1,
        files: [{ relPath: 'src/user/UserService.java', via: 'reachability' }],
      },
    ],
    common: [],
    ambiguous: [],
    unresolved: [],
  }
}

describe('confirm — buildAutoPlan', () => {
  it('accepts candidates as-is; name defaults to key, aliasKeys empty', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(plan.decidedBy).toBe('auto')
    expect(plan.gitCommit).toBe('abc123')
    expect(plan.excludedKeys).toEqual([])
    expect(plan.domains.map((d) => d.key)).toEqual(['order', 'user'])
    for (const d of plan.domains) {
      expect(d.name).toBe(d.key)
      expect(d.aliasKeys).toEqual([])
    }
  })

  it('honors an explicit decidedBy', () => {
    const plan = buildAutoPlan(sampleCandidates(), 'jk@example.com')
    expect(plan.decidedBy).toBe('jk@example.com')
  })
})

describe('confirm — pure operations are immutable (new objects, key unchanged)', () => {
  it('renameDomain changes name only, keeps key, returns a new object', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = renameDomain(plan, 'user', 'Accounts')
    expect(next).not.toBe(plan)
    expect(plan.domains.find((d) => d.key === 'user')!.name).toBe('user') // 원본 불변
    const renamed = next.domains.find((d) => d.key === 'user')!
    expect(renamed.key).toBe('user')
    expect(renamed.name).toBe('Accounts')
  })

  it('renameDomain throws on unknown key', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(() => renameDomain(plan, 'nope', 'X')).toThrow(/unknown domain key/)
  })

  it('mergeDomains absorbs roots and records fromKey in aliasKeys', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = mergeDomains(plan, 'user', 'order')
    expect(next).not.toBe(plan)
    expect(plan.domains.map((d) => d.key)).toEqual(['order', 'user']) // 원본 불변
    expect(next.domains.map((d) => d.key)).toEqual(['order'])
    const order = next.domains[0]
    expect(order.roots).toEqual([
      'src/order/OrderController.java',
      'src/user/UserController.java',
    ])
    expect(order.aliasKeys).toEqual(['user'])
  })

  it('mergeDomains rejects self-merge and unknown keys', () => {
    const plan = buildAutoPlan(sampleCandidates())
    expect(() => mergeDomains(plan, 'user', 'user')).toThrow(/itself/)
    expect(() => mergeDomains(plan, 'user', 'nope')).toThrow(/unknown domain key/)
  })

  it('moveRoot transfers a root to another domain (sorted)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = moveRoot(plan, 'src/user/UserController.java', 'order')
    expect(next).not.toBe(plan)
    expect(next.domains.find((d) => d.key === 'order')!.roots).toEqual([
      'src/order/OrderController.java',
      'src/user/UserController.java',
    ])
    // user 도메인은 마지막 루트가 빠져 사라진다.
    expect(next.domains.find((d) => d.key === 'user')).toBeUndefined()
  })

  it('excludeDomain removes the domain and records key in excludedKeys (sorted)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const next = excludeDomain(plan, 'user')
    expect(next).not.toBe(plan)
    expect(plan.excludedKeys).toEqual([]) // 원본 불변
    expect(next.domains.map((d) => d.key)).toEqual(['order'])
    expect(next.excludedKeys).toEqual(['user'])
  })
})

describe('confirm — detectPlanDrift', () => {
  it('detects added and removed roots vs fresh candidates (sorted)', () => {
    const plan = buildAutoPlan(sampleCandidates())
    const fresh = sampleCandidates()
    // order 루트 삭제(제거됨), 새 payment 후보 추가(추가됨).
    fresh.candidates = [
      {
        key: 'user',
        roots: ['src/user/UserController.java'],
        entryCount: 1,
        files: [],
      },
      {
        key: 'payment',
        roots: ['src/payment/PaymentController.java'],
        entryCount: 1,
        files: [],
      },
    ]
    const drift = detectPlanDrift(plan, fresh)
    expect(drift.removedRoots).toEqual(['src/order/OrderController.java'])
    expect(drift.addedRoots).toEqual(['src/payment/PaymentController.java'])
  })
})

describe('confirm — planTable returns deterministic data rows', () => {
  it('rows from candidates carry entryCount and fileCount (sorted by key)', () => {
    const rows = planTable(sampleCandidates())
    expect(rows).toEqual([
      { key: 'order', name: 'order', rootCount: 1, entryCount: 2, fileCount: 2 },
      { key: 'user', name: 'user', rootCount: 1, entryCount: 1, fileCount: 2 },
    ])
  })

  it('rows from a plan reflect renamed display names', () => {
    const plan = renameDomain(buildAutoPlan(sampleCandidates()), 'user', 'Accounts')
    const rows = planTable(plan)
    expect(rows.find((r) => r.key === 'user')!.name).toBe('Accounts')
  })
})

describe('confirm — write/read round-trip is stable', () => {
  it('writeConfirmedPlan then readConfirmedPlan returns equal plan; null if absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'confirm-'))
    try {
      expect(readConfirmedPlan(dir)).toBeNull()
      const plan: ConfirmedPlan = buildAutoPlan(sampleCandidates(), 'tester')
      const path = writeConfirmedPlan(dir, plan)
      expect(path).toMatch(/domain-plan\.confirmed\.json$/)
      const read = readConfirmedPlan(dir)
      expect(read).not.toBeNull()
      expect(stableJson(read)).toBe(stableJson(plan))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
