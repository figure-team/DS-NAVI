import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { buildCensus } from './census.js'
import { buildMap, extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildAutoPlan, excludeDomain, renameDomain } from './confirm.js'
import { buildSkeleton } from './skeleton.js'
import { stableJson, writeConfirmedPlan } from './persist.js'
import {
  buildCrossDomainGraph,
  buildDomainMapSummary,
  scoreDomains,
  buildNameSuggestionContext,
} from './domain-map.js'
import type { SkeletonReport, EdgesReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')

/**
 * shop-mini 의 결정론 골격 + 엣지를 파일 쓰기 없이 in-memory 로 조립한다.
 * 확정 플랜은 후보를 그대로 수용하는 buildAutoPlan 으로 빌드한다(테스트 격리).
 */
async function buildFixture(): Promise<{ skeleton: SkeletonReport; edges: EdgesReport }> {
  const census = buildCensus(shopMini)
  const routes = await extractRoutes(shopMini, census)
  const edges = await extractEdges(shopMini, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates, 'tester')
  const skeleton = await buildSkeleton(shopMini, {
    census,
    routes,
    edges,
    slices,
    candidates,
    plan,
  })
  return { skeleton, edges }
}

describe('domain-map E-c — cross-domain dependency graph (AC-33)', () => {
  it('emits a grounded cross-domain edge when two domains depend on each other', async () => {
    const { skeleton, edges } = await buildFixture()
    const graph = buildCrossDomainGraph(skeleton, edges)

    expect(graph.schemaVersion).toBe(1)
    expect(graph.edges.length).toBeGreaterThan(0)

    // 모든 엣지는 grounded — 근거 파일 엣지를 보유하고 weight 가 그 수와 일치.
    for (const e of graph.edges) {
      expect(e.evidence.length).toBeGreaterThan(0)
      expect(e.weight).toBe(e.evidence.length)
      for (const ev of e.evidence) {
        expect(typeof ev.source).toBe('string')
        expect(typeof ev.target).toBe('string')
        expect(typeof ev.kind).toBe('string')
      }
    }
  })

  it('excludes self-domain edges', async () => {
    const { skeleton, edges } = await buildFixture()
    const graph = buildCrossDomainGraph(skeleton, edges)
    for (const e of graph.edges) {
      expect(e.from).not.toBe(e.to)
    }
  })

  it('sorts edges by (from, to)', async () => {
    const { skeleton, edges } = await buildFixture()
    const graph = buildCrossDomainGraph(skeleton, edges)
    const keys = graph.edges.map((e) => `${e.from} ${e.to}`)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('domain-map E-b — onboarding priority (AC-32)', () => {
  it('computes deterministic component scores and 1-based rank', async () => {
    const { skeleton, edges } = await buildFixture()
    const graph = buildCrossDomainGraph(skeleton, edges)
    const priorities = scoreDomains(skeleton, graph)

    expect(priorities.length).toBeGreaterThan(0)
    for (const p of priorities) {
      expect(p.priorityScore).toBe(
        p.complexityScore * 3 + p.couplingScore * 2 + p.sizeScore * 1,
      )
      expect(p.sizeScore).toBeGreaterThanOrEqual(0)
      expect(p.complexityScore).toBeGreaterThanOrEqual(0)
      expect(p.couplingScore).toBeGreaterThanOrEqual(0)
    }
    // rank 는 1..N 의 1-based 연속 위치.
    expect(priorities.map((p) => p.rank)).toEqual(
      priorities.map((_, i) => i + 1),
    )
  })

  it('orders by priorityScore DESC then key ASC (deterministic tie-break)', async () => {
    const { skeleton, edges } = await buildFixture()
    const graph = buildCrossDomainGraph(skeleton, edges)
    const priorities = scoreDomains(skeleton, graph)
    for (let i = 1; i < priorities.length; i++) {
      const prev = priorities[i - 1]
      const cur = priorities[i]
      const ordered =
        prev.priorityScore > cur.priorityScore ||
        (prev.priorityScore === cur.priorityScore && prev.key < cur.key)
      expect(ordered).toBe(true)
    }
  })
})

describe('domain-map E-a — LLM name-suggestion context (AC-31)', () => {
  it('produces per-domain sampleFiles and tokens', () => {
    const census = buildCensus(shopMini)
    return (async () => {
      const routes = await extractRoutes(shopMini, census)
      const edges = await extractEdges(shopMini, census)
      const slices = buildSlices(census, routes, edges)
      const candidates = buildCandidates(census, routes, slices)
      const ctx = buildNameSuggestionContext(candidates)

      expect(ctx.schemaVersion).toBe(1)
      expect(ctx.domains.length).toBe(candidates.candidates.length)
      for (const d of ctx.domains) {
        expect(d.key.length).toBeGreaterThan(0)
        expect(d.currentName).toBe(d.key)
        expect(d.sampleFiles.length).toBeGreaterThan(0)
        expect(d.tokens.length).toBeGreaterThan(0)
        // 정렬 결정론.
        expect(d.sampleFiles).toEqual([...d.sampleFiles].sort())
        expect(d.tokens).toEqual([...d.tokens].sort())
      }
    })()
  })

  it('renameDomain applied with an LLM-style name keeps key, updates name (AC-31)', async () => {
    const census = buildCensus(shopMini)
    const routes = await extractRoutes(shopMini, census)
    const edges = await extractEdges(shopMini, census)
    const slices = buildSlices(census, routes, edges)
    const candidates = buildCandidates(census, routes, slices)
    const plan = buildAutoPlan(candidates, 'tester')
    const key = plan.domains[0].key
    const renamed = renameDomain(plan, key, '주문 도메인')
    const d = renamed.domains.find((x) => x.key === key)!
    expect(d.key).toBe(key) // key 불변.
    expect(d.name).toBe('주문 도메인')
  })
})

describe('domain-map AC-3 — summary per-domain aggregation', () => {
  it('flowCount/nodeCount correct, grounded=true with anchors, sampleAnchors carry file:line', async () => {
    const { skeleton, edges } = await buildFixture()
    const graph = buildCrossDomainGraph(skeleton, edges)
    const priorities = scoreDomains(skeleton, graph)
    const priorityByKey = new Map(priorities.map((p) => [p.key, p]))

    // skeleton 에서 직접 집계해 요약 산출의 정확성을 교차검증한다.
    const domainKeys = skeleton.nodes
      .filter((n) => n.type === 'domain')
      .map((n) => n.tags[0])
    expect(domainKeys.length).toBeGreaterThan(0)

    for (const key of domainKeys) {
      const flows = skeleton.nodes.filter((n) => n.type === 'flow' && n.tags[0] === key)
      const members = skeleton.nodes.filter(
        (n) => (n.type === 'flow' || n.type === 'step') && n.tags[0] === key,
      )
      expect(members.length).toBeGreaterThanOrEqual(flows.length)
      // 모든 멤버가 앵커를 가지므로 grounded=true 여야 한다.
      const grounded = members.every(
        (n) => typeof n.filePath === 'string' && Array.isArray(n.lineRange),
      )
      expect(grounded).toBe(true)
      // 우선순위 sizeScore = 멤버 노드 수.
      expect(priorityByKey.get(key)!.sizeScore).toBe(members.length)
      // flow 노드는 file:line 앵커를 갖는다.
      for (const f of flows) {
        expect(typeof f.filePath).toBe('string')
        expect(Array.isArray(f.lineRange)).toBe(true)
      }
    }
  })
})

describe('domain-map — determinism (byte-identical re-runs)', () => {
  it('cross-domain graph + priority build twice byte-identical', async () => {
    const a = await buildFixture()
    const b = await buildFixture()
    const gA = buildCrossDomainGraph(a.skeleton, a.edges)
    const gB = buildCrossDomainGraph(b.skeleton, b.edges)
    expect(stableJson(gA)).toBe(stableJson(gB))
    expect(stableJson(scoreDomains(a.skeleton, gA))).toBe(
      stableJson(scoreDomains(b.skeleton, gB)),
    )
  })
})

describe('domain-map — 확정 플랜 드리프트 표면화(낡은 플랜 폭주 방지)', () => {
  it('플랜과 후보가 어긋나면 buildMap/summary 가 planDrift 를 싣는다', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ua-drift-'))
    try {
      cpSync(shopMini, tmp, { recursive: true })
      const first = await buildMap(tmp)
      expect(first.needsConfirm).toBe(true)

      // 후보 그대로 확정 → 드리프트 없음.
      const plan = buildAutoPlan(first.candidates, 'tester')
      writeConfirmedPlan(tmp, plan)
      const clean = await buildMap(tmp)
      if (clean.needsConfirm) throw new Error('confirmed plan must be picked up')
      expect(clean.planDrift).toEqual({ addedRoots: [], removedRoots: [] })

      // ops(exclude)로 의도적으로 뺀 도메인의 루트는 드리프트 오탐이 아니어야 한다.
      const excludedKey = plan.domains[1].key
      const excludedRoot = plan.domains[1].roots[0]
      writeConfirmedPlan(tmp, excludeDomain(plan, excludedKey))
      const withExclude = await buildMap(tmp)
      if (withExclude.needsConfirm) throw new Error('confirmed plan must be picked up')
      expect(withExclude.planDrift.addedRoots).not.toContain(excludedRoot)
      expect(withExclude.planDrift.removedRoots).toEqual([])
      writeConfirmedPlan(tmp, plan) // 원복

      // 낡은 플랜 시뮬레이션: 첫 도메인의 실제 루트를 유령 루트로 바꿔치기.
      const realRoot = plan.domains[0].roots[0]
      const stale = {
        ...plan,
        domains: [
          { ...plan.domains[0], roots: ['src/ghost/GhostController.java'] },
          ...plan.domains.slice(1),
        ],
      }
      writeConfirmedPlan(tmp, stale)
      const summary = await buildDomainMapSummary(tmp)
      expect(summary.planDrift).toBeDefined()
      expect(summary.planDrift!.addedRoots).toContain(realRoot)
      expect(summary.planDrift!.removedRoots).toEqual(['src/ghost/GhostController.java'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
