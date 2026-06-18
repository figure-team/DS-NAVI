/**
 * SKELETON × METHOD-CALL GRAPH 통합(P3 refinement) — buildSkeleton 이 methodCallGraph 를
 * 받으면 flow 의 step 을 메서드 트레이스(reachableFlowFiles)로 정련하고, 받지 않으면
 * 기존 P2 파일 단위 폴백을 유지함을 확인한다.
 *
 * 기존 skeleton.test.ts 의 단언은 건드리지 않는다(이 파일은 추가만).
 *
 * 정직성 노트(검증된 한계):
 *   라우트 추출의 handler 는 `Class#method` 형식인 반면, reachableFlowFiles 는 bare
 *   메서드명(callerMethod)으로 매칭한다. 따라서 실제 추출 routes 를 그대로 쓰면 HTTP
 *   라우트의 P3 트레이스는 매칭되지 않아 항상 파일 단위로 폴백한다(아래 첫 테스트로 락).
 *   메서드 정밀 트레이스가 실제로 발화하려면 handler 가 bare 메서드명이어야 한다
 *   (아래 두 번째/세 번째 테스트가 그 동작을 입증).
 */
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildAutoPlan } from './confirm.js'
import { buildSkeleton } from './skeleton.js'
import { buildMethodCallGraph, reachableFlowFiles } from './method-calls.js'
import { stableJson } from './persist.js'
import type { RoutesReport, SkeletonReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')

const ORDER_ROOT = 'src/main/java/com/shop/web/OrderController.java'
const ORDER_SERVICE = 'src/main/java/com/shop/service/OrderService.java'

/** shop-mini 의 산출물 + (옵션) bare-handler routes 를 만든다. */
async function buildInputs(bareHandlers = false) {
  const census = buildCensus(shopMini)
  let routes = await extractRoutes(shopMini, census)
  if (bareHandlers) {
    routes = {
      ...routes,
      routes: routes.routes.map((r) =>
        r.handler && r.handler.includes('#')
          ? { ...r, handler: r.handler.split('#')[1] }
          : r,
      ),
    } as RoutesReport
  }
  const edges = await extractEdges(shopMini, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  const methodCallGraph = await buildMethodCallGraph(shopMini, census)
  return { census, routes, edges, slices, candidates, plan, methodCallGraph }
}

/** POST /orders flow 의 step 파일을 순서대로. */
function orderSteps(sk: SkeletonReport): string[] {
  return sk.nodes
    .filter((n) => n.type === 'step' && n.id.includes('POST /orders'))
    .map((n) => n.filePath!)
}

describe('skeleton — reachableFlowFiles primitive', () => {
  it('traces handler -> reachable project files in call-depth order', async () => {
    const { methodCallGraph } = await buildInputs()
    const reached = reachableFlowFiles(methodCallGraph, ORDER_ROOT, 'create')
    expect(reached).toEqual([ORDER_ROOT, ORDER_SERVICE])
  })

  it('returns only the root when the handler method has no resolved calls', async () => {
    const { methodCallGraph } = await buildInputs()
    const reached = reachableFlowFiles(methodCallGraph, ORDER_ROOT, 'noSuchMethod')
    expect(reached).toEqual([ORDER_ROOT])
  })

  it('Class#method handler form does NOT match (bare-name limitation)', async () => {
    const { methodCallGraph } = await buildInputs()
    // documented limitation: extraction yields "OrderController#create" but the
    // trace matches on bare callerMethod -> no match -> root only.
    const reached = reachableFlowFiles(methodCallGraph, ORDER_ROOT, 'OrderController#create')
    expect(reached).toEqual([ORDER_ROOT])
  })
})

describe('skeleton — methodCallGraph refinement vs file-level fallback', () => {
  it('WITHOUT methodCallGraph: P2 file-level steps (multi-file reached set)', async () => {
    const { methodCallGraph: _omit, ...input } = await buildInputs(true)
    const sk = await buildSkeleton(shopMini, input, {})
    const steps = orderSteps(sk)
    // file-level fallback yields the full sorted reached set (>2 files).
    expect(steps.length).toBeGreaterThan(2)
    expect(steps).toContain(ORDER_ROOT)
    expect(steps).toContain('src/main/resources/com/shop/mapper/OrderMapper.xml')
  })

  it('WITH methodCallGraph (bare handler): steps are the method-traced path', async () => {
    const input = await buildInputs(true)
    const sk = await buildSkeleton(shopMini, input, {})
    const steps = orderSteps(sk)
    // method trace reaches exactly OrderController -> OrderService.
    expect(new Set(steps)).toEqual(new Set([ORDER_ROOT, ORDER_SERVICE]))
  })

  it('method-traced steps are a strict subset of the file-level fallback', async () => {
    const input = await buildInputs(true)
    const { methodCallGraph: _omit, ...noGraph } = input
    const fileLevel = orderSteps(await buildSkeleton(shopMini, noGraph, {}))
    const traced = orderSteps(await buildSkeleton(shopMini, input, {}))
    expect(traced.length).toBeLessThan(fileLevel.length)
    for (const f of traced) expect(fileLevel).toContain(f)
  })

  it('WITH methodCallGraph and real Class#method handler: trace engages (wiring fix)', async () => {
    // real extracted routes keep "OrderController#create"; collectFlows now strips the
    // "Class#" prefix to the bare method, so the method trace fires for real routes too.
    const input = await buildInputs(false)
    const { methodCallGraph: _omit, ...noGraph } = input
    const withGraph = orderSteps(await buildSkeleton(shopMini, input, {}))
    const without = orderSteps(await buildSkeleton(shopMini, noGraph, {}))
    // method-traced path is the precise OrderController -> OrderService subset...
    expect(new Set(withGraph)).toEqual(new Set([ORDER_ROOT, ORDER_SERVICE]))
    // ...strictly smaller than the P2 file-level fallback.
    expect(withGraph.length).toBeLessThan(without.length)
  })

  it('refinement anchors the root as the first traced step (lowest flow_step weight)', async () => {
    const input = await buildInputs(true)
    const sk = await buildSkeleton(shopMini, input, {})
    // step nodes are id-sorted in the array; traced ORDER is encoded in flow_step
    // edge weights ((i+1)/total). The root step carries the lowest weight.
    const flowStepEdges = sk.edges
      .filter((e) => e.type === 'flow_step' && e.source.includes('POST /orders'))
      .sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0))
    expect(flowStepEdges[0].target).toBe(`step:POST /orders:${ORDER_ROOT}`)
  })

  it('skeleton with methodCallGraph is deterministic (byte-identical twice)', async () => {
    const input = await buildInputs(true)
    const a = await buildSkeleton(shopMini, input, {})
    const b = await buildSkeleton(shopMini, input, {})
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it('step nodes from a refined flow still carry layer + stepSources', async () => {
    const input = await buildInputs(true)
    const sk = await buildSkeleton(shopMini, input, {})
    const orderStepNodes = sk.nodes.filter(
      (n) => n.type === 'step' && n.id.includes('POST /orders'),
    )
    for (const n of orderStepNodes) {
      expect(n.layer).toBeDefined()
      const src = sk.stepSources.find((s) => s.stepId === n.id)
      expect(src).toBeDefined()
    }
  })
})
