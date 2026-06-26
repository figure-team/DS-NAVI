/**
 * Java 파일 단일패스 팩트 추출 — 엣지 생산이 필요로 하는 것만.
 *
 * 파일당 1회 파싱으로 패키지/임포트/클래스(필드·생성자 파라미터·상속/구현·어노테이션)를
 * 뽑아낸다. 타입 이름은 외곽 식별자만 보존한다(예: `List<User>` -> `List`,
 * `com.acme.User` -> `User`, `User[]` -> `User`). FQN 해소는 edges 단계에서 한다.
 */
import type { Node } from 'web-tree-sitter'
import { parseSource, startLine } from './tree-sitter.js'

/** 클래스/인터페이스/열거/레코드 종류. */
export type ClassKind = 'class' | 'interface' | 'enum' | 'record'

/** 필드 팩트. */
export interface FieldFact {
  name: string
  /** 타입의 외곽 식별자(제네릭/배열/패키지 제거). */
  type: string
  line: number
  annotations: string[]
}

/**
 * 호출 수신자(receiver) 기술자 — 메서드 호출의 수신 표현식을 재귀 형태로 표현한다.
 * P3 method-call 해소가 8-receiver 종류를 판정하는 입력이다.
 *   - this        : `this.m()` / 묵시적 self (receiver 가 `this`)
 *   - super       : `super.m()`
 *   - name        : 단일 식별자 receiver (`svc`, `p`, `x`, `Foo`) — field/param/local/static 후보
 *   - call        : 체이닝 호출 receiver (`a.b()` 의 `b()` 부분) — 반환 타입 추론으로 해소
 *   - field       : 필드 접근 receiver (`a.b` 의 `b` 부분) — 필드 타입 추론으로 해소
 *   - unknown     : 명시 수신자가 있으나 형태를 따라갈 수 없음(캐스트/람다/배열접근/생성식/
 *                   삼항 등) — unresolved 로 해소돼야 한다. null(묵시적 self)과 구별하기 위함:
 *                   null=수신자 없음(self), unknown=수신자 있으나 미해소(절대 self 로 오인 금지).
 */
export type ReceiverDesc =
  | { kind: 'this' }
  | { kind: 'super' }
  | { kind: 'name'; text: string }
  | { kind: 'call'; on: ReceiverDesc | null; methodName: string }
  | { kind: 'field'; on: ReceiverDesc | null; field: string }
  | { kind: 'unknown' }

/** 메서드 본문 내 단일 호출 지점(소스 순서 보존). */
export interface CallSite {
  /** 호출되는 메서드 이름. */
  methodName: string
  /** 호출 인자 개수(오버로드 arity 매칭에 사용). */
  argCount: number
  /** 수신자 기술자. receiver 없는 묵시적 self 호출은 null. */
  receiver: ReceiverDesc | null
  /** receiver 의 소스 텍스트(없으면 null). */
  receiverText: string | null
  /** 1-based 호출 라인. */
  line: number
  /** 호출 노드의 바이트 시작 오프셋(지역변수 선언-사용 순서 판정용). */
  startIndex: number
}

/** 메서드 본문 내 지역변수 선언(선언-사용 순서로 가장 가까운 선언을 고르기 위함). */
export interface JavaLocalVar {
  name: string
  /** 선언 타입의 외곽 식별자. `var` 는 그대로 'var'(추론 불가 표식). */
  typeName: string
  /** 선언 노드의 바이트 시작 오프셋. */
  startIndex: number
}

/** 메서드(또는 생성자) 선언 팩트. */
export interface MethodFact {
  name: string
  /** 파라미터 개수(오버로드 arity 키). */
  paramCount: number
  /** formal_parameters 의 소스 텍스트(파라미터 타입/이름 파싱용). */
  paramsText: string
  /** 반환 타입의 외곽 식별자(없거나 void/기본형이면 null). */
  returnType: string | null
  /** 1-based 선언 라인. */
  line: number
  /** 메서드/생성자 선언 어노테이션(이름만, 예 `PreAuthorize`). 정책 신호(권한) 입력. */
  annotations: string[]
  /** 메서드 본문 지역변수 선언(선언 순서). */
  locals: JavaLocalVar[]
  /** 메서드 본문 내 호출 지점(소스 순서). */
  calls: CallSite[]
}

/** 클래스(또는 인터페이스/열거/레코드) 팩트. */
export interface ClassFact {
  name: string
  /** packageName 이 있으면 `${packageName}.${name}`, 없으면 name. */
  fqn: string
  kind: ClassKind
  isAbstract: boolean
  /** 상속 대상의 외곽 식별자 목록(클래스는 0~1, 인터페이스는 다수 가능). */
  extends: string[]
  /** 구현 인터페이스의 외곽 식별자 목록. */
  implements: string[]
  line: number
  fields: FieldFact[]
  /** 모든 생성자 파라미터 타입의 외곽 식별자(선언 순서). */
  ctorParamTypes: string[]
  annotations: string[]
  /** 메서드 선언(선언 순서) — P3 method-call 해소 입력(추가 필드, 기존 소비자 무영향). */
  methods: MethodFact[]
}

/** 한 Java 파일의 팩트. */
export interface JavaFileFacts {
  relPath: string
  packageName: string | null
  /** import 문 FQN 목록(정적/와일드카드 포함, 선언 순서). */
  imports: string[]
  classes: ClassFact[]
}

const DECL_KINDS: Record<string, ClassKind> = {
  class_declaration: 'class',
  interface_declaration: 'interface',
  enum_declaration: 'enum',
  record_declaration: 'record',
}

/** 직계 named child 중 첫 번째 주어진 타입. */
function child(node: Node, type: string): Node | null {
  for (const c of node.namedChildren) {
    if (c && c.type === type) return c
  }
  return null
}

/** 직계 named children 중 주어진 타입들(선언 순서). */
function children(node: Node, ...types: string[]): Node[] {
  const want = new Set(types)
  const out: Node[] = []
  for (const c of node.namedChildren) {
    if (c && want.has(c.type)) out.push(c)
  }
  return out
}

/** scoped_identifier 등에서 최종(외곽) 식별자 텍스트. */
function lastIdentifier(node: Node): string {
  if (node.type === 'identifier' || node.type === 'type_identifier') return node.text
  // scoped_identifier / scoped_type_identifier: 마지막 identifier 가 외곽 이름.
  const ids = node.namedChildren.filter((c): c is Node => c !== null)
  for (let i = ids.length - 1; i >= 0; i--) {
    const c = ids[i]
    if (c.type === 'identifier' || c.type === 'type_identifier') return c.text
  }
  // 폴백: 텍스트의 마지막 점 뒤.
  const t = node.text
  const dot = t.lastIndexOf('.')
  return dot >= 0 ? t.slice(dot + 1) : t
}

/**
 * 타입 노드에서 외곽 식별자만 추출한다.
 * generic_type -> 기저 type_identifier, array_type -> 원소 타입,
 * scoped_type_identifier -> 마지막 식별자, type_identifier -> 그대로.
 */
function typeOuterName(node: Node | null): string | null {
  if (!node) return null
  switch (node.type) {
    case 'type_identifier':
    case 'identifier':
      return node.text
    case 'generic_type': {
      const base = child(node, 'type_identifier') ?? child(node, 'scoped_type_identifier')
      return base ? typeOuterName(base) : null
    }
    case 'array_type': {
      const el = child(node, 'type_identifier') ??
        child(node, 'scoped_type_identifier') ??
        child(node, 'generic_type')
      return el ? typeOuterName(el) : null
    }
    case 'scoped_type_identifier':
      return lastIdentifier(node)
    default:
      // integral_type/void_type/floating_point_type 등 기본형은 무시.
      return null
  }
}

/** 모디파이어 노드에서 어노테이션 이름 목록(정렬 없이 선언 순서). */
function annotationNames(mods: Node | null): string[] {
  if (!mods) return []
  const out: string[] = []
  for (const a of children(mods, 'annotation', 'marker_annotation')) {
    const id = child(a, 'identifier')
    if (id) out.push(id.text)
  }
  return out
}

/** 모디파이어 텍스트에 abstract 키워드가 있는지. */
function isAbstractMods(mods: Node | null): boolean {
  return mods ? /\babstract\b/.test(mods.text) : false
}

/** 선언 노드의 첫 type 노드(필드 타입). field_declaration 전용. */
function fieldTypeNode(field: Node): Node | null {
  for (const c of field.namedChildren) {
    if (!c) continue
    if (
      c.type === 'type_identifier' ||
      c.type === 'generic_type' ||
      c.type === 'array_type' ||
      c.type === 'scoped_type_identifier'
    ) {
      return c
    }
  }
  return null
}

/** 클래스 본문(class_body / interface_body / enum_body)에서 멤버 컨테이너. */
function bodyOf(decl: Node): Node | null {
  return (
    child(decl, 'class_body') ??
    child(decl, 'interface_body') ??
    child(decl, 'enum_body') ??
    null
  )
}

/** record_declaration 의 헤더 파라미터 타입(생성자 파라미터로 취급). */
function recordParamTypes(decl: Node): string[] {
  const fps = child(decl, 'formal_parameters')
  if (!fps) return []
  return formalParamTypes(fps)
}

/** formal_parameters 노드에서 파라미터 타입 외곽 식별자(선언 순서). */
function formalParamTypes(fps: Node): string[] {
  const out: string[] = []
  for (const p of children(fps, 'formal_parameter', 'spread_parameter')) {
    const typeNode =
      child(p, 'type_identifier') ??
      child(p, 'generic_type') ??
      child(p, 'array_type') ??
      child(p, 'scoped_type_identifier')
    const name = typeOuterName(typeNode)
    if (name) out.push(name)
  }
  return out
}

/** extends 대상 외곽 식별자 목록. */
function extendsNames(decl: Node, kind: ClassKind): string[] {
  if (kind === 'class') {
    const sc = child(decl, 'superclass')
    if (!sc) return []
    const t = typeOuterName(sc.namedChildren.filter((c): c is Node => c !== null)[0] ?? null)
    return t ? [t] : []
  }
  if (kind === 'interface') {
    const ext = child(decl, 'extends_interfaces')
    if (!ext) return []
    return typeListNames(child(ext, 'type_list'))
  }
  return []
}

/** implements 인터페이스 외곽 식별자 목록(class/enum/record). */
function implementsNames(decl: Node): string[] {
  const si = child(decl, 'super_interfaces')
  if (!si) return []
  return typeListNames(child(si, 'type_list'))
}

/** type_list 노드에서 타입 외곽 식별자들. */
function typeListNames(typeList: Node | null): string[] {
  if (!typeList) return []
  const out: string[] = []
  for (const c of typeList.namedChildren) {
    const name = typeOuterName(c)
    if (name) out.push(name)
  }
  return out
}

/** 임의 타입 노드에서 외곽 식별자(generic/array/scoped 처리). returnType/local 타입용. */
function anyTypeOuterName(node: Node | null): string | null {
  if (!node) return null
  switch (node.type) {
    case 'type_identifier':
    case 'identifier':
      return node.text
    case 'generic_type':
    case 'array_type':
    case 'scoped_type_identifier':
      return typeOuterName(node)
    default:
      return null
  }
}

/** method_declaration 의 반환 타입 노드(이름이 'type' 인 필드 또는 첫 타입). */
function returnTypeName(method: Node): string | null {
  const t = method.childForFieldName('type')
  if (t) return anyTypeOuterName(t)
  // 폴백: name 앞의 첫 타입 노드.
  for (const c of method.namedChildren) {
    if (!c) continue
    const n = anyTypeOuterName(c)
    if (n) return n
  }
  return null
}

/**
 * 표현식 노드를 ReceiverDesc 로 변환한다(재귀). 해소 가능한 형태만 생산하고,
 * 알 수 없는 형태(캐스트/람다/배열접근/생성식/삼항 등)는 `{ kind: 'unknown' }` 을 돌려
 * 호출자가 unresolved 로 처리하게 한다. null 은 "수신자 노드 자체가 없음"(묵시적 self)에만
 * 쓰인다 — 명시 수신자가 있는데 미해소인 경우를 self 로 오인하지 않기 위함.
 */
function exprToReceiver(node: Node | null): ReceiverDesc | null {
  if (!node) return null
  switch (node.type) {
    case 'this':
      return { kind: 'this' }
    case 'super':
      return { kind: 'super' }
    case 'identifier':
      return { kind: 'name', text: node.text }
    case 'field_access': {
      // `<obj>.<field>` — obj 가 super 면 super, this 면 this, 그 외 receiver 재귀.
      const objNode = node.childForFieldName('object')
      const fieldNode = node.childForFieldName('field')
      if (!fieldNode) return { kind: 'unknown' }
      if (objNode?.type === 'super') {
        // super.field 는 흔치 않으나 field on super 로 표현.
        return { kind: 'field', on: { kind: 'super' }, field: fieldNode.text }
      }
      const on = objNode ? exprToReceiver(objNode) : null
      // obj 가 해소 불가(unknown && objNode 존재)면 전체 미해소.
      if (on?.kind === 'unknown') return { kind: 'unknown' }
      return { kind: 'field', on, field: fieldNode.text }
    }
    case 'method_invocation': {
      // 체이닝: `<obj>.<name>(...)` — obj 의 반환 타입으로 해소.
      const objNode = node.childForFieldName('object')
      const nameNode = node.childForFieldName('name')
      if (!nameNode) return { kind: 'unknown' }
      if (objNode?.type === 'super') {
        return { kind: 'call', on: { kind: 'super' }, methodName: nameNode.text }
      }
      const on = objNode ? exprToReceiver(objNode) : null
      if (on?.kind === 'unknown') return { kind: 'unknown' }
      return { kind: 'call', on, methodName: nameNode.text }
    }
    case 'parenthesized_expression': {
      const inner = node.namedChildren.filter((c): c is Node => c !== null)[0] ?? null
      // 괄호 안이 비어 있으면(불가능에 가까움) 미해소. 그 외 내부 식 그대로 해소.
      return inner ? exprToReceiver(inner) : { kind: 'unknown' }
    }
    default:
      // cast_expression / array_access / object_creation_expression / 람다 / 삼항 등은 미해소.
      return { kind: 'unknown' }
  }
}

/** arguments 노드의 인자 개수(named children 수). */
function argCountOf(invocation: Node): number {
  const args = invocation.childForFieldName('arguments')
  if (!args) return 0
  return args.namedChildren.filter((c): c is Node => c !== null).length
}

/**
 * 메서드 본문에서 호출 지점(소스 순서)과 지역변수 선언을 수집한다.
 * 호출은 깊이우선 전위순회(소스 순서 ≈ startIndex 오름차순)로 모으되, 마지막에 startIndex 정렬한다.
 */
function collectBodyFacts(body: Node): { calls: CallSite[]; locals: JavaLocalVar[] } {
  const calls: CallSite[] = []
  const locals: JavaLocalVar[] = []
  const visit = (node: Node): void => {
    if (node.type === 'method_invocation') {
      const nameNode = node.childForFieldName('name')
      const objNode = node.childForFieldName('object')
      if (nameNode) {
        let receiver: ReceiverDesc | null
        let receiverText: string | null
        if (!objNode) {
          // 묵시적 self 호출 — `m(...)`.
          receiver = null
          receiverText = null
        } else {
          receiver = exprToReceiver(objNode)
          receiverText = objNode.text
        }
        calls.push({
          methodName: nameNode.text,
          argCount: argCountOf(node),
          receiver,
          receiverText,
          line: startLine(node),
          startIndex: node.startIndex,
        })
      }
    } else if (node.type === 'local_variable_declaration') {
      const typeNode =
        child(node, 'type_identifier') ??
        child(node, 'generic_type') ??
        child(node, 'array_type') ??
        child(node, 'scoped_type_identifier')
      let typeName: string | null
      if (typeNode) {
        typeName = anyTypeOuterName(typeNode)
      } else {
        // `var x = ...` — type 가 식별자 'var' 로 파싱될 수 있음.
        const firstId = child(node, 'identifier')
        typeName = firstId && firstId.text === 'var' ? 'var' : null
      }
      for (const declr of children(node, 'variable_declarator')) {
        const nameId = child(declr, 'identifier')
        if (nameId && typeName) {
          locals.push({ name: nameId.text, typeName, startIndex: node.startIndex })
        }
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

/** class_body 등에서 메서드(+생성자) 선언을 MethodFact 로 수집(선언 순서). */
function collectMethods(body: Node): MethodFact[] {
  const out: MethodFact[] = []
  for (const m of children(body, 'method_declaration', 'constructor_declaration')) {
    const id = child(m, 'identifier')
    if (!id) continue
    const fps = child(m, 'formal_parameters')
    const paramCount = fps
      ? children(fps, 'formal_parameter', 'spread_parameter').length
      : 0
    const mbody = child(m, 'block') ?? child(m, 'constructor_body')
    const { calls, locals } = mbody
      ? collectBodyFacts(mbody)
      : { calls: [], locals: [] }
    out.push({
      name: id.text,
      paramCount,
      paramsText: fps ? fps.text : '()',
      returnType: m.type === 'constructor_declaration' ? null : returnTypeName(m),
      line: startLine(m),
      annotations: annotationNames(child(m, 'modifiers')),
      locals,
      calls,
    })
  }
  return out
}

/** 단일 선언 노드에서 ClassFact 를 만든다. */
function declToFact(decl: Node, kind: ClassKind, packageName: string | null): ClassFact | null {
  const id = child(decl, 'identifier')
  if (!id) return null
  const name = id.text
  const mods = child(decl, 'modifiers')

  const fields: FieldFact[] = []
  const ctorParamTypes: string[] = []
  const methods: MethodFact[] = []
  const body = bodyOf(decl)
  if (body) {
    methods.push(...collectMethods(body))
    for (const field of children(body, 'field_declaration')) {
      const typeName = typeOuterName(fieldTypeNode(field))
      const fmods = child(field, 'modifiers')
      const fannots = annotationNames(fmods)
      for (const declr of children(field, 'variable_declarator')) {
        const nameId = child(declr, 'identifier')
        if (!nameId || !typeName) continue
        fields.push({
          name: nameId.text,
          type: typeName,
          line: startLine(field),
          annotations: fannots,
        })
      }
    }
    for (const ctor of children(body, 'constructor_declaration')) {
      const fps = child(ctor, 'formal_parameters')
      if (fps) ctorParamTypes.push(...formalParamTypes(fps))
    }
  }
  if (kind === 'record') ctorParamTypes.push(...recordParamTypes(decl))

  return {
    name,
    fqn: packageName ? `${packageName}.${name}` : name,
    kind,
    isAbstract: isAbstractMods(mods),
    extends: extendsNames(decl, kind),
    implements: implementsNames(decl),
    line: startLine(decl),
    fields,
    ctorParamTypes,
    annotations: annotationNames(mods),
    methods,
  }
}

/** 모든 (중첩 포함) 타입 선언을 결정론적 깊이우선으로 수집. */
function collectDecls(root: Node): Array<{ node: Node; kind: ClassKind }> {
  const out: Array<{ node: Node; kind: ClassKind }> = []
  const stack: Node[] = [root]
  // 스택 사용으로 인한 역순을 막기 위해, 자식을 역순으로 push 한다.
  while (stack.length > 0) {
    const node = stack.pop()!
    const named = node.namedChildren.filter((c): c is Node => c !== null)
    for (let i = named.length - 1; i >= 0; i--) {
      stack.push(named[i])
    }
    const kind = DECL_KINDS[node.type]
    if (kind) out.push({ node, kind })
  }
  return out
}

/** import 문 FQN 목록(선언 순서). */
function collectImports(root: Node): string[] {
  const out: string[] = []
  for (const c of root.namedChildren) {
    if (!c || c.type !== 'import_declaration') continue
    // `import a.b.C;` / `import static a.b.C.m;` / `import a.b.*;`
    const scoped = child(c, 'scoped_identifier')
    if (scoped) {
      const asterisk = c.text.includes('.*') ? '.*' : ''
      out.push(scoped.text + asterisk)
    }
  }
  return out
}

/** package 선언의 FQN. */
function readPackage(root: Node): string | null {
  const pkg = child(root, 'package_declaration')
  if (!pkg) return null
  const scoped = child(pkg, 'scoped_identifier') ?? child(pkg, 'identifier')
  return scoped ? scoped.text : null
}

/** 한 Java 파일에서 팩트를 추출한다(파일당 1회 파싱). */
export async function extractJavaFacts(relPath: string, src: string): Promise<JavaFileFacts> {
  const root = await parseSource('java', src)
  const packageName = readPackage(root)
  const imports = collectImports(root)
  const classes: ClassFact[] = []
  for (const { node, kind } of collectDecls(root)) {
    const fact = declToFact(node, kind, packageName)
    if (fact) classes.push(fact)
  }
  return { relPath, packageName, imports, classes }
}
