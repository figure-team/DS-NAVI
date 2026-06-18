/**
 * 라우트 결정론 헬퍼 — 경로 정규화, 자연키, ID 할당, 전순서 정렬.
 *
 * 모든 라우트 산출은 명시 키로 전순서 정렬되며 routeId 는 충돌 시
 * 안정적으로 한정자를 덧붙여 유일성을 보장한다(인덱스 서수 금지).
 */
import type { BatchEntry, RouteEntry, RouteMethod } from './types.js'

/**
 * 경로 정규화 — 선행 "/", 중복 "//" 축약, 후행 "/" 제거(루트 "/" 예외).
 * 경로 파라미터({id} 등)는 그대로 둔다.
 */
export function normalizePath(raw: string): string {
  let p = raw.trim()
  if (p.length === 0) return '/'
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p.length === 0 ? '/' : p
}

/** (method, path) 자연키. */
export function routeNaturalKey(method: RouteMethod, path: string): string {
  return `${method} ${path}`
}

/**
 * routeId 를 할당한다.
 * 기본 `route:${method} ${path}`. (method,path) 충돌 시 `@${filePath}` 를
 * 덧붙이고, 그래도 충돌하면 `:${line}` 을 덧붙여 유일성을 보장한다.
 */
export function assignRouteIds(routes: RouteEntry[]): void {
  const baseCount = new Map<string, number>()
  for (const r of routes) {
    const key = routeNaturalKey(r.method, r.path)
    baseCount.set(key, (baseCount.get(key) ?? 0) + 1)
  }

  const used = new Set<string>()
  for (const r of routes) {
    const key = routeNaturalKey(r.method, r.path)
    let id = `route:${key}`
    if ((baseCount.get(key) ?? 0) > 1) {
      id = `${id}@${r.filePath}`
      if (used.has(id)) id = `${id}:${r.line}`
    }
    // 최종 방어: 여전히 충돌하면 line 한정자 추가 후에도 충돌하면 접미사 증분.
    if (used.has(id)) {
      id = `${id}:${r.line}`
      let n = 2
      let candidate = id
      while (used.has(candidate)) {
        candidate = `${id}#${n++}`
      }
      id = candidate
    }
    used.add(id)
    r.routeId = id
  }
}

function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 라우트 전순서 정렬 — (path, method, filePath, line, rawPath, routeId). */
export function sortRoutes(routes: RouteEntry[]): RouteEntry[] {
  return [...routes].sort(
    (a, b) =>
      cmp(a.path, b.path) ||
      cmp(a.method, b.method) ||
      cmp(a.filePath, b.filePath) ||
      cmp(a.line, b.line) ||
      cmp(a.rawPath, b.rawPath) ||
      cmp(a.routeId, b.routeId),
  )
}

/** 배치 엔트리 정렬 — (filePath, line, entryId). */
export function sortBatchEntries(entries: BatchEntry[]): BatchEntry[] {
  return [...entries].sort(
    (a, b) => cmp(a.filePath, b.filePath) || cmp(a.line, b.line) || cmp(a.entryId, b.entryId),
  )
}
