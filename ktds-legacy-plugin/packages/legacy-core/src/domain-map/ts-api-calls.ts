/**
 * fetch/axios API 호출 추출 + 백엔드 라우트 조인(P5) — 파일 단위 순수 함수.
 *
 * `fetch(...)` / `axios.get|post|put|delete|patch(...)` / `axios(...)` 의 첫 인자가
 * '/'로 시작하는 문자열 또는 템플릿 리터럴이면 수집한다. 템플릿 보간(`${...}`)은
 * 보간 시작 전 접두 경로 + '*' 로 기록하고 그 이후는 버린다(예:
 * `/api/trust/members/${id}` -> '/api/trust/members/*') — 결정론 우선, 부분 정보라도
 * 누락 없이 남기되 과잉 구체화(오탐)는 피한다.
 * method 는 fetch 2번째 인자 옵션 객체의 `method: 'X'` 문자열 리터럴, 또는 axios
 * 메서드명(get/post/put/delete/patch)에서 결정한다. 판정 불가 -> null(GET 으로 임의 추정 금지).
 */
import type { Node } from 'web-tree-sitter'
import { childrenOfType, startLine } from './tree-sitter.js'
import type { RouteMethod } from './types.js'

/** axios.<method>(...) 의 메서드명 -> RouteMethod. */
const AXIOS_METHODS: Record<string, RouteMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
}

function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** string 리터럴 값(따옴표 제외). */
function stringLiteralValue(node: Node): string {
  const frag = childrenOfType(node, 'string_fragment')[0]
  return frag ? frag.text : ''
}

/**
 * 첫 인자(문자열/템플릿 리터럴)에서 API 경로를 읽는다.
 * '/'로 시작하지 않거나 리터럴이 아니면 null(수집 대상 아님).
 */
function firstArgPath(node: Node): string | null {
  let value: string | null = null
  if (node.type === 'string') {
    value = stringLiteralValue(node)
  } else if (node.type === 'template_string') {
    // 첫 template_substitution 이전에 오는 string_fragment 만 접두로 쓴다(그 뒤는 버림).
    let prefix = ''
    let hasSub = false
    for (const child of node.namedChildren) {
      if (!child) continue
      if (child.type === 'template_substitution') {
        hasSub = true
        break
      }
      if (child.type === 'string_fragment') prefix += child.text
    }
    value = hasSub ? `${prefix}*` : prefix
  }
  if (value === null || !value.startsWith('/')) return null
  return value
}

/** 두 번째 인자(옵션 객체)의 `method: 'X'` 리터럴을 읽는다(대문자화). 없으면 null. */
function optionsMethod(argsNode: Node): string | null {
  const args = argsNode.namedChildren.filter((x): x is Node => x !== null)
  const opts = args[1]
  if (!opts || opts.type !== 'object') return null
  for (const pair of childrenOfType(opts, 'pair')) {
    const key = pair.childForFieldName('key')
    if (!key || key.text !== 'method') continue
    const value = pair.childForFieldName('value')
    if (!value || value.type !== 'string') continue
    return stringLiteralValue(value).toUpperCase()
  }
  return null
}

/** 단일 API 호출 수집 결과. */
export interface TsApiCall {
  relPath: string
  /** fetch 옵션/axios 메서드명에서 판정. 불가 -> null(추정 금지). */
  method: string | null
  /** '/'로 시작하는 경로(보간부는 '*'). */
  path: string
  /** 1-based 줄. */
  line: number
}

/**
 * 파싱된 루트(단일 파일)에서 fetch/axios API 호출을 추출한다.
 * relPath 는 호출자가 census 로 알고 있는 값을 그대로 전달한다(AST 에서 유도 불가).
 */
export function extractTsApiCalls(root: Node, relPath: string): TsApiCall[] {
  const out: TsApiCall[] = []
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    for (const c of node.namedChildren) if (c) stack.push(c)
    if (node.type !== 'call_expression') continue

    const fn = node.childForFieldName('function')
    const argsNode = node.childForFieldName('arguments')
    if (!fn || !argsNode) continue
    const args = argsNode.namedChildren.filter((x): x is Node => x !== null)
    if (args.length === 0) continue

    let method: string | null = null
    let matched = false

    if (fn.type === 'identifier' && (fn.text === 'fetch' || fn.text === 'axios')) {
      matched = true
      method = optionsMethod(argsNode)
    } else if (fn.type === 'member_expression') {
      const obj = fn.childForFieldName('object')
      const prop = fn.childForFieldName('property')
      if (obj?.type === 'identifier' && obj.text === 'axios' && prop?.type === 'property_identifier') {
        const verb = AXIOS_METHODS[prop.text]
        if (verb) {
          matched = true
          method = verb
        }
      }
    }
    if (!matched) continue

    const path = firstArgPath(args[0])
    if (path === null) continue
    out.push({ relPath, method, path, line: startLine(node) })
  }
  return out.sort((a, b) => cmp(a.line, b.line) || cmp(a.path, b.path))
}

/** 백엔드 라우트 조인 대상(정) — RouteEntry 의 path/method 부분집합. */
export interface JoinableRoute {
  path: string
  method: RouteMethod
}

/** call ↔ route 매칭 결과 1건. */
export interface ApiRouteLink {
  from: string
  toRoute: string
  method: string | null
  line: number
}

/** 경로를 '/' 로 분할한 비어있지 않은 세그먼트 배열. */
function pathSegments(p: string): string[] {
  return p.split('/').filter((s) => s.length > 0)
}

/** route 경로 세그먼트가 `{...}` 파라미터 플레이스홀더인지. */
function isParamSegment(seg: string): boolean {
  return /^\{.+\}$/.test(seg)
}

/**
 * call.path 가 route.path 에 매칭되는지 판정.
 * - call 세그먼트가 '*'(항상 마지막) -> route 의 남은 세그먼트(1개 이상)를 전부 흡수.
 * - call 세그먼트가 리터럴 -> route 세그먼트가 파라미터(`{id}`)면 매칭, 아니면 완전일치.
 * - '*' 없이 끝까지 갔으면 두 세그먼트 배열 길이가 같아야 매칭.
 */
function matchesRoute(callPath: string, routePath: string): boolean {
  const callSegs = pathSegments(callPath)
  const routeSegs = pathSegments(routePath)
  for (let i = 0; i < callSegs.length; i++) {
    const cs = callSegs[i]
    if (cs === '*') {
      return i === callSegs.length - 1 && routeSegs.length > i
    }
    const rs = routeSegs[i]
    if (rs === undefined) return false
    if (isParamSegment(rs)) continue
    if (cs !== rs) return false
  }
  return callSegs.length === routeSegs.length
}

/** method 호환 판정 — 한쪽이라도 미지정(null/ANY)이면 호환으로 본다. */
function methodCompatible(callMethod: string | null, routeMethod: RouteMethod): boolean {
  if (callMethod === null || routeMethod === 'ANY') return true
  return callMethod === routeMethod
}

/** 조인 결과 중복제거 + (from,toRoute,method,line) 정렬. */
function dedupSortLinks(links: ApiRouteLink[]): ApiRouteLink[] {
  const seen = new Set<string>()
  const out: ApiRouteLink[] = []
  for (const l of links) {
    const key = `${l.from} ${l.toRoute} ${l.method ?? ''} ${l.line}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(l)
  }
  return out.sort(
    (a, b) =>
      cmp(a.from, b.from) ||
      cmp(a.toRoute, b.toRoute) ||
      cmp(a.method ?? '', b.method ?? '') ||
      cmp(a.line, b.line),
  )
}

/**
 * 프런트 API 호출과 백엔드 라우트 목록을 결정론 조인한다.
 * 하나의 호출이 여러 라우트에 매칭될 수 있으면(모호) 전부 보고한다(누락 금지).
 */
export function joinApiCallsToRoutes(calls: TsApiCall[], routes: JoinableRoute[]): ApiRouteLink[] {
  const out: ApiRouteLink[] = []
  for (const call of calls) {
    for (const route of routes) {
      if (!matchesRoute(call.path, route.path)) continue
      if (!methodCompatible(call.method, route.method)) continue
      out.push({
        from: call.relPath,
        toRoute: route.path,
        method: call.method ?? (route.method === 'ANY' ? null : route.method),
        line: call.line,
      })
    }
  }
  return dedupSortLinks(out)
}
