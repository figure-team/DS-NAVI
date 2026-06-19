import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { stableJson } from './persist.js'
import type { CandidatesReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', '..', 'fixtures')
const shopMini = join(fixtures, 'chain-recall', 'shop-mini')
const featureTree = join(fixtures, 'classify', 'feature-tree')
const flat = join(fixtures, 'classify', 'flat')
const packageByLayer = join(fixtures, 'classify', 'package-by-layer')

async function candidatesFor(root: string): Promise<CandidatesReport> {
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  const slices = buildSlices(census, routes, edges)
  return buildCandidates(census, routes, slices)
}

function keyOf(report: CandidatesReport, key: string) {
  return report.candidates.find((c) => c.key === key)
}

describe('classify — shop-mini (reachability precedence, prefix keys)', () => {
  it('produces order + user candidates keyed by prefix (directory collapses)', async () => {
    const c = await candidatesFor(shopMini)
    expect(c.candidates.map((x) => x.key)).toEqual(['order', 'user'])
  })

  it('sole-owned files attach to the right domain via reachability', async () => {
    const c = await candidatesFor(shopMini)
    const user = keyOf(c, 'user')!
    const order = keyOf(c, 'order')!
    expect(user.roots).toEqual(['src/main/java/com/shop/web/UserController.java'])
    expect(order.roots).toEqual(['src/main/java/com/shop/web/OrderController.java'])
    const userServiceFile = user.files.find((f) => f.relPath.endsWith('service/UserService.java'))
    expect(userServiceFile).toBeDefined()
    expect(userServiceFile!.via).toBe('reachability')
    // 도메인 교차 없음: user 도메인에 order 파일이 섞이지 않는다.
    expect(user.files.every((f) => !f.relPath.includes('Order'))).toBe(true)
  })

  it('entryCount counts declared route/batch entryIds of the roots', async () => {
    const c = await candidatesFor(shopMini)
    expect(keyOf(c, 'user')!.entryCount).toBe(1)
    expect(keyOf(c, 'order')!.entryCount).toBe(1)
  })

  it('shared FormatUtil lands in common[] with both owners', async () => {
    const c = await candidatesFor(shopMini)
    expect(c.common).toHaveLength(1)
    expect(c.common[0].relPath).toMatch(/util\/FormatUtil\.java$/)
    expect(c.common[0].owners).toHaveLength(2)
  })

  it('orphan with no signal lands in unresolved[] (never silently dropped)', async () => {
    const c = await candidatesFor(shopMini)
    expect(c.unresolved).toEqual(['src/main/java/com/shop/orphan/OrphanThing.java'])
  })

  it('byte-identical buildCandidates across two runs (determinism)', async () => {
    const a = await candidatesFor(shopMini)
    const b = await candidatesFor(shopMini)
    expect(stableJson(a)).toBe(stableJson(b))
  })
})

describe('classify — feature-tree (directory signal active, ambiguous)', () => {
  it('directory signal is non-degenerate and distinguishes feature roots', async () => {
    const c = await candidatesFor(featureTree)
    expect(c.directoryDegenerate).toBeNull()
    expect(c.candidates.map((x) => x.key)).toEqual(['billing', 'shipping'])
  })

  it('reachability vs directory conflict is recorded as ambiguous (not auto-resolved)', async () => {
    const c = await candidatesFor(featureTree)
    expect(c.ambiguous).toEqual([
      {
        relPath: 'src/main/java/app/shipping/BillingHelper.java',
        reachKey: 'billing',
        directoryKey: 'shipping',
      },
    ])
    // 모호 파일은 어느 후보의 files 에도 들어가지 않는다.
    const allFiles = c.candidates.flatMap((x) => x.files.map((f) => f.relPath))
    expect(allFiles).not.toContain('src/main/java/app/shipping/BillingHelper.java')
  })
})

describe('classify — flat (directory-degenerate fallback to prefix)', () => {
  it('flat tree triggers directoryDegenerate and falls back to prefix keys', async () => {
    const c = await candidatesFor(flat)
    expect(c.directoryDegenerate).toEqual({ reason: 'too-few-clusters' })
    expect(c.candidates.map((x) => x.key)).toEqual(['catalog', 'invoice'])
  })
})

describe('classify — package-by-layer (shared directory token must not collapse roots)', () => {
  // 여러 컨트롤러가 한 패키지(org/shop/*Controller)에 모여 같은 디렉토리 토큰("shop")을
  // 공유하고, 토큰이 다른 이질 루트(org/admin/AdminController)가 하나 있어 디렉토리 분류는
  // 전역적으로 degenerate 가 아니다(=null). 과거 버그: 이질 루트 하나로 "디렉토리가 루트를
  // 구별한다"고 전역 판정해 shop 컨트롤러 3개를 'shop' 한 도메인으로 붕괴시켰다(jpetstore의
  // mybatis 붕괴와 동형). 공유 토큰 루트는 파일명 prefix 로 분리되어야 한다.
  it('splits roots sharing a directory token by filename prefix (not collapsed)', async () => {
    const c = await candidatesFor(packageByLayer)
    expect(c.directoryDegenerate).toBeNull()
    // shop 컨트롤러 3개는 account/cart/order 로 분리, 이질 루트 admin 은 유지.
    expect(c.candidates.map((x) => x.key).sort()).toEqual(['account', 'admin', 'cart', 'order'])
    // 'shop'(공유 디렉토리 토큰)이 도메인 key 로 남으면 붕괴 회귀.
    expect(c.candidates.map((x) => x.key)).not.toContain('shop')
  })
})
