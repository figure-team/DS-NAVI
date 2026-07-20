import { describe, expect, it } from 'vitest'
import { extractKotlinFacts } from './kotlin-facts.js'

describe('kotlin-facts — JavaFileFacts 동형 추출', () => {
  it('패키지·임포트·클래스 기본 팩트를 추출한다', async () => {
    const facts = await extractKotlinFacts(
      'a/B.kt',
      'package com.acme\nimport x.y.Z\nclass B(val repo: MemberRepo, svc: Svc) : Base(), Aud\n',
    )
    expect(facts.packageName).toBe('com.acme')
    expect(facts.imports).toEqual(['x.y.Z'])
    const b = facts.classes[0]!
    expect(b.fqn).toBe('com.acme.B')
    expect(b.kind).toBe('class')
    expect(b.extends).toEqual(['Base'])
    expect(b.implements).toEqual(['Aud'])
    // 주생성자: 모든 파라미터는 ctorParamTypes, val 파라미터는 필드이기도.
    expect(b.ctorParamTypes).toEqual(['MemberRepo', 'Svc'])
    expect(b.fields.map((f) => [f.name, f.type])).toEqual([['repo', 'MemberRepo']])
  })

  it('인터페이스 상속·enum·object 를 판정한다', async () => {
    const facts = await extractKotlinFacts(
      'a/I.kt',
      'interface I : Sup\nenum class E { A }\nobject O\n',
    )
    const [i, e, o] = facts.classes
    expect([i!.kind, i!.extends]).toEqual(['interface', ['Sup']])
    expect(e!.kind).toBe('enum')
    expect(o!.kind).toBe('class')
  })

  it('호출 지점 — 묵시적 self·navigation·체이닝·안전호출을 수집한다', async () => {
    const facts = await extractKotlinFacts(
      'a/C.kt',
      [
        'class C(val svc: Svc) {',
        '  fun f() {',
        '    m3()',
        '    svc.deep.m4(x)',
        '    p?.m5()',
        '    repo.findAll().first()',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    const calls = facts.classes[0]!.methods[0]!.calls
    const byName = Object.fromEntries(calls.map((c) => [c.methodName, c]))
    expect(byName['m3']!.receiver).toBeNull()
    expect(byName['m4']!.receiver).toEqual({
      kind: 'field',
      on: { kind: 'name', text: 'svc' },
      field: 'deep',
    })
    expect(byName['m5']!.receiver).toEqual({ kind: 'name', text: 'p' })
    expect(byName['first']!.receiver).toEqual({
      kind: 'call',
      on: { kind: 'name', text: 'repo' },
      methodName: 'findAll',
    })
  })

  it('후행 람다 — 인자로 계상하고 이중 call_expression 을 한 호출로 합친다', async () => {
    const facts = await extractKotlinFacts(
      'a/L.kt',
      'class L {\n  fun f() {\n    items.map { it.v }\n    items.fold(0) { acc, x -> acc }\n  }\n}\n',
    )
    const calls = facts.classes[0]!.methods[0]!.calls
    const names = calls.map((c) => `${c.methodName}/${c.argCount}`)
    expect(names).toContain('map/1')
    expect(names).toContain('fold/2')
    expect(calls.filter((c) => c.methodName === 'fold')).toHaveLength(1)
  })

  it('타입 미상 프로퍼티는 필드에서 제외하고, 생성 호출 초기화는 타입으로 인정한다', async () => {
    const facts = await extractKotlinFacts(
      'a/P.kt',
      'class P(svc: Svc) {\n  private val p = svc.platform\n  private val reg = Registry()\n  val n: Int = 0\n}\n',
    )
    const fields = facts.classes[0]!.fields.map((f) => [f.name, f.type])
    expect(fields).toEqual([
      ['reg', 'Registry'],
      ['n', 'Int'],
    ])
  })

  it('멤버 확장함수·표현식 본문·companion 멤버를 소속 클래스에 합친다', async () => {
    const facts = await extractKotlinFacts(
      'a/T.kt',
      [
        '@RestController',
        'class T(val p: Platform) {',
        '  fun list(): List<V> = p.all()',
        '  private fun A.toView() = V(x)',
        '  companion object {',
        '    const val PREFIX = "/api"',
        '    fun of(s: String): T = T(Platform())',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    const t = facts.classes[0]!
    // 치유 확인 — 확장함수가 있는 본문에서도 클래스 어노테이션이 잡힌다.
    expect(t.annotations).toContain('RestController')
    const names = t.methods.map((m) => m.name)
    expect(names).toEqual(['list', 'toView', 'of'])
    const list = t.methods[0]!
    expect(list.returnType).toBe('List')
    expect(list.calls.map((c) => c.methodName)).toEqual(['all'])
  })

  it('보조 생성자를 클래스명 메서드로 싣는다', async () => {
    const facts = await extractKotlinFacts(
      'a/S.kt',
      'class S {\n  constructor(x: Int) { init2(x) }\n}\n',
    )
    const s = facts.classes[0]!
    expect(s.methods.map((m) => m.name)).toEqual(['S'])
    expect(s.methods[0]!.calls.map((c) => c.methodName)).toEqual(['init2'])
    expect(s.ctorParamTypes).toEqual(['Int'])
  })

  it('지역변수 — 선언 타입 우선, 생성 호출명 차선, 그 외 var 표식', async () => {
    const facts = await extractKotlinFacts(
      'a/V.kt',
      'class V {\n  fun f() {\n    val a: Foo = mk()\n    val b = Bar()\n    val c = svc.find()\n  }\n}\n',
    )
    const locals = facts.classes[0]!.methods[0]!.locals.map((l) => [l.name, l.typeName])
    expect(locals).toEqual([
      ['a', 'Foo'],
      ['b', 'Bar'],
      ['c', 'var'],
    ])
  })
})
