import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildAutoPlan } from './confirm.js'
import { buildSkeleton } from './skeleton.js'
import {
  buildBundles,
  bundleDir,
  safeKeyFilename,
  DomainBundleSchema,
  DEFAULT_BUNDLE_CHAR_CAP,
} from './bundle.js'
import { stableJson } from './persist.js'
import type { SkeletonReport } from './types.js'

// bundle.ts — 도메인 번들 조립(소스 슬라이스·KG 힌트·charCap 거동·결정론).

const ORDER_SVC = 'src/main/java/shop/service/OrderService.java'
const FILES: Record<string, string> = {
  'src/main/java/shop/web/OrderController.java': `package shop.web;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import shop.service.OrderService;
@RestController
public class OrderController {
  private OrderService orderService;
  @PostMapping("/orders")
  public void create() { orderService.create(); }
}`,
  [ORDER_SVC]: `package shop.service;
public class OrderService {
  /** 주문은 회원만 생성할 수 있다. */
  public void create() {}
}`,
}

const LONG_SUMMARY = '주문 서비스. '.repeat(40) // ~320자

async function seed(root: string, withKg = true): Promise<void> {
  for (const [rel, content] of Object.entries(FILES)) {
    await mkdir(dirname(join(root, rel)), { recursive: true })
    await writeFile(join(root, rel), content, 'utf8')
  }
  if (withKg) {
    await mkdir(join(root, '.understand-anything'), { recursive: true })
    await writeFile(
      join(root, '.understand-anything', 'knowledge-graph.json'),
      JSON.stringify({
        nodes: [{ type: 'file', filePath: ORDER_SVC, summary: LONG_SUMMARY, tags: ['domain', 'order'] }],
      }),
      'utf8',
    )
  }
}

/** OrderController/OrderService 만 담는 1-도메인 skeleton 을 결정론으로 빌드. */
async function shopSkeleton(root: string): Promise<SkeletonReport> {
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  return buildSkeleton(root, { census, routes, edges, slices, candidates, plan })
}

describe('bundle — 도메인 LLM 입력 묶음', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ktds-bundle-'))
    await seed(root)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('기본 charCap: 슬라이스 채워짐, sliceOmitted 비어있음, kgHint 주입, 파일 영속', async () => {
    const skeleton = await shopSkeleton(root)
    const { bundles, paths } = await buildBundles(root, skeleton)
    const order = bundles.find((b) => b.key === 'order')!
    expect(order.sliceOmitted).toEqual([])
    for (const f of order.files) expect(f.slice).not.toBeNull()
    const svc = order.files.find((f) => f.relPath === ORDER_SVC)!
    expect(svc.kgHint?.summary).toBe(LONG_SUMMARY)
    for (const b of bundles) expect(() => DomainBundleSchema.parse(b)).not.toThrow()
    // 영속 파일 경로가 .spec/map/bundle/ 하위이고 실제로 쓰여 있다.
    expect(paths.every((p) => p.startsWith(bundleDir(root)))).toBe(true)
    const onDisk = JSON.parse(await readFile(join(bundleDir(root), 'order.json'), 'utf8'))
    expect(onDisk.key).toBe('order')
    // 슬라이스가 실제 인용 가능 텍스트(비즈니스 규칙 주석)를 담는다.
    expect(svc.slice!.text).toContain('주문은 회원만 생성할 수 있다')
  })

  it('P2: 모든 번들에 nodeDetailTemplate(v1 role 섹션) 동봉', async () => {
    const skeleton = await shopSkeleton(root)
    const { bundles } = await buildBundles(root, skeleton)
    expect(bundles.length).toBeGreaterThan(0)
    for (const b of bundles) {
      expect(b.nodeDetailTemplate.version).toBe(1)
      const role = b.nodeDetailTemplate.sections.find((s) => s.id === 'role')
      expect(role).toBeDefined()
      expect(role!.promptHint.length).toBeGreaterThan(0)
    }
  })

  it('charCap=0: 모든 슬라이스 생략(null) + sliceOmitted 전건(정렬) 보고', async () => {
    const skeleton = await shopSkeleton(root)
    const { bundles } = await buildBundles(root, skeleton, { charCap: 0 })
    const order = bundles.find((b) => b.key === 'order')!
    expect(order.files.length).toBeGreaterThan(0)
    for (const f of order.files) expect(f.slice).toBeNull()
    expect(order.sliceOmitted).toEqual(order.files.map((f) => f.relPath))
    expect([...order.sliceOmitted]).toEqual([...order.sliceOmitted].sort())
  })

  it('charCap 은 slice.text.length 만 계상(kgHint 오버헤드 제외)', async () => {
    const skeleton = await shopSkeleton(root)
    const big = await buildBundles(root, skeleton, { charCap: DEFAULT_BUNDLE_CHAR_CAP })
    const order = big.bundles.find((b) => b.key === 'order')!
    const svc = order.files.find((f) => f.relPath === ORDER_SVC)!
    expect(svc.kgHint!.summary.length).toBeGreaterThan(300)
    const sliceChars = order.files.reduce((n, f) => n + (f.slice?.text.length ?? 0), 0)
    const refit = await buildBundles(root, skeleton, { charCap: sliceChars })
    const orderRefit = refit.bundles.find((b) => b.key === 'order')!
    expect(orderRefit.sliceOmitted).toEqual([]) // slice.text 합 == cap → 전건 포함(kgHint 미계상)
  })

  it('KG 부재여도 진행(kgHint=null)', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'ktds-bundle-bare-'))
    try {
      await seed(bare, false)
      const skeleton = await shopSkeleton(bare)
      const { bundles } = await buildBundles(bare, skeleton)
      const order = bundles.find((b) => b.key === 'order')!
      for (const f of order.files) expect(f.kgHint).toBeNull()
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  })

  it('결정론: 2회 실행 byte 동일(stableJson)', async () => {
    const skeleton = await shopSkeleton(root)
    const a = await buildBundles(root, skeleton)
    const b = await buildBundles(root, skeleton)
    expect(stableJson(a.bundles)).toBe(stableJson(b.bundles))
  })
})

describe('safeKeyFilename — fail-closed 경로 가드', () => {
  it('정상 key 는 안전 파일명으로 보존/치환', () => {
    expect(safeKeyFilename('order')).toBe('order')
    expect(safeKeyFilename('web-inf')).toBe('web-inf')
    expect(safeKeyFilename('a b')).toBe('a_b') // 공백 → _
  })
  it('경로 세그먼트·숨김·빈 이름은 거부', () => {
    expect(() => safeKeyFilename('')).toThrow()
    expect(() => safeKeyFilename('.hidden')).toThrow()
    expect(() => safeKeyFilename('../escape')).toThrow() // 정규화 후에도 빈/숨김/슬래시 거부
    expect(() => safeKeyFilename('..')).toThrow()
  })
})
