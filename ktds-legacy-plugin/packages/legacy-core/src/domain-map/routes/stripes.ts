/**
 * Stripes ActionBean 라우트 추출 — 파싱된 Java AST 기준.
 *
 * 베이스 URL: @UrlBinding("/x.action") 가 있으면 그 값을 verbatim 사용,
 * 없으면 NameBasedActionResolver 이름규약으로 유도한다
 * (마지막 패키지 세그먼트 + 클래스명에서 ActionBean/Bean suffix 제거 + ".action").
 * abstract 베이스 빈은 제외한다.
 * 이벤트 핸들러(= Resolution 을 반환하는 public 비정적 메서드)마다 라우트 1개:
 *   @DefaultHandler -> 베이스 URL,
 *   @HandlesEvent("name") -> 베이스?name,
 *   그 외 public Resolution 메서드 -> 베이스?<메서드명>.
 * framework "stripes", kind "form", handler = ClassName#method.
 */
import type { Node } from 'web-tree-sitter'
import { childrenOfType, startLine } from '../tree-sitter.js'
import type { RouteEntry } from '../types.js'

/** 직계 named child 중 첫 번째 주어진 타입. */
function child(node: Node, type: string): Node | null {
  for (const c of node.namedChildren) {
    if (c && c.type === type) return c
  }
  return null
}

/** string_literal 노드의 실제 문자열(따옴표 제외). */
function stringLiteralValue(node: Node): string {
  const frag = childrenOfType(node, 'string_fragment')[0]
  return frag ? frag.text : ''
}

/** 어노테이션 이름(identifier). */
function annotationName(annot: Node): string | null {
  return child(annot, 'identifier')?.text ?? null
}

/** modifiers 노드의 어노테이션들(annotation + marker_annotation). */
function annotationsOf(decl: Node): Node[] {
  const mods = child(decl, 'modifiers')
  return mods ? childrenOfType(mods, 'annotation', 'marker_annotation') : []
}

/** 단일 인자 어노테이션의 첫 문자열 리터럴 값(@UrlBinding / @HandlesEvent). */
function singleStringArg(annot: Node): string | null {
  const argList = child(annot, 'annotation_argument_list')
  if (!argList) return null
  const lit = childrenOfType(argList, 'string_literal')[0]
  return lit ? stringLiteralValue(lit) : null
}

/** package 선언의 FQN(없으면 null). */
function packageName(root: Node): string | null {
  const pkg = child(root, 'package_declaration')
  if (!pkg) return null
  const scoped = child(pkg, 'scoped_identifier') ?? child(pkg, 'identifier')
  return scoped ? scoped.text : null
}

/** program 전체에서 class_declaration 들을 재귀 수집. */
function findClassDeclarations(root: Node): Node[] {
  const out: Node[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const c of node.namedChildren) {
      if (!c) continue
      if (c.type === 'class_declaration') out.push(c)
      stack.push(c)
    }
  }
  return out
}

/** method_declaration 의 이름(formal_parameters 직전 identifier). */
function methodName(method: Node): string | null {
  const named = method.namedChildren.filter((c): c is Node => c !== null)
  const fpIdx = named.findIndex((c) => c.type === 'formal_parameters')
  if (fpIdx > 0 && named[fpIdx - 1].type === 'identifier') return named[fpIdx - 1].text
  return named.find((c) => c.type === 'identifier')?.text ?? null
}

/** method_declaration 의 반환 타입 텍스트(최상위 type 노드). */
function returnTypeText(method: Node): string {
  for (const c of method.namedChildren) {
    if (!c) continue
    if (
      c.type === 'type_identifier' ||
      c.type === 'generic_type' ||
      c.type === 'scoped_type_identifier' ||
      c.type === 'void_type' ||
      c.type === 'integral_type' ||
      c.type === 'array_type'
    ) {
      return c.text
    }
  }
  return ''
}

/**
 * 클래스명에서 Stripes 이름규약 suffix 를 제거한다.
 * `XActionBean` -> `X`, 그 외 `XBean` -> `X`, 둘 다 아니면 그대로.
 */
function stripBeanSuffix(name: string): string {
  if (name.endsWith('ActionBean')) return name.slice(0, -'ActionBean'.length)
  if (name.endsWith('Bean')) return name.slice(0, -'Bean'.length)
  return name
}

/**
 * 단일 파일에서 Stripes 라우트를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 */
export function extractStripesRoutes(root: Node, filePath: string): RouteEntry[] {
  const out: RouteEntry[] = []
  const pkg = packageName(root)
  const lastPkgSeg = pkg ? pkg.split('.').pop() ?? '' : ''

  for (const cls of findClassDeclarations(root)) {
    const clsName = child(cls, 'identifier')?.text
    if (!clsName) continue
    const mods = child(cls, 'modifiers')
    if (mods && /\babstract\b/.test(mods.text)) continue

    const clsAnnots = annotationsOf(cls)
    const urlBinding = clsAnnots.find((a) => annotationName(a) === 'UrlBinding')
    const nameBased = !urlBinding
    let base: string
    if (urlBinding) {
      const v = singleStringArg(urlBinding)
      if (!v) continue
      base = v
    } else {
      base = `/${lastPkgSeg}/${stripBeanSuffix(clsName)}.action`
    }

    const body = child(cls, 'class_body')
    if (!body) continue

    // ActionBean 신호가 약하면(매핑/이벤트 핸들러가 전혀 없으면) 라우트 없음.
    const handlerRoutes: RouteEntry[] = []
    for (const method of childrenOfType(body, 'method_declaration')) {
      const mMods = child(method, 'modifiers')
      const mModText = mMods ? mMods.text : ''
      // public 비정적 + Resolution(또는 서브타입) 반환만 이벤트 핸들러.
      // Stripes Resolution 구현은 전부 "…Resolution" 으로 끝난다(ForwardResolution,
      // RedirectResolution, StreamingResolution 등). 베이스 `Resolution` 만 매칭하면
      // ForwardResolution 핸들러(예: CatalogActionBean)를 통째로 놓친다.
      if (!/\bpublic\b/.test(mModText)) continue
      if (/\bstatic\b/.test(mModText)) continue
      if (!/Resolution\b/.test(returnTypeText(method))) continue

      const mName = methodName(method) ?? '<unknown>'
      const mAnnots = annotationsOf(method)
      const isDefault = mAnnots.some((a) => annotationName(a) === 'DefaultHandler')
      const handlesEvent = mAnnots.find((a) => annotationName(a) === 'HandlesEvent')

      let path: string
      if (isDefault) {
        path = base
      } else if (handlesEvent) {
        const evt = singleStringArg(handlesEvent) ?? mName
        path = `${base}?${evt}`
      } else {
        path = `${base}?${mName}`
      }

      const notes = nameBased ? ['name-based-convention', 'stripes-event'] : ['stripes-event']
      handlerRoutes.push({
        routeId: '',
        method: 'ANY',
        path,
        rawPath: path,
        kind: 'form',
        framework: 'stripes',
        filePath,
        line: startLine(method),
        handler: `${clsName}#${mName}`,
        notes,
      })
    }

    out.push(...handlerRoutes)
  }
  return out
}
