/**
 * SCREEN FILL FAN-OUT(화면설계서 Stage B 대규모 채움 팬아웃) — 청크 준비·조각 감사·병합.
 *
 * 화면·주석 수가 커지면 "호스트가 screens.json 을 통째로 읽고 인라인 채움"하는 경로는
 * 메인 세션 컨텍스트가 폭발한다(jpetstore: 화면 22개·주석 369건). 이 모듈은
 * domain-map fill-fanout 의 실증 방법론을 화면설계서에 이식한다: screens.json 을
 * **화면 N개 단위 자립 청크**로 쪼개고, 각 청크에 검증 통과가 보장된 pre-cite
 * (실파일에서 결정론 추출한 인용) + 핸들러 사전(routes/method-calls 결정론 조인)을
 * 동봉해 **인용 생산을 LLM 에서 제거**한다. 팬아웃 에이전트는 청크당 조각(fragment)을
 * 쓰고, 결정론 병합이 screens.json 의 채움 필드에만 반영한다.
 *
 *   prep : screens.json + routes/method-calls + 컨트롤러 소스 → screens-fill-prep/<chunkId>.json + index.json
 *   (팬아웃: 에이전트가 screens-fill-frag/<chunkId>.json 작성 — SKILL.md / workflow 지시)
 *   audit: 조각 완결성 감사(존재 ∧ 스키마 ∧ 커버리지 ∧ CONFIRMED⇒evidence≥1) — 재디스패치 근거
 *   merge: 조각의 **채움 필드만** screens.json 본체에 병합 + validate 재게이트
 *
 * 불변 봉인: annotations[].{no,kind,selector,bbox,eventType,mechanical} 은 mechanicalHash
 * 로 봉인된 Stage A 기계 사실 — 채움이 절대 수정하지 않는다(조각은 채움 필드만 담는다).
 * 완료의 진실은 디스크에 있다(audit) — 에이전트 ack 가 아니라. 중단 후 재실행하면
 * 완료 청크는 건너뛴다(멱등 재개). 결정론: 산출물 전부 stableJson + 자연키 정렬.
 */
import { readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { cmp } from '../utils/cmp.js'
import { CONFIDENCE_VALUES } from '../types.js'
import { specMapDir, stableJson, readMapArtifact } from '../domain-map/persist.js'
import { normalizeCitationText, isTrivialSnippet, verifyCitation, type FileCache } from '../domain-map/verify.js'
import { CitationSchema, type Citation } from '../domain-map/fill.js'
import {
  BundleFileSchema,
  sliceFile,
  DEFAULT_SLICE_LINES,
  type BundleFile,
} from '../domain-map/bundle.js'
import { DEFAULT_CHUNK_CHAR_CAP } from '../domain-map/fill-fanout.js'
import {
  assignScreenDomains,
  loadDomainAssignContext,
  type DomainAssignSummary,
} from './domain-assign.js'
import { resolveScreenViews, type ViewResolveSummary } from './view-resolve.js'
import { RoutesReportSchema, MethodCallGraphSchema } from '../domain-map/types.js'
import type { ResolvedCall } from '../domain-map/types.js'
import {
  ScreensFileSchema,
  HandlerSchema,
  ANNOTATION_KEY_RE,
  SCREENS_FILENAME,
  type Annotation,
  type Handler,
  type Screen,
  type ScreensFile,
} from './types.js'
import { computeMechanicalHash, validateScreensFile } from './assemble.js'
import { listJspFilesFromGraph, reconcileJsps } from './discover.js'

/** `.spec/map/screens-fill-prep/` — 청크(팬아웃 입력) 디렉터리 이름. */
export const SCREEN_FILL_PREP_DIR = 'screens-fill-prep'
/** `.spec/map/screens-fill-frag/` — 조각(팬아웃 출력) 디렉터리 이름. */
export const SCREEN_FILL_FRAG_DIR = 'screens-fill-frag'
/** 청크 색인 파일명(`screens-fill-prep/` 하위). */
export const SCREEN_FILL_PREP_INDEX_FILENAME = 'index.json'
/** 청크당 화면 수 기본값 — 청크 1개가 에이전트 1회 컨텍스트에 들어가는 유계. */
export const DEFAULT_CHUNK_SCREENS = 6
/** pre-cite 후보 탐색 창 — 앵커 라인에서 위/아래로 훑는 최대 라인 수. */
const PRECITE_SCAN_LINES = 40
/** pre-cite 스니펫 길이 상한(정규화 substring 일치라 잘라도 안전). */
const PRECITE_SNIPPET_MAX = 200
/** 뷰 경로 리터럴 패턴 — 따옴표 문자열이 .jsp/.jspx 로 끝나는 선언(대소문자 무시). */
const VIEW_LITERAL_RE = /"([^"\n]*\.jspx?)"/i
/** 청크당 뷰 상수 사전 상한(과다 팽창 방지 — 전형적 ActionBean 은 파일당 수 건). */
const VIEW_CONSTANT_CAP = 60
/** 표준 웹앱 문서루트 후보 — 컨테이너 경로("/WEB-INF/…")의 repo 상대 해석에 사용. */
const WEBAPP_ROOTS = ['src/main/webapp', 'WebContent', 'web', 'webapp']
/** 핸들러 사전 체인 후보 BFS 깊이(ActionBean → Service → Mapper). */
const CHAIN_DEPTH = 2
/** 핸들러 1건당 체인 후보 상한(과다 팽창 방지). */
const CHAIN_CANDIDATE_CAP = 16
/** fail-closed 신뢰도 — 이 등급 주장은 evidence(file:line) ≥ 1 필수(assemble.ts 게이트와 동일). */
const CONFIRMED_CONFIDENCES = new Set<string>(['CONFIRMED', 'CONFIRMED_AI'])

// ──────────────────────────────────────────────────────────────────────────
// 스키마
// ──────────────────────────────────────────────────────────────────────────

/** 조각 채움 필드용 요약 스키마(Screen.summary 와 동형). */
const SummarySchema = z.object({
  text: z.string(),
  confidence: z.enum(CONFIDENCE_VALUES),
})

/** 청크가 실어 나르는 주석 골격 — 불변 기계 사실 + 현재 채움 상태(에이전트 참고). */
const ChunkAnnotationSchema = z.object({
  /** `<kind>:<no>` — 조각/병합 정합 키(불변). */
  key: z.string().regex(ANNOTATION_KEY_RE),
  kind: z.string(),
  label: z.string(),
  eventType: z.string(),
  /** 이벤트→핸들러 유추 근거(Stage A 결정론 조인이 선기입한 CONFIRMED 포함). */
  target: z.string().nullable(),
  /** 현재 핸들러 신뢰도(있으면). */
  confidence: z.string().nullable(),
  /** 현재 채움 상태(재개 시 참고 — 비어 있으면 채울 대상). */
  description: z.string().nullable(),
  note: z.string().nullable(),
})

/** 청크가 실어 나르는 화면 골격 — 불변 식별자 + 현재 채움 상태. */
const ChunkScreenSchema = z.object({
  screenId: z.string(),
  title: z.string(),
  url: z.string(),
  domain: z.string().nullable(),
  jspFile: z.string().nullable(),
  graphNodeId: z.string().nullable(),
  contentSignature: z.string().nullable(),
  openedFrom: z.string().nullable(),
  summary: SummarySchema.nullable(),
  annotations: z.array(ChunkAnnotationSchema),
})

/** 핸들러 사전 항목 — routes/method-calls 결정론 조인의 pre-cite 후보. */
const HandlerDictEntrySchema = z.object({
  target: z.string(),
  /** 핸들러 선언(진입 메서드)의 검증 통과 보장 인용. 없으면 null(정직 보고). */
  routeEvidence: CitationSchema.nullable(),
  /** ActionBean→Service→Mapper 다운스트림 호출 후보(체인 채움용, verbatim 인용 가능). */
  chainCandidates: z.array(
    z.object({
      caller: z.string(),
      callee: z.string(),
      preCite: CitationSchema.nullable(),
    }),
  ),
})

/**
 * 뷰 상수 사전 항목 — 앵커 파일 **전 범위**에서 결정론 추출한 뷰 경로 리터럴.
 * 소스 슬라이스는 핸들러 앵커 주변 창이라 파일 상단의 뷰 상수 정의를 우연히만
 * 담는다(jpetstore: Cart 는 창 안이라 jspFile 매핑 성공·Order 는 창 밖이라 미채움).
 * 사전은 창과 무관하게 전 파일을 스캔하고 상수→repo 실경로 해결까지 동봉해
 * 에이전트가 `ForwardResolution(상수)` 를 근거와 함께 jspFile 로 풀 수 있게 한다.
 */
const ViewConstantSchema = z.object({
  /** 리터럴이 선언된 파일(repo 상대) — 인용(file:line) 대상. */
  relPath: z.string(),
  line: z.number().int().positive(),
  /** `String NAME = "..."` 선언의 NAME(인라인 리터럴 등 파싱 불가 시 null). */
  name: z.string().nullable(),
  /** 리터럴 원문(컨테이너 경로, 예 "/WEB-INF/jsp/order/NewOrderForm.jsp"). */
  value: z.string(),
  /** repo 상대 실경로(KG 유일 대조 또는 웹앱 문서루트 실존 확인 통과). 미해결 null. */
  resolvedPath: z.string().nullable(),
  /** 선언 라인 verbatim(검증 통과 보장 인용용). */
  snippet: z.string(),
})

/** 팬아웃 에이전트 1명이 읽는 자립 청크 — screens.json 의 부분집합 + pre-cite. */
export const ScreenFillChunkSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  chunkId: z.string(),
  /** 이 청크 화면들의 JSP 폴더 파생 도메인(그룹핑 축, null 가능). */
  domain: z.string().nullable(),
  screens: z.array(ChunkScreenSchema),
  handlerDict: z.array(HandlerDictEntrySchema),
  /** 이 청크 핸들러들의 컨트롤러/서비스 소스 슬라이스(도메인 번들과 동일 형식). */
  files: z.array(BundleFileSchema),
  /** 청크 charCap 으로 슬라이스가 생략된 파일(조용한 누락 금지). */
  sliceOmitted: z.array(z.string()),
  /** 앵커 파일들의 뷰 경로 리터럴 사전 — jspFile 채움의 결정론 근거(구판 청크 호환 default). */
  viewConstants: z.array(ViewConstantSchema).default([]),
})
export type ScreenFillChunk = z.infer<typeof ScreenFillChunkSchema>

const ChunkIndexEntrySchema = z.object({
  chunkId: z.string(),
  domain: z.string().nullable(),
  screenIds: z.array(z.string()),
  annotationCount: z.number().int().nonnegative(),
  /** pre-cite 미확보 핸들러 수 — 근거 공백의 정직 보고. */
  handlerPreCiteMissing: z.number().int().nonnegative(),
})

export const ScreenFillChunkIndexSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  chunkScreens: z.number().int().positive(),
  chunks: z.array(ChunkIndexEntrySchema),
  totals: z.object({
    screens: z.number().int().nonnegative(),
    chunks: z.number().int().nonnegative(),
    annotations: z.number().int().nonnegative(),
    handlerPreCiteMissing: z.number().int().nonnegative(),
  }),
})
export type ScreenFillChunkIndex = z.infer<typeof ScreenFillChunkIndexSchema>

/** 조각 주석 채움 — 불변 필드는 담지 않는다(병합이 본체 값 유지). */
const FragmentAnnotationSchema = z.object({
  key: z.string().regex(ANNOTATION_KEY_RE),
  description: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  handler: HandlerSchema.nullable().optional(),
})

/** 조각 화면 채움 — 불변 식별자(screenId)로만 본체와 정합, 나머지는 채움 필드. */
const FragmentScreenSchema = z.object({
  screenId: z.string(),
  jspFile: z.string().nullable().optional(),
  graphNodeId: z.string().nullable().optional(),
  title: z.string().optional(),
  summary: SummarySchema.nullable().optional(),
  annotations: z.array(FragmentAnnotationSchema),
})

/** 팬아웃 에이전트가 쓰는 조각 — 청크 화면들의 채움 필드 집합. */
export const ScreenFillFragmentSchema = z.object({
  schemaVersion: z.literal(1),
  chunkId: z.string(),
  screens: z.array(FragmentScreenSchema),
})
export type ScreenFillFragment = z.infer<typeof ScreenFillFragmentSchema>

// ──────────────────────────────────────────────────────────────────────────
// 경로 헬퍼
// ──────────────────────────────────────────────────────────────────────────

/** `.spec/map/screens-fill-prep/` 디렉터리 경로. */
export function screenFillPrepDir(projectRoot: string): string {
  return join(specMapDir(projectRoot), SCREEN_FILL_PREP_DIR)
}

/** `.spec/map/screens-fill-frag/` 디렉터리 경로. */
export function screenFillFragDir(projectRoot: string): string {
  return join(specMapDir(projectRoot), SCREEN_FILL_FRAG_DIR)
}

function chunkPath(projectRoot: string, chunkId: string): string {
  return join(screenFillPrepDir(projectRoot), `${chunkId}.json`)
}

function fragPath(projectRoot: string, chunkId: string): string {
  return join(screenFillFragDir(projectRoot), `${chunkId}.json`)
}

function screensPath(projectRoot: string): string {
  return join(projectRoot, '.understand-anything', SCREENS_FILENAME)
}

/** screens.json 을 읽어 검증한다 — 없으면 안내와 함께 던진다(fail-closed). */
function readScreensFile(projectRoot: string): ScreensFile {
  let raw: string
  try {
    raw = readFileSync(screensPath(projectRoot), 'utf8')
  } catch {
    throw new Error('screens.json 없음 — 먼저 capture(Stage A)를 실행하세요')
  }
  return ScreensFileSchema.parse(JSON.parse(raw))
}

/** 청크 색인을 읽는다 — 없으면 안내와 함께 던진다(fail-closed). */
export async function readScreenFillChunkIndex(
  projectRoot: string,
): Promise<ScreenFillChunkIndex> {
  let raw: string
  try {
    raw = await readFile(
      join(screenFillPrepDir(projectRoot), SCREEN_FILL_PREP_INDEX_FILENAME),
      'utf8',
    )
  } catch {
    throw new Error('screens-fill-prep/index.json 없음 — 먼저 fill-prep 을 실행하세요')
  }
  return ScreenFillChunkIndexSchema.parse(JSON.parse(raw))
}

// ──────────────────────────────────────────────────────────────────────────
// pre-cite 추출(domain-map fill-fanout 과 동일 규칙, 헬퍼 재사용)
// ──────────────────────────────────────────────────────────────────────────

/** relPath 의 라인 배열을 캐시 경유로 읽는다(읽기 실패는 null 캐시 — 정직 보고). */
async function loadLinesCached(
  projectRoot: string,
  relPath: string,
  cache: Map<string, string[] | null>,
): Promise<string[] | null> {
  let lines = cache.get(relPath)
  if (lines === undefined) {
    try {
      lines = (await readFile(join(projectRoot, relPath), 'utf8')).split('\n')
    } catch {
      lines = null
    }
    cache.set(relPath, lines)
  }
  return lines
}

/** KG 노드에서 JSP 목록을 읽는다(KG 부재/파손 시 null — 호출측이 fs 폴백). */
function readGraphJsps(projectRoot: string): string[] | null {
  const kgPath = join(projectRoot, '.understand-anything', 'knowledge-graph.json')
  if (!existsSync(kgPath)) return null
  try {
    const kg = JSON.parse(readFileSync(kgPath, 'utf8'))
    return listJspFilesFromGraph(kg.nodes ?? [])
  } catch {
    return null
  }
}

/**
 * 뷰 리터럴(컨테이너 경로)을 repo 상대 실경로로 해석한다.
 * 1) KG JSP 목록과 suffix 대조(유일 일치만 — 동명 다수는 단정 금지),
 * 2) 웹앱 문서루트 후보 + 경로의 실존 확인. 실패는 null(합성 금지).
 */
function resolveViewPath(projectRoot: string, value: string, graphJsps: string[] | null): string | null {
  const clean = value.replace(/^\/+/, '')
  if (graphJsps) {
    const matches = graphJsps.filter((p) => p === clean || p.endsWith(`/${clean}`))
    if (matches.length === 1) return matches[0]
  }
  for (const rootDir of WEBAPP_ROOTS) {
    const candidate = `${rootDir}/${clean}`
    if (existsSync(join(projectRoot, candidate))) return candidate
  }
  return null
}

/** 상속 부모 추적 홉 상한 — AbstractActionBean 류 공용 상수(예: ERROR)까지 커버. */
const SUPERCLASS_HOPS = 3

/**
 * 앵커 파일 목록을 상속 부모(같은 디렉터리의 `extends X` → X.java)로 확장한다.
 * 공용 뷰 상수(jpetstore: AbstractActionBean.ERROR)가 부모에 선언되는 전형을
 * 결정론으로 커버한다 — 패키지 밖/소스 밖 부모는 침묵 생략(합성 금지).
 */
async function expandWithSuperclasses(
  projectRoot: string,
  relPaths: string[],
  cache: Map<string, string[] | null>,
): Promise<string[]> {
  const visited = new Set(relPaths)
  let frontier = [...relPaths]
  for (let hop = 0; hop < SUPERCLASS_HOPS && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const relPath of frontier) {
      const lines = await loadLinesCached(projectRoot, relPath, cache)
      if (!lines) continue
      for (const line of lines) {
        const m = /\bclass\s+[A-Za-z_$][\w$]*\s+extends\s+([A-Za-z_$][\w$]*)/.exec(line)
        if (!m) continue
        const dir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : ''
        const superPath = dir ? `${dir}/${m[1]}.java` : `${m[1]}.java`
        if (!visited.has(superPath) && existsSync(join(projectRoot, superPath))) {
          visited.add(superPath)
          next.push(superPath)
        }
      }
    }
    frontier = next
  }
  return [...visited]
}

/**
 * 앵커 파일들(+상속 부모)을 **전 범위** 스캔해 뷰 상수 사전을 만든다(파일 정렬·라인 순
 * 결정론). 슬라이스 창(extractPreCite ±PRECITE_SCAN_LINES·번들 슬라이스)은 앵커 주변만
 * 담아 파일 상단의 뷰 상수 정의를 놓친다 — 사전은 창과 독립이라 이 갭을 결정론으로
 * 막는다. 스니펫은 실파일 라인 verbatim(min 8)이라 인용 검증을 통과한다. 상한 초과분은
 * 잘라낸다(전형 규모에선 도달하지 않음 — 도달 시에도 스키마상 개수로 드러난다).
 */
async function scanViewConstants(
  projectRoot: string,
  relPaths: string[],
  cache: Map<string, string[] | null>,
  graphJsps: string[] | null,
): Promise<z.infer<typeof ViewConstantSchema>[]> {
  const out: z.infer<typeof ViewConstantSchema>[] = []
  const scanPaths = await expandWithSuperclasses(projectRoot, relPaths, cache)
  for (const relPath of scanPaths.sort(cmp)) {
    const lines = await loadLinesCached(projectRoot, relPath, cache)
    if (!lines) continue
    for (let i = 0; i < lines.length && out.length < VIEW_CONSTANT_CAP; i++) {
      const m = VIEW_LITERAL_RE.exec(lines[i])
      if (!m) continue
      const snippet = lines[i].trim().slice(0, PRECITE_SNIPPET_MAX)
      if (snippet.length < 8) continue
      const nameMatch = /String\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[i])
      out.push({
        relPath,
        line: i + 1,
        name: nameMatch ? nameMatch[1] : null,
        value: m[1],
        resolvedPath: resolveViewPath(projectRoot, m[1], graphJsps),
        snippet,
      })
    }
    if (out.length >= VIEW_CONSTANT_CAP) break
  }
  return out
}

/**
 * 실파일에서 검증 통과가 보장된 인용 1건을 결정론으로 추출한다.
 * 후보 순서: 앵커 라인 → 아래로 PRECITE_SCAN_LINES → 위로 PRECITE_SCAN_LINES.
 * verify.ts 와 동일 규칙(normalizeCitationText/isTrivialSnippet)을 공유하고,
 * CitationSchema 의 snippet min 8 도 함께 보장한다. 실패는 null(정직 보고).
 */
async function extractPreCite(
  projectRoot: string,
  relPath: string,
  anchorLine: number,
  cache: Map<string, string[] | null>,
): Promise<Citation | null> {
  const lines = await loadLinesCached(projectRoot, relPath, cache)
  if (!lines) return null
  const anchor = Math.min(Math.max(1, anchorLine), lines.length)
  const candidates: number[] = [anchor]
  for (let d = 1; d <= PRECITE_SCAN_LINES; d++) {
    if (anchor + d <= lines.length) candidates.push(anchor + d)
  }
  for (let d = 1; d <= PRECITE_SCAN_LINES; d++) {
    if (anchor - d >= 1) candidates.push(anchor - d)
  }
  for (const line of candidates) {
    const snippet = lines[line - 1].trim().slice(0, PRECITE_SNIPPET_MAX)
    if (snippet.length < 8) continue
    const normalized = normalizeCitationText(snippet)
    if (normalized.length === 0 || isTrivialSnippet(normalized)) continue
    return { filePath: relPath, line, snippet }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────────
// 핸들러 사전(routes/method-calls 결정론 조인)
// ──────────────────────────────────────────────────────────────────────────

interface HandlerAnchor {
  filePath: string
  line: number
}

/**
 * 핸들러 사전을 준비한다. 청크의 주석에서 등장하는 핸들러 target 마다:
 *  - routeEvidence: 진입 메서드 선언의 pre-cite(주석의 기존 evidence file:line 앵커,
 *    없으면 routes.json 핸들러 매칭). Stage A 조인이 대부분 file:line 을 선기입한다.
 *  - chainCandidates: method-calls.json 에서 target 메서드로부터 CHAIN_DEPTH 홉까지
 *    프로젝트 내부 다운스트림 호출(ActionBean→Service→Mapper) — 호출 지점 pre-cite 동봉.
 */
async function buildHandlerDict(
  projectRoot: string,
  targets: Map<string, HandlerAnchor | null>,
  fileCache: Map<string, string[] | null>,
): Promise<{ dict: z.infer<typeof HandlerDictEntrySchema>[]; anchors: HandlerAnchor[] }> {
  const routes = readMapArtifact(projectRoot, 'routes.json', RoutesReportSchema)
  const methodCalls = readMapArtifact(projectRoot, 'method-calls.json', MethodCallGraphSchema)

  // routes.json 핸들러 → file:line(주석에 evidence 가 없을 때 폴백 앵커).
  const routeByHandler = new Map<string, HandlerAnchor>()
  for (const r of routes?.routes ?? []) {
    if (r.handler && !routeByHandler.has(r.handler)) {
      routeByHandler.set(r.handler, { filePath: r.filePath, line: r.line })
    }
  }

  // callerClass#callerMethod → 다운스트림 호출(호출 지점 정렬).
  const callsByCaller = new Map<string, ResolvedCall[]>()
  for (const c of methodCalls?.calls ?? []) {
    const key = `${c.callerClass}#${c.callerMethod}`
    const list = callsByCaller.get(key)
    if (list) list.push(c)
    else callsByCaller.set(key, [c])
  }

  const dict: z.infer<typeof HandlerDictEntrySchema>[] = []
  const anchors: HandlerAnchor[] = []
  for (const target of [...targets.keys()].sort(cmp)) {
    const annAnchor = targets.get(target) ?? null
    const anchor = annAnchor ?? routeByHandler.get(target) ?? null
    const routeEvidence = anchor
      ? await extractPreCite(projectRoot, anchor.filePath, anchor.line, fileCache)
      : null
    if (anchor) anchors.push(anchor)

    // 다운스트림 BFS — target 메서드에서 CHAIN_DEPTH 홉, 프로젝트 내부 호출만.
    const chainCandidates: z.infer<typeof HandlerDictEntrySchema>['chainCandidates'] = []
    const seenEdge = new Set<string>()
    let frontier = [target]
    const visited = new Set<string>([target])
    for (let depth = 0; depth < CHAIN_DEPTH && chainCandidates.length < CHAIN_CANDIDATE_CAP; depth++) {
      const next: string[] = []
      for (const caller of frontier) {
        const calls = (callsByCaller.get(caller) ?? [])
          .slice()
          .sort((a, b) => cmp(a.callerFile, b.callerFile) || cmp(a.callLine, b.callLine))
        for (const c of calls) {
          if (!c.calleeFile) continue // 프로젝트 내부 호출만(external 제외)
          const callee = `${c.calleeClass ?? '?'}#${c.calleeMethod}`
          const edgeKey = `${caller}->${callee}@${c.callerFile}:${c.callLine}`
          if (seenEdge.has(edgeKey)) continue
          seenEdge.add(edgeKey)
          const preCite = await extractPreCite(projectRoot, c.callerFile, c.callLine, fileCache)
          chainCandidates.push({ caller, callee, preCite })
          anchors.push({ filePath: c.callerFile, line: c.callLine })
          if (chainCandidates.length >= CHAIN_CANDIDATE_CAP) break
          if (!visited.has(callee)) {
            visited.add(callee)
            next.push(callee)
          }
        }
        if (chainCandidates.length >= CHAIN_CANDIDATE_CAP) break
      }
      frontier = next
    }
    dict.push({ target, routeEvidence, chainCandidates })
  }
  return { dict, anchors }
}

// ──────────────────────────────────────────────────────────────────────────
// prep
// ──────────────────────────────────────────────────────────────────────────

export interface PrepScreenFillOptions {
  /** 청크당 화면 수(기본 DEFAULT_CHUNK_SCREENS). */
  chunkScreens?: number
  /** 청크당 소스 슬라이스 문자 예산(기본 DEFAULT_CHUNK_CHAR_CAP). */
  charCap?: number
}

/** 도메인 그룹 키(null → 빈 문자열, 정렬 안정). */
function domainKey(domain: string | null): string {
  return domain ?? ''
}

/**
 * screens.json 을 팬아웃 청크로 분해해 `.spec/map/screens-fill-prep/` 에 영속한다.
 * 화면을 도메인(JSP 폴더 파생) 우선으로 그룹핑하고, 각 그룹을 chunkScreens 개
 * 단위로 자른다(주석을 화면에서 분리하지 않는다 — 화면 단위로만 자름). 각 청크에
 * 핸들러 사전(routes/method-calls 결정론 조인의 pre-cite)과 컨트롤러/서비스 소스
 * 슬라이스를 charCap 안에서 동봉한다. 기존 prep/*.json 은 전부 지우고 다시 쓴다
 * (청크 수 변경 시 낡은 청크 잔존 방지 — frag/ 는 재개 자산이라 보존).
 */
export async function prepScreenFill(
  projectRoot: string,
  options: PrepScreenFillOptions = {},
): Promise<{ index: ScreenFillChunkIndex; paths: string[] }> {
  const chunkScreens = options.chunkScreens ?? DEFAULT_CHUNK_SCREENS
  const charCap = options.charCap ?? DEFAULT_CHUNK_CHAR_CAP
  const file = readScreensFile(projectRoot)

  const prep = screenFillPrepDir(projectRoot)
  await mkdir(prep, { recursive: true })
  for (const name of (await readdir(prep).catch(() => [])).filter((n) => n.endsWith('.json'))) {
    await rm(join(prep, name))
  }

  // 화면을 도메인 우선으로 그룹핑(도메인 키 정렬 → 그룹 내 screenId 정렬).
  const byDomain = new Map<string, Screen[]>()
  for (const s of file.screens) {
    const k = domainKey(s.domain)
    const list = byDomain.get(k)
    if (list) list.push(s)
    else byDomain.set(k, [s])
  }
  const groups: Screen[][] = []
  for (const k of [...byDomain.keys()].sort(cmp)) {
    const screens = byDomain.get(k)!.slice().sort((a, b) => cmp(a.id, b.id))
    for (let i = 0; i < screens.length; i += chunkScreens) {
      groups.push(screens.slice(i, i + chunkScreens))
    }
  }

  const fileCache = new Map<string, string[] | null>()
  // 뷰 상수 실경로 해석용 KG JSP 목록(1회 로드, KG 부재 시 null → fs 폴백).
  const graphJsps = readGraphJsps(projectRoot)
  const entries: ScreenFillChunkIndex['chunks'] = []
  const paths: string[] = []
  let totalScreens = 0
  let totalAnnotations = 0
  let totalMissing = 0

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]
    const chunkId = `scr-${String(gi).padStart(3, '0')}`
    const domain = group[0]?.domain ?? null

    // 이 청크에 등장하는 핸들러 target → 앵커(주석의 기존 evidence file:line).
    const targets = new Map<string, HandlerAnchor | null>()
    for (const s of group) {
      for (const a of s.annotations) {
        const target = a.handler?.target ?? null
        if (!target) continue
        const ev = a.handler?.evidence?.[0]
        const anchor = ev ? { filePath: ev.file, line: ev.line } : null
        if (!targets.has(target) || (anchor && !targets.get(target))) {
          targets.set(target, anchor)
        }
      }
    }
    const { dict, anchors } = await buildHandlerDict(projectRoot, targets, fileCache)

    // 화면 골격(불변 사실 + 현재 채움 상태).
    const screens = group.map((s) => ({
      screenId: s.id,
      title: s.title,
      url: s.url,
      domain: s.domain,
      jspFile: s.jspFile,
      graphNodeId: s.graphNodeId,
      contentSignature: s.contentSignature,
      openedFrom: s.openedFrom,
      summary: s.summary,
      annotations: s.annotations.map((a: Annotation) => ({
        key: `${a.kind}:${a.no}`,
        kind: a.kind,
        label: a.label,
        eventType: a.eventType,
        target: a.handler?.target ?? null,
        confidence: a.handler?.confidence ?? null,
        description: a.description,
        note: a.note,
      })),
    }))

    // 소스 슬라이스: 핸들러 앵커 파일들을 relPath 정렬 순서로 charCap 까지.
    const anchorByRel = new Map<string, number>()
    for (const a of anchors) {
      const cur = anchorByRel.get(a.filePath)
      if (cur === undefined || a.line < cur) anchorByRel.set(a.filePath, a.line)
    }
    const relPaths = [...anchorByRel.keys()].sort(cmp)
    const files: BundleFile[] = []
    const sliceOmitted: string[] = []
    let used = 0
    for (const relPath of relPaths) {
      const anchorLine = anchorByRel.get(relPath) ?? 1
      let slice = await sliceFile(projectRoot, relPath, anchorLine, DEFAULT_SLICE_LINES)
      if (slice && used + slice.text.length > charCap) {
        slice = null
        sliceOmitted.push(relPath)
      }
      if (slice) used += slice.text.length
      files.push({ relPath, className: null, line: anchorLine, slice, kgHint: null })
    }

    // 뷰 상수 사전 — 슬라이스 창 밖의 상수 정의까지 전 파일 스캔(jspFile 채움 근거).
    const viewConstants = await scanViewConstants(projectRoot, relPaths, fileCache, graphJsps)

    const chunk: ScreenFillChunk = {
      schemaVersion: 1,
      gitCommit: file.gitCommit,
      chunkId,
      domain,
      screens,
      handlerDict: dict,
      files,
      sliceOmitted,
      viewConstants,
    }
    const filePath = chunkPath(projectRoot, chunkId)
    await writeFile(filePath, stableJson(ScreenFillChunkSchema.parse(chunk)), 'utf8')
    paths.push(filePath)

    const annotationCount = group.reduce((n, s) => n + s.annotations.length, 0)
    const handlerPreCiteMissing = dict.filter((d) => d.routeEvidence === null).length
    entries.push({
      chunkId,
      domain,
      screenIds: group.map((s) => s.id),
      annotationCount,
      handlerPreCiteMissing,
    })
    totalScreens += group.length
    totalAnnotations += annotationCount
    totalMissing += handlerPreCiteMissing
  }

  const index: ScreenFillChunkIndex = {
    schemaVersion: 1,
    gitCommit: file.gitCommit,
    chunkScreens,
    chunks: entries,
    totals: {
      screens: totalScreens,
      chunks: entries.length,
      annotations: totalAnnotations,
      handlerPreCiteMissing: totalMissing,
    },
  }
  await writeFile(
    join(prep, SCREEN_FILL_PREP_INDEX_FILENAME),
    stableJson(ScreenFillChunkIndexSchema.parse(index)),
    'utf8',
  )
  return { index, paths }
}

// ──────────────────────────────────────────────────────────────────────────
// audit
// ──────────────────────────────────────────────────────────────────────────

export interface ScreenFragmentAudit {
  complete: string[]
  incomplete: Array<{ chunkId: string; reason: string }>
}

/**
 * 조각 완결성 감사 — 존재 ∧ JSON ∧ 스키마 ∧ chunkId 정합 ∧ 커버리지(선언 화면 id +
 * 화면별 선언 주석 key 전수) ∧ 신뢰도(CONFIRMED/CONFIRMED_AI ⇒ evidence ≥ 1).
 * 완료의 진실은 이 감사가 결정한다(에이전트 ack 아님). `only` 로 부분 감사(스킵 가드용).
 */
export async function auditScreenFillFragments(
  projectRoot: string,
  only?: string[],
): Promise<ScreenFragmentAudit> {
  const index = await readScreenFillChunkIndex(projectRoot)
  const onlySet = only && only.length > 0 ? new Set(only) : null
  const complete: string[] = []
  const incomplete: Array<{ chunkId: string; reason: string }> = []

  for (const entry of index.chunks) {
    if (onlySet && !onlySet.has(entry.chunkId)) continue
    const fail = (reason: string) => incomplete.push({ chunkId: entry.chunkId, reason })

    let raw: string
    try {
      raw = await readFile(fragPath(projectRoot, entry.chunkId), 'utf8')
    } catch {
      fail('missing')
      continue
    }
    let frag: ScreenFillFragment
    try {
      frag = ScreenFillFragmentSchema.parse(JSON.parse(raw))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      fail(`schema: ${msg.slice(0, 300)}`)
      continue
    }
    if (frag.chunkId !== entry.chunkId) {
      fail(`chunkId-mismatch: ${frag.chunkId}`)
      continue
    }

    // 커버리지 + 신뢰도: 청크 골격과 대조(선언 화면·주석 전수, CONFIRMED⇒evidence).
    const chunk = ScreenFillChunkSchema.parse(
      JSON.parse(await readFile(chunkPath(projectRoot, entry.chunkId), 'utf8')),
    )
    const fragByScreen = new Map(frag.screens.map((s) => [s.screenId, s]))
    let coverageFail: string | null = null
    let evidenceFail: string | null = null
    for (const cs of chunk.screens) {
      const fs = fragByScreen.get(cs.screenId)
      if (!fs) {
        coverageFail = `screen 누락: ${cs.screenId}`
        break
      }
      const fragKeys = new Set(fs.annotations.map((a) => a.key))
      const missingAnn = cs.annotations.filter((a) => !fragKeys.has(a.key))
      if (missingAnn.length > 0) {
        coverageFail = `${cs.screenId} 주석 누락 ${missingAnn.length}/${cs.annotations.length}`
        break
      }
      for (const a of fs.annotations) {
        const conf = a.handler?.confidence
        if (
          conf &&
          CONFIRMED_CONFIDENCES.has(conf) &&
          (a.handler?.evidence.length ?? 0) === 0
        ) {
          evidenceFail = `${cs.screenId} ${a.key}: ${conf} 인데 evidence 비어 있음`
          break
        }
      }
      if (evidenceFail) break
    }
    if (coverageFail) {
      fail(`coverage: ${coverageFail}`)
      continue
    }
    if (evidenceFail) {
      fail(`evidence: ${evidenceFail}`)
      continue
    }
    complete.push(entry.chunkId)
  }
  complete.sort(cmp)
  incomplete.sort((a, b) => cmp(a.chunkId, b.chunkId))
  return { complete, incomplete }
}

// ──────────────────────────────────────────────────────────────────────────
// merge
// ──────────────────────────────────────────────────────────────────────────

export interface MergeScreenFillResult {
  screensPath: string
  /** 완결 조각으로 채움 반영된 화면 수. */
  screensFilled: number
  /** 청크 선언됐으나 완결 조각이 없어 미반영된 화면 id(부분 병합). */
  missingScreens: string[]
  /** 조각이 청크 선언 밖 화면/주석 key 를 내 버린 항목 수(유령 id — 병합서 제외). */
  droppedItems: number
  /** 인용 진위 검증에서 실파일과 불일치해 제거된 조각 신규 evidence 수. */
  citationsRemoved: number
  /** 인용 제거로 evidence 가 0 이 되어 CONFIRMED→INFERRED 강등된 handler 수(fail-closed). */
  handlersDemoted: number
  /** 병합 후 재계산한 unmatchedJsps(KG 있을 때). */
  unmatchedJsps: string[]
  /** 병합 후 validate 게이트 결과. */
  validation: ReturnType<typeof validateScreensFile>
  /** 병합 후 결정론 도메인 배정 요약(domain-assign.ts — 화면설계서 그룹 축). */
  domainAssign: DomainAssignSummary
  /** 병합 후 ViewResolver 해석 요약(view-resolve.ts — Spring 뷰 이름→JSP 실경로). */
  viewResolve: ViewResolveSummary
}

/** KG 가 있으면 unmatchedJsps 를 재계산한다(understand-screens.mjs recomputeUnmatched 동형). */
function recomputeUnmatched(projectRoot: string, screens: Screen[], fragments: string[]): string[] | null {
  const jsps = readGraphJsps(projectRoot)
  return jsps ? reconcileJsps(jsps, screens, fragments) : null
}

/**
 * 조각이 가져온 handler.evidence 진위를 실파일과 대조한다(map fill verify 와 동형).
 * 본체(Stage A 선기입)가 이미 갖고 있던 evidence(같은 file:line)는 건드리지 않고,
 * 조각이 **새로 추가한** evidence 만 검증한다: snippet 부재(검증 불가) 또는 실파일
 * 불일치(text-mismatch/no-file/line-out-of-range/path-escape/trivial)는 제거하고,
 * 검증 통과분만 남긴다. CONFIRMED/CONFIRMED_AI 인데 살아남은 evidence 가 0 이면
 * confidence 를 INFERRED 로 강등한다(fail-closed — 날조 인용으로 확정 등급을 못 얻게).
 */
async function verifyFragmentHandler(
  projectRoot: string,
  bodyHandler: Handler | null,
  fragHandler: Handler,
  cache: Map<string, FileCache>,
): Promise<{ handler: Handler; removed: number; demoted: boolean }> {
  const bodyKeys = new Set((bodyHandler?.evidence ?? []).map((e) => `${e.file}:${e.line}`))
  const kept: Handler['evidence'] = []
  let removed = 0
  for (const e of fragHandler.evidence) {
    if (bodyKeys.has(`${e.file}:${e.line}`)) {
      kept.push(e) // Stage A 선기입 인용 — 조각이 echo 해도 건드리지 않는다.
      continue
    }
    const snippet = (e.snippet ?? '').trim()
    if (snippet.length === 0) {
      removed++ // 스니펫 없는 조각 신규 인용 = 검증 불가(fail-closed).
      continue
    }
    const status = await verifyCitation(
      projectRoot,
      { filePath: e.file, line: e.line, snippet: e.snippet ?? '' },
      cache,
    )
    if (status === 'ok') kept.push(e)
    else removed++
  }
  let confidence = fragHandler.confidence
  let demoted = false
  if (CONFIRMED_CONFIDENCES.has(confidence) && kept.length === 0) {
    confidence = 'INFERRED'
    demoted = true
  }
  return { handler: { ...fragHandler, evidence: kept, confidence }, removed, demoted }
}

/**
 * 조각의 **채움 필드만** screens.json 본체에 병합한다. 불변 봉인 필드
 * (no/kind/selector/bbox/eventType/mechanical)는 본체 값을 유지하고, 조각이 담은
 * 채움 필드(screen: jspFile/graphNodeId/title/summary, annotation: description/note/
 * handler)만 반영한다. 청크 선언 밖 화면/주석 key 는 버리고 집계 보고한다. 완결
 * 조각이 없는 화면은 본체 그대로 둔다(부분 병합 — 재개 시 나머지 청크가 메운다).
 * 병합 후 unmatchedJsps 재계산(KG) + mechanicalHash 재산출(불변이라 동일) +
 * validateScreensFile 게이트로 최종 검증한다.
 */
export async function mergeScreenFillFragments(
  projectRoot: string,
): Promise<MergeScreenFillResult> {
  const file = readScreensFile(projectRoot)
  const index = await readScreenFillChunkIndex(projectRoot)
  const audit = await auditScreenFillFragments(projectRoot)
  const completeSet = new Set(audit.complete)

  // screenId → 조각 채움(완결 청크 + 청크 선언 화면만).
  const fillByScreen = new Map<string, z.infer<typeof FragmentScreenSchema>>()
  const declaredScreenIds = new Set<string>()
  const declaredAnnByScreen = new Map<string, Set<string>>()
  let droppedItems = 0
  const missingScreens: string[] = []

  for (const entry of index.chunks) {
    for (const sid of entry.screenIds) declaredScreenIds.add(sid)
    if (!completeSet.has(entry.chunkId)) {
      for (const sid of entry.screenIds) missingScreens.push(sid)
      continue
    }
    const chunk = ScreenFillChunkSchema.parse(
      JSON.parse(await readFile(chunkPath(projectRoot, entry.chunkId), 'utf8')),
    )
    for (const cs of chunk.screens) {
      declaredAnnByScreen.set(cs.screenId, new Set(cs.annotations.map((a) => a.key)))
    }
    const frag = ScreenFillFragmentSchema.parse(
      JSON.parse(await readFile(fragPath(projectRoot, entry.chunkId), 'utf8')),
    )
    const chunkScreenIds = new Set(chunk.screens.map((s) => s.screenId))
    for (const fs of frag.screens) {
      if (!chunkScreenIds.has(fs.screenId)) {
        droppedItems++
        continue
      }
      fillByScreen.set(fs.screenId, fs)
    }
  }

  // 본체 화면에 채움 반영(불변 필드 유지). 조각의 선언 밖 주석 key 는 드랍.
  // 조각이 가져온 handler.evidence 는 실파일 대조 후에만 실린다(진위 검증 게이트).
  const fileCache = new Map<string, FileCache>()
  let screensFilled = 0
  let citationsRemoved = 0
  let handlersDemoted = 0
  const mergedScreens: Screen[] = []
  for (const s of file.screens) {
    const fs = fillByScreen.get(s.id)
    if (!fs) {
      mergedScreens.push(s)
      continue
    }
    screensFilled++
    const declaredAnn = declaredAnnByScreen.get(s.id) ?? new Set<string>()
    const fillByKey = new Map<string, z.infer<typeof FragmentAnnotationSchema>>()
    for (const fa of fs.annotations) {
      if (!declaredAnn.has(fa.key)) {
        droppedItems++
        continue
      }
      fillByKey.set(fa.key, fa)
    }
    const annotations: Annotation[] = []
    for (const a of s.annotations) {
      const fa = fillByKey.get(`${a.kind}:${a.no}`)
      if (!fa) {
        annotations.push(a)
        continue
      }
      let handler = a.handler
      if (fa.handler !== undefined) {
        if (fa.handler === null) {
          handler = null
        } else {
          const v = await verifyFragmentHandler(projectRoot, a.handler, fa.handler, fileCache)
          handler = v.handler
          citationsRemoved += v.removed
          if (v.demoted) handlersDemoted++
        }
      }
      annotations.push({
        ...a, // 불변 봉인 필드(no/kind/selector/bbox/eventType/mechanical) 유지
        description: fa.description !== undefined ? fa.description : a.description,
        note: fa.note !== undefined ? fa.note : a.note,
        handler,
      })
    }
    mergedScreens.push({
      ...s,
      jspFile: fs.jspFile !== undefined ? fs.jspFile : s.jspFile,
      graphNodeId: fs.graphNodeId !== undefined ? fs.graphNodeId : s.graphNodeId,
      title: fs.title !== undefined ? fs.title : s.title,
      summary: fs.summary !== undefined ? fs.summary : s.summary,
      annotations,
    })
  }

  // 불변 봉인 재확인: 채움은 기계 필드를 건드리지 않으므로 해시가 그대로여야 한다.
  const newHash = computeMechanicalHash(mergedScreens, file.missing)
  if (newHash !== file.mechanicalHash) {
    throw new Error(
      `mechanicalHash 변동 감지 — 병합이 봉인 필드를 건드렸습니다(버그). ` +
        `기대 ${file.mechanicalHash.slice(0, 12)}… 실제 ${newHash.slice(0, 12)}…`,
    )
  }

  // ViewResolver 해석 — Spring 뷰 이름(조각의 jspFile)·미채움 jspFile 을 실경로로
  // 확정한 뒤 도메인을 배정한다(해석된 jspFile 이 뷰 폴더 파생의 입력이 되도록 순서 고정).
  const { screens: resolvedScreens, summary: viewResolve } = resolveScreenViews(
    mergedScreens,
    projectRoot,
  )

  // 결정론 도메인 배정 — domain 은 채움 필드(mechanical 밖)라 위 해시 검증과 무관.
  // LLM 조각 계약에는 domain 이 없다(의도) — 배정은 엔진 소유(domain-assign.ts).
  const { screens: assignedScreens, summary: domainAssign } = assignScreenDomains(
    resolvedScreens,
    loadDomainAssignContext(projectRoot),
  )

  // unmatchedJsps 재계산(KG 있을 때만) — 없으면 본체 값 보존.
  const recomputed = recomputeUnmatched(projectRoot, assignedScreens, file.fragments)
  const merged: ScreensFile = ScreensFileSchema.parse({
    ...file,
    screens: [...assignedScreens].sort((a, b) => a.id.localeCompare(b.id)),
    unmatchedJsps: recomputed ?? file.unmatchedJsps,
    mechanicalHash: newHash,
  })

  await writeFile(screensPath(projectRoot), stableJson(merged), 'utf8')

  missingScreens.sort(cmp)
  return {
    screensPath: screensPath(projectRoot),
    screensFilled,
    missingScreens,
    droppedItems,
    citationsRemoved,
    handlersDemoted,
    unmatchedJsps: merged.unmatchedJsps,
    validation: validateScreensFile(merged),
    domainAssign,
    viewResolve,
  }
}
