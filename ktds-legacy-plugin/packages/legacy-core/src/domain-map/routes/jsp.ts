/**
 * JSP 페이지 라우트 추출 — census 파일 목록 기반.
 *
 * webapp 루트 하위의 *.jsp 파일을 직접 호출 가능한 엔드포인트로 본다.
 * path = webapp 루트 기준 상대경로(선행 `/` 부여), method GET, kind "page",
 * framework "jsp", handler null. WEB-INF 하위(포워드 전용)는 제외한다.
 */
import { normalizePath } from '../route-key.js'
import type { CensusReport, RouteEntry } from '../types.js'

/**
 * relPath 에서 webapp 루트 이후의 경로를 구한다.
 * `.../webapp/x/y.jsp` -> `x/y.jsp`. webapp 세그먼트가 없으면 relPath 전체.
 */
function webappRelative(relPath: string): string {
  const parts = relPath.split('/')
  const idx = parts.lastIndexOf('webapp')
  return idx >= 0 ? parts.slice(idx + 1).join('/') : relPath
}

/**
 * census 파일 목록에서 JSP 라우트를 추출한다.
 * @param census buildCensus 결과(lang === 'jsp' 인 파일만 대상)
 */
export function extractJspRoutes(census: CensusReport): RouteEntry[] {
  const out: RouteEntry[] = []
  for (const file of census.files) {
    if (file.lang !== 'jsp') continue
    const rel = webappRelative(file.relPath)
    // WEB-INF 하위는 포워드 전용 — 직접 주소화 불가.
    if (rel.split('/').includes('WEB-INF')) continue
    out.push({
      routeId: '',
      method: 'GET',
      path: normalizePath('/' + rel),
      rawPath: '/' + rel,
      kind: 'page',
      framework: 'jsp',
      filePath: file.relPath,
      line: 1,
      handler: null,
      notes: [],
    })
  }
  return out
}
