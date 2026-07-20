import { describe, expect, it } from 'vitest'
import { parseSource } from '../tree-sitter.js'
import type { SpringContext } from './spring.js'
import { collectKotlinConstants, extractSpringKotlinRoutes } from './spring-kotlin.js'

function freshCtx(): SpringContext {
  return { constants: new Map(), composedVerb: new Map(), composedStereotype: new Set() }
}

describe('extractSpringKotlinRoutes', () => {
  it('분리형(annotated_expression) 클래스 어노테이션 — 치유 후 prefix+메서드 결합', async () => {
    // m-project TransferController 관용구 축약: 멤버 확장함수(private fun A.toView())가
    // 본문에 있으면 클래스 어노테이션이 annotated_expression 으로 분리 파싱된다(실측 재현).
    const src = [
      'package com.music.api',
      '',
      '@RestController',
      '@RequestMapping("/api/transfer")',
      'class TransferController(svc: PlatformService) {',
      '    private val p = svc.platform',
      '',
      '    @GetMapping("/applications/{id}")',
      '    fun application(id: String): TransferApplicationView {',
      '        return svc.get(id)',
      '    }',
      '',
      '    private fun TransferApplication.toView() = TransferApplicationView(id)',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const routes = extractSpringKotlinRoutes(root, 'com/music/api/TransferController.kt', freshCtx())

    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({
      method: 'GET',
      path: '/api/transfer/applications/{id}',
      kind: 'api',
      framework: 'spring',
      handler: 'TransferController#application',
    })
  })

  it('위치 인자(경로) + named 인자(produces) 혼용 — Kotlin 관용구(Java 판과 의도적 차이)', async () => {
    const src = [
      '@RestController',
      '@RequestMapping("/api/x")',
      'class C {',
      '    @GetMapping("/{id}", produces = ["application/json"])',
      '    fun getOne(id: String): String = id',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const routes = extractSpringKotlinRoutes(root, 'C.kt', freshCtx())

    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ method: 'GET', path: '/api/x/{id}', kind: 'api' })
  })

  it('RequestMapping value=[...] + method=[...] 배열 전개', async () => {
    const src = [
      '@RestController',
      'class C {',
      '    @RequestMapping(value = ["/a", "/b"], method = [RequestMethod.GET, RequestMethod.POST])',
      '    fun multi(): String = "x"',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const routes = extractSpringKotlinRoutes(root, 'C.kt', freshCtx())

    const key = (r: (typeof routes)[number]) => `${r.method} ${r.path}`
    expect(routes.map(key).sort()).toEqual(['GET /a', 'GET /b', 'POST /a', 'POST /b'])
  })

  it('companion object const val 을 상수로 해소한다', async () => {
    const src = [
      '@RestController',
      'class C {',
      '    companion object {',
      '        const val DEFAULT_PAGE = "/list"',
      '    }',
      '',
      '    @PostMapping(DEFAULT_PAGE)',
      '    fun list(): String = "x"',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const ctx = freshCtx()
    collectKotlinConstants(root, ctx.constants)
    const routes = extractSpringKotlinRoutes(root, 'C.kt', ctx)

    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ method: 'POST', path: '/list' })
    expect(routes[0].notes).toContain('constant:DEFAULT_PAGE')
  })

  it('미해소 상수 참조는 __unresolved__ 마커를 남긴다', async () => {
    const src = ['@RestController', 'class C {', '    @GetMapping(UNKNOWN_PATH)', '    fun x(): String = "x"', '}', ''].join(
      '\n',
    )
    const root = await parseSource('kotlin', src)
    const routes = extractSpringKotlinRoutes(root, 'C.kt', freshCtx())

    expect(routes).toHaveLength(1)
    expect(routes[0].path).toBe('/__unresolved__/UNKNOWN_PATH')
    expect(routes[0].notes).toContain('unresolved-constant:UNKNOWN_PATH')
  })

  it('@Controller(비 Rest) + 평문 반환은 kind=form, ResponseEntity 반환은 kind=api', async () => {
    const src = [
      '@Controller',
      '@RequestMapping("/web")',
      'class WebController {',
      '    @GetMapping("/home")',
      '    fun home(): String = "home"',
      '',
      '    @GetMapping("/status")',
      '    fun status(): ResponseEntity<String> = ResponseEntity.ok("up")',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const routes = extractSpringKotlinRoutes(root, 'WebController.kt', freshCtx())

    const home = routes.find((r) => r.path === '/web/home')!
    const status = routes.find((r) => r.path === '/web/status')!
    expect(home.kind).toBe('form')
    expect(status.kind).toBe('api')
  })

  it('@Controller·@RestController 가 없는 클래스는 라우트를 만들지 않는다', async () => {
    const src = ['class PlainService {', '    @GetMapping("/x")', '    fun x(): String = "x"', '}', ''].join('\n')
    const root = await parseSource('kotlin', src)
    const routes = extractSpringKotlinRoutes(root, 'PlainService.kt', freshCtx())
    expect(routes).toHaveLength(0)
  })
})
