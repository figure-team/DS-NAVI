import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildAutoPlan } from './confirm.js'
import { buildSkeleton } from './skeleton.js'
import { buildBundles } from './bundle.js'
import {
  prepFillChunks,
  auditFillFragments,
  mergeFillFragments,
  readFillChunkIndex,
  fillPrepDir,
  fillFragDir,
  FillChunkSchema,
  FillFragmentSchema,
  type FillChunk,
  type FillFragment,
} from './fill-fanout.js'
import { DomainFillSchema, fillPathFor, type DomainFill } from './fill.js'
import { verifyFills } from './verify.js'
import { stableJson } from './persist.js'
import type { SkeletonReport } from './types.js'

// fill-fanout.ts — 대규모 채움 팬아웃(청크 준비·조각 감사·병합)의 결정론과
// pre-cite 의 핵심 보증(추출 인용이 기계 검증을 실제로 통과)을 검증한다.

const FILES: Record<string, string> = {
  'src/main/java/shop/web/OrderController.java': `package shop.web;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import shop.service.OrderService;
@RestController
public class OrderController {
  private OrderService orderService;
  @PostMapping("/orders")
  public void create() { orderService.create(); }
  @GetMapping("/orders")
  public void list() { orderService.list(); }
  @GetMapping("/orders/detail")
  public void detail() { orderService.detail(); }
}`,
  'src/main/java/shop/service/OrderService.java': `package shop.service;
public class OrderService {
  /** 주문은 회원만 생성할 수 있다. */
  public void create() {}
  public void list() {}
  public void detail() {}
}`,
}

async function seed(root: string): Promise<void> {
  for (const [rel, content] of Object.entries(FILES)) {
    await mkdir(dirname(join(root, rel)), { recursive: true })
    await writeFile(join(root, rel), content, 'utf8')
  }
}

async function shopSkeleton(root: string): Promise<SkeletonReport> {
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  return buildSkeleton(root, { census, routes, edges, slices, candidates, plan })
}

/** 청크 파일을 전부 읽어 chunkId 순으로 반환. */
async function readChunks(root: string): Promise<FillChunk[]> {
  const dir = fillPrepDir(root)
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json') && n !== 'index.json').sort()
  const chunks: FillChunk[] = []
  for (const n of names) {
    chunks.push(FillChunkSchema.parse(JSON.parse(await readFile(join(dir, n), 'utf8'))))
  }
  return chunks
}

/** 청크 내용에서 계약을 지키는 유효 조각을 기계적으로 만든다(에이전트 역할 대행). */
function fragFor(chunk: FillChunk): FillFragment {
  const cite = (preCite: FillChunk['flows'][number]['preCite']) =>
    preCite ? [preCite] : [{ filePath: chunk.files[0].relPath, line: chunk.files[0].line, snippet: 'public class OrderController {' }]
  return FillFragmentSchema.parse({
    schemaVersion: 1,
    chunkId: chunk.chunkId,
    domainId: chunk.domainId,
    header: chunk.isHeaderChunk
      ? {
          name: '주문',
          summary: { text: '주문 도메인 요약', citations: cite(chunk.flows[0]?.preCite ?? null) },
          entities: [],
          businessRules: [],
          crossDomainInteractions: [],
        }
      : null,
    flows: chunk.flows.map((f) => ({
      flowId: f.flowId,
      name: '주문 흐름',
      summary: { text: '흐름 요약', citations: cite(f.preCite) },
    })),
    steps: chunk.steps.map((s) => ({
      stepId: s.stepId,
      name: '주문 단계',
      summary: { text: '단계 요약', citations: cite(s.preCite) },
    })),
  })
}

async function writeFrag(root: string, frag: FillFragment): Promise<void> {
  await mkdir(fillFragDir(root), { recursive: true })
  await writeFile(join(fillFragDir(root), `${frag.chunkId}.json`), stableJson(frag), 'utf8')
}

describe('fill-fanout — 청크 준비(prep)', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-fanout-'))
    await seed(root)
    const skeleton = await shopSkeleton(root)
    await buildBundles(root, skeleton)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('흐름을 chunkFlows 단위로 자르고 첫 청크만 헤더(전 흐름 flowIndex 동봉)', async () => {
    const { index } = await prepFillChunks(root, { chunkFlows: 2 })
    const order = index.chunks.filter((c) => c.key === 'order')
    // 3 흐름 · chunkFlows=2 → 2청크(2+1).
    expect(order.length).toBe(2)
    expect(order[0].isHeaderChunk).toBe(true)
    expect(order[1].isHeaderChunk).toBe(false)
    expect(order[0].flowCount).toBe(2)
    expect(order[1].flowCount).toBe(1)
    const chunks = await readChunks(root)
    const header = chunks.find((c) => c.chunkId === order[0].chunkId)!
    const tail = chunks.find((c) => c.chunkId === order[1].chunkId)!
    expect(header.header).not.toBeNull()
    expect(header.header!.flowIndex.length).toBe(3) // 도메인 전 흐름 색인
    expect(tail.header).toBeNull()
    // 청크가 자립적: step 파일 슬라이스 동봉.
    expect(header.files.length).toBeGreaterThan(0)
    expect(header.files.every((f) => f.slice !== null)).toBe(true)
    expect(index.totals.flows).toBe(3)
  })

  it('pre-cite 는 기계 검증(verifyFills)을 실제로 통과한다 — 핵심 보증', async () => {
    const { index } = await prepFillChunks(root, { chunkFlows: 20 })
    expect(index.totals.preCiteMissing).toBe(0)
    const chunks = await readChunks(root)
    const orderChunk = chunks.find((c) => c.key === 'order' && c.isHeaderChunk)!
    // pre-cite verbatim 복사만으로 만든 fill 이 인용 검증 전건 ok 여야 한다.
    const fill: DomainFill = DomainFillSchema.parse({
      schemaVersion: 1,
      domainId: orderChunk.domainId,
      name: '주문',
      summary: { text: '요약', citations: [orderChunk.flows[0].preCite!] },
      entities: [],
      businessRules: [],
      crossDomainInteractions: [],
      flows: orderChunk.flows.map((f) => ({
        flowId: f.flowId,
        name: '흐름',
        summary: { text: '요약', citations: [f.preCite!] },
      })),
      steps: orderChunk.steps.map((s) => ({
        stepId: s.stepId,
        name: '단계',
        summary: { text: '요약', citations: [s.preCite!] },
      })),
    })
    const report = await verifyFills(root, [fill], null)
    expect(report.overall.citationOk).toBe(report.overall.citationTotal)
    expect(report.overall.groundedPct).toBe(100)
  })

  it('결정론: 2회 실행 시 청크·색인 byte 동일 + chunkFlows 변경 시 낡은 청크 잔존 없음', async () => {
    await prepFillChunks(root, { chunkFlows: 1 })
    const many = (await readdir(fillPrepDir(root))).sort()
    expect(many.length).toBeGreaterThan(2) // 흐름 3 → 청크 3 + index
    const a = await prepFillChunks(root, { chunkFlows: 2 })
    const filesA = (await readdir(fillPrepDir(root))).sort()
    const bytesA = await readFile(join(fillPrepDir(root), 'index.json'), 'utf8')
    const b = await prepFillChunks(root, { chunkFlows: 2 })
    const filesB = (await readdir(fillPrepDir(root))).sort()
    const bytesB = await readFile(join(fillPrepDir(root), 'index.json'), 'utf8')
    expect(filesA).toEqual(filesB)
    expect(bytesA).toBe(bytesB)
    expect(stableJson(a.index)).toBe(stableJson(b.index))
    // chunkFlows=1 시절 청크(-002 등)가 남아 있지 않다.
    expect(filesA.length).toBeLessThan(many.length)
  })
})

describe('fill-fanout — 조각 감사(audit)·병합(merge)', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-fanout-'))
    await seed(root)
    const skeleton = await shopSkeleton(root)
    await buildBundles(root, skeleton)
    await prepFillChunks(root, { chunkFlows: 2 })
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('조각 없음 → 전건 missing, 유효 조각 → complete, --chunk 부분 감사', async () => {
    const empty = await auditFillFragments(root)
    expect(empty.complete).toEqual([])
    expect(empty.incomplete.every((i) => i.reason === 'missing')).toBe(true)

    const chunks = await readChunks(root)
    const header = chunks.find((c) => c.key === 'order' && c.isHeaderChunk)!
    await writeFrag(root, fragFor(header))
    const after = await auditFillFragments(root)
    expect(after.complete).toEqual([header.chunkId])
    const only = await auditFillFragments(root, [header.chunkId])
    expect(only.complete).toEqual([header.chunkId])
    expect(only.incomplete).toEqual([])
  })

  it('커버리지 위반(step 누락)·헤더 누락은 미완결 사유로 보고', async () => {
    const chunks = await readChunks(root)
    const header = chunks.find((c) => c.key === 'order' && c.isHeaderChunk)!
    const partial = fragFor(header)
    partial.steps = partial.steps.slice(1) // step 1개 누락
    await writeFrag(root, partial)
    const audit = await auditFillFragments(root, [header.chunkId])
    expect(audit.incomplete[0]?.reason).toMatch(/^coverage:/)

    const noHeader = fragFor(header)
    noHeader.header = null
    await writeFrag(root, noHeader)
    const audit2 = await auditFillFragments(root, [header.chunkId])
    expect(audit2.incomplete[0]?.reason).toBe('header-missing')
  })

  it('전 청크 조각 → 병합 fill 이 DomainFillSchema 유효 + 청크 선언 밖 id 버림 보고', async () => {
    const chunks = await readChunks(root)
    const orderChunks = chunks.filter((c) => c.key === 'order')
    for (const c of orderChunks) {
      const frag = fragFor(c)
      if (!c.isHeaderChunk) {
        // 청크 선언 밖 유령 flow 를 하나 끼워 넣는다 — 병합이 버리고 집계해야 한다.
        frag.flows.push({
          flowId: 'flow:ghost',
          name: '유령',
          summary: { text: '유령', citations: [c.flows[0].preCite!] },
        })
      }
      await writeFrag(root, frag)
    }
    const result = await mergeFillFragments(root)
    const order = result.written.find((w) => w.key === 'order')!
    expect(order.flows).toBe(3)
    expect(order.missingChunks).toEqual([])
    expect(result.droppedItems).toBe(1)
    const fill = DomainFillSchema.parse(
      JSON.parse(await readFile(fillPathFor(root, 'order'), 'utf8')),
    )
    expect(fill.name).toBe('주문')
    expect(fill.flows.map((f) => f.flowId)).toEqual([...fill.flows.map((f) => f.flowId)].sort())
    // 병합 결정론: 재실행 byte 동일.
    const bytesA = await readFile(fillPathFor(root, 'order'), 'utf8')
    await mergeFillFragments(root)
    expect(await readFile(fillPathFor(root, 'order'), 'utf8')).toBe(bytesA)
  })

  it('헤더 청크 미완결 도메인은 병합 스킵(pending 유지), 꼬리 청크 누락은 부분 병합', async () => {
    const chunks = await readChunks(root)
    const orderChunks = chunks.filter((c) => c.key === 'order')
    // 헤더만 없음 → 도메인 스킵.
    await writeFrag(root, fragFor(orderChunks[1]))
    const skip = await mergeFillFragments(root)
    expect(skip.written.find((w) => w.key === 'order')).toBeUndefined()
    expect(skip.skippedDomains.find((s) => s.key === 'order')?.reason).toContain('헤더 청크 미완결')

    // 헤더만 있음 → 부분 병합 + 누락 청크 보고.
    await rm(join(fillFragDir(root), `${orderChunks[1].chunkId}.json`))
    await writeFrag(root, fragFor(orderChunks[0]))
    const partial = await mergeFillFragments(root)
    const order = partial.written.find((w) => w.key === 'order')!
    expect(order.flows).toBe(2)
    expect(order.missingChunks).toEqual([orderChunks[1].chunkId])
  })

  it('색인 없이 audit/merge 호출 시 fill-prep 안내로 fail-closed', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'ktds-fanout-bare-'))
    try {
      await expect(auditFillFragments(bare)).rejects.toThrow(/fill-prep/)
      await expect(mergeFillFragments(bare)).rejects.toThrow(/fill-prep/)
      await expect(readFillChunkIndex(bare)).rejects.toThrow(/fill-prep/)
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  })
})
