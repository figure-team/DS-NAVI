import { describe, expect, it } from 'vitest'
import { parseSource } from './tree-sitter.js'
import {
  collectDeclAnnotations,
  ktChild,
  ktDeclKind,
  ktImports,
  ktPackageName,
  ktStringContent,
  ktTypeOuterName,
} from './kotlin-ast.js'

describe('kotlin-ast 공용 유틸', () => {
  it('패키지·임포트(와일드카드 보존)를 읽는다', async () => {
    const root = await parseSource('kotlin', 'package a.b.c\nimport x.y.Z\nimport x.y.*\n')
    expect(ktPackageName(root)).toBe('a.b.c')
    expect(ktImports(root)).toEqual(['x.y.Z', 'x.y.*'])
  })

  it('선언 종류를 키워드로 판정한다 — class/interface/enum/object', async () => {
    const root = await parseSource(
      'kotlin',
      'interface I\nclass K\nenum class E { A }\nobject O\n',
    )
    const decls = root.namedChildren.filter(
      (c) => c && (c.type === 'class_declaration' || c.type === 'object_declaration'),
    )
    expect(decls.map((d) => ktDeclKind(d!))).toEqual(['interface', 'class', 'enum', 'object'])
  })

  it('정상형 — modifiers 안 어노테이션과 value_arguments 를 읽는다', async () => {
    const root = await parseSource(
      'kotlin',
      '@RestController\n@RequestMapping("/api/x")\nclass C(s: S)\n',
    )
    const cls = ktChild(root, 'class_declaration')!
    const annos = collectDeclAnnotations(cls)
    expect(annos.map((a) => a.name)).toEqual(['RestController', 'RequestMapping'])
    expect(ktStringContent(annos[1].args[0]!.node)).toBe('/api/x')
  })

  it('분리형(annotated_expression) — 치유 규칙으로 재결합하고 괄호 인자를 짝짓는다', async () => {
    // 실측 미스파스 재현: TransferController.kt 원형 축약 — 멤버 확장함수가 있는 본문에서
    // 클래스 어노테이션이 annotated_expression 으로 분리된다. 소스는 실파일에서 재현 확인된 형태.
    const src = [
      'package com.music.api',
      'import a.b.C',
      '/** doc */',
      '@RestController',
      '@RequestMapping("/api/transfer")',
      'class TransferController(svc: PlatformService) {',
      '    private val p = svc.platform',
      '    fun list(): List<V> = p.all()',
      '    private fun A.toView() = V(x)',
      '    fun tail(): Int = 0',
      '}',
      '',
    ].join('\n')
    const root = await parseSource('kotlin', src)
    const cls = root.namedChildren.filter((c) => c && c.type === 'class_declaration')[0]
    expect(cls).toBeTruthy()
    const annos = collectDeclAnnotations(cls!)
    const names = annos.map((a) => a.name)
    expect(names).toContain('RestController')
    expect(names).toContain('RequestMapping')
    const rm = annos.find((a) => a.name === 'RequestMapping')!
    expect(rm.args.length).toBeGreaterThan(0)
    expect(ktStringContent(rm.args[0]!.node)).toBe('/api/transfer')
  })

  it('named 인자(@Scheduled cron)를 이름과 함께 읽는다', async () => {
    const root = await parseSource(
      'kotlin',
      'class J {\n  @Scheduled(cron = "0 0 * * * *")\n  fun sweep() { }\n}\n',
    )
    const fn = root.descendantsOfType('function_declaration')[0]!
    const annos = collectDeclAnnotations(fn)
    expect(annos[0]!.name).toBe('Scheduled')
    expect(annos[0]!.args[0]!.name).toBe('cron')
    expect(ktStringContent(annos[0]!.args[0]!.node)).toBe('0 0 * * * *')
  })

  it('타입 외곽 식별자 — 제네릭/널러블/점표기를 벗긴다', async () => {
    const root = await parseSource(
      'kotlin',
      'class C(val repo: JpaRepository<Member, String>, val s: Foo?, val q: a.b.Qux)\n',
    )
    const params = root.descendantsOfType('class_parameter')
    const names = params.map((p) => {
      const named = p!.namedChildren.filter((c) => c && c.type !== 'identifier' && c.type !== 'modifiers')
      return ktTypeOuterName(named[0] ?? null)
    })
    expect(names).toEqual(['JpaRepository', 'Foo', 'Qux'])
  })
})
