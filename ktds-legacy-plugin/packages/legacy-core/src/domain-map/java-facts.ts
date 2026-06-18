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

/** 단일 선언 노드에서 ClassFact 를 만든다. */
function declToFact(decl: Node, kind: ClassKind, packageName: string | null): ClassFact | null {
  const id = child(decl, 'identifier')
  if (!id) return null
  const name = id.text
  const mods = child(decl, 'modifiers')

  const fields: FieldFact[] = []
  const ctorParamTypes: string[] = []
  const body = bodyOf(decl)
  if (body) {
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
