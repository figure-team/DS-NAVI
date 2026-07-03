/**
 * ktds legacy-core — 화면 발견/식별 정책(순수 함수).
 *
 * - URL 정규화(same-origin, jsessionid 제거)와 화면 동일성 키(path + 쿼리 "이름" 집합).
 *   값이 다른 viewProduct?productId=… 폭발은 대표 1건으로 수렴한다.
 * - 화면 id/slug 규칙, 크롤 방문 정책, JSP fragment 판별, 그래프 JSP 대조.
 */
import type { Screen } from './types.js'

/** 정적 자산 확장자 — 크롤 방문 제외. */
const ASSET_EXT_RE =
  /\.(css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map|pdf|zip|gz)(\?|$)/i

/**
 * 원시 링크 → 정규화 URL. same-origin 이 아니거나 http(s) 가 아니면 null.
 * fragment 제거, jsessionid(매트릭스/쿼리) 제거.
 */
export function normalizeUrl(raw: string, base: URL): URL | null {
  let u: URL
  try {
    u = new URL(raw, base)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.origin !== base.origin) return null
  u.hash = ''
  u.pathname = u.pathname.replace(/;jsessionid=[^/?#]*/gi, '')
  u.searchParams.delete('jsessionid')
  return u
}

/** 컨텍스트 경로 제거 후 앱 상대 경로(선행 '/' 없는 형태). */
export function relativePath(u: URL, contextPath?: string | null): string {
  let path = u.pathname
  const ctx = contextPath?.replace(/\/$/, '')
  if (ctx && ctx !== '' && (path === ctx || path.startsWith(ctx + '/'))) {
    path = path.slice(ctx.length)
  }
  return path.replace(/^\//, '')
}

/**
 * 화면 동일성 키 — path + 정렬된 쿼리 파라미터 "이름" 집합(값 제거).
 * 같은 키의 URL 은 같은 화면으로 보고 최초 도달분만 캡처한다.
 */
export function screenKey(u: URL, contextPath?: string | null): string {
  const rel = relativePath(u, contextPath)
  const keys = [...new Set([...u.searchParams.keys()])].sort()
  return keys.length ? `${rel}?${keys.join('&')}` : rel
}

/** 파일명 안전 slug — `[A-Za-z0-9._-]` 이외는 '_' 로, 연속 '_' 축약. */
export function slugify(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'root'
}

/**
 * 화면 안정 식별자 — `screen:<상대경로>__<쿼리키(정렬)>`.
 * 예: /jpetstore/actions/Account.action?signonForm= → "screen:actions/Account.action__signonForm"
 */
export function screenIdFor(u: URL, contextPath?: string | null): string {
  const rel = relativePath(u, contextPath) || '(root)'
  const keys = [...new Set([...u.searchParams.keys()])].sort()
  return keys.length ? `screen:${rel}__${keys.join('_')}` : `screen:${rel}`
}

/** 화면 id → 캡처 PNG 상대 경로(`screens/<slug>.png`). */
export function capturePathFor(screenId: string): string {
  return `screens/${slugify(screenId.replace(/^screen:/, ''))}.png`
}

/** 크롤 방문 정책 — 자산/제외 정규식 필터(횟수 상한은 러너의 maxPages 가 담당). */
export function shouldVisit(u: URL, exclude: string[]): boolean {
  const full = u.pathname + u.search
  if (ASSET_EXT_RE.test(u.pathname)) return false
  for (const pattern of exclude) {
    try {
      if (new RegExp(pattern).test(full)) return false
    } catch {
      // 잘못된 정규식은 무시(조용한 전체 차단 방지).
    }
  }
  return true
}

/** include 지시자 — `<%@ include file="…" %>` / `<jsp:include page="…">`. */
const JSP_INCLUDE_RE =
  /<%@\s*include\s+file\s*=\s*"([^"]+)"|<jsp:include\s+[^>]*page\s*=\s*"([^"]+)"/g

/** '.'/'..' 세그먼트 정규화(선행 '/' 제거). */
function normalizeSegments(p: string): string {
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/** include 대상 경로를 알려진 JSP 경로로 해석(상대=포함 파일 기준, 절대=웹앱 루트 suffix 매칭). */
function resolveIncludeTarget(
  fromPath: string,
  target: string,
  known: ReadonlySet<string>,
): string | null {
  const cand = target.startsWith('/')
    ? normalizeSegments(target)
    : normalizeSegments(fromPath.split('/').slice(0, -1).join('/') + '/' + target)
  if (known.has(cand)) return cand
  for (const k of known) {
    if (k.endsWith('/' + cand)) return k
  }
  return null
}

/**
 * JSP fragment 판별 — 다른 JSP 가 include 지시자로 참조하는 파일은 독립 화면이
 * 아니라 조각이다(IncludeTop/IncludeAccountFields 등).
 * `<html>` 부재 휴리스틱은 레이아웃을 include 로 조립하는 앱(jpetstore 등)에서
 * 본문 페이지까지 오탐하므로 쓰지 않는다 — 피참조 여부가 결정론 기준.
 * 반환: fragment 로 판별된 path 목록(입력 순서 유지).
 */
export function detectFragments(jsps: Array<{ path: string; content: string }>): string[] {
  const known = new Set(jsps.map((j) => j.path))
  const referenced = new Set<string>()
  for (const { path, content } of jsps) {
    for (const m of content.matchAll(JSP_INCLUDE_RE)) {
      const target = m[1] ?? m[2]
      if (!target) continue
      const resolved = resolveIncludeTarget(path, target, known)
      if (resolved && resolved !== path) referenced.add(resolved)
    }
  }
  return jsps.filter((j) => referenced.has(j.path)).map((j) => j.path)
}

/** 지식그래프 노드에서 JSP 파일 경로 추출(file 노드, .jsp 한정). */
export function listJspFilesFromGraph(
  nodes: Array<{ id: string; type?: string; filePath?: string | null }>,
): string[] {
  const out = new Set<string>()
  for (const n of nodes) {
    const p = n.filePath ?? (n.id.startsWith('file:') ? n.id.slice('file:'.length) : null)
    if (p && p.toLowerCase().endsWith('.jsp')) out.add(p)
  }
  return [...out].sort()
}

/** JSP 폴더 파생 도메인 — `WEB-INF/jsp/<domain>/...`. 규약 밖이면 null. */
export function domainForJsp(jspFile: string): string | null {
  const m = /WEB-INF\/jsp\/([^/]+)\//.exec(jspFile)
  return m ? m[1] : null
}

/**
 * 그래프 JSP 대조 — 화면으로 매핑(jspFile)되지도, fragment 도 아닌 JSP 목록.
 * Stage A(전부 미매핑)와 Stage B 이후(validate) 양쪽에서 호출한다.
 */
export function reconcileJsps(
  graphJsps: string[],
  screens: Pick<Screen, 'jspFile'>[],
  fragments: string[],
): string[] {
  const mapped = new Set(screens.map((s) => s.jspFile).filter((f): f is string => f !== null))
  const frag = new Set(fragments)
  return graphJsps.filter((j) => !mapped.has(j) && !frag.has(j)).sort()
}
