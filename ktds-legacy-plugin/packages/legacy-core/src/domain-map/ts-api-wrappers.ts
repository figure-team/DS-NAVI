/**
 * 프런트 API "래퍼 함수" 해소 — 파일-로컬 결정론 분석.
 *
 * 실전 관용구(BFF 래퍼): `const BASE = import.meta.env.X ?? "/api"` +
 * `async function request(path, init) { fetch(\`${BASE}${path}\`, ...) }` +
 * `function post(path, body) { return request(path, { method: "POST", ... }) }` +
 * `export const listMembers = () => request("/trust/members")`.
 * fetch 리터럴 직접 호출만 보는 ts-api-calls.ts 로는 이 관용구가 전부 누락된다(m-project 실측 0건).
 *
 * 규칙(전부 파일 안에서만, 교차 파일 전파 없음 — 화면→래퍼 파일은 import 엣지가 잇는다):
 *  1) 문자열 상수: `const N = "lit"` 또는 `const N = <아무 식> ?? "lit"` → N→lit.
 *  2) 근원 래퍼: 함수(선언/화살표)의 파라미터 p 가 `fetch(\`${N}${p}...\`)` 에 쓰이면
 *     래퍼(접두=상수 N 값, 경로 파라미터=p 위치). 템플릿 머리가 상수·경로 순이 아닐 땐 제외.
 *  3) 전이 래퍼(고정점, 파일 내): 함수 G 가 자기 파라미터 q 를 알려진 래퍼 W 의 경로 위치에
 *     그대로 넘기면 G 도 래퍼. method 는 (a) 그 호출 인자 객체의 `method: "LIT"` 리터럴,
 *     (b) 함수명이 get/post/put/patch/delete 면 그 동사, (c) W 의 method 상속 순으로 결정.
 *  4) 호출 지점: 알려진 래퍼를 경로 위치 문자열 리터럴(또는 리터럴 머리 템플릿)로 호출하면
 *     TsApiCall{path=접두+리터럴(+보간 꼬리는 '*'), method=래퍼 method} 를 낸다.
 * 산출은 ts-api-calls.ts 의 TsApiCall 과 동형 — 동일 조인(joinApiCallsToRoutes)에 그대로 태운다.
 */
import type { Node } from 'web-tree-sitter'
import { startLine } from './tree-sitter.js'
import type { TsApiCall } from './ts-api-calls.js'

const HTTP_VERB_NAMES = new Set(['get', 'post', 'put', 'patch', 'delete'])

interface WrapperInfo {
  /** 경로 파라미터 위치(0-based 인자 인덱스). */
  pathParamIndex: number
  /** 상수에서 해석된 경로 접두(예: '/api'). */
  prefix: string
  /** 판정된 HTTP 메서드(모르면 null). */
  method: string | null
}

/** 직계 named child 중 첫 번째 타입 일치. */
function child(node: Node, type: string): Node | null {
  for (const c of node.namedChildren) {
    if (c && c.type === type) return c
  }
  return null
}

/** string 노드 → 내용(보간 없는 단순형만). */
function stringValue(node: Node | null): string | null {
  if (!node || node.type !== 'string') return null
  const frag = child(node, 'string_fragment')
  // 빈 문자열("")은 fragment 가 없다 — 빈 접두는 조인에 무의미해 제외.
  return frag ? frag.text : null
}

/** 1) 파일-로컬 문자열 상수 수집 — `const N = "lit"` / `const N = expr ?? "lit"`. */
function collectStringConsts(root: Node): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (node: Node): void => {
    if (node.type === 'variable_declarator') {
      const nameId = child(node, 'identifier')
      const value = node.namedChildren.filter((c): c is Node => c !== null)[1] ?? null
      if (nameId && value) {
        const direct = stringValue(value)
        if (direct !== null) {
          out.set(nameId.text, direct)
        } else if (value.type === 'binary_expression') {
          // `expr ?? "lit"` — 마지막 string 자식을 폴백 리터럴로 본다(?? 우변).
          const named = value.namedChildren.filter((c): c is Node => c !== null)
          const rhs = named[named.length - 1]
          const lit = stringValue(rhs ?? null)
          if (lit !== null && value.text.includes('??')) out.set(nameId.text, lit)
        }
      }
    }
    for (const c of node.namedChildren) if (c) visit(c)
  }
  visit(root)
  return out
}

interface FnDecl {
  name: string
  params: string[]
  body: Node
}

/** 파일 내 이름 있는 함수(선언 + const 화살표/함수식) 수집. */
function collectFunctions(root: Node): FnDecl[] {
  const out: FnDecl[] = []
  const paramNames = (fn: Node): string[] => {
    const fps = child(fn, 'formal_parameters')
    if (!fps) return []
    const names: string[] = []
    for (const p of fps.namedChildren) {
      if (!p) continue
      // required_parameter/optional_parameter > (identifier | 구조분해 — 구조분해는 경로 후보 아님).
      const id = child(p, 'identifier') ?? (p.type === 'identifier' ? p : null)
      names.push(id ? id.text : `#${names.length}`)
    }
    return names
  }
  const visit = (node: Node): void => {
    if (node.type === 'function_declaration') {
      const id = child(node, 'identifier')
      const body = child(node, 'statement_block')
      if (id && body) out.push({ name: id.text, params: paramNames(node), body })
    } else if (node.type === 'variable_declarator') {
      const id = child(node, 'identifier')
      const fn = child(node, 'arrow_function') ?? child(node, 'function_expression')
      if (id && fn) {
        const body = child(fn, 'statement_block') ?? fn
        out.push({ name: id.text, params: paramNames(fn), body })
      }
    }
    for (const c of node.namedChildren) if (c) visit(c)
  }
  visit(root)
  return out
}

/** 템플릿이 `${CONST}${param}...` 머리인지 — 맞으면 [상수명, 파라미터명]. */
function templateHead(template: Node): [string, string] | null {
  const named = template.namedChildren.filter((c): c is Node => c !== null)
  if (named.length < 2) return null
  const [a, b] = named
  if (a.type !== 'template_substitution' || b.type !== 'template_substitution') return null
  const aId = child(a, 'identifier')
  const bId = child(b, 'identifier')
  return aId && bId ? [aId.text, bId.text] : null
}

/** 호출 인자 객체들에서 `method: "LIT"` 리터럴 추출. */
function methodFromArgs(args: Node): string | null {
  for (const arg of args.namedChildren) {
    if (!arg || arg.type !== 'object') continue
    for (const pair of arg.namedChildren) {
      if (!pair || pair.type !== 'pair') continue
      const key = child(pair, 'property_identifier')
      if (key?.text !== 'method') continue
      const v = stringValue(child(pair, 'string'))
      if (v) return v.toUpperCase()
    }
  }
  return null
}

/** 2)+3) 래퍼 판별(근원 + 파일 내 전이 고정점). */
function resolveWrappers(root: Node, consts: Map<string, string>): Map<string, WrapperInfo> {
  const fns = collectFunctions(root)
  const wrappers = new Map<string, WrapperInfo>()

  // 근원: fetch(`${CONST}${param}...`).
  for (const fn of fns) {
    const visit = (node: Node): boolean => {
      if (node.type === 'call_expression') {
        const callee = node.namedChildren.filter((c): c is Node => c !== null)[0]
        const args = child(node, 'arguments')
        if (callee?.type === 'identifier' && callee.text === 'fetch' && args) {
          const first = args.namedChildren.filter((c): c is Node => c !== null)[0]
          if (first?.type === 'template_string') {
            const head = templateHead(first)
            if (head) {
              const [constName, paramName] = head
              const prefix = consts.get(constName)
              const idx = fn.params.indexOf(paramName)
              if (prefix !== undefined && idx >= 0 && !wrappers.has(fn.name)) {
                wrappers.set(fn.name, { pathParamIndex: idx, prefix, method: null })
                return true
              }
            }
          }
        }
      }
      for (const c of node.namedChildren) if (c && visit(c)) return true
      return false
    }
    visit(fn.body)
  }

  // 전이: 자기 파라미터를 알려진 래퍼의 경로 위치로 그대로 넘기는 함수(최대 3단).
  for (let round = 0; round < 3; round++) {
    let grew = false
    for (const fn of fns) {
      if (wrappers.has(fn.name)) continue
      const visit = (node: Node): boolean => {
        if (node.type === 'call_expression') {
          const callee = node.namedChildren.filter((c): c is Node => c !== null)[0]
          const args = child(node, 'arguments')
          const w = callee?.type === 'identifier' ? wrappers.get(callee.text) : undefined
          if (w && args) {
            const argNodes = args.namedChildren.filter((c): c is Node => c !== null)
            const pathArg = argNodes[w.pathParamIndex]
            if (pathArg?.type === 'identifier') {
              const idx = fn.params.indexOf(pathArg.text)
              if (idx >= 0) {
                const verb = HTTP_VERB_NAMES.has(fn.name.toLowerCase())
                  ? fn.name.toUpperCase()
                  : null
                wrappers.set(fn.name, {
                  pathParamIndex: idx,
                  prefix: w.prefix,
                  method: methodFromArgs(args) ?? verb ?? w.method,
                })
                return true
              }
            }
          }
        }
        for (const c of node.namedChildren) if (c && visit(c)) return true
        return false
      }
      if (visit(fn.body)) grew = true
    }
    if (!grew) break
  }
  return wrappers
}

/** 경로 인자(문자열/리터럴 머리 템플릿) → 경로 문자열('*' 꼬리 규약은 ts-api-calls 와 동일). */
function pathFromArg(arg: Node): string | null {
  const direct = stringValue(arg)
  if (direct !== null) return direct
  if (arg.type === 'template_string') {
    const named = arg.namedChildren.filter((c): c is Node => c !== null)
    if (named.length > 0 && named[0].type === 'string_fragment') {
      return `${named[0].text}*`
    }
  }
  return null
}

/** 4) 래퍼 호출 지점 → TsApiCall 목록(라인 순 정렬, 결정론). */
export function extractWrapperApiCalls(root: Node, relPath: string): TsApiCall[] {
  const consts = collectStringConsts(root)
  if (consts.size === 0) return []
  const wrappers = resolveWrappers(root, consts)
  if (wrappers.size === 0) return []

  const out: TsApiCall[] = []
  const visit = (node: Node): void => {
    if (node.type === 'call_expression') {
      const callee = node.namedChildren.filter((c): c is Node => c !== null)[0]
      const args = child(node, 'arguments')
      const w = callee?.type === 'identifier' ? wrappers.get(callee.text) : undefined
      if (w && args) {
        const argNodes = args.namedChildren.filter((c): c is Node => c !== null)
        const pathArg = argNodes[w.pathParamIndex]
        const tail = pathArg ? pathFromArg(pathArg) : null
        if (tail !== null) {
          const path = `${w.prefix}${tail}`
          if (path.startsWith('/')) {
            out.push({
              relPath,
              method: methodFromArgs(args) ?? w.method,
              path,
              line: startLine(node),
            })
          }
        }
      }
    }
    for (const c of node.namedChildren) if (c) visit(c)
  }
  visit(root)
  return out.sort((a, b) => a.line - b.line || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
