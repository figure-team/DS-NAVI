import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices, DEFAULT_DEPTH_CAP } from './slices.js'
import type { SlicesReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')
const oraclePath = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini.expected.json')

interface Oracle {
  project: string
  chains: Array<{ root: string; mustReach: string[] }>
  knownGaps: string[]
}

function loadOracle(): Oracle {
  return JSON.parse(readFileSync(oraclePath, 'utf8'))
}

async function buildShopMiniSlices(depthCap?: number): Promise<SlicesReport> {
  const census = buildCensus(shopMini)
  const routes = await extractRoutes(shopMini, census)
  const edges = await extractEdges(shopMini, census)
  return buildSlices(census, routes, edges, depthCap)
}

describe('slices — shop-mini chain recall', () => {
  it('each root reaches its full oracle mustReach set (100% recall)', async () => {
    const oracle = loadOracle()
    const report = await buildShopMiniSlices()
    const reachedByRoot = new Map(report.slices.map((s) => [s.root, new Set(s.reached)]))
    expect(oracle.chains.length).toBeGreaterThanOrEqual(2)
    for (const chain of oracle.chains) {
      const reached = reachedByRoot.get(chain.root)
      expect(reached, `missing slice for root ${chain.root}`).toBeDefined()
      const missing = chain.mustReach.filter((f) => !reached!.has(f))
      expect(missing, `root ${chain.root} missing: ${missing.join(', ')}`).toEqual([])
    }
  })

  it('root files include themselves in reached', async () => {
    const report = await buildShopMiniSlices()
    for (const s of report.slices) {
      expect(s.reached).toContain(s.root)
    }
  })

  it('entryIds are the declared route ids (sorted, non-empty)', async () => {
    const report = await buildShopMiniSlices()
    for (const s of report.slices) {
      expect(s.entryIds.length).toBeGreaterThan(0)
      expect([...s.entryIds].sort()).toEqual(s.entryIds)
    }
  })

  it('ownership: FormatUtil is shared by both roots', async () => {
    const report = await buildShopMiniSlices()
    const fmt = report.ownership.find((o) => o.relPath.endsWith('util/FormatUtil.java'))
    expect(fmt).toBeDefined()
    expect(fmt!.status).toBe('shared')
    expect(fmt!.owners.length).toBe(2)
  })

  it('ownership: domain User is sole-owned by UserController', async () => {
    const report = await buildShopMiniSlices()
    const user = report.ownership.find((o) => o.relPath.endsWith('domain/User.java'))
    expect(user).toBeDefined()
    expect(user!.status).toBe('sole')
    expect(user!.owners).toEqual(['src/main/java/com/shop/web/UserController.java'])
  })

  it('ownership: OrphanThing is unreached (no owners)', async () => {
    const report = await buildShopMiniSlices()
    const orphan = report.ownership.find((o) => o.relPath.endsWith('orphan/OrphanThing.java'))
    expect(orphan).toBeDefined()
    expect(orphan!.status).toBe('unreached')
    expect(orphan!.owners).toEqual([])
  })

  it('uses DEFAULT_DEPTH_CAP and a tiny cap truncates reachability', async () => {
    const full = await buildShopMiniSlices()
    expect(full.depthCap).toBe(DEFAULT_DEPTH_CAP)

    // depthCap=1: from root, only directly-adjacent files (+root) are reached;
    // the deeper mapper-xml / domain leaves should not all be present.
    const capped = await buildShopMiniSlices(1)
    expect(capped.depthCap).toBe(1)
    for (const s of capped.slices) {
      const fullSlice = full.slices.find((f) => f.root === s.root)!
      expect(s.reached.length).toBeLessThan(fullSlice.reached.length)
    }
  })

  it('slices sorted by root, ownership sorted by relPath', async () => {
    const report = await buildShopMiniSlices()
    const roots = report.slices.map((s) => s.root)
    expect([...roots].sort()).toEqual(roots)
    const rels = report.ownership.map((o) => o.relPath)
    expect([...rels].sort()).toEqual(rels)
  })
})
