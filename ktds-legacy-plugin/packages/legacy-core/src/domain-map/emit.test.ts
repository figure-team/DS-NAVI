import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, cp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildAutoPlan } from './confirm.js'
import { buildSkeleton } from './skeleton.js'
import { emitDomainGraph } from './emit.js'
import { loadProjectGraph } from '../orchestrator/index.js'
import type { SkeletonReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')
const dualLoadSample = join(here, '..', '..', 'fixtures', 'dual-load', 'sample')

/** Build a real ktds skeleton from the shop-mini fixture (auto-confirmed plan). */
async function shopMiniSkeleton(): Promise<SkeletonReport> {
  const census = buildCensus(shopMini)
  const routes = await extractRoutes(shopMini, census)
  const edges = await extractEdges(shopMini, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  return buildSkeleton(shopMini, { census, routes, edges, slices, candidates, plan })
}

describe('emit — structural domain-graph.json (pre-LLM-fill)', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-emit-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes .understand-anything/domain-graph.json as a full UA KG envelope', async () => {
    const skeleton = await shopMiniSkeleton()
    const out = emitDomainGraph(root, skeleton)
    expect(out.nodes).toBe(skeleton.nodes)
    expect(out.edges).toBe(skeleton.edges)

    const raw = await readFile(join(root, '.understand-anything', 'domain-graph.json'), 'utf8')
    const parsed = JSON.parse(raw) as {
      version: string
      project: { name: string; analyzedAt: string; gitCommitHash: string }
      nodes: unknown[]
      edges: unknown[]
      layers: unknown[]
      tour: unknown[]
      ktdsMap: { generatedFromCommit: string }
    }
    // 대시보드가 standalone 그래프로 검증·렌더하려면 envelope(version/project/layers/tour)가 필수.
    expect(parsed.version).toBe('1.0.0')
    expect(typeof parsed.project.name).toBe('string')
    expect(typeof parsed.project.analyzedAt).toBe('string')
    expect(Array.isArray(parsed.layers)).toBe(true)
    expect(Array.isArray(parsed.tour)).toBe(true)
    expect(parsed.ktdsMap.generatedFromCommit).toBe(skeleton.gitCommit ?? '')
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(Array.isArray(parsed.edges)).toBe(true)
    expect(parsed.nodes.length).toBe(skeleton.nodes.length)
    expect(parsed.edges.length).toBe(skeleton.edges.length)
  })

  it('dual-load merges a REAL ktds-produced overlay onto the UA KG', async () => {
    // Seed only the UA native KG (no domain overlay yet).
    await mkdir(join(root, '.understand-anything'), { recursive: true })
    await cp(
      join(dualLoadSample, '.understand-anything', 'knowledge-graph.json'),
      join(root, '.understand-anything', 'knowledge-graph.json'),
    )

    // Produce + emit a real ktds skeleton overlay into the same project.
    const skeleton = await shopMiniSkeleton()
    emitDomainGraph(root, skeleton)

    const merged = await loadProjectGraph(root)
    expect(merged.nativeNodeCount).toBeGreaterThan(0)
    expect(merged.overlayNodeCount).toBe(skeleton.nodes.length)

    // Overlay domain/flow/step nodes are present in the merged graph.
    const ids = new Set(merged.nodes.map((n) => n.id))
    expect(ids.has('domain:order')).toBe(true)
    expect(ids.has('flow:POST /orders')).toBe(true)
    expect(
      ids.has('step:POST /orders:src/main/java/com/shop/web/OrderController.java'),
    ).toBe(true)
    // Base UA nodes still present.
    expect(ids.has('file:src/auth/Auth.java')).toBe(true)

    // Overlay edges touching new nodes survive the merge filter.
    const edgeKeys = new Set(merged.edges.map((e) => `${e.source}|${e.target}|${e.type}`))
    expect(edgeKeys.has('domain:order|flow:POST /orders|contains_flow')).toBe(true)
  })

  it('emit output is deterministic (skeleton already sorted -> byte-identical file)', async () => {
    const a = await shopMiniSkeleton()
    const rootA = await mkdtemp(join(tmpdir(), 'ktds-emit-a-'))
    const rootB = await mkdtemp(join(tmpdir(), 'ktds-emit-b-'))
    // projectName/analyzedAt 를 고정해 시각·temp 디렉터리명에 의존하지 않게 한다
    // (envelope 도입 후에도 동일 입력 -> byte-identical 보장).
    const fixed = { projectName: 'shop-mini', analyzedAt: '2026-01-01T00:00:00.000Z' }
    try {
      emitDomainGraph(rootA, a, fixed)
      emitDomainGraph(rootB, await shopMiniSkeleton(), fixed)
      const fileA = await readFile(join(rootA, '.understand-anything', 'domain-graph.json'), 'utf8')
      const fileB = await readFile(join(rootB, '.understand-anything', 'domain-graph.json'), 'utf8')
      expect(fileA).toBe(fileB)
    } finally {
      await rm(rootA, { recursive: true, force: true })
      await rm(rootB, { recursive: true, force: true })
    }
  })
})
