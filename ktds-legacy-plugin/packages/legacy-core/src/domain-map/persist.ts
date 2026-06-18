/**
 * `.spec/map/` 산출물 IO 헬퍼.
 *
 * 결정론(byte-identical) 보장: stableJson 으로 객체 키를 재귀 정렬하고
 * 2칸 들여쓰기 + 후행 개행으로 직렬화한다(배열 순서는 생산자가 이미 정렬).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConfirmedPlanSchema } from './types.js'
import type {
  CandidatesReport,
  CensusReport,
  ConfirmedPlan,
  DomainMapSummary,
  EdgesReport,
  MethodCallGraph,
  RoutesReport,
  SkeletonReport,
  SlicesReport,
  UaGraphEdge,
  UaGraphNode,
} from './types.js'

/** 확정 플랜 파일명(`.spec/map/` 하위) — S7 사람 게이트 결정의 영속 닻. */
export const CONFIRMED_PLAN_FILENAME = 'domain-plan.confirmed.json'

/** `.spec/map/` 디렉터리 경로. */
export function specMapDir(projectRoot: string): string {
  return join(projectRoot, '.spec', 'map')
}

/** 현재 git 커밋 해시(HEAD). git 저장소가 아니거나 실패하면 null. */
export function gitCommitHash(projectRoot: string): string | null {
  try {
    const out = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const hash = out.trim()
    return hash.length > 0 ? hash : null
  } catch {
    return null
  }
}

/** 객체 키를 재귀 정렬한 사본을 만든다(배열 순서는 유지). */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => sortKeysDeep(v))
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key])
    }
    return out
  }
  return value
}

/**
 * 안정 JSON 직렬화 — 키 재귀 정렬, 2칸 들여쓰기, 후행 개행.
 * 동일 입력 -> byte-identical 출력.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + '\n'
}

/** `.spec/map/<fileName>` 에 안정 JSON 을 기록(`.spec/map/` mkdir -p 선행). */
function writeReport(projectRoot: string, fileName: string, report: unknown): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, fileName), stableJson(report), 'utf8')
}

/** census.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeCensus(projectRoot: string, report: CensusReport): void {
  writeReport(projectRoot, 'census.json', report)
}

/** routes.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeRoutes(projectRoot: string, report: RoutesReport): void {
  writeReport(projectRoot, 'routes.json', report)
}

/** edges.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeEdges(projectRoot: string, report: EdgesReport): void {
  writeReport(projectRoot, 'edges.json', report)
}

/** slices.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeSlices(projectRoot: string, report: SlicesReport): void {
  writeReport(projectRoot, 'slices.json', report)
}

/** candidates.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeCandidates(projectRoot: string, report: CandidatesReport): void {
  writeReport(projectRoot, 'candidates.json', report)
}

/**
 * domain-plan.confirmed.json 기록(`.spec/map/` mkdir -p 선행).
 * 기록한 파일의 절대 경로를 반환한다.
 */
export function writeConfirmedPlan(projectRoot: string, plan: ConfirmedPlan): string {
  writeReport(projectRoot, CONFIRMED_PLAN_FILENAME, plan)
  return join(specMapDir(projectRoot), CONFIRMED_PLAN_FILENAME)
}

/**
 * domain-plan.confirmed.json 을 읽는다. 파일이 없으면 null.
 * 권한/IO 오류는 던진다(fail-closed: "미확정"으로 오인하지 않음).
 * 스키마 검증으로 손편집/버전 스큐를 조용히 통과시키지 않는다(zod parse).
 */
export function readConfirmedPlan(projectRoot: string): ConfirmedPlan | null {
  const file = join(specMapDir(projectRoot), CONFIRMED_PLAN_FILENAME)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return ConfirmedPlanSchema.parse(JSON.parse(raw))
}

/** skeleton.json 기록(`.spec/map/` mkdir -p 선행) — S6 결정론 골격의 영속. */
export function writeSkeleton(projectRoot: string, report: SkeletonReport): void {
  writeReport(projectRoot, 'skeleton.json', report)
}

/** method-calls.json 기록(`.spec/map/` mkdir -p 선행) — P3 메서드 단위 호출 그래프. */
export function writeMethodCalls(projectRoot: string, report: MethodCallGraph): void {
  writeReport(projectRoot, 'method-calls.json', report)
}

/** domain-map.json 파일명(`.spec/map/` 하위) — AC-3 도메인 맵 요약. */
export const DOMAIN_MAP_SUMMARY_FILENAME = 'domain-map.json'

/** domain-map.json 기록(`.spec/map/` mkdir -p 선행) — AC-3 도메인 맵 요약(E-a/E-b/E-c 결합). */
export function writeDomainMapSummary(projectRoot: string, report: DomainMapSummary): void {
  writeReport(projectRoot, DOMAIN_MAP_SUMMARY_FILENAME, report)
}

/** `.understand-anything/` 디렉터리 경로 — dual-load 오버레이가 사는 곳(`.spec` 아님). */
export function uaDir(projectRoot: string): string {
  return join(projectRoot, '.understand-anything')
}

/** dual-load 오버레이 파일명 — orchestrator(loadProjectGraph)가 fetch 하는 경로. */
export const DOMAIN_GRAPH_FILENAME = 'domain-graph.json'

/**
 * domain-graph.json 기록 — `.understand-anything/`(NOT `.spec`)에 { nodes, edges }
 * 구조 오버레이를 쓴다. dual-load(orchestrator)가 이 파일을 읽어 UA KG 와 병합한다.
 * 기록한 파일의 절대 경로를 반환한다.
 *
 * 주: P2 는 name 이 공란(SKELETON_BLANK)인 구조 골격만 emit 한다. LLM 채움(S8)·
 * 인용 검증(S9)이 P4 에서 name/summary 를 enrich 한다. 대시보드/dual-load 가
 * P2 시점에 데이터를 갖도록 골격을 먼저 emit 하는 것이 목적이다.
 */
export function writeDomainGraph(
  projectRoot: string,
  graph: { nodes: UaGraphNode[]; edges: UaGraphEdge[] },
): string {
  const dir = uaDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, DOMAIN_GRAPH_FILENAME)
  writeFileSync(filePath, stableJson(graph), 'utf8')
  return filePath
}
