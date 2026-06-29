/**
 * domain-map 라우트 추출 오케스트레이션.
 *
 * census -> 각 .java 파일 1회 파싱(상수/composed 레지스트리 구축 후 추출) ->
 * Spring 추출 + Next.js 추출 -> routeId 할당 -> 전순서 정렬 ->
 * contextPath 해소 -> routes.json/census.json 기록.
 * 배치(batch)는 @Scheduled / public static void main 만 결정론적으로 탐지한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Node } from 'web-tree-sitter'
import { buildCensus } from './census.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { buildCandidates } from './classify.js'
import { buildMethodCallGraph } from './method-calls.js'
import {
  readConfirmedPlan,
  writeCandidates,
  writeCensus,
  writeDashboardConfig,
  writeEdges,
  writeMapArtifact,
  writeMethodCalls,
  writeRoutes,
  writeSkeleton,
  writeSlices,
} from './persist.js'
import { extractJpaModel } from '../jpa/extract.js'
import { JPA_MODEL_FILENAME } from '../jpa/types.js'
import { extractDbSchema, writeDbSchema } from '../db-schema/index.js'
import type { DbSchemaModel } from '../db-schema/index.js'
import { buildCoverageReport } from '../coverage-report/index.js'
import { computeFileFingerprints } from '../incremental/index.js'
import { readSkeleton } from './persist.js'

/** `.spec/map/` 통합 커버리지 리포트 파일명(보완 D-c). */
export const COVERAGE_FILENAME = 'coverage.json'
/** `.spec/map/` 증분 재스캔용 파일 fingerprint 스냅샷 파일명(보완 D-b). */
export const FINGERPRINTS_FILENAME = 'fingerprints.json'
import { buildSkeleton } from './skeleton.js'
import { emitDomainGraph } from './emit.js'
import { assignRouteIds, sortBatchEntries, sortRoutes } from './route-key.js'
import { parseSource } from './tree-sitter.js'
import { extractNextjsRoutes } from './routes/nextjs.js'
import { extractStripesRoutes } from './routes/stripes.js'
import { extractJspRoutes } from './routes/jsp.js'
import { extractWebXmlRoutesFromCensus } from './routes/web-xml.js'
import { extractJavaBatchEntries, extractXmlBatchEntries } from './routes/batch.js'
import {
  collectComposedAnnotations,
  collectConstants,
  extractSpringRoutes,
  type SpringContext,
} from './routes/spring.js'
import type {
  BatchEntry,
  CandidatesReport,
  CensusReport,
  ConfirmedPlan,
  EdgesReport,
  MethodCallGraph,
  RouteEntry,
  RouteMethod,
  SkeletonReport,
  SlicesReport,
} from './types.js'

/** 프로젝트 루트에서 라우트/배치 보고를 추출한다(파일 기록 없음). */
export async function extractRoutes(
  projectRoot: string,
  census: CensusReport,
): Promise<{
  schemaVersion: 1
  gitCommit: string | null
  contextPath: string | null
  routes: RouteEntry[]
  batchEntries: BatchEntry[]
}> {
  const javaFiles = census.files.filter((f) => f.lang === 'java')

  // 1) 모든 Java 파일 1회 파싱(루트 노드 캐시).
  const parsed = new Map<string, Node>()
  for (const f of javaFiles) {
    try {
      const src = readFileSync(join(projectRoot, f.relPath), 'utf8')
      parsed.set(f.relPath, await parseSource('java', src))
    } catch {
      // 파싱 실패 파일은 조용히 건너뛰지 않고 단순 제외(증거 없는 라우트 금지).
    }
  }

  // 2) 상수 + composed 레지스트리 구축(전 파일 스캔).
  const ctx: SpringContext = {
    constants: new Map<string, string>(),
    composedVerb: new Map<string, RouteMethod | undefined>(),
    composedStereotype: new Set<string>(),
  }
  for (const root of parsed.values()) {
    collectConstants(root, ctx.constants)
    collectComposedAnnotations(root, ctx.composedVerb, ctx.composedStereotype)
  }

  // 3) Java 기반 추출(Spring 라우트 + Stripes 라우트 + Java 배치 진입점).
  //    relPath 정렬 순회로 결정론을 보장한다.
  const routes: RouteEntry[] = []
  const batchEntries: BatchEntry[] = []
  const sortedJava = [...parsed.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const relPath of sortedJava) {
    const root = parsed.get(relPath)!
    routes.push(...extractSpringRoutes(root, relPath, ctx))
    routes.push(...extractStripesRoutes(root, relPath))
    batchEntries.push(...extractJavaBatchEntries(root, relPath))
  }

  // 4) Next.js 라우트 추출(census 기반).
  routes.push(...(await extractNextjsRoutes(projectRoot, census)))

  // 5) JSP 페이지 + web.xml 서블릿 라우트(census 기반).
  routes.push(...extractJspRoutes(census))
  routes.push(...extractWebXmlRoutesFromCensus(projectRoot, census))

  // 6) XML 배치 진입점(Quartz CronTrigger / task:scheduled). xml census 파일 스캔.
  const sortedXml = census.files
    .filter((f) => f.lang === 'xml')
    .map((f) => f.relPath)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const relPath of sortedXml) {
    let text: string
    try {
      text = readFileSync(join(projectRoot, relPath), 'utf8')
    } catch {
      continue
    }
    batchEntries.push(...extractXmlBatchEntries(text, relPath))
  }

  // 7) routeId 할당 + 정렬.
  const sortedRoutes = sortRoutes(routes)
  assignRouteIds(sortedRoutes)
  const finalRoutes = sortRoutes(sortedRoutes)

  return {
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    contextPath: readContextPath(projectRoot),
    routes: finalRoutes,
    batchEntries: sortBatchEntries(batchEntries),
  }
}

/** buildCensus -> extractRoutes -> 기록. census/routes 반환. */
export async function scanRoutes(projectRoot: string): Promise<{
  census: CensusReport
  routes: Awaited<ReturnType<typeof extractRoutes>>
}> {
  const census = buildCensus(projectRoot)
  const routes = await extractRoutes(projectRoot, census)
  writeCensus(projectRoot, census)
  writeRoutes(projectRoot, routes)
  return { census, routes }
}

/**
 * 전체 domain-map 스캔: census -> routes -> edges -> slices -> candidates.
 * 다섯 산출물을 `.spec/map/` 에 기록하고 모두 반환한다(결정론).
 * 후보(candidates)는 빌드/기록만 한다 — 확정(confirm)은 별도 사람 게이트 단계다(자동 확정 금지).
 */
export async function scanDomainMap(projectRoot: string): Promise<{
  census: CensusReport
  routes: Awaited<ReturnType<typeof extractRoutes>>
  edges: EdgesReport
  slices: SlicesReport
  candidates: CandidatesReport
  dbSchema: DbSchemaModel
}> {
  const census = buildCensus(projectRoot)
  const routes = await extractRoutes(projectRoot, census)
  const edges = await extractEdges(projectRoot, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  writeCensus(projectRoot, census)
  writeRoutes(projectRoot, routes)
  writeEdges(projectRoot, edges)
  writeSlices(projectRoot, slices)
  writeCandidates(projectRoot, candidates)
  // 보완 B(JPA): jpa-model.json 도 스캔 시 산출 — impact db-grounding 이 동기 로드한다.
  // (JPA 신호 없는 프로젝트는 entities/repositories 빈 배열. MyBatis 와 공존, AC-16b.)
  const jpaModel = await extractJpaModel(projectRoot, census)
  writeMapArtifact(projectRoot, JPA_MODEL_FILENAME, jpaModel)
  // PA1: db-schema(정적 .sql DDL/dataload + 라이브 신호 정적 탐지) — map 이 단독 소유.
  // jpa-model 과 동형(census 파생·scan 시점·.spec/map/ 기록). 소비자(docs/policy)는 로드만.
  const dbSchema = extractDbSchema(projectRoot, census)
  writeDbSchema(projectRoot, dbSchema)
  // 보완 D-c/D-b: 통합 커버리지 리포트 + 파일 fingerprint 스냅샷(증분 재스캔 기준).
  const coverage = buildCoverageReport({
    census,
    routes,
    edges,
    slices,
    skeleton: readSkeleton(projectRoot),
    jpaModel,
  })
  writeMapArtifact(projectRoot, COVERAGE_FILENAME, coverage)
  writeMapArtifact(projectRoot, FINGERPRINTS_FILENAME, computeFileFingerprints(projectRoot, census))
  return { census, routes, edges, slices, candidates, dbSchema }
}

/**
 * 전체 도메인 맵 빌드 — 스캔 후 확정 플랜이 있으면 skeleton/emit 까지.
 *
 * 1) scanDomainMap(census→routes→edges→slices→candidates, `.spec/map/` 기록).
 * 2) readConfirmedPlan:
 *    - 플랜 있음  → buildSkeleton + emitDomainGraph + writeSkeleton.
 *                   skeleton.json(`.spec/map/`) + domain-graph.json(`.understand-anything/`).
 *    - 플랜 없음  → 스캔 결과만 반환(needsConfirm=true). 자동 확정하지 않는다
 *                   (사람 게이트 필수 — /understand-map confirm).
 */
export async function buildMap(
  projectRoot: string,
  options: { stepCap?: number } = {},
): Promise<
  | {
      needsConfirm: true
      census: CensusReport
      routes: Awaited<ReturnType<typeof extractRoutes>>
      edges: EdgesReport
      slices: SlicesReport
      candidates: CandidatesReport
    }
  | {
      needsConfirm: false
      census: CensusReport
      routes: Awaited<ReturnType<typeof extractRoutes>>
      edges: EdgesReport
      slices: SlicesReport
      candidates: CandidatesReport
      plan: ConfirmedPlan
      skeleton: SkeletonReport
      methodCallGraph: MethodCallGraph
    }
> {
  const scan = await scanDomainMap(projectRoot)
  const plan = readConfirmedPlan(projectRoot)
  if (!plan) {
    return { needsConfirm: true, ...scan }
  }
  // P3: 메서드 단위 호출 그래프 빌드/기록 후 skeleton refinement 로 전달.
  // 트레이스가 핸들러에서 프로젝트 파일로 해소되면 step 이 메서드 정밀이 되고,
  // 아니면 skeleton 내부에서 슬라이스 파일 단위로 폴백한다(P2 동작 유지).
  const methodCallGraph = await buildMethodCallGraph(projectRoot, scan.census)
  writeMethodCalls(projectRoot, methodCallGraph)
  const skeleton = await buildSkeleton(
    projectRoot,
    {
      census: scan.census,
      routes: scan.routes,
      edges: scan.edges,
      slices: scan.slices,
      candidates: scan.candidates,
      plan,
      methodCallGraph,
    },
    options,
  )
  writeSkeleton(projectRoot, skeleton)
  emitDomainGraph(projectRoot, skeleton)
  // 대시보드 UI 언어를 사용자 설정(기본 ko)으로 오버레이 — UA 코어의 "en" 기본 무력화.
  writeDashboardConfig(projectRoot)
  return { needsConfirm: false, ...scan, plan, skeleton, methodCallGraph }
}

/** server.servlet.context-path 를 properties/yaml 에서 best-effort 로 읽는다. */
function readContextPath(projectRoot: string): string | null {
  const candidates = [
    'src/main/resources/application.properties',
    'src/main/resources/application.yml',
    'src/main/resources/application.yaml',
    'application.properties',
    'application.yml',
    'application.yaml',
  ]
  for (const rel of candidates) {
    const abs = join(projectRoot, rel)
    if (!existsSync(abs)) continue
    let text: string
    try {
      text = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    if (rel.endsWith('.properties')) {
      const m = text.match(/^\s*server\.servlet\.context-path\s*[=:]\s*(.+?)\s*$/m)
      if (m) return m[1].trim()
    } else {
      // 단순 yaml: server: \n  servlet: \n    context-path: /foo
      const m = text.match(/context-path\s*:\s*(.+?)\s*$/m)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  return null
}
