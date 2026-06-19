import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, cp, mkdir, writeFile, readFile } from 'node:fs/promises'
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
import { buildBundles } from './bundle.js'
import { fillPathFor } from './fill.js'
import { runFillPipeline } from './fill-pipeline.js'
import { writeSkeleton } from './persist.js'
import { NEEDS_REVIEW_MARKER } from './emit.js'
import type { SkeletonReport } from './types.js'

// Stage-17 통합: scan→confirm(auto)→bundle→fill(호스트 역할 시뮬레이션)→emit.
// 실제 디스크에서 부분 채움(pending)·환각 강등·하이브리드 폴백·domain-graph 산출.

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')
const FIXED = { analyzedAt: '2026-06-11T00:00:00.000Z', projectName: 'shop-mini' }

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ktds-fill-pipeline-'))
  // shop-mini 의 소스만 복사(기존 산출물은 제외 — skeleton 은 새로 쓴다).
  await cp(join(shopMini, 'src'), join(root, 'src'), { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function buildAndWriteSkeleton(): Promise<SkeletonReport> {
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  const skeleton = await buildSkeleton(root, { census, routes, edges, slices, candidates, plan })
  writeSkeleton(root, skeleton)
  return skeleton
}

describe('fill-pipeline — scan→bundle→fill→emit E2E', () => {
  it('부분 채움·환각 강등·하이브리드 폴백·domain-graph 산출', async () => {
    const skeleton = await buildAndWriteSkeleton()
    expect(skeleton.nodes.filter((n) => n.type === 'domain').map((n) => n.id)).toEqual([
      'domain:order',
      'domain:user',
    ])

    const { bundles } = await buildBundles(root, skeleton)
    const orderBundle = bundles.find((b) => b.key === 'order')!
    expect(orderBundle.flows[0].entryPoint).toBe('OrderController#create')

    // ── 호스트 역할: order 만 채움(user 는 pending) ──
    const flowId = orderBundle.flows[0].flowId
    const stepIds = orderBundle.flows[0].stepIds
    const CTRL = 'src/main/java/com/shop/web/OrderController.java'
    const fill = {
      schemaVersion: 1,
      domainId: 'domain:order',
      name: '주문',
      summary: {
        text: '주문 생성을 담당한다.',
        citations: [{ filePath: CTRL, line: 12, snippet: 'public class OrderController' }],
      },
      entities: [],
      businessRules: [
        {
          text: '주문은 컨트롤러를 통해 접수된다',
          citations: [{ filePath: CTRL, line: 12, snippet: 'public class OrderController' }],
        },
        {
          // 환각: 존재하지 않는 라인 내용
          text: 'VIP는 무료배송',
          citations: [{ filePath: CTRL, line: 3, snippet: 'VIP free shipping policy' }],
        },
      ],
      crossDomainInteractions: [],
      flows: [
        {
          flowId,
          name: '주문 생성',
          summary: {
            text: 'POST /orders 접수',
            citations: [{ filePath: CTRL, line: 12, snippet: 'public class OrderController' }],
          },
        },
      ],
      steps: stepIds.map((stepId) => ({
        stepId,
        name: '체인 단계',
        summary: {
          text: '주문 체인의 한 단계',
          citations: [{ filePath: CTRL, line: 12, snippet: 'public class OrderController' }],
        },
      })),
    }
    await mkdir(dirname(fillPathFor(root, 'order')), { recursive: true })
    await writeFile(fillPathFor(root, 'order'), JSON.stringify(fill), 'utf8')

    const result = await runFillPipeline(root, FIXED)
    expect(result.pending).toEqual(['user'])
    expect(result.invalid).toEqual([])
    expect(result.rejected).toEqual([])

    // 환각 1건만 NEEDS_REVIEW, 나머지 GROUNDED
    const orderResult = result.report.domains.find((d) => d.domainId === 'domain:order')!
    const hallucinated = orderResult.items.find((i) => i.text === 'VIP는 무료배송')!
    expect(hallucinated.verdict).toBe('NEEDS_REVIEW')
    expect(orderResult.items.filter((i) => i.verdict === 'GROUNDED').length).toBe(
      orderResult.items.length - 1,
    )

    const graph = JSON.parse(await readFile(join(root, '.understand-anything/domain-graph.json'), 'utf8'))
    expect(graph.version).toBe('1.0.0')
    expect(Array.isArray(graph.layers)).toBe(true)
    const domainNode = graph.nodes.find((n: { id: string }) => n.id === 'domain:order')
    expect(domainNode.name).toBe('주문')
    expect(domainNode.domainMeta.businessRules).toEqual([
      '주문은 컨트롤러를 통해 접수된다',
      `${NEEDS_REVIEW_MARKER}VIP는 무료배송`,
    ])

    // user 도메인은 pending → 하이브리드 폴백으로 결정론 라벨이 채워진다(빈 이름 아님).
    const userNode = graph.nodes.find((n: { id: string }) => n.id === 'domain:user')
    expect(userNode.name).not.toBe('')
    expect(userNode.summary).toMatch(/기능/)
    // 단, unfilled 는 채움 전 빈칸 기준으로 user 도메인을 보고한다.
    expect(result.unfilled).toContain('domain:user')

    // skeleton 엣지가 그대로 실린다(구조 read-only).
    expect(graph.edges).toEqual(skeleton.edges)
  })

  it('멱등 재시도: emit 재실행 → 같은 리포트, 둘 다 pending', async () => {
    await buildAndWriteSkeleton()
    const a = await runFillPipeline(root, FIXED)
    const b = await runFillPipeline(root, FIXED)
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report))
    expect(a.pending).toEqual(['order', 'user'])
  })

  it('결정론: 채운 fill 로 2회 emit → domain-graph byte 동일', async () => {
    await buildAndWriteSkeleton()
    const rootB = await mkdtemp(join(tmpdir(), 'ktds-fill-pipeline-b-'))
    try {
      await cp(join(shopMini, 'src'), join(rootB, 'src'), { recursive: true })
      // rootB 도 동일 skeleton 빌드(결정론 전제)
      const censusB = buildCensus(rootB)
      const routesB = await extractRoutes(rootB, censusB)
      const edgesB = await extractEdges(rootB, censusB)
      const slicesB = buildSlices(censusB, routesB, edgesB)
      const candidatesB = buildCandidates(censusB, routesB, slicesB)
      const planB = buildAutoPlan(candidatesB)
      const skB = await buildSkeleton(rootB, {
        census: censusB,
        routes: routesB,
        edges: edgesB,
        slices: slicesB,
        candidates: candidatesB,
        plan: planB,
      })
      writeSkeleton(rootB, skB)
      await runFillPipeline(root, FIXED)
      await runFillPipeline(rootB, FIXED)
      const fa = await readFile(join(root, '.understand-anything/domain-graph.json'), 'utf8')
      const fb = await readFile(join(rootB, '.understand-anything/domain-graph.json'), 'utf8')
      expect(fa).toBe(fb)
    } finally {
      await rm(rootB, { recursive: true, force: true })
    }
  })

  it('skeleton 부재 시 명시적 오류(조용한 빈 그래프 금지)', async () => {
    await expect(runFillPipeline(root)).rejects.toThrow(/skeleton/)
  })
})
