/**
 * SLICES 단계 — 라우트/배치 루트에서 엣지를 BFS 로 따라가 도달 파일을 모은다.
 *
 * 루트 = 라우트 또는 배치 엔트리를 "선언한" census 파일.
 * entryIds = 그 루트가 선언한 routeId/entryId(정렬).
 * BFS 는 엣지를 source->target 방향(전진)으로 따르며 depthCap 까지 확장한다.
 * ownership = 각 census 파일을 도달하는 루트 집합(정렬), 상태 sole/shared/unreached.
 * 슬라이스는 root, ownership 은 relPath 로 정렬해 결정론을 보장한다.
 */
import type {
  CensusReport,
  EdgesReport,
  Ownership,
  RoutesReport,
  SliceRecord,
  SlicesReport,
} from './types.js'

/** 기본 BFS 깊이 상한. */
export const DEFAULT_DEPTH_CAP = 12

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(cmp)
}

/** census/routes/edges 로 슬라이스/소유권을 만든다. */
export function buildSlices(
  census: CensusReport,
  routes: Pick<RoutesReport, 'routes' | 'batchEntries'>,
  edges: Pick<EdgesReport, 'edges'>,
  depthCap: number = DEFAULT_DEPTH_CAP,
): SlicesReport {
  // 1) 루트 -> entryIds 수집(라우트 + 배치).
  const entriesByRoot = new Map<string, Set<string>>()
  const addEntry = (relPath: string, entryId: string): void => {
    let set = entriesByRoot.get(relPath)
    if (!set) {
      set = new Set<string>()
      entriesByRoot.set(relPath, set)
    }
    set.add(entryId)
  }
  for (const r of routes.routes) addEntry(r.filePath, r.routeId)
  for (const b of routes.batchEntries) {
    addEntry(b.filePath, b.entryId)
    // W2: 해석된 잡 구현 파일도 루트로 — XML 엔트리의 filePath(XML)는 엣지가 없어
    // 잡 클래스가 미도달(데드코드)로 오판되던 것을 제거한다.
    if (b.handlerFile && b.handlerFile !== b.filePath) addEntry(b.handlerFile, b.entryId)
  }

  // 2) 인접 리스트(source -> target[]).
  const adj = new Map<string, string[]>()
  for (const e of edges.edges) {
    let list = adj.get(e.source)
    if (!list) {
      list = []
      adj.set(e.source, list)
    }
    list.push(e.target)
  }

  // 3) 각 루트에서 BFS(depthCap 까지). root 도 reached 에 포함.
  const roots = [...entriesByRoot.keys()].sort(cmp)
  const slices: SliceRecord[] = []
  for (const root of roots) {
    const reached = new Set<string>([root])
    let frontier: string[] = [root]
    let depth = 0
    while (frontier.length > 0 && depth < depthCap) {
      const next: string[] = []
      for (const node of frontier) {
        const targets = adj.get(node)
        if (!targets) continue
        for (const t of targets) {
          if (!reached.has(t)) {
            reached.add(t)
            next.push(t)
          }
        }
      }
      frontier = next
      depth += 1
    }
    slices.push({
      root,
      entryIds: sortUnique(entriesByRoot.get(root)!),
      reached: sortUnique(reached),
    })
  }

  // 4) ownership — 각 census 파일을 도달하는 루트 집합.
  const ownersByFile = new Map<string, Set<string>>()
  for (const slice of slices) {
    for (const f of slice.reached) {
      let set = ownersByFile.get(f)
      if (!set) {
        set = new Set<string>()
        ownersByFile.set(f, set)
      }
      set.add(slice.root)
    }
  }

  const ownership: Ownership[] = census.files
    .map((f) => {
      const owners = sortUnique(ownersByFile.get(f.relPath) ?? [])
      const status: Ownership['status'] =
        owners.length === 0 ? 'unreached' : owners.length === 1 ? 'sole' : 'shared'
      return { relPath: f.relPath, status, owners }
    })
    .sort((a, b) => cmp(a.relPath, b.relPath))

  return {
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    depthCap,
    slices: slices.sort((a, b) => cmp(a.root, b.root)),
    ownership,
  }
}
