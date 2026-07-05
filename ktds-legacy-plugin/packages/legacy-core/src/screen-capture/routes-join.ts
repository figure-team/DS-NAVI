/**
 * ktds legacy-core — 주석 ↔ routes.json 결정론 조인(순수 함수).
 *
 * href/form action 을 `.spec/map/routes.json` 의 라우트 path 와 대조해
 * 핸들러(`AccountActionBean#signon` 등)를 CONFIRMED(file:line 근거)로 선기입한다.
 * LLM 없이 확정 근거를 만드는 이 설계의 최대 지렛대.
 *
 * Stripes 이벤트 규약:
 * - 링크: `Account.action?signonForm=` → 이벤트 = 쿼리 파라미터 이름.
 * - 폼 제출: `<stripes:submit name="signon">` → 이벤트 = submit 요소의 name.
 * routes.json 의 path 는 이벤트 포함형(`/actions/Account.action?signon`)과
 * 기본형(`/actions/Account.action`)이 공존한다 — 이벤트 우선, 기본형 폴백.
 */
import type { RouteEntry } from '../domain-map/types.js'
import type { Annotation } from './types.js'

export interface RouteJoinContext {
  routes: RouteEntry[]
  /** 앱 컨텍스트 경로(예: "/jpetstore") — href 정규화 시 제거. */
  contextPath?: string | null
}

export interface NormalizedAction {
  /** 컨텍스트 제거·jsessionid 제거된 앱 상대 path(선행 '/'). */
  path: string
  /** 쿼리 파라미터 이름 목록(문서 순서, 값 제거). */
  queryKeys: string[]
}

/**
 * href/formAction 원문 → 조인용 정규화. 조인 불가 형태(javascript:, mailto:,
 * 순수 fragment, 빈 값)는 null.
 */
export function normalizeActionPath(
  raw: string,
  contextPath?: string | null,
): NormalizedAction | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('mailto:') || lower.startsWith('tel:')) {
    return null
  }
  // 절대 URL 이면 origin 제거(러너가 same-origin 만 넘긴다).
  let rest = trimmed
  const originMatch = /^https?:\/\/[^/]+/i.exec(rest)
  if (originMatch) rest = rest.slice(originMatch[0].length)
  // fragment 제거.
  const hashIdx = rest.indexOf('#')
  if (hashIdx >= 0) rest = rest.slice(0, hashIdx)
  const qIdx = rest.indexOf('?')
  let path = qIdx >= 0 ? rest.slice(0, qIdx) : rest
  const query = qIdx >= 0 ? rest.slice(qIdx + 1) : ''
  // path;jsessionid=... 매트릭스 파라미터 제거.
  path = path.replace(/;jsessionid=[^/?#]*/i, '')
  if (!path.startsWith('/')) path = '/' + path
  // 컨텍스트 경로 제거.
  const ctx = contextPath?.replace(/\/$/, '')
  if (ctx && ctx !== '' && (path === ctx || path.startsWith(ctx + '/'))) {
    path = path.slice(ctx.length)
    if (!path.startsWith('/')) path = '/' + path
  }
  const queryKeys = query
    .split('&')
    .map((pair) => pair.split('=')[0])
    .map((k) => k.trim())
    .filter((k) => k !== '' && k.toLowerCase() !== 'jsessionid')
  return { path, queryKeys }
}

/** 라우트 인덱스 — path 완전일치(중복 시 최초 항목 우선, 결정론). */
function indexRoutes(routes: RouteEntry[]): Map<string, RouteEntry> {
  const byPath = new Map<string, RouteEntry>()
  for (const r of routes) {
    if (!byPath.has(r.path)) byPath.set(r.path, r)
  }
  return byPath
}

/** 주석 1건의 조인 후보 경로들(우선순위 순). */
export function candidatePaths(a: Annotation, contextPath?: string | null): string[] {
  const m = a.mechanical
  const candidates: string[] = []
  const isSubmitLike = a.kind === 'action' && m.formAction !== null
  if (isSubmitLike) {
    const n = normalizeActionPath(m.formAction as string, contextPath)
    if (n) {
      // Stripes: submit 요소 name = 이벤트.
      if (m.name) candidates.push(`${n.path}?${m.name}`)
      for (const k of n.queryKeys) candidates.push(`${n.path}?${k}`)
      candidates.push(n.path)
    }
  }
  if (m.href !== null) {
    const n = normalizeActionPath(m.href, contextPath)
    if (n) {
      for (const k of n.queryKeys) candidates.push(`${n.path}?${k}`)
      candidates.push(n.path)
    }
  }
  return candidates
}

/**
 * routes.json 조인 — 매칭되고 handler 가 있으면 CONFIRMED handler 를 채운 새 배열 반환.
 * (handler 가 이미 채워진 주석은 건드리지 않는다 — 멱등.)
 */
export function joinRoutes(annotations: Annotation[], ctx: RouteJoinContext): Annotation[] {
  const byPath = indexRoutes(ctx.routes)
  return annotations.map((a) => {
    if (a.handler !== null) return a
    for (const cand of candidatePaths(a, ctx.contextPath)) {
      const route = byPath.get(cand)
      if (route && route.handler) {
        return {
          ...a,
          handler: {
            target: route.handler,
            chain: [],
            evidence: [{ file: route.filePath, line: route.line }],
            confidence: 'CONFIRMED' as const,
          },
        }
      }
    }
    return a
  })
}
