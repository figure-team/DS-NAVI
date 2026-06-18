/**
 * 역/정 도달성 코어 — slices.ts BFS 를 거울 반전한 순수 함수.
 *
 * edges.json 은 FORWARD 의존(source 가 target 에 의존)이므로:
 *   reverse BFS from seed = upstream(시드에 의존하는 호출자 = 영향받음),
 *   forward BFS from seed = downstream(시드가 의존하는 협력자 = 보조).
 * 결정론: 인접 정렬·visited Set·출력 정렬로 BFS 방문 순서가 산출에 누출되지 않는다.
 * 부수효과 0(파일 IO 없음) — 인용 스니펫은 엔진(IO)이 채운다.
 */
import type { EdgeKind, EdgeRecord } from '../domain-map/types.js'
import { cmp } from '../utils/cmp.js'

export type ReachDirection = 'reverse' | 'forward'

export interface AdjEntry {
  /** 이 방향으로 간선을 따라갔을 때 도달하는 이웃 파일. */
  relPath: string
  kind: EdgeKind
  /** 의존이 적힌 소스 파일의 1-based 근거 라인(없으면 null). */
  line: number | null
  /**
   * 근거 라인을 가진 파일 — 항상 간선의 source(의존이 적힌 쪽). 방향에 따라
   * 의미가 다르다: reverse 에선 evidenceFile===이웃(영향 파일이 시드측을 참조하는
   * 라인), forward 에선 evidenceFile===key(시드측이 협력자를 부르는 라인).
   */
  evidenceFile: string
}

export interface ReachedFile {
  relPath: string
  /** 가장 가까운 시드로부터의 최단 BFS 거리(1 = 직접 이웃). */
  minDepth: number
  /** 이 파일을 폐포에 들인 간선 종류들, 정렬. */
  viaKinds: EdgeKind[]
  /** 근거 인용(filePath:line) — line 없는 간선만으로 도달 시 null. */
  citation: { filePath: string; line: number } | null
}

/**
 * 방향별 인접 리스트. reverse: key=target → 이웃=source(그 target 에 의존하는 파일).
 * forward: key=source → 이웃=target. 근거 파일은 어느 방향이든 간선의 source.
 * allowedKinds 로 약신호(import 등)를 거른다.
 */
export function buildAdjacency(
  edges: readonly EdgeRecord[],
  allowedKinds: ReadonlySet<EdgeKind>,
  direction: ReachDirection,
): Map<string, AdjEntry[]> {
  const adj = new Map<string, AdjEntry[]>()
  for (const e of edges) {
    if (!allowedKinds.has(e.kind)) continue
    const key = direction === 'reverse' ? e.target : e.source
    const neighbor = direction === 'reverse' ? e.source : e.target
    const entry: AdjEntry = {
      relPath: neighbor,
      kind: e.kind,
      line: e.line,
      evidenceFile: e.source,
    }
    const list = adj.get(key)
    if (list) list.push(entry)
    else adj.set(key, [entry])
  }
  for (const list of adj.values()) {
    list.sort(
      (a, b) => cmp(a.relPath, b.relPath) || cmp(a.kind, b.kind) || (a.line ?? -1) - (b.line ?? -1),
    )
  }
  return adj
}

/**
 * 시드 집합에서 인접을 따라 도달하는 모든 파일(시드 자신 제외). minDepth 는 최단
 * 발견 깊이, viaKinds 는 폐포 내 선행 노드에서 이 파일로 들어온 모든 간선 종류의
 * 합집합, citation 은 그 중 가장 이른(작은 라인) 근거. depthCap hop 제한.
 */
export function reachClosure(
  seeds: readonly string[],
  adjacency: Map<string, AdjEntry[]>,
  depthCap: number,
): ReachedFile[] {
  const seedSet = new Set(seeds)
  const info = new Map<
    string,
    { minDepth: number; kinds: Set<EdgeKind>; citation: { filePath: string; line: number } | null }
  >()
  const visited = new Set<string>(seeds)
  let frontier = [...seedSet].sort(cmp)

  for (let depth = 1; depth <= depthCap && frontier.length > 0; depth++) {
    const next: string[] = []
    for (const u of frontier) {
      for (const entry of adjacency.get(u) ?? []) {
        const v = entry.relPath
        if (seedSet.has(v)) continue // 시드는 영향 대상이 아니라 변경의 원점
        let rec = info.get(v)
        if (!rec) {
          rec = { minDepth: depth, kinds: new Set(), citation: null }
          info.set(v, rec)
        }
        rec.kinds.add(entry.kind)
        if (entry.line !== null) {
          const better =
            rec.citation === null ||
            entry.line < rec.citation.line ||
            (entry.line === rec.citation.line && entry.evidenceFile < rec.citation.filePath)
          if (better) rec.citation = { filePath: entry.evidenceFile, line: entry.line }
        }
        if (!visited.has(v)) {
          visited.add(v)
          next.push(v)
        }
      }
    }
    frontier = next.sort(cmp)
  }

  return [...info.entries()]
    .map(([relPath, rec]) => ({
      relPath,
      minDepth: rec.minDepth,
      viaKinds: [...rec.kinds].sort(cmp),
      citation: rec.citation,
    }))
    .sort((a, b) => cmp(a.relPath, b.relPath))
}

/**
 * fan-in(f) = f 에 의존하는 서로 다른 source 수(target 으로서의 진입차수).
 * 높은 fan-in 은 hub(공용 유틸/예외/상수) — 폐포에 들면 역방향 영향을 폭발시키므로
 * 엔진이 임계 초과분을 overEdges/needsReview 로 표면화한다.
 */
export function computeFanIn(
  edges: readonly EdgeRecord[],
  allowedKinds: ReadonlySet<EdgeKind>,
): Map<string, number> {
  const dependents = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!allowedKinds.has(e.kind)) continue
    if (e.source === e.target) continue
    let set = dependents.get(e.target)
    if (!set) {
      set = new Set()
      dependents.set(e.target, set)
    }
    set.add(e.source)
  }
  const out = new Map<string, number>()
  for (const [f, set] of dependents) out.set(f, set.size)
  return out
}
