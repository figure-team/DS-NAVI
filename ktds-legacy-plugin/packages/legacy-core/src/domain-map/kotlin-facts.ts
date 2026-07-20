/**
 * Kotlin 파일 단일패스 팩트 추출 — JavaFileFacts 동형을 산출한다.
 *
 * 목적: edges/method-calls 의 해소 기계(ClassIndex·수신자 해소·도달성 BFS)는 언어 무관이므로,
 * Kotlin AST 에서 같은 팩트 형태만 만들어 주면 그대로 재사용된다. 타입 이름은 Java 판과
 * 동일하게 외곽 식별자만 보존한다(`List<User>` → `List`, `Foo?` → `Foo`).
 *
 * Java 판과 의도적으로 다른 점(Kotlin 문법 기인):
 *  - 주생성자 val/var 파라미터는 필드이자 생성자 파라미터다 — fields 와 ctorParamTypes 양쪽에 싣는다.
 *  - 타입 미선언 프로퍼티(`val p = svc.platform`)는 초기화식이 단순 생성 호출(`Foo(...)`)일 때만
 *    그 이름을 타입으로 기록하고, 그 외(navigation 등)는 필드로 싣지 않는다(미해소 정직 표기).
 *  - 후행 람다는 인자 1개로 계상한다(`items.map { }` → argCount 1). `fold(0) { }` 처럼
 *    외곽 call_expression 이 람다만 들고 내부 call_expression 을 감싸는 형태는 한 호출로 합친다.
 *  - top-level 함수는 클래스 소속이 아니므로 classes 에 싣지 않는다(콜그래프 한계, 정직 유보).
 *  - kind 매핑: object/data class → 'class' (record 는 Java 전용 표기로 남긴다).
 */
import type { Node } from 'web-tree-sitter'
import { parseSource, startLine } from './tree-sitter.js'
import type {
  CallSite,
  ClassFact,
  ClassKind,
  JavaFileFacts,
  JavaLocalVar,
  MethodFact,
  ReceiverDesc,
} from './java-facts.js'
import {
  collectDeclAnnotations,
  ktChild,
  ktChildren,
  ktDeclKind,
  ktImports,
  ktPackageName,
  ktTypeOuterName,
} from './kotlin-ast.js'

/** 타입 노드 후보(직계 자식에서 타입으로 취급할 것들). */
const TYPE_NODE_TYPES = new Set(['user_type', 'nullable_type'])

/** 직계 자식 중 첫 타입 노드. */
function firstTypeChild(node: Node): Node | null {
  for (const c of node.namedChildren) {
    if (c && TYPE_NODE_TYPES.has(c.type)) return c
  }
  return null
}

/** 초기화식에서 타입 추정 — 단순 생성 호출(`Foo(...)`)만 인정, 그 외 null. */
function initializerTypeName(init: Node | null): string | null {
  if (!init) return null
  if (init.type !== 'call_expression') return null
  const callee = init.namedChildren.filter((c): c is Node => c !== null)[0]
  if (!callee || callee.type !== 'identifier') return null
  // Kotlin 관례상 생성 호출은 대문자 시작 — 일반 함수 호출 반환타입 오인을 막는다.
  return /^[A-Z]/.test(callee.text) ? callee.text : null
}

/** 표현식 → ReceiverDesc (Java 판 exprToReceiver 의 Kotlin 대응). */
function exprToReceiver(node: Node | null): ReceiverDesc | null {
  if (!node) return null
  switch (node.type) {
    case 'this_expression':
      return { kind: 'this' }
    case 'super_expression':
      return { kind: 'super' }
    case 'identifier':
      return { kind: 'name', text: node.text }
    case 'navigation_expression': {
      // `<obj>.<member>` — 멤버가 프로퍼티 접근이면 field, 상위에서 호출로 감싸이면
      // 호출자(collectBodyFacts)가 call 로 승격한다.
      const named = node.namedChildren.filter((c): c is Node => c !== null)
      if (named.length < 2) return { kind: 'unknown' }
      const memberNode = named[named.length - 1]
      if (memberNode.type !== 'identifier') return { kind: 'unknown' }
      const objNode = named[0]
      if (objNode.type === 'super_expression') {
        return { kind: 'field', on: { kind: 'super' }, field: memberNode.text }
      }
      const on = exprToReceiver(objNode)
      if (on?.kind === 'unknown') return { kind: 'unknown' }
      return { kind: 'field', on, field: memberNode.text }
    }
    case 'call_expression': {
      const info = callInfo(node)
      if (!info) return { kind: 'unknown' }
      if (info.receiver?.kind === 'unknown') return { kind: 'unknown' }
      return { kind: 'call', on: info.receiver, methodName: info.methodName }
    }
    case 'parenthesized_expression': {
      const inner = node.namedChildren.filter((c): c is Node => c !== null)[0] ?? null
      return inner ? exprToReceiver(inner) : { kind: 'unknown' }
    }
    default:
      // 캐스트(as)/엘비스/인덱스/람다/문자열보간 등은 미해소.
      return { kind: 'unknown' }
  }
}

interface CallInfo {
  methodName: string
  receiver: ReceiverDesc | null
  receiverText: string | null
  argCount: number
}

/**
 * call_expression 1개의 호출 정보. 형태:
 *  - `m(...)`            : identifier + value_arguments — 묵시적 self.
 *  - `a.m(...)`          : navigation_expression + value_arguments.
 *  - `m { }` `a.m { }`   : … + annotated_lambda (후행 람다 = 인자 1 추가).
 *  - `a.m(x) { }`        : call_expression( call_expression(a.m, x), annotated_lambda ) —
 *                          외곽은 내부 호출에 람다만 더한 같은 호출이다(합쳐서 1건).
 */
function callInfo(node: Node): CallInfo | null {
  const named = node.namedChildren.filter((c): c is Node => c !== null)
  if (named.length === 0) return null
  const callee = named[0]
  const hasLambda = named.some((c) => c.type === 'annotated_lambda' || c.type === 'lambda_literal')
  const va = ktChild(node, 'value_arguments')
  const argCount =
    (va ? va.namedChildren.filter((c): c is Node => c !== null).length : 0) + (hasLambda ? 1 : 0)

  if (callee.type === 'identifier') {
    return { methodName: callee.text, receiver: null, receiverText: null, argCount }
  }
  if (callee.type === 'navigation_expression') {
    const sub = callee.namedChildren.filter((c): c is Node => c !== null)
    if (sub.length < 2) return null
    const nameNode = sub[sub.length - 1]
    if (nameNode.type !== 'identifier') return null
    const objNode = sub[0]
    const receiver =
      objNode.type === 'super_expression' ? ({ kind: 'super' } as const) : exprToReceiver(objNode)
    return {
      methodName: nameNode.text,
      receiver,
      receiverText: objNode.text,
      argCount,
    }
  }
  if (callee.type === 'call_expression') {
    // `a.m(x) { }` 외곽 — 내부 호출 정보에 람다 인자만 더한다.
    const inner = callInfo(callee)
    if (!inner) return null
    return { ...inner, argCount: inner.argCount + (hasLambda ? 1 : 0) }
  }
  return null
}

/** 외곽 call_expression 에 합쳐질 내부 호출인지(중복 계상 방지). */
function isMergedInnerCall(node: Node): boolean {
  const p = node.parent
  if (!p || p.type !== 'call_expression') return false
  const first = p.namedChildren.filter((c): c is Node => c !== null)[0]
  return first?.id === node.id
}

/** 함수/생성자 본문에서 호출 지점과 지역변수 선언을 수집한다(Java 판 collectBodyFacts 대응). */
function collectBodyFacts(body: Node): { calls: CallSite[]; locals: JavaLocalVar[] } {
  const calls: CallSite[] = []
  const locals: JavaLocalVar[] = []
  const visit = (node: Node): void => {
    if (node.type === 'call_expression' && !isMergedInnerCall(node)) {
      const info = callInfo(node)
      if (info) {
        calls.push({
          methodName: info.methodName,
          argCount: info.argCount,
          receiver: info.receiver,
          receiverText: info.receiverText,
          line: startLine(node),
          startIndex: node.startIndex,
        })
      }
    } else if (node.type === 'property_declaration') {
      // 지역 `val x: Foo = ...` / `val x = Foo()` — 선언 타입 우선, 없으면 생성 호출명, 그 외 'var'.
      const vd = ktChild(node, 'variable_declaration')
      if (vd) {
        const nameId = ktChild(vd, 'identifier')
        const declared = ktTypeOuterName(firstTypeChild(vd))
        const named = node.namedChildren.filter((c): c is Node => c !== null)
        const init = named.length > 0 ? named[named.length - 1] : null
        const typeName =
          declared ?? initializerTypeName(init && init.id !== vd.id ? init : null) ?? 'var'
        if (nameId) locals.push({ name: nameId.text, typeName, startIndex: node.startIndex })
      }
    }
    for (const c of node.namedChildren) {
      if (c) visit(c)
    }
  }
  visit(body)
  calls.sort((a, b) => a.startIndex - b.startIndex)
  return { calls, locals }
}

/** function_declaration 의 반환 타입 — 파라미터 뒤 첫 타입 노드(선언된 것만). */
function returnTypeName(fn: Node): string | null {
  let afterParams = false
  for (const c of fn.namedChildren) {
    if (!c) continue
    if (c.type === 'function_value_parameters') {
      afterParams = true
      continue
    }
    if (afterParams && TYPE_NODE_TYPES.has(c.type)) return ktTypeOuterName(c)
    if (c.type === 'function_body') break
  }
  return null
}

/** function_declaration → MethodFact. */
function functionToMethod(fn: Node): MethodFact | null {
  const id = ktChild(fn, 'identifier')
  if (!id) return null
  const fvp = ktChild(fn, 'function_value_parameters')
  const params = fvp ? ktChildren(fvp, 'parameter') : []
  const body = ktChild(fn, 'function_body')
  // 블록 본문이면 블록을, 표현식 본문이면 함수 본문 전체를 순회한다.
  const walkTarget = body ? (ktChild(body, 'block') ?? body) : null
  const { calls, locals } = walkTarget ? collectBodyFacts(walkTarget) : { calls: [], locals: [] }
  return {
    name: id.text,
    paramCount: params.length,
    paramsText: fvp ? fvp.text : '()',
    returnType: returnTypeName(fn),
    line: startLine(fn),
    annotations: collectDeclAnnotations(fn).map((a) => a.name),
    locals,
    calls,
  }
}

/** secondary_constructor → MethodFact(이름은 클래스명 — Java 생성자 표기와 동형). */
function ctorToMethod(ctor: Node, className: string): MethodFact {
  const fvp = ktChild(ctor, 'function_value_parameters')
  const params = fvp ? ktChildren(fvp, 'parameter') : []
  const block = ktChild(ctor, 'block')
  const { calls, locals } = block ? collectBodyFacts(block) : { calls: [], locals: [] }
  return {
    name: className,
    paramCount: params.length,
    paramsText: fvp ? fvp.text : '()',
    returnType: null,
    line: startLine(ctor),
    annotations: collectDeclAnnotations(ctor).map((a) => a.name),
    locals,
    calls,
  }
}

/** 선언 노드(class_declaration/object_declaration) → ClassFact. */
function declToFact(decl: Node, packageName: string | null): ClassFact | null {
  const id = ktChild(decl, 'identifier')
  if (!id) return null // 익명 object 표현식 등.
  const name = id.text
  const kt = ktDeclKind(decl)
  const kind: ClassKind = kt === 'object' ? 'class' : kt

  const fields: ClassFact['fields'] = []
  const ctorParamTypes: string[] = []
  const methods: MethodFact[] = []

  // 주생성자 — 모든 파라미터 타입은 ctorParamTypes, val/var 파라미터는 필드이기도 하다.
  const pc = ktChild(decl, 'primary_constructor')
  const cps = pc ? ktChild(pc, 'class_parameters') : null
  if (cps) {
    for (const cp of ktChildren(cps, 'class_parameter')) {
      const typeName = ktTypeOuterName(firstTypeChild(cp))
      const nameId = ktChild(cp, 'identifier')
      if (typeName) ctorParamTypes.push(typeName)
      const isProp = cp.children.some((c) => c && (c.type === 'val' || c.type === 'var'))
      if (isProp && nameId && typeName) {
        const mods = ktChild(cp, 'modifiers')
        const annos = mods
          ? ktChildren(mods, 'annotation')
              .map((a) => collectAnnoName(a))
              .filter((n): n is string => n !== null)
          : []
        fields.push({ name: nameId.text, type: typeName, line: startLine(cp), annotations: annos })
      }
    }
  }

  // 본문 — 프로퍼티/함수/보조 생성자. companion object 멤버는 별도 ClassFact 로 승격하지 않고
  // 소속 클래스 멤버로 합친다(상수 해석·콜그래프 모두 클래스 단위 소비라 실용 동형).
  const bodies: Node[] = []
  const directBody = ktChild(decl, 'class_body') ?? ktChild(decl, 'enum_class_body')
  if (directBody) {
    bodies.push(directBody)
    for (const co of ktChildren(directBody, 'companion_object')) {
      const cb = ktChild(co, 'class_body')
      if (cb) bodies.push(cb)
    }
  }
  for (const body of bodies) {
    for (const prop of ktChildren(body, 'property_declaration')) {
      const vd = ktChild(prop, 'variable_declaration')
      if (!vd) continue
      const nameId = ktChild(vd, 'identifier')
      if (!nameId) continue
      const declared = ktTypeOuterName(firstTypeChild(vd))
      const named = prop.namedChildren.filter((c): c is Node => c !== null)
      const init = named.length > 0 ? named[named.length - 1] : null
      const typeName = declared ?? initializerTypeName(init && init.id !== vd.id ? init : null)
      if (!typeName) continue // 타입 미상 프로퍼티는 싣지 않는다(미해소 정직 표기).
      fields.push({
        name: nameId.text,
        type: typeName,
        line: startLine(prop),
        annotations: collectDeclAnnotations(prop).map((a) => a.name),
      })
    }
    for (const fn of ktChildren(body, 'function_declaration')) {
      const m = functionToMethod(fn)
      if (m) methods.push(m)
    }
    for (const ctor of ktChildren(body, 'secondary_constructor')) {
      methods.push(ctorToMethod(ctor, name))
      const fvp = ktChild(ctor, 'function_value_parameters')
      if (fvp) {
        for (const p of ktChildren(fvp, 'parameter')) {
          const t = ktTypeOuterName(firstTypeChild(p))
          if (t) ctorParamTypes.push(t)
        }
      }
    }
  }

  // 상속/구현 — 생성자 호출형(`Base()`)은 extends, 맨이름형은 인터페이스면 extends, 클래스면 implements.
  const ext: string[] = []
  const impl: string[] = []
  const ds = ktChild(decl, 'delegation_specifiers')
  if (ds) {
    for (const spec of ktChildren(ds, 'delegation_specifier')) {
      const ci = ktChild(spec, 'constructor_invocation')
      if (ci) {
        const t = ktTypeOuterName(ktChild(ci, 'user_type'))
        if (t) ext.push(t)
        continue
      }
      const t = ktTypeOuterName(firstTypeChild(spec) ?? spec.namedChildren[0] ?? null)
      if (!t) continue
      if (kind === 'interface') ext.push(t)
      else impl.push(t)
    }
  }

  const mods = ktChild(decl, 'modifiers')
  const isAbstract = mods
    ? ktChildren(mods, 'inheritance_modifier').some((m) => m.text === 'abstract')
    : false

  return {
    name,
    fqn: packageName ? `${packageName}.${name}` : name,
    kind,
    isAbstract,
    extends: ext,
    implements: impl,
    line: startLine(decl),
    fields,
    ctorParamTypes,
    annotations: collectDeclAnnotations(decl).map((a) => a.name),
    methods,
  }
}

/** annotation 노드에서 이름만(주생성자 파라미터 어노테이션 전용 — 치유 불필요 위치). */
function collectAnnoName(anno: Node): string | null {
  const ci = ktChild(anno, 'constructor_invocation')
  const ut = ktChild(ci ?? anno, 'user_type')
  if (!ut) return null
  const ids = ktChildren(ut, 'identifier')
  return ids.length > 0 ? ids[ids.length - 1].text : null
}

/** 모든 (중첩 포함) 타입 선언을 결정론 깊이우선으로 수집(Java 판 collectDecls 동형). */
function collectDecls(root: Node): Node[] {
  const out: Node[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    const named = node.namedChildren.filter((c): c is Node => c !== null)
    for (let i = named.length - 1; i >= 0; i--) stack.push(named[i])
    if (node.type === 'class_declaration' || node.type === 'object_declaration') {
      // companion_object 는 소속 클래스에 합산되므로 별도 수집하지 않는다.
      out.push(node)
    }
  }
  return out
}

/** 한 Kotlin 파일에서 JavaFileFacts 동형 팩트를 추출한다(파일당 1회 파싱). */
export async function extractKotlinFacts(relPath: string, src: string): Promise<JavaFileFacts> {
  const root = await parseSource('kotlin', src)
  const packageName = ktPackageName(root)
  const imports = ktImports(root)
  const classes: ClassFact[] = []
  for (const node of collectDecls(root)) {
    const fact = declToFact(node, packageName)
    if (fact) classes.push(fact)
  }
  return { relPath, packageName, imports, classes }
}
