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
import { emitDomainGraph, embedVerification } from './emit.js'
import { validateGraph } from '@understand-anything/core/schema'
import { loadProjectGraph } from '../orchestrator/index.js'
import type { SkeletonReport, UaGraphNode } from './types.js'
import type { VerifyReport } from './verify.js'

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
    expect(out.edges).toBe(skeleton.edges)
    // 노드는 결정론 라벨이 적용된 사본 — 개수/순서는 보존하되 공란 이름이 채워진다.
    expect(out.nodes.length).toBe(skeleton.nodes.length)
    const outDomain = out.nodes.find((n) => n.type === 'domain')
    expect(outDomain?.name).not.toBe('') // SKELETON_BLANK 공란이 라벨로 채워짐
    expect(outDomain?.summary).toMatch(/기능/)

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

  it('UA core 자동 보정을 한 건도 유발하지 않는다(정식 어휘 — 대시보드 배너 소음 0)', async () => {
    // 엣지에 direction 을 안 쓰던 시절엔 UA 검증기가 엣지마다 'forward' 를 채워 넣고
    // auto-corrected 이슈를 1건씩 쌓았다(egov 실측 11776건 = 엣지 수). 배너는 그걸
    // "LLM generation errors" 로 안내해 사람을 엉뚱한 곳으로 보냈다.
    const skeleton = await shopMiniSkeleton()
    emitDomainGraph(root, skeleton)
    const raw = await readFile(join(root, '.understand-anything', 'domain-graph.json'), 'utf8')
    const result = validateGraph(JSON.parse(raw))

    expect(result.success).toBe(true)
    expect(result.issues.filter((i) => i.level === 'auto-corrected')).toEqual([])
  })

  it('groups 옵션은 ktdsMap.groups 로 투영되고, 없으면 필드가 생략된다(DOMAIN_HIERARCHY)', async () => {
    const skeleton = await shopMiniSkeleton()
    const groups = [{ key: 'g:common', name: '공통', memberKeys: ['order'] }]
    emitDomainGraph(root, skeleton, { groups })
    const withGroups = JSON.parse(
      await readFile(join(root, '.understand-anything', 'domain-graph.json'), 'utf8'),
    ) as { ktdsMap: { groups?: unknown } }
    expect(withGroups.ktdsMap.groups).toEqual(groups)

    // groups 부재·빈 배열 → 기존 평면 그래프와 동일(필드 자체가 없음 — 하위호환).
    emitDomainGraph(root, skeleton, { groups: [] })
    const flat = JSON.parse(
      await readFile(join(root, '.understand-anything', 'domain-graph.json'), 'utf8'),
    ) as { ktdsMap: Record<string, unknown> }
    expect('groups' in flat.ktdsMap).toBe(false)
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

describe('embedVerification — 검증결과를 노드 domainMeta 에 단일소스 임베드', () => {
  const report: VerifyReport = {
    schemaVersion: 1,
    gitCommit: 'abc',
    domains: [
      {
        domainId: 'domain:cart',
        items: [
          {
            kind: 'summary',
            ref: 'domain:cart',
            text: '장바구니',
            citations: [{ filePath: 'Cart.java', line: 32, snippet: 'class Cart impl', status: 'ok' }],
            verdict: 'GROUNDED',
          },
          {
            kind: 'businessRule',
            ref: 'domain:cart#businessRule[0]',
            text: '무료배송(환각)',
            citations: [{ filePath: 'Cart.java', line: 9999, snippet: 'free shipping', status: 'line-out-of-range' }],
            verdict: 'NEEDS_REVIEW',
          },
          {
            kind: 'flow',
            ref: 'flow:cart-add',
            text: '담기',
            citations: [{ filePath: 'CartActionBean.java', line: 45, snippet: 'addItemToCart()', status: 'ok' }],
            verdict: 'GROUNDED',
          },
        ],
        citationTotal: 3,
        citationOk: 2,
        groundedPct: 66.7,
      },
    ],
    overall: { itemTotal: 3, itemGrounded: 2, citationTotal: 3, citationOk: 2, groundedPct: 66.7 },
  }
  const mk = (id: string, type: UaGraphNode['type']): UaGraphNode => ({
    id,
    type,
    name: 'x',
    summary: 's',
    tags: ['cart'],
    complexity: 'simple',
    domainMeta: {},
  })

  it('도메인 노드: 도메인 레벨 주장만 ktdsClaims + 그 부분집합 기준 근거율(flow 제외)', () => {
    const out = embedVerification([mk('domain:cart', 'domain')], report)
    const meta = out[0].domainMeta as Record<string, unknown>
    const claims = meta.ktdsClaims as Array<{ kind: string; verdict: string }>
    // flow 항목은 카드 근거율에서 제외 → summary + businessRule 2개만
    expect(claims.map((c) => c.kind).sort()).toEqual(['businessRule', 'summary'])
    expect(claims.find((c) => c.kind === 'businessRule')?.verdict).toBe('NEEDS_REVIEW')
    expect(meta.groundedPct).toBe(50) // 2개 중 1개 GROUNDED
    expect(meta.groundedCount).toBe(1)
    expect(meta.reviewCount).toBe(1)
  })

  it('flow 노드: 자기 ref 항목 1개를 ktdsClaims 로(citation status 포함)', () => {
    const out = embedVerification([mk('flow:cart-add', 'flow')], report)
    const claims = (out[0].domainMeta as Record<string, unknown>).ktdsClaims as Array<{
      citations: Array<{ status: string }>
    }>
    expect(claims).toHaveLength(1)
    expect(claims[0].citations[0].status).toBe('ok')
  })

  it('검증항목 없는 노드(미채움)는 변경하지 않는다', () => {
    const node = mk('domain:account', 'domain')
    const out = embedVerification([node], report)
    expect((out[0].domainMeta as Record<string, unknown>).ktdsClaims).toBeUndefined()
  })
})

describe('embedVerification — P2 step 상세 섹션(detail) 임베드', () => {
  const stepId = 'step:POST /orders:src/OrderService.java'
  const report: VerifyReport = {
    schemaVersion: 1,
    gitCommit: 'abc',
    domains: [
      {
        domainId: 'domain:order',
        items: [
          {
            kind: 'step',
            ref: stepId,
            text: '주문 생성 서비스',
            citations: [{ filePath: 'OrderService.java', line: 5, snippet: 'public void create', status: 'ok' }],
            verdict: 'GROUNDED',
          },
          {
            kind: 'detail:role',
            ref: `${stepId}#detail:role`,
            text: '주문 생성 서비스 계층',
            citations: [{ filePath: 'OrderService.java', line: 5, snippet: 'public void create', status: 'ok' }],
            verdict: 'GROUNDED',
          },
        ],
        citationTotal: 2,
        citationOk: 2,
        groundedPct: 100,
      },
    ],
    overall: { itemTotal: 2, itemGrounded: 2, citationTotal: 2, citationOk: 2, groundedPct: 100 },
  }
  const mkStep = (id: string): UaGraphNode => ({
    id,
    type: 'step',
    name: 'x',
    summary: 's',
    tags: ['order'],
    complexity: 'simple',
    domainMeta: {},
  })

  it('step 노드: summary 항목 + detail 항목을 모두 ktdsClaims 로(summary 먼저)', () => {
    const out = embedVerification([mkStep(stepId)], report)
    const claims = (out[0].domainMeta as Record<string, unknown>).ktdsClaims as Array<{ kind: string }>
    expect(claims.map((c) => c.kind)).toEqual(['step', 'detail:role'])
  })

  it('detail 만 있고 summary 항목이 없어도 detail 을 임베드한다', () => {
    const detailOnly: VerifyReport = {
      ...report,
      domains: [{ ...report.domains[0], items: [report.domains[0].items[1]] }],
    }
    const out = embedVerification([mkStep(stepId)], detailOnly)
    const claims = (out[0].domainMeta as Record<string, unknown>).ktdsClaims as Array<{ kind: string }>
    expect(claims.map((c) => c.kind)).toEqual(['detail:role'])
  })

  it('다른 step 의 detail 은 섞이지 않는다(ref 접두 매칭)', () => {
    const out = embedVerification([mkStep('step:GET /other:src/Other.java')], report)
    expect((out[0].domainMeta as Record<string, unknown>).ktdsClaims).toBeUndefined()
  })
})
