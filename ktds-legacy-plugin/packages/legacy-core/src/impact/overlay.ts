/**
 * 영향도 대시보드 오버레이(impact-overlay.json) 브리지.
 *
 * 엔진 산출 `impact.json`(relPath 기반 도달성) → 대시보드 구조 탭이 읽는
 * `{changedNodeIds, affectedNodeIds}`(knowledge-graph 노드 id 기반) 오버레이로 변환한다.
 *   changed  = 시드(변경 원점)         → 그래프에서 진하게(색칠).
 *   affected = 상류∪하류∪API∪영속성   → 영향 색으로 강조, 나머지는 흐려짐.
 *
 * 매핑은 추측하지 않는다: knowledge-graph.json 의 파일성 노드(file/config/…)에서
 * relPath → nodeId 인덱스를 만들어 그대로 조회한다(엔진의 prefix 규칙 미가정).
 * 인덱스에 없는 relPath 는 조용히 버리지 않고 unresolved 로 노출한다(투명성).
 *
 * 결정론: 모든 배열 정렬·dedup, 타임스탬프 없음 → 동일 commit+seeds 면 byte-diff=0.
 * generatedAt 을 싣지 않으므로 대시보드 store 는 빈 문자열로 보고(자동 활성 영향 없음,
 * changed>0 이면 토글 점등).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { stableJson, uaDir } from '../domain-map/persist.js'
import type { ImpactResult } from './types.js'
import { cmp } from '../utils/cmp.js'

export const IMPACT_OVERLAY_FILENAME = 'impact-overlay.json'

/**
 * 파일성 노드 타입 우선순위 — 한 relPath 가 여러 노드를 가질 때(드묾) 파일 대표
 * 노드를 고르고 function/class 같은 하위 심볼 노드는 배제한다. 앞일수록 우선.
 */
const FILE_NODE_TYPES = ['file', 'config', 'document', 'schema'] as const

export const ImpactOverlaySchema = z.object({
  schemaVersion: z.literal(1),
  /** 변경 원점(시드) 노드 id, 정렬·dedup. */
  changedNodeIds: z.array(z.string()),
  /** 영향받는 노드 id(상류∪하류∪API∪영속성), changed 제외, 정렬·dedup. */
  affectedNodeIds: z.array(z.string()),
  /** KG 인덱스에 매핑되지 않은 relPath(조용한 누락 방지), 정렬·dedup. */
  unresolved: z.array(z.string()),
  /** 출처 메타(투명성) — gitCommit + 규모. */
  ktdsImpact: z.object({
    gitCommit: z.string().nullable(),
    seedCount: z.number().int().nonnegative(),
    upstreamFileCount: z.number().int().nonnegative(),
    downstreamFileCount: z.number().int().nonnegative(),
  }),
})
export type ImpactOverlay = z.infer<typeof ImpactOverlaySchema>

/** KG 노드 배열 → relPath → nodeId 인덱스. 파일성 노드 우선순위로 대표 노드 선택. */
export function buildKgNodeIndex(
  nodes: ReadonlyArray<{ id?: unknown; type?: unknown; filePath?: unknown }>,
): Map<string, string> {
  const rank = (t: string): number => {
    const i = (FILE_NODE_TYPES as readonly string[]).indexOf(t)
    return i < 0 ? FILE_NODE_TYPES.length : i
  }
  // relPath → {rank, id} 최선 후보. rank 낮을수록(파일성) 우선, 동률은 id 사전순.
  const best = new Map<string, { rank: number; id: string }>()
  for (const n of nodes) {
    if (typeof n.id !== 'string' || typeof n.filePath !== 'string' || typeof n.type !== 'string') continue
    const r = rank(n.type)
    // function/class 등 비-파일성 노드는 파일 대표가 될 수 없다 → 배제.
    if (r >= FILE_NODE_TYPES.length) continue
    const prev = best.get(n.filePath)
    if (!prev || r < prev.rank || (r === prev.rank && n.id < prev.id)) {
      best.set(n.filePath, { rank: r, id: n.id })
    }
  }
  const idx = new Map<string, string>()
  for (const [relPath, v] of best) idx.set(relPath, v.id)
  return idx
}

/** impact.json 이 참조하는 모든 영향 relPath(시드 제외) — affected 후보. */
function affectedRelPaths(result: ImpactResult): string[] {
  const out: string[] = []
  for (const f of result.upstream.files) out.push(f.relPath)
  for (const f of result.downstream.files) out.push(f.relPath)
  for (const a of result.upstream.api) out.push(a.filePath)
  for (const m of result.upstream.persistence.mappers) out.push(m.relPath)
  for (const s of result.upstream.persistence.sqlFiles) out.push(s.relPath)
  for (const t of result.upstream.persistence.jpaTables) out.push(t.relPath)
  return out
}

/**
 * 순수 변환: impact 결과 + KG 인덱스 → 오버레이. IO 없음(테스트 가능).
 * affected 에서 시드(changed)는 제외한다(이중 색칠 방지). 매핑 실패 relPath 는 unresolved.
 */
export function buildImpactOverlay(
  result: ImpactResult,
  kgIndex: ReadonlyMap<string, string>,
): ImpactOverlay {
  const unresolved = new Set<string>()
  const resolve = (relPath: string): string | null => {
    const id = kgIndex.get(relPath)
    if (id === undefined) {
      unresolved.add(relPath)
      return null
    }
    return id
  }

  const changedSet = new Set<string>()
  for (const s of result.seeds) {
    const id = resolve(s.relPath)
    if (id !== null) changedSet.add(id)
  }

  const affectedSet = new Set<string>()
  for (const relPath of affectedRelPaths(result)) {
    const id = resolve(relPath)
    if (id !== null && !changedSet.has(id)) affectedSet.add(id)
  }

  return ImpactOverlaySchema.parse({
    schemaVersion: 1,
    changedNodeIds: [...changedSet].sort(cmp),
    affectedNodeIds: [...affectedSet].sort(cmp),
    unresolved: [...unresolved].sort(cmp),
    ktdsImpact: {
      gitCommit: result.gitCommit,
      seedCount: result.seeds.length,
      upstreamFileCount: result.upstream.files.length,
      downstreamFileCount: result.downstream.files.length,
    },
  })
}

/** knowledge-graph.json 로드 → 노드 인덱스. 없거나 깨지면 빈 인덱스(graceful). */
export function loadKgNodeIndex(projectRoot: string): Map<string, string> {
  const p = join(uaDir(projectRoot), 'knowledge-graph.json')
  let raw: string
  try {
    raw = readFileSync(p, 'utf8')
  } catch {
    return new Map()
  }
  let g: { nodes?: Array<Record<string, unknown>> }
  try {
    g = JSON.parse(raw)
  } catch {
    return new Map()
  }
  return buildKgNodeIndex(g.nodes ?? [])
}

/**
 * 오버레이를 `.understand-anything/impact-overlay.json` 에 쓴다(대시보드 fetch 경로).
 * stableJson 으로 결정론 직렬화. 기록한 절대 경로 반환. KG 인덱스가 비어 changedNodeIds
 * 가 0건이면(KG 미조인) 그대로 쓴다 — 대시보드 store 가 빈 채널로 보고 토글을 비활성한다.
 */
export function writeImpactOverlay(projectRoot: string, overlay: ImpactOverlay): string {
  const dir = uaDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, IMPACT_OVERLAY_FILENAME)
  writeFileSync(filePath, stableJson(overlay), 'utf8')
  return filePath
}

/**
 * 편의 IO 래퍼: KG 인덱스 로드 → 오버레이 빌드 → 기록. analyze 흐름에서 호출.
 * KG 부재 시 빈 인덱스로 진행(unresolved 에 전부 적재 + changed 0 → 비활성 오버레이).
 */
export function emitImpactOverlay(projectRoot: string, result: ImpactResult): {
  overlay: ImpactOverlay
  overlayPath: string
} {
  const overlay = buildImpactOverlay(result, loadKgNodeIndex(projectRoot))
  const overlayPath = writeImpactOverlay(projectRoot, overlay)
  return { overlay, overlayPath }
}
