import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildAutoPlan } from './confirm.js'
import { buildSkeleton, DEFAULT_STEP_CAP } from './skeleton.js'
import { stableJson } from './persist.js'
import type { ConfirmedPlan, SkeletonReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')

/** shop-mini 의 다섯 산출물 + 확정 플랜(자동수용)을 인메모리로 만든다(파일 격리). */
async function buildShopMiniSkeleton(stepCap?: number): Promise<{
  skeleton: SkeletonReport
  plan: ConfirmedPlan
}> {
  const census = buildCensus(shopMini)
  const routes = await extractRoutes(shopMini, census)
  const edges = await extractEdges(shopMini, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  const skeleton = await buildSkeleton(
    shopMini,
    { census, routes, edges, slices, candidates, plan },
    stepCap !== undefined ? { stepCap } : {},
  )
  return { skeleton, plan }
}

describe('skeleton — shop-mini structural (S6, P2 file-level steps)', () => {
  it('requires a ConfirmedPlan (throws when absent)', async () => {
    const census = buildCensus(shopMini)
    const routes = await extractRoutes(shopMini, census)
    const edges = await extractEdges(shopMini, census)
    const slices = buildSlices(census, routes, edges)
    const candidates = buildCandidates(census, routes, slices)
    await expect(
      // @ts-expect-error — deliberately omit plan to assert the guard
      buildSkeleton(shopMini, { census, routes, edges, slices, candidates, plan: undefined }),
    ).rejects.toThrow(/confirm first/)
  })

  it('domain/flow/step node id formats', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    const byType = (t: string) => skeleton.nodes.filter((n) => n.type === t)

    const domains = byType('domain')
    expect(domains.map((n) => n.id).sort()).toEqual(['domain:order', 'domain:user'])

    const flows = byType('flow')
    // flowId reuses the route natural key (route:POST /orders -> flow:POST /orders)
    expect(flows.map((n) => n.id).sort()).toEqual(['flow:GET /users/{id}', 'flow:POST /orders'])

    const steps = byType('step')
    expect(steps.length).toBeGreaterThan(0)
    // step id = step:<flowKey>:<relPath>
    for (const s of steps) {
      expect(s.id).toMatch(/^step:(POST \/orders|GET \/users\/\{id\}):src\/main\//)
    }
  })

  it('flow anchors carry filePath + lineRange', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    const flows = skeleton.nodes.filter((n) => n.type === 'flow')
    const orderFlow = flows.find((n) => n.id === 'flow:POST /orders')!
    expect(orderFlow.filePath).toBe('src/main/java/com/shop/web/OrderController.java')
    expect(orderFlow.lineRange).toEqual([17, 17]) // route line in routes.json
    expect(orderFlow.domainMeta).toMatchObject({ entryType: 'http' })
    for (const f of flows) {
      expect(f.filePath).toBeDefined()
      expect(f.lineRange).toBeDefined()
    }
  })

  it('step.layer is assigned matching the chain (api/service/dao/db)', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    const layerOf = (suffix: string) =>
      skeleton.nodes.find((n) => n.type === 'step' && n.filePath?.endsWith(suffix))?.layer

    expect(layerOf('web/OrderController.java')).toBe('api')
    expect(layerOf('service/OrderService.java')).toBe('service')
    expect(layerOf('mapper/OrderMapper.java')).toBe('dao')
    expect(layerOf('mapper/OrderMapper.xml')).toBe('db')
  })

  it('flow_step weights monotonic increasing, last ≈ 1', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    const orderSteps = skeleton.edges
      .filter((e) => e.type === 'flow_step' && e.source === 'flow:POST /orders')
      .map((e) => e.weight!)
    expect(orderSteps.length).toBeGreaterThan(1)
    for (let i = 1; i < orderSteps.length; i++) {
      expect(orderSteps[i]).toBeGreaterThan(orderSteps[i - 1])
    }
    expect(orderSteps[orderSteps.length - 1]).toBeCloseTo(1, 5)
  })

  it('truncatedSteps empty when under cap; populated when cap exceeded', async () => {
    // shop-mini order/user slices have 7 reached files each — under default cap 8.
    const { skeleton: full } = await buildShopMiniSkeleton()
    expect(full.stepCap).toBe(DEFAULT_STEP_CAP)
    expect(full.truncatedSteps).toEqual([])

    // Force a tiny cap to exercise honest truncation (no silent cap).
    const { skeleton: capped } = await buildShopMiniSkeleton(3)
    expect(capped.stepCap).toBe(3)
    expect(capped.truncatedSteps.length).toBeGreaterThan(0)
    for (const t of capped.truncatedSteps) {
      expect(t.dropped.length).toBeGreaterThan(0)
      expect(t.flowId).toMatch(/^flow:/)
    }
    // dropped files are NOT emitted as step nodes for that flow.
    for (const t of capped.truncatedSteps) {
      const flowKey = t.flowId.replace(/^flow:/, '')
      for (const file of t.dropped) {
        expect(capped.nodes.some((n) => n.id === `step:${flowKey}:${file}`)).toBe(false)
      }
    }
  })

  it('calls edges only where a real file dependency exists (both endpoints in chain)', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    const callEdges = skeleton.edges.filter((e) => e.type === 'calls')
    expect(callEdges.length).toBeGreaterThan(0)
    const stepIds = new Set(skeleton.nodes.filter((n) => n.type === 'step').map((n) => n.id))
    for (const e of callEdges) {
      expect(stepIds.has(e.source)).toBe(true)
      expect(stepIds.has(e.target)).toBe(true)
    }
    // OrderController -> OrderService dependency exists -> calls edge present.
    expect(
      callEdges.some(
        (e) =>
          e.source === 'step:POST /orders:src/main/java/com/shop/web/OrderController.java' &&
          e.target === 'step:POST /orders:src/main/java/com/shop/service/OrderService.java',
      ),
    ).toBe(true)
  })

  it('stepSources carry className + line', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    expect(skeleton.stepSources.length).toBeGreaterThan(0)
    const controller = skeleton.stepSources.find((s) =>
      s.relPath.endsWith('web/OrderController.java'),
    )!
    expect(controller.className).toBe('OrderController')
    expect(controller.line).toBeGreaterThan(0)
    // XML steps have no java class -> className null, line 1.
    const xml = skeleton.stepSources.find((s) => s.relPath.endsWith('OrderMapper.xml'))!
    expect(xml.className).toBeNull()
    expect(xml.line).toBe(1)
  })

  it('SKELETON_BLANK for name/summary on all nodes (pre-LLM-fill)', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    for (const n of skeleton.nodes) {
      expect(n.name).toBe('')
      expect(n.summary).toBe('')
    }
  })

  it('contains_flow edges link domain -> its flows', async () => {
    const { skeleton } = await buildShopMiniSkeleton()
    const contains = skeleton.edges.filter((e) => e.type === 'contains_flow')
    expect(contains).toContainEqual(
      expect.objectContaining({ source: 'domain:order', target: 'flow:POST /orders' }),
    )
  })

  it('determinism: buildSkeleton twice byte-identical', async () => {
    const a = await buildShopMiniSkeleton()
    const b = await buildShopMiniSkeleton()
    expect(stableJson(a.skeleton)).toBe(stableJson(b.skeleton))
  })
})
