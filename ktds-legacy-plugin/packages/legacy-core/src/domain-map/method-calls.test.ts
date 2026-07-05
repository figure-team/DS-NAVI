/**
 * METHOD-CALL GRAPH(P3.1) — 단위 테스트(8-receiver 해소 + 오버로드 + 타입추론 + 결정론).
 *
 * 전략: 대부분의 행위 테스트는 인메모리 인라인 소스를 extractJavaFacts + buildGraphFromFacts
 * 로 해소해 빠르고 격리된 단언을 한다. on-disk 픽스처(fixtures/method-calls)는 골든 락
 * (byte-identical) + 결정론(buildMethodCallGraph 2회) 검증에 쓴다.
 *
 * 모든 단언은 엔진의 실제 산출에 대해 잠근다(추측 금지). 엔진 한계(var/람다/캐스트/삼항/
 * 배열접근/object-creation 수신자 등)는 "실제 동작"을 단언하고 주석으로 한계를 명시한다.
 */
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractJavaFacts, type JavaFileFacts } from './java-facts.js'
import { buildGraphFromFacts, buildMethodCallGraph } from './method-calls.js'
import { stableJson } from './persist.js'
import type { CensusReport, MethodCallGraph, ResolvedCall } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureRoot = join(here, '..', '..', 'fixtures', 'method-calls')

// ──────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────

/** 인라인 소스 맵({relPath: src})을 facts 로 파싱해 그래프를 만든다. */
async function graphOf(sources: Record<string, string>): Promise<MethodCallGraph> {
  const facts = new Map<string, JavaFileFacts>()
  for (const [rel, src] of Object.entries(sources)) {
    facts.set(rel, await extractJavaFacts(rel, src))
  }
  return buildGraphFromFacts(facts, 'GIT')
}

/** 단일 클래스 P + 보조 클래스들에서 메서드 m 의 호출만 추린다(선택). */
function callsIn(graph: MethodCallGraph, method: string): ResolvedCall[] {
  return graph.calls.filter((c) => c.callerMethod === method)
}

/** 첫 calleeMethod 일치 호출. */
function firstCall(graph: MethodCallGraph, calleeMethod: string): ResolvedCall {
  const c = graph.calls.find((cc) => cc.calleeMethod === calleeMethod)
  if (!c) throw new Error(`no call to ${calleeMethod} in ${stableJson(graph.calls)}`)
  return c
}

/** P.java + Target.java 의 표준 2-파일 그래프(같은 패키지 p). */
async function pair(pBody: string, targetBody: string, extra: Record<string, string> = {}) {
  return graphOf({
    'p/P.java': `package p;\n${pBody}\n`,
    'p/Target.java': `package p;\n${targetBody}\n`,
    ...extra,
  })
}

const TARGET = `public class Target { public void go(){} public int num(){return 0;} }`

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: field
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — field', () => {
  it('this.field.m() resolves to field declaration type', async () => {
    const g = await pair(`public class P { Target t; void run(){ this.t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('field')
  })

  it('bare field.m() resolves to field type', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('field')
  })

  it('field receiver sets calleeClass to the field type class', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').calleeClass).toBe('Target')
  })

  it('field receiver sets calleeFile to the in-project target file', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').calleeFile).toBe('p/Target.java')
  })

  it('field declared with generic type resolves on outer type', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import java.util.List; public class P { List<Target> ts; void run(){ ts.size(); } }`,
      'p/Target.java': `package p; ${TARGET}`,
    })
    // List is java.util -> external; outer type wins (not Target element).
    expect(firstCall(g, 'size').receiverKind).toBe('external')
  })

  it('field declared with array type resolves on element type', async () => {
    const g = await pair(
      `public class P { Target[] ts; void run(){ Target one = ts[0]; one.go(); } }`,
      TARGET,
    )
    // array access itself is unresolved, but local typed Target drives it.
    expect(firstCall(g, 'go').receiverKind).toBe('local')
    expect(firstCall(g, 'go').calleeClass).toBe('Target')
  })

  it('two distinct fields each resolve to their own type', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; B b; void run(){ a.ay(); b.by(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
      'p/B.java': `package p; public class B { void by(){} }`,
    })
    expect(firstCall(g, 'ay').calleeClass).toBe('A')
    expect(firstCall(g, 'by').calleeClass).toBe('B')
  })

  it('field receiver overrides a same-named param when no param exists', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('field')
  })

  it('unknown field name (no declaration) is unresolved, not field', async () => {
    const g = await pair(`public class P { void run(){ ghost.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: param
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — param', () => {
  it('param.m() resolves to parameter declared type', async () => {
    const g = await pair(`public class P { void run(Target p){ p.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('param')
  })

  it('param receiver yields correct calleeClass/calleeFile', async () => {
    const g = await pair(`public class P { void run(Target p){ p.go(); } }`, TARGET)
    const c = firstCall(g, 'go')
    expect(c.calleeClass).toBe('Target')
    expect(c.calleeFile).toBe('p/Target.java')
  })

  it('param shadows a field of the same name (param wins by precedence)', async () => {
    // local > param > field; here no local, param p vs field p -> param resolves.
    const g = await graphOf({
      'p/P.java': `package p; public class P { B p; void run(A p){ p.ay(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
      'p/B.java': `package p; public class B { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').receiverKind).toBe('param')
    expect(firstCall(g, 'ay').calleeClass).toBe('A')
  })

  it('final-qualified param is parsed and resolves', async () => {
    const g = await pair(`public class P { void run(final Target p){ p.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('param')
  })

  it('annotated param is parsed and resolves', async () => {
    const g = await pair(
      `public class P { void run(@Deprecated Target p){ p.go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('param')
  })

  it('generic param type resolves on outer type (external for java.util)', async () => {
    const g = await pair(
      `import java.util.List; public class P { void run(List<Target> ps){ ps.size(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'size').receiverKind).toBe('external')
  })

  it('second param resolves independently of the first', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(A a, B b){ b.by(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
      'p/B.java': `package p; public class B { void by(){} }`,
    })
    expect(firstCall(g, 'by').calleeClass).toBe('B')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: local
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — local', () => {
  it('local from new X() resolves to X', async () => {
    const g = await pair(
      `public class P { void run(){ Target x = new Target(); x.go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('local')
  })

  it('local declared by explicit type resolves regardless of initializer', async () => {
    const g = await pair(
      `public class P { Target mk(){return new Target();} void run(){ Target x = mk(); x.go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('local')
  })

  it('local shadows a field of the same name (nearest-decl precedence)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { B t; void run(){ A t = new A(); t.ay(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
      'p/B.java': `package p; public class B { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').receiverKind).toBe('local')
    expect(firstCall(g, 'ay').calleeClass).toBe('A')
  })

  it('use BEFORE its own local declaration falls back to the field of same name', async () => {
    // nearestLocal requires decl.startIndex < callStartIndex. Here the local `t2`
    // is unrelated; `t` is used before any local `t` exists, so it binds to field t (A).
    const g = await graphOf({
      'p/P.java': `package p; public class P { A t; void run(){ t.ay(); A t2 = new A(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').receiverKind).toBe('field')
  })

  it('local used strictly before its own declaration line does NOT bind to that later local', async () => {
    // No field of the same name; the local `t` is declared AFTER use -> unresolved.
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ t.ay(); A t = new A(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').receiverKind).toBe('unresolved')
  })

  it('redeclaration: nearest preceding declaration wins', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ A t = new A(); B t2 = new B(); t2.by(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
      'p/B.java': `package p; public class B { void by(){} }`,
    })
    expect(firstCall(g, 'by').calleeClass).toBe('B')
  })

  it('local of generic type resolves on outer type', async () => {
    const g = await pair(
      `import java.util.List; import java.util.ArrayList; public class P { void run(){ List<Target> l = new ArrayList<>(); l.size(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'size').receiverKind).toBe('external')
  })

  it('local var (var keyword) is unresolved — inference unsupported', async () => {
    const g = await pair(
      `public class P { Target mk(){return new Target();} void run(){ var x = mk(); x.go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('local typed by in-project class sets calleeFile', async () => {
    const g = await pair(
      `public class P { void run(){ Target x = new Target(); x.go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').calleeFile).toBe('p/Target.java')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: self
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — self', () => {
  it('unqualified m() resolves to enclosing class (self)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ helper(); } void helper(){} }`,
    })
    expect(firstCall(g, 'helper').receiverKind).toBe('self')
  })

  it('this.m() resolves to enclosing class (self)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ this.helper(); } void helper(){} }`,
    })
    expect(firstCall(g, 'helper').receiverKind).toBe('self')
  })

  it('self call calleeClass equals the enclosing class name', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ helper(); } void helper(){} }`,
    })
    expect(firstCall(g, 'helper').calleeClass).toBe('P')
  })

  it('self call calleeFile equals the caller file', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ helper(); } void helper(){} }`,
    })
    const c = firstCall(g, 'helper')
    expect(c.calleeFile).toBe('p/P.java')
    expect(c.callerFile).toBe('p/P.java')
  })

  it('inherited method called unqualified is attributed to enclosing class (documented limitation)', async () => {
    // provide() is declared on Base; called unqualified from Sub. The engine reports
    // self/Sub (not Base) — receiver is enclosing class, callee class = enclosing.
    const g = await graphOf({
      'p/Base.java': `package p; public class Base { public void provide(){} }`,
      'p/Sub.java': `package p; public class Sub extends Base { void run(){ provide(); } }`,
    })
    const c = firstCall(g, 'provide')
    expect(c.receiverKind).toBe('self')
    expect(c.calleeClass).toBe('Sub')
    expect(c.calleeFile).toBe('p/Sub.java')
  })

  it('self overloadArity reflects the method declared on the enclosing class', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ helper(1); } void helper(int a){} }`,
    })
    expect(firstCall(g, 'helper').overloadArity).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: super
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — super', () => {
  it('super.m() resolves to the superclass', async () => {
    const g = await graphOf({
      'p/Base.java': `package p; public class Base { public void init(){} }`,
      'p/Sub.java': `package p; public class Sub extends Base { void run(){ super.init(); } }`,
    })
    expect(firstCall(g, 'init').receiverKind).toBe('super')
  })

  it('super receiver calleeClass is the superclass name', async () => {
    const g = await graphOf({
      'p/Base.java': `package p; public class Base { public void init(){} }`,
      'p/Sub.java': `package p; public class Sub extends Base { void run(){ super.init(); } }`,
    })
    const c = firstCall(g, 'init')
    expect(c.calleeClass).toBe('Base')
    expect(c.calleeFile).toBe('p/Base.java')
  })

  it('super.m() with no superclass is unresolved', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ super.toString(); } }`,
    })
    // no extends -> supertypeNames empty -> unresolved.
    expect(firstCall(g, 'toString').receiverKind).toBe('unresolved')
  })

  it('super to an external superclass yields external', async () => {
    const g = await graphOf({
      'p/Sub.java': `package p; import java.util.ArrayList; public class Sub extends ArrayList { void run(){ super.clear(); } }`,
    })
    expect(firstCall(g, 'clear').receiverKind).toBe('external')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: static
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — static', () => {
  it('Type.m() with capitalized type name resolves to static', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ Helper.fmt(); } }`,
      'p/Helper.java': `package p; public class Helper { public static void fmt(){} }`,
    })
    expect(firstCall(g, 'fmt').receiverKind).toBe('static')
  })

  it('static receiver calleeClass is the type name', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ Helper.fmt(); } }`,
      'p/Helper.java': `package p; public class Helper { public static void fmt(){} }`,
    })
    expect(firstCall(g, 'fmt').calleeClass).toBe('Helper')
  })

  it('static call on a JDK type is external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ Math.max(1,2); } }`,
    })
    expect(firstCall(g, 'max').receiverKind).toBe('external')
  })

  it('lowercase unknown identifier is NOT treated as static type', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ helper.fmt(); } }`,
      'p/Helper.java': `package p; public class Helper { public static void fmt(){} }`,
    })
    // lowercase "helper" is not a field/param/local and does not match /^[A-Z]/ -> unresolved.
    expect(firstCall(g, 'fmt').receiverKind).toBe('unresolved')
  })

  it('capitalized name that resolves to no type is unresolved', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ Nope.fmt(); } }`,
    })
    expect(firstCall(g, 'fmt').receiverKind).toBe('unresolved')
  })

  it('static via explicit import resolves to imported type', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import q.Helper; public class P { void run(){ Helper.fmt(); } }`,
      'q/Helper.java': `package q; public class Helper { public static void fmt(){} }`,
    })
    const c = firstCall(g, 'fmt')
    expect(c.receiverKind).toBe('static')
    expect(c.calleeFile).toBe('q/Helper.java')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: return-type / chaining
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — return-type / chain', () => {
  it('a.b().c() resolves c() on the return type of b()', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.mkB().by(); } }`,
      'p/A.java': `package p; public class A { public B mkB(){return new B();} }`,
      'p/B.java': `package p; public class B { public void by(){} }`,
    })
    const c = firstCall(g, 'by')
    expect(c.receiverKind).toBe('return-type')
    expect(c.calleeClass).toBe('B')
  })

  it('self-method chain mk().go() resolves go() on mk() return type', async () => {
    const g = await pair(
      `public class P { Target mk(){return new Target();} void run(){ mk().go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('return-type')
  })

  it('three-hop chain a().b().c() resolves the final hop via return types', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A mk(){return new A();} void run(){ mk().self().tick(); } }`,
      'p/A.java': `package p; public class A { public A self(){return this;} public void tick(){} }`,
    })
    expect(firstCall(g, 'tick').receiverKind).toBe('return-type')
    expect(firstCall(g, 'tick').calleeClass).toBe('A')
  })

  it('chain off an external return type is reported external (external-ness propagates)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ mk().trim(); } public String mk(){return "x";} }`,
    })
    // mk() returns String (java.lang) -> external; .trim() chained off an external
    // owner stays external (engine propagates external via unresolvedType(true)).
    expect(firstCall(g, 'trim').receiverKind).toBe('external')
  })

  it('chain off a method with unknown return type is unresolved', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ mk().go(); } public Unknownz mk(){return null;} }`,
    })
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('void-returning method in a chain yields unresolved downstream', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ mk().go(); } public void mk(){} }`,
    })
    // void return -> returnType null -> chain unresolved.
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('field-of-field chain this.b.c.m() reports a return-type hop on c', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { B b; void run(){ this.b.c.go(); } }`,
      'p/B.java': `package p; public class B { C c; }`,
      'p/C.java': `package p; public class C { public void go(){} }`,
    })
    const c = firstCall(g, 'go')
    // desc.on is not this/null (it's field b) -> kind is return-type (deep field hop).
    expect(c.receiverKind).toBe('return-type')
    expect(c.calleeClass).toBe('C')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: external
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — external', () => {
  it('String literal local .m() is external (java.lang implicit)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ String s = "x"; s.length(); } }`,
    })
    expect(firstCall(g, 'length').receiverKind).toBe('external')
  })

  it('external receiver has null calleeClass and calleeFile', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ String s = "x"; s.length(); } }`,
    })
    const c = firstCall(g, 'length')
    expect(c.calleeClass).toBeNull()
    expect(c.calleeFile).toBeNull()
  })

  it('external receiver overloadArity is always null', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ String s = "x"; s.indexOf("a"); } }`,
    })
    expect(firstCall(g, 'indexOf').overloadArity).toBeNull()
  })

  it('explicit java.util import field -> external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import java.util.List; public class P { List l; void run(){ l.clear(); } }`,
    })
    expect(firstCall(g, 'clear').receiverKind).toBe('external')
  })

  it('javax.* import resolves to external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import javax.sql.DataSource; public class P { DataSource ds; void run(){ ds.getConnection(); } }`,
    })
    expect(firstCall(g, 'getConnection').receiverKind).toBe('external')
  })

  it('jakarta.* import resolves to external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import jakarta.persistence.EntityManager; public class P { EntityManager em; void run(){ em.flush(); } }`,
    })
    expect(firstCall(g, 'flush').receiverKind).toBe('external')
  })

  it('wildcard java.util.* import makes unknown simple type external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import java.util.*; public class P { Deque d; void run(){ d.pop(); } }`,
    })
    expect(firstCall(g, 'pop').receiverKind).toBe('external')
  })

  it('java.lang implicit type (StringBuilder) is external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { StringBuilder sb; void run(){ sb.append("x"); } }`,
    })
    expect(firstCall(g, 'append').receiverKind).toBe('external')
  })

  it('chained call off external receiver stays external (external-ness propagates)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { StringBuilder sb; void run(){ sb.append("x").length(); } }`,
    })
    // append() is external; .length() chained off it remains external (propagation).
    expect(firstCall(g, 'length').receiverKind).toBe('external')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// receiver kind: unresolved (genuinely unresolvable)
// ──────────────────────────────────────────────────────────────────────────

describe('receiver kind — unresolved', () => {
  it('cast receiver ((T)o).m() is unresolved, NOT a phantom self', async () => {
    const g = await pair(
      `public class P { void run(Object o){ ((Target)o).go(); } void go(){} }`,
      TARGET,
    )
    const c = firstCall(g, 'go')
    expect(c.receiverKind).toBe('unresolved')
    expect(c.calleeClass).toBeNull()
  })

  it('object-creation receiver new T().m() is unresolved (not self)', async () => {
    const g = await pair(
      `public class P { void run(){ new Target().go(); } void go(){} }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('ternary receiver (c?a:b).m() is unresolved (not self)', async () => {
    const g = await pair(
      `public class P { Target a; Target b; void run(boolean f){ (f?a:b).go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('array-access receiver arr[0].m() is unresolved (not self)', async () => {
    const g = await pair(
      `public class P { Target[] arr; void run(){ arr[0].go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('unknown bare identifier receiver is unresolved', async () => {
    const g = await pair(`public class P { void run(){ mystery.go(); } }`, TARGET)
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('var-typed local receiver is unresolved (no inference)', async () => {
    const g = await pair(
      `public class P { Target mk(){return new Target();} void run(){ var v = mk(); v.go(); } }`,
      TARGET,
    )
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('Object param receiver is external (java.lang Object), method call external', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(Object o){ o.toString(); } }`,
    })
    expect(firstCall(g, 'toString').receiverKind).toBe('external')
  })

  it('unresolved calls are reported, never silently dropped', async () => {
    const g = await pair(`public class P { void run(){ mystery.go(); } }`, TARGET)
    expect(g.calls.length).toBe(1)
    expect(firstCall(g, 'go').receiverKind).toBe('unresolved')
  })

  it('unresolved receiver has null callee fields and null overloadArity', async () => {
    const g = await pair(`public class P { void run(){ mystery.go(); } }`, TARGET)
    const c = firstCall(g, 'go')
    expect(c.calleeClass).toBeNull()
    expect(c.calleeFile).toBeNull()
    expect(c.overloadArity).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// lambda behavior (documented)
// ──────────────────────────────────────────────────────────────────────────

describe('lambda bodies', () => {
  it('a call INSIDE a lambda body is still traced (not dropped)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { B b; void run(){ go(x -> b.by()); } void go(Object o){} }`,
      'p/B.java': `package p; public class B { void by(){} }`,
    })
    // inner b.by() is resolved as field B.
    expect(firstCall(g, 'by').receiverKind).toBe('field')
    expect(firstCall(g, 'by').calleeClass).toBe('B')
  })

  it('the call whose argument is a lambda is itself counted (self go)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { B b; void run(){ go(x -> b.by()); } void go(Object o){} }`,
      'p/B.java': `package p; public class B { void by(){} }`,
    })
    expect(firstCall(g, 'go').receiverKind).toBe('self')
  })

  it('lambda parameter receiver is unresolved (no inferred type)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import java.util.List; public class P { List<B> items; void run(){ items.forEach(x -> x.by()); } }`,
      'p/B.java': `package p; public class B { void by(){} }`,
    })
    // x is a lambda param with no declared type info -> unresolved.
    expect(firstCall(g, 'by').receiverKind).toBe('unresolved')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// overload arity selection
// ──────────────────────────────────────────────────────────────────────────

describe('overload arity selection', () => {
  const REPO = `public class Repo {
    public void put(String k){}
    public void put(String k, String v){}
    public void put(String k, String v, int t){}
    public void amb(int a){}
    public void amb(String a){}
    public void only(int a){}
  }`

  it('arg1 selects the 1-arity overload', async () => {
    const g = await pair(`public class P { Repo r; void run(){ r.put("a"); } }`, REPO)
    expect(firstCall(g, 'put').overloadArity).toBe(1)
  })

  it('arg2 selects the 2-arity overload', async () => {
    const g = await pair(`public class P { Repo r; void run(){ r.put("a","b"); } }`, REPO)
    expect(firstCall(g, 'put').overloadArity).toBe(2)
  })

  it('arg3 selects the 3-arity overload', async () => {
    const g = await pair(`public class P { Repo r; void run(){ r.put("a","b",1); } }`, REPO)
    expect(firstCall(g, 'put').overloadArity).toBe(3)
  })

  it('ambiguous same-arity overloads yield null overloadArity', async () => {
    const g = await pair(`public class P { Repo r; void run(){ r.amb(1); } }`, REPO)
    expect(firstCall(g, 'amb').overloadArity).toBeNull()
  })

  it('single same-name method always yields its paramCount even with arg mismatch', async () => {
    // only(int) called with 2 args -> exact match 0, but single same-name -> its paramCount.
    const g = await pair(`public class P { Repo r; void run(){ r.only(1,2); } }`, REPO)
    expect(firstCall(g, 'only').overloadArity).toBe(1)
  })

  it('arg count with no matching arity but multiple same-name -> null', async () => {
    // put has 1/2/3 arity; call with 4 args -> no exact match, multiple same-name -> null.
    const g = await pair(`public class P { Repo r; void run(){ r.put("a","b","c","d"); } }`, REPO)
    expect(firstCall(g, 'put').overloadArity).toBeNull()
  })

  it('arity selection still records the actual argCount independent of overloadArity', async () => {
    const g = await pair(`public class P { Repo r; void run(){ r.amb(1); } }`, REPO)
    const c = firstCall(g, 'amb')
    expect(c.argCount).toBe(1)
    expect(c.overloadArity).toBeNull()
  })

  it('overload arity walks the supertype chain', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { Sub s; void run(){ s.foo(1,2); } }`,
      'p/Base.java': `package p; public class Base { public void foo(int a, int b){} }`,
      'p/Sub.java': `package p; public class Sub extends Base {}`,
    })
    expect(firstCall(g, 'foo').overloadArity).toBe(2)
  })

  it('overload arity null when method only exists with different ambiguous candidates across super', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { Sub s; void run(){ s.foo(1); } }`,
      'p/Base.java': `package p; public class Base { public void foo(int a){} public void foo(String a){} }`,
      'p/Sub.java': `package p; public class Sub extends Base {}`,
    })
    expect(firstCall(g, 'foo').overloadArity).toBeNull()
  })

  it('callee with no same-name method (e.g. only inherited contract) -> null', async () => {
    // method name not declared on the resolved type or its supers -> null.
    const g = await pair(`public class P { Repo r; void run(){ r.missing(); } }`, REPO)
    expect(firstCall(g, 'missing').overloadArity).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// argCount correctness
// ──────────────────────────────────────────────────────────────────────────

describe('argCount', () => {
  it('zero-arg call has argCount 0', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').argCount).toBe(0)
  })

  it('single-arg call has argCount 1', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(1); } }`,
      'p/A.java': `package p; public class A { void ay(int x){} }`,
    })
    expect(firstCall(g, 'ay').argCount).toBe(1)
  })

  it('many-arg call counts all top-level args', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(1,2,3,4); } }`,
      'p/A.java': `package p; public class A { void ay(int a,int b,int c,int d){} }`,
    })
    expect(firstCall(g, 'ay').argCount).toBe(4)
  })

  it('nested call args count only top-level args of the outer call', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(a.mk(1,2), 3); } }`,
      'p/A.java': `package p; public class A { int mk(int a,int b){return 0;} void ay(Object o,int i){} }`,
    })
    expect(firstCall(g, 'ay').argCount).toBe(2)
  })

  it('nested inner call argCount is counted on its own', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(a.mk(1,2), 3); } }`,
      'p/A.java': `package p; public class A { int mk(int a,int b){return 0;} void ay(Object o,int i){} }`,
    })
    expect(firstCall(g, 'mk').argCount).toBe(2)
  })

  it('arg that is a method chain counts as one argument', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(a.self().self()); } }`,
      'p/A.java': `package p; public class A { A self(){return this;} void ay(Object o){} }`,
    })
    expect(firstCall(g, 'ay').argCount).toBe(1)
  })

  it('generic-typed argument with commas inside <> counts as one arg', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import java.util.Map; public class P { A a; void run(){ a.ay(mk()); } Map<String,Integer> mk(){return null;} }`,
      'p/A.java': `package p; public class A { void ay(Object o){} }`,
    })
    expect(firstCall(g, 'ay').argCount).toBe(1)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// callLine + caller identity
// ──────────────────────────────────────────────────────────────────────────

describe('callLine and caller identity', () => {
  it('callLine is the 1-based invocation line', async () => {
    // pair() prepends "package p;\n" (line 1), so the body starts at line 2:
    // line2 class, line3 field, line4 method, line5 t.go().
    const g = await pair(
      `public class P {\n  Target t;\n  void run(){\n    t.go();\n  }\n}`,
      TARGET,
    )
    expect(firstCall(g, 'go').callLine).toBe(5)
  })

  it('two calls on different lines keep distinct callLine', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P {\n  A a;\n  void run(){\n    a.x();\n    a.y();\n  }\n}`,
      'p/A.java': `package p; public class A { void x(){} void y(){} }`,
    })
    expect(firstCall(g, 'x').callLine).toBe(4)
    expect(firstCall(g, 'y').callLine).toBe(5)
  })

  it('callerClass is the enclosing class', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').callerClass).toBe('P')
  })

  it('callerMethod is the enclosing method', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').callerMethod).toBe('run')
  })

  it('callerFile is the file containing the call', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(firstCall(g, 'go').callerFile).toBe('p/P.java')
  })

  it('calls in distinct methods carry distinct callerMethod', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void one(){ a.x(); } void two(){ a.y(); } }`,
      'p/A.java': `package p; public class A { void x(){} void y(){} }`,
    })
    expect(firstCall(g, 'x').callerMethod).toBe('one')
    expect(firstCall(g, 'y').callerMethod).toBe('two')
  })

  it('a call inside a constructor uses the constructor name as callerMethod', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; P(){ a.x(); } }`,
      'p/A.java': `package p; public class A { void x(){} }`,
    })
    expect(firstCall(g, 'x').callerMethod).toBe('P')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// type inference depth: field/return/local driving resolution
// ──────────────────────────────────────────────────────────────────────────

describe('type inference driving resolution', () => {
  it('field declaration type drives field receiver resolution', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').calleeClass).toBe('A')
  })

  it('method return type drives chained resolution', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.mk().bee(); } }`,
      'p/A.java': `package p; public class A { B mk(){return new B();} }`,
      'p/B.java': `package p; public class B { void bee(){} }`,
    })
    expect(firstCall(g, 'bee').calleeClass).toBe('B')
  })

  it('new X() local type drives resolution', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ A a = new A(); a.ay(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').receiverKind).toBe('local')
  })

  it('inherited field type is resolved by walking the super chain', async () => {
    const g = await graphOf({
      'p/Base.java': `package p; public class Base { protected A a; }`,
      'p/Sub.java': `package p; public class Sub extends Base { void run(){ a.ay(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
    })
    const c = firstCall(g, 'ay')
    expect(c.receiverKind).toBe('field')
    expect(c.calleeClass).toBe('A')
  })

  it('inherited method return type is resolved across super chain in a chain', async () => {
    const g = await graphOf({
      'p/Base.java': `package p; public class Base { public A make(){return new A();} }`,
      'p/Sub.java': `package p; public class Sub extends Base { A a; void run(){ a.go().ay(); } }`,
      'p/A.java': `package p; public class A { public A go(){return this;} void ay(){} }`,
    })
    // a.go() returns A, then .ay() on A.
    expect(firstCall(g, 'ay').calleeClass).toBe('A')
  })

  it('field type resolution prefers same-package over ambiguous simple name', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { Thing t; void run(){ t.go(); } }`,
      'p/Thing.java': `package p; public class Thing { void go(){} }`,
      'q/Thing.java': `package q; public class Thing { void go(){} }`,
    })
    expect(firstCall(g, 'go').calleeFile).toBe('p/Thing.java')
  })

  it('field type resolution via explicit import beats same-package and ambiguity', async () => {
    const g = await graphOf({
      'p/P.java': `package p; import q.Thing; public class P { Thing t; void run(){ t.go(); } }`,
      'p/Thing.java': `package p; public class Thing { void go(){} }`,
      'q/Thing.java': `package q; public class Thing { void go(){} }`,
    })
    expect(firstCall(g, 'go').calleeFile).toBe('q/Thing.java')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// calleeClass / calleeFile correctness
// ──────────────────────────────────────────────────────────────────────────

describe('callee resolution correctness', () => {
  it('in-project callee resolves calleeFile to a relative path', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.ay(); } }`,
      'p/A.java': `package p; public class A { void ay(){} }`,
    })
    expect(firstCall(g, 'ay').calleeFile).toBe('p/A.java')
  })

  it('external callee yields null calleeFile', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ String s = "x"; s.length(); } }`,
    })
    expect(firstCall(g, 'length').calleeFile).toBeNull()
  })

  it('calleeClass uses the primary class of the resolved file', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { Outer o; void run(){ o.om(); } }`,
      'p/Outer.java': `package p; public class Outer { void om(){} class Inner {} }`,
    })
    expect(firstCall(g, 'om').calleeClass).toBe('Outer')
  })

  it('calleeMethod is preserved verbatim', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.weirdName(); } }`,
      'p/A.java': `package p; public class A { void weirdName(){} }`,
    })
    expect(firstCall(g, 'weirdName').calleeMethod).toBe('weirdName')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// graph-level invariants
// ──────────────────────────────────────────────────────────────────────────

describe('graph-level invariants', () => {
  it('schemaVersion is 1', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(g.schemaVersion).toBe(1)
  })

  it('gitCommit is passed through verbatim', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    expect(g.gitCommit).toBe('GIT')
  })

  it('gitCommit may be null', async () => {
    const facts = new Map<string, JavaFileFacts>()
    facts.set('p/P.java', await extractJavaFacts('p/P.java', 'package p; public class P {}'))
    const g = buildGraphFromFacts(facts, null)
    expect(g.gitCommit).toBeNull()
  })

  it('empty project yields zero calls', async () => {
    const g = await graphOf({ 'p/P.java': `package p; public class P {}` })
    expect(g.calls).toEqual([])
  })

  it('every call has a non-empty calleeMethod', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){ a.x(); a.y(); } }`,
      'p/A.java': `package p; public class A { void x(){} void y(){} }`,
    })
    for (const c of g.calls) expect(c.calleeMethod.length).toBeGreaterThan(0)
  })

  it('resolved calls always have a non-null calleeFile', async () => {
    const g = await pair(`public class P { Target t; void run(){ t.go(); } }`, TARGET)
    for (const c of g.calls) {
      if (c.receiverKind !== 'external' && c.receiverKind !== 'unresolved') {
        expect(c.calleeFile).not.toBeNull()
      }
    }
  })

  it('external + unresolved calls always have null calleeFile and calleeClass', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ String s="x"; s.length(); mystery.go(); } }`,
    })
    for (const c of g.calls) {
      if (c.receiverKind === 'external' || c.receiverKind === 'unresolved') {
        expect(c.calleeFile).toBeNull()
        expect(c.calleeClass).toBeNull()
      }
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// determinism + sorting
// ──────────────────────────────────────────────────────────────────────────

describe('determinism and sorting', () => {
  it('calls are sorted by (callerFile, callLine, calleeMethod)', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { A a; void run(){\n a.z();\n a.a();\n } }`,
      'p/A.java': `package p; public class A { void z(){} void a(){} }`,
    })
    const keys = g.calls.map((c) => [c.callerFile, c.callLine, c.calleeMethod])
    const sorted = [...keys].sort((x, y) =>
      x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0,
    )
    expect(keys).toEqual(sorted)
  })

  it('buildGraphFromFacts twice is byte-identical (stableJson)', async () => {
    const sources = {
      'p/P.java': `package p; public class P { A a; void run(){ a.x(); a.y(); } }`,
      'p/A.java': `package p; public class A { void x(){} void y(){} }`,
    }
    const g1 = await graphOf(sources)
    const g2 = await graphOf(sources)
    expect(stableJson(g1)).toBe(stableJson(g2))
  })

  it('insertion order of facts does not change output (sorted internally)', async () => {
    const f1 = new Map<string, JavaFileFacts>()
    f1.set('p/A.java', await extractJavaFacts('p/A.java', 'package p; public class A { void x(){} }'))
    f1.set('p/P.java', await extractJavaFacts('p/P.java', 'package p; public class P { A a; void run(){ a.x(); } }'))
    const f2 = new Map<string, JavaFileFacts>()
    f2.set('p/P.java', await extractJavaFacts('p/P.java', 'package p; public class P { A a; void run(){ a.x(); } }'))
    f2.set('p/A.java', await extractJavaFacts('p/A.java', 'package p; public class A { void x(){} }'))
    expect(stableJson(buildGraphFromFacts(f1, 'G'))).toBe(stableJson(buildGraphFromFacts(f2, 'G')))
  })

  it('buildMethodCallGraph twice over the on-disk fixture is byte-identical', async () => {
    const census = censusFor([
      'com/app/Base.java',
      'com/app/Entity.java',
      'com/app/Helper.java',
      'com/app/Repo.java',
      'com/app/Service.java',
    ])
    const g1 = await buildMethodCallGraph(fixtureRoot, census)
    const g2 = await buildMethodCallGraph(fixtureRoot, census)
    expect(stableJson(g1.calls)).toBe(stableJson(g2.calls))
  })
})

/** census 한 줄짜리 헬퍼(java 파일만). */
function censusFor(rels: string[]): CensusReport {
  return {
    schemaVersion: 1,
    gitCommit: null,
    fileCount: rels.length,
    files: rels.map((relPath) => ({ relPath, lang: 'java' })),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// golden lock — original on-disk fixture (com/app) via buildMethodCallGraph
// ──────────────────────────────────────────────────────────────────────────

describe('golden — com/app fixture (all 8 receiver kinds + overloads)', () => {
  let graph: MethodCallGraph

  async function load(): Promise<MethodCallGraph> {
    if (!graph) {
      graph = await buildMethodCallGraph(
        fixtureRoot,
        censusFor([
          'com/app/Base.java',
          'com/app/Entity.java',
          'com/app/Helper.java',
          'com/app/Repo.java',
          'com/app/Service.java',
        ]),
      )
    }
    return graph
  }

  /** caller/line/callee 자연키로 한 호출을 찾는다. */
  function pick(g: MethodCallGraph, method: string, line: number, callee: string): ResolvedCall {
    const c = g.calls.find(
      (cc) => cc.callerMethod === method && cc.callLine === line && cc.calleeMethod === callee,
    )
    if (!c) throw new Error(`not found ${method}:${line}:${callee}`)
    return c
  }

  it('produces exactly 29 resolved calls', async () => {
    const g = await load()
    expect(g.calls.length).toBe(29)
  })

  it('byField: this.repo.save -> field/Repo', async () => {
    const c = pick(await load(), 'byField', 13, 'save')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Repo'])
  })

  it('byField: repo.load -> field/Repo', async () => {
    const c = pick(await load(), 'byField', 14, 'load')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Repo'])
  })

  it('byParam: p.touch -> param/Entity', async () => {
    const c = pick(await load(), 'byParam', 19, 'touch')
    expect([c.receiverKind, c.calleeClass]).toEqual(['param', 'Entity'])
  })

  it('byParam: r.save -> param/Repo', async () => {
    const c = pick(await load(), 'byParam', 20, 'save')
    expect([c.receiverKind, c.calleeClass]).toEqual(['param', 'Repo'])
  })

  it('byLocal: localRepo.load -> local/Repo', async () => {
    const c = pick(await load(), 'byLocal', 26, 'load')
    expect([c.receiverKind, c.calleeClass]).toEqual(['local', 'Repo'])
  })

  it('byLocal: helper.build -> field/Helper (helper field, not local)', async () => {
    const c = pick(await load(), 'byLocal', 27, 'build')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Helper'])
  })

  it('byLocal: e.touch -> local/Entity (e from helper.build())', async () => {
    const c = pick(await load(), 'byLocal', 28, 'touch')
    expect([c.receiverKind, c.calleeClass]).toEqual(['local', 'Entity'])
  })

  it('bySelf: unqualified helperMethod -> self/Service', async () => {
    const c = pick(await load(), 'bySelf', 33, 'helperMethod')
    expect([c.receiverKind, c.calleeClass]).toEqual(['self', 'Service'])
  })

  it('bySelf: this.helperMethod -> self/Service', async () => {
    const c = pick(await load(), 'bySelf', 34, 'helperMethod')
    expect([c.receiverKind, c.calleeClass]).toEqual(['self', 'Service'])
  })

  it('bySuper: super.init -> super/Base', async () => {
    const c = pick(await load(), 'bySuper', 42, 'init')
    expect([c.receiverKind, c.calleeClass]).toEqual(['super', 'Base'])
  })

  it('byStatic: Helper.fmt -> static/Helper', async () => {
    const c = pick(await load(), 'byStatic', 47, 'fmt')
    expect([c.receiverKind, c.calleeClass]).toEqual(['static', 'Helper'])
  })

  it('byStatic: Helper.make -> static/Helper', async () => {
    const c = pick(await load(), 'byStatic', 48, 'make')
    expect([c.receiverKind, c.calleeClass]).toEqual(['static', 'Helper'])
  })

  it('byChain: entity.repo().load -> return-type/Repo', async () => {
    const c = pick(await load(), 'byChain', 53, 'load')
    expect([c.receiverKind, c.calleeClass]).toEqual(['return-type', 'Repo'])
  })

  it('byChain: entity.repo (inner field hop) -> field/Entity', async () => {
    const c = pick(await load(), 'byChain', 53, 'repo')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Entity'])
  })

  it('byChain: entity.self().name -> return-type/Entity', async () => {
    const c = pick(await load(), 'byChain', 54, 'name')
    expect([c.receiverKind, c.calleeClass]).toEqual(['return-type', 'Entity'])
  })

  it('byChain: helper.build().touch -> return-type/Entity', async () => {
    const c = pick(await load(), 'byChain', 55, 'touch')
    expect([c.receiverKind, c.calleeClass]).toEqual(['return-type', 'Entity'])
  })

  it('byExternal: list.add -> external/null', async () => {
    const c = pick(await load(), 'byExternal', 61, 'add')
    expect([c.receiverKind, c.calleeClass]).toEqual(['external', null])
  })

  it('byExternal: s.length -> external/null', async () => {
    const c = pick(await load(), 'byExternal', 63, 'length')
    expect([c.receiverKind, c.calleeClass]).toEqual(['external', null])
  })

  it('byOverload: put arg1 -> overloadArity 1', async () => {
    const c = pick(await load(), 'byOverload', 68, 'put')
    expect(c.overloadArity).toBe(1)
  })

  it('byOverload: put arg2 -> overloadArity 2', async () => {
    const c = pick(await load(), 'byOverload', 69, 'put')
    expect(c.overloadArity).toBe(2)
  })

  it('byOverload: put arg3 -> overloadArity 3', async () => {
    const c = pick(await load(), 'byOverload', 70, 'put')
    expect(c.overloadArity).toBe(3)
  })

  it('byOverload: amb arg1 ambiguous -> overloadArity null', async () => {
    const c = pick(await load(), 'byOverload', 71, 'amb')
    expect(c.overloadArity).toBeNull()
  })

  it('byInheritedField: baseRepo.save -> field/Repo (walks Base)', async () => {
    const c = pick(await load(), 'byInheritedField', 76, 'save')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Repo'])
  })

  it('byInheritedSelf: provide() unqualified -> self/Service', async () => {
    const c = pick(await load(), 'byInheritedSelf', 81, 'provide')
    expect([c.receiverKind, c.calleeClass]).toEqual(['self', 'Service'])
  })

  it('byUnresolved: o.toString -> external (Object)', async () => {
    const c = pick(await load(), 'byUnresolved', 86, 'toString')
    expect(c.receiverKind).toBe('external')
  })

  it('byUnresolved: repo.load (field) still resolves', async () => {
    const c = pick(await load(), 'byUnresolved', 87, 'load')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Repo'])
  })

  it('byUnresolved: v.touch (var) -> unresolved', async () => {
    const c = pick(await load(), 'byUnresolved', 88, 'touch')
    expect(c.receiverKind).toBe('unresolved')
  })

  it('full golden snapshot is stable (stableJson lock)', async () => {
    const g = await load()
    // Lock the natural-key projection so accidental engine changes are caught.
    const projection = g.calls.map((c) => [
      c.callerMethod,
      c.callLine,
      c.calleeMethod,
      c.receiverKind,
      c.calleeClass,
      c.argCount,
      c.overloadArity,
    ])
    expect(projection).toMatchSnapshot()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// golden lock — com/ext fixture (generics/arrays/interface/ambiguity/deep chain)
// ──────────────────────────────────────────────────────────────────────────

describe('golden — com/ext fixture (generics, arrays, interface, ambiguity, chains)', () => {
  let graph: MethodCallGraph

  async function load(): Promise<MethodCallGraph> {
    if (!graph) {
      graph = await buildMethodCallGraph(
        fixtureRoot,
        censusFor([
          'com/ext/Iface.java',
          'com/ext/Impl.java',
          'com/ext/Node.java',
          'com/ext/Consumer.java',
          'com/ext/AmbiguousUser.java',
          'lib/x/Box.java',
          'lib/y/Box.java',
        ]),
      )
    }
    return graph
  }

  function pick(g: MethodCallGraph, method: string, callee: string): ResolvedCall {
    const c = g.calls.find((cc) => cc.callerMethod === method && cc.calleeMethod === callee)
    if (!c) throw new Error(`not found ${method}:${callee}`)
    return c
  }

  it('genericField: nodes.add (List) -> external', async () => {
    expect(pick(await load(), 'genericField', 'add').receiverKind).toBe('external')
  })

  it('arrayFieldDirect: local n typed Node -> local/Node', async () => {
    const c = pick(await load(), 'arrayFieldDirect', 'tick')
    expect([c.receiverKind, c.calleeClass]).toEqual(['local', 'Node'])
  })

  it('explicitImport: box.open resolves to lib.x.Box (imported)', async () => {
    const c = pick(await load(), 'explicitImport', 'open')
    expect(c.calleeFile).toBe('lib/x/Box.java')
  })

  it('interfaceReceiver: svc.handle -> field/Iface', async () => {
    const c = pick(await load(), 'interfaceReceiver', 'handle')
    expect([c.receiverKind, c.calleeClass]).toEqual(['field', 'Iface'])
  })

  it('interfaceReceiver: svc.cfg arity 1 selects overload 1', async () => {
    const c = (await load()).calls.find(
      (cc) => cc.callerMethod === 'interfaceReceiver' && cc.calleeMethod === 'cfg' && cc.argCount === 1,
    )!
    expect(c.overloadArity).toBe(1)
  })

  it('interfaceReceiver: svc.cfg arity 2 selects overload 2', async () => {
    const c = (await load()).calls.find(
      (cc) => cc.callerMethod === 'interfaceReceiver' && cc.calleeMethod === 'cfg' && cc.argCount === 2,
    )!
    expect(c.overloadArity).toBe(2)
  })

  it('deepChain: head().next().tick resolves final tick on Node', async () => {
    const c = pick(await load(), 'deepChain', 'tick')
    expect([c.receiverKind, c.calleeClass]).toEqual(['return-type', 'Node'])
  })

  it('deepChain: head() is self on Consumer', async () => {
    const c = pick(await load(), 'deepChain', 'head')
    expect([c.receiverKind, c.calleeClass]).toEqual(['self', 'Consumer'])
  })

  it('deepChain: next() is return-type on Node', async () => {
    const c = pick(await load(), 'deepChain', 'next')
    expect([c.receiverKind, c.calleeClass]).toEqual(['return-type', 'Node'])
  })

  it('varReceiver: x.tick (var) -> unresolved', async () => {
    expect(pick(await load(), 'varReceiver', 'tick').receiverKind).toBe('unresolved')
  })

  it('typedLocalFromChain: y.tick (typed local) -> local/Node', async () => {
    const c = pick(await load(), 'typedLocalFromChain', 'tick')
    expect([c.receiverKind, c.calleeClass]).toEqual(['local', 'Node'])
  })

  it('AmbiguousUser: box.open (two wildcard Box) -> unresolved', async () => {
    expect(pick(await load(), 'useAmbiguous', 'open').receiverKind).toBe('unresolved')
  })

  it('com/ext golden snapshot is stable', async () => {
    const g = await load()
    const projection = g.calls.map((c) => [
      c.callerMethod,
      c.calleeMethod,
      c.receiverKind,
      c.calleeClass,
      c.calleeFile,
      c.argCount,
      c.overloadArity,
    ])
    expect(projection).toMatchSnapshot()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// regression: phantom-self bug (fixed) — explicit receivers never become self
// ──────────────────────────────────────────────────────────────────────────

describe('regression — explicit-but-unresolvable receivers never become phantom self', () => {
  const cases: Array<[string, string]> = [
    ['cast', `((Target)o).go();`],
    ['array-access', `arr[0].go();`],
    ['ternary', `(f?a:b).go();`],
    ['object-creation', `new Target().go();`],
  ]
  for (const [label, body] of cases) {
    it(`${label} receiver is unresolved (not self), and not attributed to caller class`, async () => {
      const g = await pair(
        `public class P { Target a; Target b; Target[] arr; void run(Object o, boolean f){ ${body} } void go(){} }`,
        TARGET,
      )
      const c = firstCall(g, 'go')
      expect(c.receiverKind).toBe('unresolved')
      // crucial: must NOT be self/P (the bug attributed go() to P.go phantom-ly).
      expect(c.calleeClass).not.toBe('P')
      expect(c.calleeClass).toBeNull()
    })
  }

  it('legitimate implicit self (no receiver) is still self', async () => {
    const g = await graphOf({
      'p/P.java': `package p; public class P { void run(){ go(); } void go(){} }`,
    })
    expect(firstCall(g, 'go').receiverKind).toBe('self')
  })

  it('a chain that begins with an unresolvable receiver does not leak self downstream', async () => {
    const g = await pair(
      `public class P { void run(Object o){ ((Target)o).self().go(); } void go(){} }`,
      `public class Target { public Target self(){return this;} public void go(){} }`,
    )
    // both hops unresolved because the base ((Target)o) is unknown.
    for (const c of callsIn(g, 'run')) {
      expect(c.receiverKind).toBe('unresolved')
      expect(c.calleeClass).toBeNull()
    }
  })
})
