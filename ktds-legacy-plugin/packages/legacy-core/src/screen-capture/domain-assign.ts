/**
 * 화면 도메인 배정(결정론) — screens[].domain 을 LLM 채움이 아니라 엔진이 채운다.
 *
 * 배경(2026-07-18): SKILL 의 "domain(뷰 폴더)" 채움 계약이 팬아웃 경로에서 구조적으로
 * 누락돼(조각 스키마·병합 모두 domain 부재) jpetstore 22·egov 130 화면 전부가
 * 화면설계서 "기타" 그룹에 뭉치는 결함이 재현됐다. domain 은 본질적으로 결정론
 * 파생값이라 LLM 계약에서 제외하고 이 모듈이 소유한다(재발 원천 차단).
 *
 * 우선순위 체인(화면 1장):
 *  ⓪ 뷰 폴더 = 플랜 키 직접 일치 — jspFile 폴더 파생값이 확정 도메인 key 와 그대로
 *     일치하면 최우선(화면의 소속은 "무엇을 보여주나"다 — jpetstore 상품 상세가
 *     "장바구니 담기" 버튼 표 때문에 cart 로 가던 오배정 교정).
 *  ① 핸들러 근거 조인 — 주석 handler.evidence[].file 을 확정 플랜(domain-plan.confirmed)
 *     roots 에 직접 대조, 불일치분만 slices.ownership(파일→진입 루트) 경유. 직접 일치
 *     표가 하나라도 있으면 그것만 쓴다(공유 유틸의 소유권 조인은 대규모에서 소음).
 *     전 화면 반복 크롬(GNB 링크·공통 폼)의 표는 제외. 다수결(득표율 ≥50%),
 *     동률은 표 수 → 키 사전순(결정론 tie-break).
 *  ② jspFile/graphNodeId 경로를 같은 방식으로 대조.
 *  ③ 뷰 폴더 파생(플랜 없는 프로젝트 폴백) — 전 화면 jspFile 의 공통 디렉터리 접두를
 *     걷어낸 첫 세그먼트. 그룹 폭발 상한 = max(24, 플랜 도메인 수) — 초과하면 접두를
 *     한 단계씩 되물려 재시도, 끝내 못 맞추면 파생하지 않는다.
 *  ④ 화면 id 경로("screen:<url경로>")에 ③ 과 동일 규칙.
 *  ⑤ 전부 실패 = null("기타") — 지어내지 않는다(fail-open).
 *
 * domain 은 mechanicalProjection 밖(채움 필드)이라 배정은 mechanicalHash 를 바꾸지
 * 않는다. 순수 함수 + 멱등 — confirm 재확정 후 assign-domains 재실행으로 재정합한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readMapArtifact,
  stableJson,
  CONFIRMED_PLAN_FILENAME,
  SLICES_FILENAME,
} from '../domain-map/persist.js'
import { ConfirmedPlanSchema, SlicesReportSchema } from '../domain-map/types.js'
import { ScreensFileSchema, SCREENS_FILENAME, type Screen, type ScreensFile } from './types.js'

// ──────────────────────────────────────────────────────────────────────────
// 컨텍스트(조인 재료)
// ──────────────────────────────────────────────────────────────────────────

export interface DomainAssignContext {
  /** 진입 루트 파일(relPath) → 확정 도메인 key. */
  domainByRoot: Map<string, string>
  /** 파일 relPath → 소유 진입 루트 목록(slices.ownership, owners 비어있지 않은 것만). */
  ownersByFile: Map<string, string[]>
  /** 확정 플랜 도메인 수 — 파생 그룹 상한 계산용(플랜 부재 시 0). */
  planDomainCount: number
}

/** `.spec/map/` 의 확정 플랜·슬라이스에서 조인 컨텍스트를 만든다(부재는 빈 맵). */
export function loadDomainAssignContext(projectRoot: string): DomainAssignContext {
  const plan = readMapArtifact(projectRoot, CONFIRMED_PLAN_FILENAME, ConfirmedPlanSchema)
  const slices = readMapArtifact(projectRoot, SLICES_FILENAME, SlicesReportSchema)
  const domainByRoot = new Map<string, string>()
  for (const d of plan?.domains ?? []) {
    for (const r of d.roots) domainByRoot.set(r, d.key)
  }
  const ownersByFile = new Map<string, string[]>()
  for (const o of slices?.ownership ?? []) {
    if (o.owners.length > 0) ownersByFile.set(o.relPath, o.owners)
  }
  return { domainByRoot, ownersByFile, planDomainCount: plan?.domains.length ?? 0 }
}

// ──────────────────────────────────────────────────────────────────────────
// 다수결(①②)
// ──────────────────────────────────────────────────────────────────────────

/** 소유권 조인 모호성 상한 — 이보다 많은 도메인이 공유하는 파일은 소음으로 버린다. */
const OWNERSHIP_AMBIGUITY_CAP = 3

/** 파생 그룹 수 기본 상한(플랜 도메인 수가 더 크면 그 값). */
const DERIVED_GROUP_CAP = 24

function bump(votes: Map<string, number>, key: string): void {
  votes.set(key, (votes.get(key) ?? 0) + 1)
}

/** 파일 1개 → 도메인 표. 직접 일치가 최우선, 소유권 경유는 모호성 상한 안에서만. */
function voteForFile(
  file: string,
  ctx: DomainAssignContext,
  direct: Map<string, number>,
  viaOwners: Map<string, number>,
): void {
  const d = ctx.domainByRoot.get(file)
  if (d) {
    bump(direct, d)
    return
  }
  const owners = ctx.ownersByFile.get(file)
  if (!owners) return
  const keys = [...new Set(owners.map((o) => ctx.domainByRoot.get(o)).filter((k): k is string => !!k))]
  if (keys.length === 0 || keys.length > OWNERSHIP_AMBIGUITY_CAP) return
  for (const k of keys) bump(viaOwners, k)
}

/** 다수결 — 최다 득표가 총표의 절반 이상일 때만 채택(동률은 표 수 → 키 사전순). */
function majority(votes: Map<string, number>): string | null {
  let total = 0
  for (const v of votes.values()) total += v
  if (total === 0) return null
  const [key, top] = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
  return top * 2 >= total ? key : null
}

/**
 * 공통 크롬(GNB·푸터·상단 검색폼) 판정 — 같은 href/formAction 이 전체 화면의 25%
 * 이상(최소 3화면)에 반복되면 화면 고유 신호가 아니다. 대시보드 화면설계서의
 * 링크 접기 규칙(screenSpecAnnotations.commonNavThreshold)과 동일 상수 — 어긋나면
 * "표에서는 접힌 링크가 도메인 표는 낸다"는 비대칭이 생긴다.
 *
 * jpetstore 실측 교훈: 이 제외 없이는 헤더의 카탈로그 링크 표가 화면 고유 핸들러를
 * 압도해 22화면 중 20장이 catalog 로 쏠렸다(계정/주문 화면 포함).
 */
function computeCommonChromeKeys(screens: Screen[]): ReadonlySet<string> {
  const byKey = new Map<string, Set<string>>()
  for (const s of screens) {
    for (const a of s.annotations) {
      const key = a.mechanical.href ?? a.mechanical.formAction
      if (!key) continue
      let ids = byKey.get(key)
      if (!ids) byKey.set(key, (ids = new Set()))
      ids.add(s.id)
    }
  }
  const threshold = Math.max(3, Math.ceil(screens.length * 0.25))
  const common = new Set<string>()
  for (const [k, ids] of byKey) if (ids.size >= threshold) common.add(k)
  return common
}

/** ① 핸들러 근거 조인 — 공통 크롬을 제외한 주석들의 evidence 파일 다수결. */
function domainFromHandlers(
  s: Screen,
  ctx: DomainAssignContext,
  commonChrome: ReadonlySet<string>,
): string | null {
  const direct = new Map<string, number>()
  const viaOwners = new Map<string, number>()
  for (const a of s.annotations) {
    const chromeKey = a.mechanical.href ?? a.mechanical.formAction
    if (chromeKey && commonChrome.has(chromeKey)) continue
    for (const ev of a.handler?.evidence ?? []) {
      voteForFile(ev.file, ctx, direct, viaOwners)
    }
  }
  return majority(direct.size > 0 ? direct : viaOwners)
}

/** ② 뷰 파일 조인 — jspFile/graphNodeId 경로 대조. */
function domainFromViewFiles(s: Screen, ctx: DomainAssignContext): string | null {
  const direct = new Map<string, number>()
  const viaOwners = new Map<string, number>()
  const files = [s.jspFile, s.graphNodeId?.replace(/^file:/, '') ?? null]
  for (const f of files) {
    if (f) voteForFile(f, ctx, direct, viaOwners)
  }
  return majority(direct.size > 0 ? direct : viaOwners)
}

// ──────────────────────────────────────────────────────────────────────────
// 폴더 파생(③④)
// ──────────────────────────────────────────────────────────────────────────

/**
 * 경로 목록에서 화면별 그룹 세그먼트를 파생한다(전 화면 공통 컨텍스트 필요 —
 * 화면 1장 단위가 아니라 목록 단위 순수 함수).
 *
 * 공통 디렉터리 접두(LCP)를 걷어낸 "첫 디렉터리 세그먼트"가 후보다. 후보 그룹 수가
 * cap 을 넘거나(폭발) 후보를 받는 화면이 절반 미만이면(접두가 의미 세그먼트를 먹음)
 * 접두를 한 단계씩 되물려 재시도한다. 어떤 접두 길이에서도 못 맞추면 전부 null.
 */
export function deriveFolderGroups(paths: Array<string | null>, cap: number): Array<string | null> {
  const segs = paths.map((p) => (p ? p.split('/').filter(Boolean) : null))
  // 디렉터리 세그먼트만(마지막 = 파일/뷰 이름은 후보에서 제외).
  const dirs = segs.map((sg) => (sg && sg.length >= 2 ? sg.slice(0, -1) : null))
  const nonNull = dirs.filter((d): d is string[] => d !== null)
  if (nonNull.length === 0) return paths.map(() => null)

  // 공통 디렉터리 접두 길이.
  let lcp = nonNull[0].length
  for (const d of nonNull) {
    let i = 0
    while (i < lcp && i < d.length && d[i] === nonNull[0][i]) i++
    lcp = Math.min(lcp, i)
  }

  for (let p = lcp; p >= 0; p--) {
    const cands = dirs.map((d) => (d && d.length > p ? d[p] : null))
    const named = cands.filter((c): c is string => c !== null)
    if (named.length === 0) continue
    const distinct = new Set(named).size
    // 후보 수용률 절반 이상 + 그룹 폭발 상한 안쪽일 때만 채택.
    if (distinct <= cap && named.length * 2 >= nonNull.length) return cands
  }
  return paths.map(() => null)
}

/** 화면 id → 파생용 경로("screen:" 접두·"__변형" 접미 제거). 경로꼴이 아니면 null. */
function idPath(screenId: string): string | null {
  const raw = screenId.replace(/^screen:/, '').split('__')[0]
  if (!raw || raw === '(root)') return null
  return raw
}

/**
 * URL 경로의 디렉터리를 "."-조인해 플랜 도메인 키와 최장 접두 일치를 찾는다 —
 * egov 류 모듈 URL(`sym/tbm/tbr/xxx.do` ↔ 도메인 키 `sym.tbm.tbr`)의 결정론 조인.
 * 일치가 없으면 null(일반 폴더 파생으로 폴백).
 */
function planKeyFromUrlPath(path: string | null, planKeys: ReadonlySet<string>): string | null {
  if (!path) return null
  const dirs = path.split('/').filter(Boolean).slice(0, -1)
  for (let n = dirs.length; n >= 1; n--) {
    const cand = dirs.slice(0, n).join('.')
    if (planKeys.has(cand)) return cand
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────────
// 배정 본체
// ──────────────────────────────────────────────────────────────────────────

export interface DomainAssignSummary {
  total: number
  assigned: number
  byMethod: {
    handlerJoin: number
    viewFileJoin: number
    viewFolder: number
    urlFolder: number
    unassigned: number
  }
}

/**
 * 전 화면 domain 재배정(순수·멱등) — 기존 domain 값은 보지 않고 항상 새로 계산한다
 * (과거 실행·수동 편집의 낡은 값이 남지 않게. 사람 편집은 *-overrides 소관).
 */
export function assignScreenDomains(
  screens: Screen[],
  ctx: DomainAssignContext,
): { screens: Screen[]; summary: DomainAssignSummary } {
  const cap = Math.max(DERIVED_GROUP_CAP, ctx.planDomainCount)
  const byMethod = { handlerJoin: 0, viewFileJoin: 0, viewFolder: 0, urlFolder: 0, unassigned: 0 }
  const commonChrome = computeCommonChromeKeys(screens)
  const planKeys = new Set(ctx.domainByRoot.values())

  // ③ 파생 축(전 화면 jspFile)은 ⓪ 플랜 키 일치 판정에도 쓰므로 먼저 계산한다.
  const viewFolder = deriveFolderGroups(
    screens.map((s) => s.jspFile),
    cap,
  )

  // ⓪①② — 화면 단위 조인.
  const joined: Array<string | null> = screens.map((s, i) => {
    const folder = viewFolder[i]
    if (folder && planKeys.has(folder)) {
      byMethod.viewFolder++
      return folder
    }
    const h = domainFromHandlers(s, ctx, commonChrome)
    if (h) {
      byMethod.handlerJoin++
      return h
    }
    const v = domainFromViewFiles(s, ctx)
    if (v) byMethod.viewFileJoin++
    return v
  })
  // ④ id(URL 경로) 파생.
  const urlFolder = deriveFolderGroups(
    screens.map((s) => idPath(s.id)),
    cap,
  )

  const out = screens.map((s, i) => {
    let domain = joined[i]
    if (!domain && viewFolder[i]) {
      domain = viewFolder[i]
      byMethod.viewFolder++
    }
    if (!domain) {
      // URL 경로 → 플랜 키 최장 접두 일치가 일반 폴더 파생보다 우선(실제 도메인 정합).
      const planMatch = planKeyFromUrlPath(idPath(s.id), planKeys)
      if (planMatch) {
        domain = planMatch
        byMethod.urlFolder++
      } else if (urlFolder[i]) {
        domain = urlFolder[i]
        byMethod.urlFolder++
      }
    }
    if (!domain) byMethod.unassigned++
    return domain === s.domain ? s : { ...s, domain }
  })

  return {
    screens: out,
    summary: { total: screens.length, assigned: screens.length - byMethod.unassigned, byMethod },
  }
}

/** screens.json 을 읽어 재배정 후 기록한다(단독 op — 백필·confirm 재확정 후 재정합). */
export function assignScreenDomainsOnDisk(projectRoot: string): {
  screensPath: string
  summary: DomainAssignSummary
} {
  const path = join(projectRoot, '.understand-anything', SCREENS_FILENAME)
  const file: ScreensFile = ScreensFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  const { screens, summary } = assignScreenDomains(file.screens, loadDomainAssignContext(projectRoot))
  const next: ScreensFile = ScreensFileSchema.parse({ ...file, screens })
  writeFileSync(path, stableJson(next), 'utf8')
  return { screensPath: path, summary }
}
