/**
 * ktds legacy-core — missing 트리아지 + routes census 보조 시드 선별(순수 함수).
 * SCREENS_MISSING_TRIAGE_DESIGN.md §2(T1)·§3(T2) 구현.
 *
 * T1 triageMissing: 도달실패(missing[]) 각 건을 routes census 와 대조해 사유를
 *   결정론 세분류한다 — "죽은 메뉴(dead-menu)" 와 "메뉴만 낡고 라우트는 실존
 *   (stale-url)" 을 사람이 소스를 파지 않아도 산출물에서 구분할 수 있게.
 * T2 selectCensusSeeds: 크롤/시나리오가 못 찾은 미방문 GET-safe 라우트(목록성 leaf)를
 *   보조 시드로 선별한다. 부작용 계열은 deny 토큰으로 항상 제외(fail-closed —
 *   비인증 GET-만 원칙의 연장).
 */
import type { MissingScreen, MissingTriage, MissingTriageCandidate } from './types.js'

/** routes.json 라우트 중 트리아지/시드에 쓰는 필드만(나머지는 무시). */
export interface CensusRoute {
  path: string
  method?: string | null
  handler?: string | null
  filePath?: string | null
  line?: number | null
}

export interface TriageOptions {
  /** 로그인 페이지로 간주할 경로들(redirected-to 대상이 이거면 auth-gated). */
  loginPaths?: string[]
}

export interface CensusSeedOptions {
  /** 이미 방문/캡처한 경로면 true(크롤 visitedKeys·usedIds 대조는 러너 소관). */
  isVisited?: (path: string) => boolean
  /** config exclude 정규식 등으로 제외할 경로면 true. */
  isExcluded?: (path: string) => boolean
}

/** 부작용 의심 토큰 — leaf 토큰에 하나라도 있으면 시드 대상에서 항상 제외. */
const DENY_TOKENS = new Set([
  'insert',
  'update',
  'delete',
  'regist',
  'action',
  'save',
  'modify',
  'remove',
  'login',
  'logout',
])

/** 후보 매칭에서 "도메인 단어" 로 치지 않는 범용 토큰(§2.2 오매칭 방지). */
const GENERIC_TOKENS = new Set([
  'select',
  'list',
  'view',
  'detail',
  'inqire',
  'inquire',
  'info',
  'infs',
  'manage',
  'main',
  'index',
])

const stripQuery = (u: string): string => u.split('?')[0].split('#')[0]
const stripSlash = (p: string): string => p.replace(/^\/+/, '')
/** URL → census 대조용 정규 경로(쿼리/선행 슬래시 제거). */
const canonPath = (u: string): string => stripSlash(stripQuery(u))

/** leaf("selectQnaList.do") → 소문자 토큰 배열(확장자 제거, camelCase/구분자 분해, egov 브랜딩 제거). */
export function leafTokens(leaf: string): string[] {
  const base = leaf.replace(/\.[A-Za-z0-9]+$/, '')
  return base
    .split(/(?=[A-Z])|[_\-.]/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0 && t !== 'egov')
}

const dirOf = (p: string): string => {
  const c = canonPath(p)
  const i = c.lastIndexOf('/')
  return i < 0 ? '' : c.slice(0, i)
}
const leafOf = (p: string): string => {
  const c = canonPath(p)
  return c.slice(c.lastIndexOf('/') + 1)
}

/**
 * §2.2 유사 후보 매칭 — 같은 디렉터리 한정, 요청 토큰 대비 공통 토큰 비율(재현율) ≥ 0.5
 * 이고 공통 토큰에 범용어(GENERIC_TOKENS) 아닌 도메인 단어가 1개 이상일 때만.
 * 동률 타이브레이크: ① 정밀도(후보 토큰 대비 공통 비율 — 잉여 토큰이 적은 후보 우선,
 * 예 selectQnaList ≻ selectQnaAnswerList) ② 목록 진입점(leaf 가 list 로 끝남) 우선.
 * 그래도 동률이면 null(fail-closed — 오매칭보다 무제안).
 */
export function findCandidateRoute(
  missingUrl: string,
  routes: CensusRoute[],
): MissingTriageCandidate | null {
  const reqDir = dirOf(missingUrl)
  const reqTokens = leafTokens(leafOf(missingUrl))
  if (reqTokens.length === 0) return null
  const scored: Array<{
    route: CensusRoute
    recall: number
    precision: number
    listEntry: boolean
  }> = []
  for (const r of routes) {
    if (dirOf(r.path) !== reqDir) continue
    const candTokens = new Set(leafTokens(leafOf(r.path)))
    if (candTokens.size === 0) continue
    const common = reqTokens.filter((t) => candTokens.has(t))
    if (common.length / reqTokens.length < 0.5) continue
    if (!common.some((t) => !GENERIC_TOKENS.has(t))) continue
    scored.push({
      route: r,
      recall: common.length / reqTokens.length,
      precision: common.length / candTokens.size,
      listEntry: /list(view)?$/i.test(leafOf(r.path).replace(/\.[A-Za-z0-9]+$/, '')),
    })
  }
  if (scored.length === 0) return null
  scored.sort(
    (a, b) =>
      b.recall - a.recall ||
      b.precision - a.precision ||
      Number(b.listEntry) - Number(a.listEntry),
  )
  const [top, second] = scored
  if (
    second &&
    second.recall === top.recall &&
    second.precision === top.precision &&
    second.listEntry === top.listEntry
  ) {
    return null
  }
  const r = top.route
  return {
    path: r.path,
    handler: r.handler ?? null,
    filePath: r.filePath ?? null,
    line: r.line ?? null,
  }
}

/** §2.1 분류표 — 위→아래 첫 매치. routes 가 비면 트리아지 자체를 하지 않는다(호출부 소관). */
export function triageOne(
  m: MissingScreen,
  routes: CensusRoute[],
  censusPaths: Set<string>,
  opts: TriageOptions = {},
): MissingTriage {
  const loginPaths = new Set((opts.loginPaths ?? []).map(canonPath))
  // scenario-failed 등 URL 이 아닌 보고는 라우트 대조 무의미.
  if (m.url.startsWith('scenario:')) {
    return { class: 'unknown', routeExists: false, candidateRoute: null }
  }
  const path = canonPath(m.url)
  const routeExists = censusPaths.has(path)
  const status = /^http-(\d{3})$/.exec(m.reason)?.[1] ?? null

  if (status === '400' && routeExists) {
    return { class: 'param-required', routeExists, candidateRoute: null }
  }
  if (status !== null && status.startsWith('5')) {
    return { class: 'server-error', routeExists, candidateRoute: null }
  }
  if ((status === '401' || status === '403') && routeExists) {
    return { class: 'auth-gated', routeExists, candidateRoute: null }
  }
  if (m.reason.startsWith('redirected-to:')) {
    const target = canonPath(m.reason.slice('redirected-to:'.length))
    return {
      class: loginPaths.has(target) ? 'auth-gated' : 'redirect-other',
      routeExists,
      candidateRoute: null,
    }
  }
  if (status !== null && status.startsWith('4')) {
    if (routeExists) return { class: 'route-missing-hit', routeExists, candidateRoute: null }
    const candidateRoute = findCandidateRoute(m.url, routes)
    return {
      class: candidateRoute ? 'stale-url' : 'dead-menu',
      routeExists,
      candidateRoute,
    }
  }
  return { class: 'unknown', routeExists, candidateRoute: null }
}

/** T1 진입점 — missing 전건에 triage 를 부여한 새 배열을 반환(입력 불변). */
export function triageMissing(
  missing: MissingScreen[],
  routes: CensusRoute[],
  opts: TriageOptions = {},
): MissingScreen[] {
  const censusPaths = new Set(routes.map((r) => canonPath(r.path)))
  return missing.map((m) => ({ ...m, triage: triageOne(m, routes, censusPaths, opts) }))
}

/**
 * T2 — census 보조 시드 선별(§3). GET-safe 게이트(fail-closed):
 *  1) method 가 GET/ANY(또는 미기재)일 것.
 *  2) leaf 토큰에 deny 토큰(insert|update|delete|regist|action|save|modify|remove|login|logout)이
 *     하나라도 있으면 항상 제외.
 *  3) leaf 가 목록성 진입점(…List/…ListView/…Main/…Index)으로 끝날 것 — 파라미터 없이
 *     열리는 화면만 노려 missing 소음(상세 화면 400)을 막는다.
 *  4) 패턴 경로({…}, *, 정규식 앵커)는 제외.
 * 반환은 path ASC 정렬(결정론).
 */
export function selectCensusSeeds(
  routes: CensusRoute[],
  opts: CensusSeedOptions = {},
): CensusRoute[] {
  const seen = new Set<string>()
  const out: CensusRoute[] = []
  for (const r of routes) {
    const path = canonPath(r.path)
    if (path.length === 0 || seen.has(path)) continue
    if (/[{}*$\\]|\\A/.test(r.path)) continue
    const method = (r.method ?? 'ANY').toUpperCase()
    if (method !== 'GET' && method !== 'ANY') continue
    const tokens = leafTokens(leafOf(r.path))
    if (tokens.length === 0) continue
    if (tokens.some((t) => DENY_TOKENS.has(t))) continue
    const last = tokens[tokens.length - 1]
    const listEntry =
      last === 'list' ||
      last === 'main' ||
      last === 'index' ||
      (last === 'view' && tokens[tokens.length - 2] === 'list')
    if (!listEntry) continue
    if (opts.isExcluded?.(path)) continue
    if (opts.isVisited?.(path)) continue
    seen.add(path)
    out.push(r)
  }
  return out.sort((a, b) => canonPath(a.path).localeCompare(canonPath(b.path)))
}
