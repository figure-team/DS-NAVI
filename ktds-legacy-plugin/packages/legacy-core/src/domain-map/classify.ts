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
 * - 시드 확신도(confidence): high(디렉터리 정합) > medium(접두어 분할) > low(폴백).
 *   키잉 후 2패스로 분할 파편을 본체 디렉터리 도메인에 재흡수하고, 3패스로 low 시드를
 *   격리한다(quarantined — 상위 신호 도메인이 있을 때만; 퇴화 프로젝트는 기존 동작 유지).
 * - 관용 접두어(conventionPrefixes): 여러 디렉터리 그룹에 반복되는 파일명 첫 토큰
 *   (벤더 접두어 Egov·Co 류)은 키 후보에서 제외.
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
  DomainConfidence,
  DomainFile,
  RoutesReport,
  SlicesReport,
} from './types.js'
import { isDomainIneligibleRoot } from './slices.js'

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
  // 배포 기술구조 폴더 — 도메인이 아니라 컨테이너 규약(잡음 도메인 web-inf 방지).
  'web-inf',
  'meta-inf',
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
  // 뷰 기술 폴더(WEB-INF/jsp/<feature>/…) — 건너뛰면 다음 세그먼트가 실 도메인이다.
  'jsp',
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

  // 통과 네임스페이스 세그먼트 동적 감지(브랜치 상대): 같은 부모 경로를 공유하는 파일들
  // 안에서 한 세그먼트 값이 NAMESPACE_SHARE 이상을 덮으면(예 src/main/java 밑에서
  // `egovframework` 가 사실상 전부) 도메인 신호가 아니라 벤더/패키지 네임스페이스이므로
  // 토큰 후보에서 건너뛴다. 전역이 아니라 브랜치 상대라야 webapp/resources 형제에
  // 희석되지 않고 java 서브트리의 네임스페이스를 잡는다. STRUCTURE_SEGMENTS 하드코딩을
  // 프로젝트 고유 패키지 루트로 일반화 → com/<org>/<feature> 의 <feature>(uss/sym/cop)
  // 까지 내려간다. 도메인 분기(소수값)는 덮지 못하므로 보존된다.
  const NAMESPACE_SHARE = 0.9
  const branchCounts = new Map<string, Map<string, number>>() // 부모경로 → (세그먼트값 → 수)
  for (const segs of dirSegs) {
    for (let d = 0; d < segs.length; d++) {
      const parent = segs.slice(0, d).join('/')
      let m = branchCounts.get(parent)
      if (!m) branchCounts.set(parent, (m = new Map()))
      m.set(segs[d], (m.get(segs[d]) ?? 0) + 1)
    }
  }
  // 표본 1개짜리 브랜치는 모든 세그먼트가 100% 지배라 '무조건' 네임스페이스로 오폭한다
  // (멀티모듈에서 파일이 적은 모듈의 feature 세그먼트까지 삼켜 도메인 신호를 죽인다).
  // 최소 표본(≥2) 미달 브랜치는 지배율 판정 대신, 표본이 충분한 브랜치에서 이미
  // 네임스페이스로 확정된 '값'(com/acme/egovframework 류는 모듈이 달라도 같다)만 스킵한다.
  const NAMESPACE_MIN_FILES = 2
  // 브랜치 총계는 한 번만 계산해 공유한다 — isNamespaceSeg 는 파일×세그먼트마다 불리는
  // 핫패스라 매 호출 합산은 대형 프로젝트에서 이차 비용이 된다.
  const branchTotals = new Map<string, number>()
  for (const [parent, m] of branchCounts) {
    let total = 0
    for (const c of m.values()) total += c
    branchTotals.set(parent, total)
  }
  const namespaceValues = new Set<string>()
  for (const [parent, m] of branchCounts) {
    const total = branchTotals.get(parent)!
    if (total < NAMESPACE_MIN_FILES) continue
    for (const [seg, c] of m) {
      if (c / total >= NAMESPACE_SHARE) namespaceValues.add(seg)
    }
  }
  const isNamespaceSeg = (segs: string[], d: number): boolean => {
    const parent = segs.slice(0, d).join('/')
    const m = branchCounts.get(parent)
    if (!m) return false
    const total = branchTotals.get(parent)!
    if (total >= NAMESPACE_MIN_FILES) {
      return (m.get(segs[d]) ?? 0) / total >= NAMESPACE_SHARE
    }
    return namespaceValues.has(segs[d])
  }

  const tokenByFile = new Map<string, string>()
  for (let i = 0; i < relPaths.length; i++) {
    const segs = dirSegs[i]
    for (let d = depth; d < segs.length; d++) {
      const seg = segs[d]
      if (isStructureOrLayer(seg) || isNamespaceSeg(segs, d)) continue
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

/**
 * 첫 비-STOP 토큰 = prefix. 전부 STOP 이면 null(도메인 신호 없음).
 * 1글자 토큰은 디렉터리 세그먼트 규칙(isStructureOrLayer)과 동형으로 제외 —
 * FCommonController 의 'f' 같은 무의미 키를 막는다. skip(관용 접두어)도 건너뛴다.
 */
export function prefixToken(relPath: string, skip?: ReadonlySet<string>): string | null {
  for (const token of tokenizeBasename(relPath)) {
    if (STOP_TOKENS.has(token) || /^\d+$/.test(token) || token.length < 2) continue
    if (skip?.has(token)) continue
    return token
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
  // 각 디렉토리 토큰이 담는 파일명 prefix 의 분포 — 조직 스타일 판정용.
  // prefix 가 그 토큰 그룹을 실제로 '분할'하면(여러 prefix 가 고르게 = package-by-layer,
  // 예 jpetstore …/web/actions/{Account,Order}ActionBean) → prefix 로 분리한다.
  // 한 prefix 가 지배하면(package-by-feature + 벤더 접두어, 예 uss/ 밑 대부분 Egov*
  // → 'egov' 지배, 소수 이질 루트 존재) → 디렉토리 토큰(=feature 패키지 uss/sym/cop)을
  // key 로. **지배율 기반**이라 단 하나의 이질 루트가 서브패키지를 통째로 붕괴시키지 않는다.
  const PREFIX_PARTITION_MAX = 0.7 // 최다 prefix 점유율이 이 미만이어야 prefix 가 도메인을 가른다고 본다
  // 분포는 관용 접두어 스킵 없이 '원시' prefix 로 계산한다 — 벤더 접두어(Egov*)가
  // 지배하는 feature 패키지(uss/sym/…)는 지배율 판정으로 분할이 '안 일어나는' 것이
  // 정답인데, 스킵한 분포로 판정하면 2차 토큰이 흩어져 오분할된다.
  // 시드 통계 단일 패스 — 디렉터리 토큰별 접두어 분포(분할 판정)와 접두어별 디렉터리
  // 그룹 집합(관용 접두어 감지)을 같은 (t, p) 관측에서 함께 쌓는다. 두 통계의 시드
  // 자격 규칙이 갈라지면 분할 판정과 관용 감지가 조용히 어긋난다.
  const prefixDistByDirToken = new Map<string, Map<string, number>>()
  const dirGroupsByPrefix = new Map<string, Set<string>>()
  for (const slice of slices.slices) {
    if (isDomainIneligibleRoot(slice.root)) continue // 시드 부적격 루트는 통계에서 제외
    const t = dirToken(slice.root)
    if (t === null) continue
    const p = prefixToken(slice.root)
    if (p === null) continue
    let m = prefixDistByDirToken.get(t)
    if (!m) prefixDistByDirToken.set(t, (m = new Map<string, number>()))
    m.set(p, (m.get(p) ?? 0) + 1)
    let g = dirGroupsByPrefix.get(p)
    if (!g) dirGroupsByPrefix.set(p, (g = new Set<string>()))
    g.add(t)
  }
  const prefixPartitions = (t: string): boolean => {
    const m = prefixDistByDirToken.get(t)
    if (!m || m.size < 2) return false
    let total = 0
    let max = 0
    for (const c of m.values()) {
      total += c
      if (c > max) max = c
    }
    return total > 0 && max / total < PREFIX_PARTITION_MAX
  }

  // 전역 관용 접두어 — 같은 파일명 첫 토큰이 서로 다른 디렉터리 토큰 그룹
  // CONVENTION_MIN_GROUPS 개 이상에서 시드로 반복되면 조직 명명 관례(예 Egov*/Co*)다.
  // 도메인 키가 될 자격이 없으므로 '키 산출 시에만' 건너뛴다(분포 판정에는 원시 유지).
  // 감지는 시드(루트)에서만 하되 적용은 멤버십 폴백에도 미친다 — 관례 여부는 진입점
  // 명명에서 판정하는 게 표본이 깨끗하고, 멤버 파일(CoOrderList.jsp 류)도 같은 관례를
  // 따르므로 접두어 뒤 실 토큰으로 귀속하는 쪽이 일관된다(의도된 비대칭).
  const CONVENTION_MIN_GROUPS = 3
  const conventionPrefixes = new Set(
    [...dirGroupsByPrefix.entries()]
      .filter(([, groups]) => groups.size >= CONVENTION_MIN_GROUPS)
      .map(([p]) => p),
  )

  // 1패스 — 시드 키잉 + 증거 확신도(high=디렉터리 정합, medium=접두어 분할, low=폴백).
  const rootKey = new Map<string, { key: string; confidence: DomainConfidence }>()
  for (const slice of slices.slices) {
    // 도메인 '시드' 제외 — 테스트/정적 진입점(예 src/test/**, code404.jsp)은 자기
    // 도메인을 만들지 않는다. slices 도달성은 유지되므로(program-inventory·risk-report
    // 소비), 이 루트가 도달한 파일은 아래 ownership 에서 실제 생산 도메인 멤버로 합류한다.
    if (isDomainIneligibleRoot(slice.root)) continue
    const t = dirToken(slice.root)
    // t 가 유일(1루트)이면 분포 크기 1 → prefixPartitions=false → 디렉토리 토큰 채택
    // (기존 '유일 토큰' 동작 보존).
    if (t !== null && !prefixPartitions(t)) {
      rootKey.set(slice.root, { key: t, confidence: 'high' })
      continue
    }
    const p = prefixToken(slice.root, conventionPrefixes)
    if (p !== null) {
      // 디렉터리 토큰이 있었는데 분할된 경우만 medium(분할 근거 있음), 없으면 low(폴백).
      rootKey.set(slice.root, { key: p, confidence: t !== null ? 'medium' : 'low' })
      continue
    }
    const base = (slice.root.split('/').pop() ?? slice.root).replace(/\.[^.]+$/, '').toLowerCase()
    rootKey.set(slice.root, { key: base, confidence: 'low' })
  }

  // 2패스 — 파편 재흡수: 접두어로 키잉된 루트(분할 파편)의 디렉터리 토큰이 이미 다른
  // 루트의 key 로 존재하면 그 도메인으로 귀속한다. package-by-feature 에서 이질 명명
  // 파일 몇 개가 분할을 촉발해 떨어져 나간 파편(예 event/ 밑 CoEventController → 'co')을
  // 본체('event')로 되돌린다. package-by-layer(jpetstore actions/)는 레이어 폴더명이
  // 파일 접두어와 절대 일치하지 않으므로 재흡수가 일어나지 않는다(분할 보존).
  // 결과는 순회 순서와 무관하다: 대상 키는 1패스 스냅샷(pass1Keys)에 고정되고 각
  // 반복은 자기 루트만 갱신한다. 재흡수된 루트는 디렉터리 공점유 증거를 얻었으므로
  // medium 으로 승격한다 — low 로 남기면 3패스 격리가 방금 합류한 본체 도메인에서
  // 루트를 도로 뽑아내는 모순이 생긴다(예 event/ 밑 STOP-only 파일명 루트).
  const pass1Keys = new Set([...rootKey.values()].map((i) => i.key))
  for (const [root, seed] of rootKey) {
    if (seed.confidence === 'high') continue
    const t = dirToken(root)
    if (t !== null && t !== seed.key && pass1Keys.has(t)) {
      rootKey.set(root, { key: t, confidence: 'medium' })
    }
  }

  // 3패스 — 약신호 격리: low 시드가 전체 시드의 '소수'(≤ LOW_QUARANTINE_MAX_SHARE)일
  // 때만 자기 도메인을 만들지 않고 격리한다(_review, 조용한 누락 금지 — root/무산 key 보존).
  // 비율 조건인 이유: 강신호 구조(feature 패키지)가 지배하는 프로젝트에서 common/ 덤프
  // 잔여만 격리하는 게 목적이다. low 가 다수면 그 프로젝트는 구조 신호가 원래 없는 것
  // (package-by-layer 소형 앱 등)이므로 격리하면 컨트롤러가 전멸한다 — 단 하나의 이질
  // 루트(배치 잡 등)가 나머지를 통째로 격리시키는 붕괴를 막는다. 퇴화 프로젝트(flat 등)도
  // 동일 이유로 격리하지 않는다.
  const LOW_QUARANTINE_MAX_SHARE = 0.3
  const quarantined: Array<{ root: string; key: string; reason: 'weak-signal' }> = []
  const lowCount = [...rootKey.values()].filter((i) => i.confidence === 'low').length
  if (
    !directory.degenerate &&
    lowCount > 0 &&
    lowCount / rootKey.size <= LOW_QUARANTINE_MAX_SHARE
  ) {
    // 순회 순서 무관(각 반복이 자기 항목만 제거), 출력 순서는 반환 직전 정렬이 보장.
    // 격리 루트는 rootKey 에서 빠지므로 아래 멤버십 루프에서 일반 파일로 취급된다 —
    // 다른 루트가 도달하면 그 도메인의 '멤버'로 합류한다(의도: 격리는 "자기 도메인을
    // 만들지 않는다"이지 "어디에도 속하지 못한다"가 아니다. 진입점 자격만 박탈).
    for (const [root, seed] of rootKey) {
      if (seed.confidence !== 'low') continue
      quarantined.push({ root, key: seed.key, reason: 'weak-signal' })
      rootKey.delete(root)
    }
  }

  // 각 후보의 entryCount = 그 후보의 루트들이 선언한 라우트/배치 entryId 수.
  const entryCountByRoot = new Map<string, number>()
  for (const slice of slices.slices) {
    entryCountByRoot.set(slice.root, slice.entryIds.length)
  }

  const byKey = new Map<
    string,
    { roots: string[]; files: DomainFile[]; confidence: DomainConfidence }
  >()
  const candidateOf = (
    key: string,
  ): { roots: string[]; files: DomainFile[]; confidence: DomainConfidence } => {
    let c = byKey.get(key)
    if (!c) {
      c = { roots: [], files: [], confidence: 'low' }
      byKey.set(key, c)
    }
    return c
  }
  const CONFIDENCE_RANK: Record<DomainConfidence, number> = { high: 2, medium: 1, low: 0 }
  for (const [root, seed] of [...rootKey.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const c = candidateOf(seed.key)
    c.roots.push(root)
    // 후보 확신도 = 루트들 중 최고 증거(재흡수로 섞인 파편이 본체 등급을 깎지 않는다).
    if (CONFIDENCE_RANK[seed.confidence] > CONFIDENCE_RANK[c.confidence]) {
      c.confidence = seed.confidence
    }
  }

  const common: Array<{ relPath: string; owners: string[] }> = []
  const ambiguous: CandidatesReport['ambiguous'] = []
  const unresolved: string[] = []

  for (const own of slices.ownership) {
    // NOTE: 테스트/정적 파일을 도메인 '멤버'에서까지 빼면 안 된다 — 예 order 컨트롤러가
    // forward 하는 list.jsp 는 order 도메인의 화면 멤버다(program-inventory 가 domain 을
    // 참조). 제외는 도메인 '시드'(slices.addEntry 의 isDomainIneligibleRoot)에서만 하고,
    // 실제 생산 도메인이 도달한 파일은 그 도메인 멤버로 유지한다.
    const isRoot = rootKey.has(own.relPath)
    if (own.status === 'shared') {
      // 루트 자신이 다른 루트의 슬라이스에 들어가도 루트는 자기 도메인의 닻이다.
      if (!isRoot) common.push({ relPath: own.relPath, owners: own.owners })
      continue
    }
    if (own.status === 'sole') {
      if (isRoot) continue // 루트는 이미 등재
      const ownerKey = rootKey.get(own.owners[0])?.key
      if (ownerKey !== undefined) {
        const dKey = dirToken(own.relPath)
        if (dKey !== null && byKey.has(dKey) && dKey !== ownerKey) {
          // 도달성 vs 디렉토리 충돌 → 모호 큐(어느 쪽에도 배정하지 않음, 사람 게이트行).
          ambiguous.push({ relPath: own.relPath, reachKey: ownerKey, directoryKey: dKey })
        } else {
          candidateOf(ownerKey).files.push({ relPath: own.relPath, via: 'reachability' })
        }
        continue
      }
      // owner 가 시드 부적격(테스트/정적 진입점)이라 도메인 key 가 없음 → 아래 디렉토리/
      // prefix 폴백으로 실제 생산 도메인에 멤버로 합류 시도(예 order/list.jsp → order).
    }
    // unreached(또는 시드 부적격 owner) → 디렉토리 > prefix 폴백, 기존 도메인 key 에만 합류.
    const dKey = dirToken(own.relPath)
    if (dKey !== null && byKey.has(dKey)) {
      candidateOf(dKey).files.push({ relPath: own.relPath, via: 'directory' })
      continue
    }
    const pKey = prefixToken(own.relPath, conventionPrefixes)
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
      confidence: c.confidence,
    }))

  return {
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    directoryDegenerate: directory.degenerate,
    candidates,
    common: common.sort((a, b) => cmp(a.relPath, b.relPath)),
    ambiguous: ambiguous.sort((a, b) => cmp(a.relPath, b.relPath)),
    unresolved: unresolved.sort(cmp),
    quarantined: quarantined.sort((a, b) => cmp(a.root, b.root)),
    conventionPrefixes: [...conventionPrefixes].sort(cmp),
  }
}
