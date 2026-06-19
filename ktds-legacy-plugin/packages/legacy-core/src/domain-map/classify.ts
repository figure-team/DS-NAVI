/**
 * CLASSIFY 단계(S4-5) — 결정론적 도메인 후보 분류.
 *
 * 신호 우선순위: 도달성(reachability, 주) > 디렉토리(directory, 교차검증) > prefix(파일명, 폴백).
 * - 도달성: 각 슬라이스 루트가 도메인 후보다(루트 파일에서 파생한 자연키로 키잉).
 *   sole 소유 파일은 그 루트의 도메인에 'reachability' 신호로 합류한다(간선이 곧 증거).
 * - 디렉토리: 과반(>50%) 하강으로 도메인 부모 디렉토리를 찾고, 구조/레이어 세그먼트를
 *   건너뛴 첫 세그먼트를 토큰으로 삼는다. 퇴화(클러스터 <2 / 단일 집중 >50%) 시 폴백.
 * - prefix(폴백): 클래스/파일 base 명을 CamelCase 로 쪼개 STOP_TOKENS 를 버리고
 *   선행 도메인 토큰으로 클러스터링한다.
 * - ambiguous: 도달성과 디렉토리가 서로 다른 도메인으로 분류한 파일(자동 미해소, 사람 게이트行).
 * - common: shared 소유 파일.
 * - unresolved: 어떤 신호도 없는 파일(절대 조용히 누락하지 않음).
 *
 * 모든 산출 배열은 자연키로 정렬되어 byte-identical 재실행을 보장한다.
 */
import type {
  CandidatesReport,
  CensusReport,
  DomainCandidate,
  DomainFile,
  RoutesReport,
  SlicesReport,
} from './types.js'

/** 구조/패키지 루트 세그먼트 — 도메인 의미 없음, 토큰 탐색에서 건너뜀. */
const STRUCTURE_SEGMENTS = new Set([
  'src',
  'main',
  'java',
  'test',
  'resources',
  'webapp',
  'com',
  'org',
  'net',
  'io',
])

/** 레이어/기술 계층 세그먼트 — 도메인 토큰이 될 수 없음. */
const LAYER_SEGMENTS = new Set([
  'controller',
  'service',
  'dao',
  'repository',
  'mapper',
  'model',
  'domain',
  'dto',
  'vo',
  'entity',
  'util',
  'config',
  'web',
  'api',
  'common',
])

/** 파일명 토큰 중 도메인 의미가 없는 접미/계층 토큰(prefix 폴백용). */
const STOP_TOKENS = new Set([
  'impl',
  'abstract',
  'base',
  'default',
  'controller',
  'service',
  'dao',
  'repository',
  'mapper',
  'manager',
  'helper',
  'util',
  'test',
  'action',
  'bean',
  'handler',
  'listener',
  'filter',
  'interceptor',
  'exception',
  'dto',
  'vo',
  'bo',
  'form',
  'view',
  'page',
  'config',
  'factory',
  'builder',
  'provider',
  'resolver',
  'validator',
  'converter',
])

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 구조/레이어/단일 문자 세그먼트인가 — 도메인 토큰 후보에서 제외. */
function isStructureOrLayer(seg: string): boolean {
  return (
    STRUCTURE_SEGMENTS.has(seg) ||
    LAYER_SEGMENTS.has(seg) ||
    seg.length === 1 ||
    /^\d+$/.test(seg)
  )
}

// ── 디렉토리 분류기 ─────────────────────────────────────────────────────────

export interface DirectoryClassification {
  /** relPath → 도메인 토큰(신호 없는 파일은 미포함). */
  tokenByFile: Map<string, string>
  degenerate: { reason: 'too-few-clusters' | 'single-cluster-concentration' } | null
}

/**
 * 과반 하강: 루트에서 시작해 한 자식 디렉토리가 전체 파일의 >50%를 담는 동안
 * 내려간다. 멈춘 지점(prefix 안정화) 이후 첫 비-구조·비-레이어 세그먼트가 그 파일의
 * 도메인 토큰이다. 퇴화(클러스터 <2 또는 단일 클러스터가 전체의 >50% 집중) 시
 * degenerate 를 세팅하고 호출측이 prefix 로 폴백한다.
 */
export function classifyByDirectory(relPaths: string[]): DirectoryClassification {
  const dirSegs = relPaths.map((p) => {
    const segs = p.split('/')
    segs.pop() // 파일명 제거
    return segs.map((s) => s.toLowerCase())
  })

  // 과반 하강으로 공통 prefix 깊이 결정(소수 이탈 파일이 prefix 를 끊어도 다수 경로를 따른다).
  let depth = 0
  for (;;) {
    const counts = new Map<string, number>()
    for (const segs of dirSegs) {
      if (segs.length > depth) {
        counts.set(segs[depth], (counts.get(segs[depth]) ?? 0) + 1)
      }
    }
    let top: string | null = null
    let topCount = 0
    for (const [seg, count] of [...counts.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      if (count > topCount) {
        top = seg
        topCount = count
      }
    }
    if (top === null || topCount * 2 <= relPaths.length) break
    depth++
  }

  const tokenByFile = new Map<string, string>()
  for (let i = 0; i < relPaths.length; i++) {
    const segs = dirSegs[i]
    for (let d = depth; d < segs.length; d++) {
      const seg = segs[d]
      if (isStructureOrLayer(seg)) continue
      tokenByFile.set(relPaths[i], seg)
      break
    }
  }

  // 퇴화 감지: 서로 다른 토큰 <2(분리 불능) 또는 최대 클러스터가 전체의 >50% 집중.
  const clusterSizes = new Map<string, number>()
  for (const token of tokenByFile.values()) {
    clusterSizes.set(token, (clusterSizes.get(token) ?? 0) + 1)
  }
  let degenerate: DirectoryClassification['degenerate'] = null
  if (clusterSizes.size < 2) {
    degenerate = { reason: 'too-few-clusters' }
  } else {
    const top = Math.max(...clusterSizes.values())
    if (top * 2 > relPaths.length) {
      degenerate = { reason: 'single-cluster-concentration' }
    }
  }
  return { tokenByFile, degenerate }
}

// ── 파일명 prefix 폴백 ──────────────────────────────────────────────────────

/** "AccountActionBean.java" → ["account","action","bean"], "line_item.sql" → ["line","item"]. */
export function tokenizeBasename(relPath: string): string[] {
  const base = relPath.split('/').pop() ?? ''
  const stem = base.replace(/\.[^.]+$/, '')
  return stem
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map((t) => t.toLowerCase().replace(/[[\]()@{}]/g, ''))
    .filter((t) => t.length > 0)
}

/** 첫 비-STOP 토큰 = prefix. 전부 STOP 이면 null(도메인 신호 없음). */
export function prefixToken(relPath: string): string | null {
  for (const token of tokenizeBasename(relPath)) {
    if (!STOP_TOKENS.has(token) && !/^\d+$/.test(token)) return token
  }
  return null
}

// ── 신호 통합 ───────────────────────────────────────────────────────────────

/** census/routes/slices 로 도메인 후보(candidates.json)를 만든다. */
export function buildCandidates(
  census: CensusReport,
  routes: Pick<RoutesReport, 'routes' | 'batchEntries'>,
  slices: SlicesReport,
): CandidatesReport {
  const allFiles = census.files.map((f) => f.relPath)
  const directory = classifyByDirectory(allFiles)
  const dirToken = (p: string): string | null =>
    directory.degenerate ? null : (directory.tokenByFile.get(p) ?? null)

  // 도메인 시드 = 루트(엔트리 파일). 루트 key 는 루트 파일에서 파생한 자연키:
  // 디렉토리 토큰이 그 루트를 '유일하게' 식별할 때만 디렉토리 토큰을 key 로 쓴다.
  // package-by-layer(모든 컨트롤러가 한 디렉토리: 예 …/web/actions/*ActionBean)에서는
  // 여러 루트가 같은 디렉토리 토큰(예 'mybatis')을 공유해 도메인이 하나로 붕괴하므로,
  // 공유 토큰인 루트는 파일명 prefix(Account→account 등)로 분리한다. 전역 boolean 으로
  // 판정하면 단 하나의 이질 루트(예 WEB-INF/web.xml)가 나머지를 통째로 붕괴시킨다.
  const rootsByDirToken = new Map<string, number>()
  for (const slice of slices.slices) {
    const t = dirToken(slice.root)
    if (t !== null) rootsByDirToken.set(t, (rootsByDirToken.get(t) ?? 0) + 1)
  }
  const rootKey = new Map<string, string>()
  for (const slice of slices.slices) {
    const t = dirToken(slice.root)
    const tokenUniqueToRoot = t !== null && rootsByDirToken.get(t) === 1
    const key =
      (tokenUniqueToRoot ? t : null) ??
      prefixToken(slice.root) ??
      (slice.root.split('/').pop() ?? slice.root).replace(/\.[^.]+$/, '').toLowerCase()
    rootKey.set(slice.root, key)
  }

  // 각 후보의 entryCount = 그 후보의 루트들이 선언한 라우트/배치 entryId 수.
  const entryCountByRoot = new Map<string, number>()
  for (const slice of slices.slices) {
    entryCountByRoot.set(slice.root, slice.entryIds.length)
  }

  const byKey = new Map<string, { roots: string[]; files: DomainFile[] }>()
  const candidateOf = (key: string): { roots: string[]; files: DomainFile[] } => {
    let c = byKey.get(key)
    if (!c) {
      c = { roots: [], files: [] }
      byKey.set(key, c)
    }
    return c
  }
  for (const [root, key] of [...rootKey.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    candidateOf(key).roots.push(root)
  }

  const common: Array<{ relPath: string; owners: string[] }> = []
  const ambiguous: CandidatesReport['ambiguous'] = []
  const unresolved: string[] = []

  for (const own of slices.ownership) {
    const isRoot = rootKey.has(own.relPath)
    if (own.status === 'shared') {
      // 루트 자신이 다른 루트의 슬라이스에 들어가도 루트는 자기 도메인의 닻이다.
      if (!isRoot) common.push({ relPath: own.relPath, owners: own.owners })
      continue
    }
    if (own.status === 'sole') {
      if (isRoot) continue // 루트는 이미 등재
      const ownerKey = rootKey.get(own.owners[0])!
      const dKey = dirToken(own.relPath)
      if (dKey !== null && byKey.has(dKey) && dKey !== ownerKey) {
        // 도달성 vs 디렉토리 충돌 → 모호 큐(어느 쪽에도 배정하지 않음, 사람 게이트行).
        ambiguous.push({ relPath: own.relPath, reachKey: ownerKey, directoryKey: dKey })
      } else {
        candidateOf(ownerKey).files.push({ relPath: own.relPath, via: 'reachability' })
      }
      continue
    }
    // unreached → 디렉토리 > prefix 폴백, 기존 도메인 key 에만 합류.
    const dKey = dirToken(own.relPath)
    if (dKey !== null && byKey.has(dKey)) {
      candidateOf(dKey).files.push({ relPath: own.relPath, via: 'directory' })
      continue
    }
    const pKey = prefixToken(own.relPath)
    if (pKey !== null && byKey.has(pKey)) {
      candidateOf(pKey).files.push({ relPath: own.relPath, via: 'prefix' })
      continue
    }
    unresolved.push(own.relPath)
  }

  const candidates: DomainCandidate[] = [...byKey.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([key, c]) => ({
      key,
      roots: [...c.roots].sort(cmp),
      entryCount: c.roots.reduce((n, r) => n + (entryCountByRoot.get(r) ?? 0), 0),
      files: [...c.files].sort((x, y) => cmp(x.relPath, y.relPath)),
    }))

  return {
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    directoryDegenerate: directory.degenerate,
    candidates,
    common: common.sort((a, b) => cmp(a.relPath, b.relPath)),
    ambiguous: ambiguous.sort((a, b) => cmp(a.relPath, b.relPath)),
    unresolved: unresolved.sort(cmp),
  }
}
