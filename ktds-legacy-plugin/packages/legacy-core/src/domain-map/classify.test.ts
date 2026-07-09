import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates, classifyByDirectory, prefixToken } from './classify.js'
import { stableJson } from './persist.js'
import type { CandidatesReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '..', '..', 'fixtures')
const shopMini = join(fixtures, 'chain-recall', 'shop-mini')
const featureTree = join(fixtures, 'classify', 'feature-tree')
const flat = join(fixtures, 'classify', 'flat')
const packageByLayer = join(fixtures, 'classify', 'package-by-layer')
const mmobileLike = join(fixtures, 'classify', 'mmobile-like')

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

describe('classify — mmobile-like (증거등급·격리·재흡수·관용접두어·멀티모듈)', () => {
  // mmobile 실사례 축약: feature 패키지(cs/board/event/appform) + common/ 덤프 컨트롤러 3개
  // + 벤더 파일 접두어(Co*) + 같은 패키지가 두 모듈에 흩어진 appform.
  it('feature 패키지만 도메인이 되고 common 덤프는 격리된다(잡음 도메인 0)', async () => {
    const c = await candidatesFor(mmobileLike)
    expect(c.candidates.map((x) => x.key)).toEqual(['appform', 'board', 'cs', 'event'])
    expect(c.quarantined!.map((q) => q.key)).toEqual(['common', 'kimtest', 'mp'])
    expect(c.quarantined!.every((q) => q.reason === 'weak-signal')).toBe(true)
  })

  it('벤더 접두어 Co* 는 관용 접두어로 감지되어 키에서 제외된다', async () => {
    const c = await candidatesFor(mmobileLike)
    expect(c.conventionPrefixes).toEqual(['co'])
    // CoCsController/CoBoardController/CoEventController 는 'co' 도메인을 만들지 않고
    // 각 feature 본체에 합류한다.
    expect(c.candidates.map((x) => x.key)).not.toContain('co')
    expect(keyOf(c, 'cs')!.roots).toContain(
      'module-app/src/main/java/com/acme/mcp/cs/controller/CoCsController.java',
    )
  })

  it('분할 파편(renew)은 본체 디렉터리 도메인(event)으로 재흡수된다', async () => {
    const c = await candidatesFor(mmobileLike)
    expect(c.candidates.map((x) => x.key)).not.toContain('renew')
    expect(keyOf(c, 'event')!.roots).toContain(
      'module-app/src/main/java/com/acme/mcp/event/controller/RenewEventController.java',
    )
  })

  it('STOP-only 파일명(low) 루트도 재흡수되면 격리되지 않고 본체에 남는다', async () => {
    // ViewController: view/controller 모두 STOP → basename 폴백(low)인데 dirToken=event.
    // 재흡수가 medium 으로 승격하지 않으면 3패스 격리가 event 에서 도로 뽑아낸다(회귀).
    const c = await candidatesFor(mmobileLike)
    expect(keyOf(c, 'event')!.roots).toContain(
      'module-app/src/main/java/com/acme/mcp/event/controller/ViewController.java',
    )
    expect(c.quarantined!.map((q) => q.root)).not.toContain(
      'module-app/src/main/java/com/acme/mcp/event/controller/ViewController.java',
    )
  })

  it('두 모듈에 흩어진 같은 패키지(appform)는 한 도메인으로 합쳐진다(high)', async () => {
    const c = await candidatesFor(mmobileLike)
    const appform = keyOf(c, 'appform')!
    expect(appform.roots).toHaveLength(2)
    expect(appform.confidence).toBe('high')
    // 단일 파일 브랜치(module-web)의 feature 세그먼트가 네임스페이스로 오폭되면 안 된다.
    expect(appform.roots).toContain(
      'module-web/src/main/java/com/acme/mcp/appform/controller/AppformAdminController.java',
    )
  })

  it('확신도 등급: 디렉터리 정합=high, 접두어 분할=medium', async () => {
    const c = await candidatesFor(mmobileLike)
    expect(keyOf(c, 'appform')!.confidence).toBe('high')
    expect(keyOf(c, 'cs')!.confidence).toBe('medium')
    expect(keyOf(c, 'board')!.confidence).toBe('medium')
    expect(keyOf(c, 'event')!.confidence).toBe('medium')
  })

  it('byte-identical across two runs (신규 필드 포함 결정론)', async () => {
    const a = await candidatesFor(mmobileLike)
    const b = await candidatesFor(mmobileLike)
    expect(stableJson(a)).toBe(stableJson(b))
  })
})

describe('classify — 격리 가드(소형 프로젝트 붕괴 방지)', () => {
  // program-inventory/mini: 컨트롤러가 web/ 레이어 밑이라 폴백(low)인데 배치 잡 하나가
  // 디렉터리 토큰(high)을 가진 소형 앱. low 가 다수(1/2 > 30%)면 격리하지 않아야
  // 컨트롤러 도메인이 전멸하지 않는다.
  const miniApp = join(fixtures, 'program-inventory', 'mini')
  it('low 시드가 다수면 격리하지 않는다(도메인 0개 붕괴 방지)', async () => {
    const c = await candidatesFor(miniApp)
    expect(c.candidates.map((x) => x.key)).toEqual(['batch', 'order'])
    expect(c.quarantined).toEqual([])
  })
})

describe('classify — 잡음 키 가드(prefixToken)', () => {
  it('1글자 토큰은 건너뛴다(FCommonController → f 가 아니라 common)', () => {
    expect(prefixToken('a/FCommonController.java')).toBe('common')
  })
  it('skip 집합(관용 접두어)을 건너뛴다', () => {
    expect(prefixToken('a/CoEventController.java', new Set(['co']))).toBe('event')
  })
})

describe('classify — 구조 아티팩트(WEB-INF/jsp)', () => {
  it('WEB-INF 는 구조 세그먼트, jsp 는 레이어 — 기능 JSP 는 feature 토큰을 받는다', () => {
    const paths = [
      'src/main/webapp/WEB-INF/jsp/account/EditAccountForm.jsp',
      'src/main/webapp/WEB-INF/jsp/order/ListOrders.jsp',
      'src/main/java/org/shop/web/actions/AccountActionBean.java',
    ]
    const { tokenByFile } = classifyByDirectory(paths)
    expect(tokenByFile.get(paths[0])).toBe('account')
    expect(tokenByFile.get(paths[1])).toBe('order')
    // 'web-inf' 가 토큰으로 남으면 구조 아티팩트 도메인 회귀.
    expect([...tokenByFile.values()]).not.toContain('web-inf')
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
