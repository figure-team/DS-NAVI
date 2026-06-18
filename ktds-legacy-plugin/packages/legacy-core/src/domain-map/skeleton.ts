/**
 * SKELETON 단계(S6) — 결정론적 도메인 그래프 골격 조립.
 *
 * confirmed plan + 스캔 산출물(census/routes/edges/slices/candidates)에서
 * U-A domain-graph 호환 domain/flow/step 노드와 contains_flow/flow_step/calls
 * 엣지를 결정론으로 만든다. 의미 필드(name/summary)는 SKELETON_BLANK —
 * S8 LLM 채움(P4)이 enrich 한다. 구조 필드(ID/엣지/순서/filePath/lineRange/
 * weight)는 이 단계가 확정하며 재실행 시 byte-identical 을 보장한다.
 *
 * ID 규칙(서수 금지):
 *   domain:<key>             확정 후보 자연키
 *   flow:<METHOD> <path>     routeId "route:..." 자연키 재사용
 *   flow:batch:<rel>#<sym>   batch entryId 재사용
 *   step:<flow 자연키>:<relPath>
 *
 * ★ 스코프(P2 폴백): step 은 슬라이스(파일 단위 도달성, slices.ts)에서
 *   STRUCTURALLY 도출한다. 메서드 단위 호출 그래프(8-receiver 해소)는 P3 —
 *   여기서 빌드하지 않는다. 그래서 step 은 "메서드 정밀"이 아니라 "파일 단위
 *   도달 집합"이다. 메서드 정밀 step 은 P3 enhancement(문서화된 폴백).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractJavaFacts, type JavaFileFacts } from './java-facts.js'
import { buildLayerSignals, deriveStepLayer, type LayerSignals } from './step-layer.js'
import {
  DEFAULT_STEP_CAP,
  SKELETON_BLANK,
  type CandidatesReport,
  type CensusReport,
  type ConfirmedPlan,
  type EdgesReport,
  type RoutesReport,
  type SkeletonReport,
  type SlicesReport,
  type StepSource,
  type UaGraphEdge,
  type UaGraphNode,
} from './types.js'

export { DEFAULT_STEP_CAP } from './types.js'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** flow_step weight 를 4자리로 반올림 — 부동소수 노이즈 제거(결정론). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * 도메인 복잡도 임계값 — 멤버 파일 수 기반(결정론, 문서화됨).
 *   simple   : < 8 파일
 *   moderate : 8 ~ 19 파일
 *   complex  : >= 20 파일
 * (8/20 은 controller→service→dao→xml 한 흐름이 ~5 파일이라, 단일 흐름 도메인은
 *  simple, 다중 흐름은 moderate, 대형 도메인은 complex 로 갈리도록 고른 값.)
 */
function domainComplexity(fileCount: number): UaGraphNode['complexity'] {
  if (fileCount < 8) return 'simple'
  if (fileCount < 20) return 'moderate'
  return 'complex'
}

/**
 * flow 복잡도 임계값 — step 수 기반(결정론, 문서화됨).
 *   simple   : <= 3 step
 *   moderate : 4 ~ 6 step
 *   complex  : >= 7 step
 */
function flowComplexity(stepCount: number): UaGraphNode['complexity'] {
  if (stepCount <= 3) return 'simple'
  if (stepCount <= 6) return 'moderate'
  return 'complex'
}

interface BuildSkeletonInput {
  census: CensusReport
  routes: RoutesReport
  edges: EdgesReport
  slices: SlicesReport
  candidates: CandidatesReport
  /** 확정 플랜 — 없으면 throw(자동 확정 금지, 사람 게이트 필수). */
  plan: ConfirmedPlan
}

/**
 * confirmed plan + 스캔 산출물로 결정론 skeleton 을 만든다(파일 기록 없음).
 * plan 이 누락되면 명확한 오류로 사람 게이트(confirm)를 요구한다.
 */
export async function buildSkeleton(
  projectRoot: string,
  input: BuildSkeletonInput,
  options: { stepCap?: number } = {},
): Promise<SkeletonReport> {
  const { census, routes, edges, slices, candidates, plan } = input
  if (!plan) {
    throw new Error(
      'skeleton requires a ConfirmedPlan — run /understand-map confirm first',
    )
  }
  const stepCap = options.stepCap ?? DEFAULT_STEP_CAP

  // ── 확정 플랜 사상: root→도메인 key, 후보 key/alias→도메인 key ──────────────
  const domains = [...plan.domains].sort((a, b) => cmp(a.key, b.key))
  const domainByRoot = new Map<string, string>()
  const domainByKey = new Map<string, string>()
  for (const d of domains) {
    domainByKey.set(d.key, d.key)
    for (const alias of d.aliasKeys) domainByKey.set(alias, d.key)
    for (const root of d.roots) domainByRoot.set(root, d.key)
  }

  // 파일→도메인 멤버십(복잡도 산정용). sole 도달 = 주 신호, 후보의 배정으로 보강,
  // root 는 자기 도메인 소속. 게이트에서 제외된 후보의 파일은 의도적으로 제외
  // (사람 결정; candidates.json + excludedKeys 로 추적 가능 — 조용한 누락 아님).
  const domainByFile = new Map<string, string>()
  for (const own of slices.ownership) {
    if (own.status !== 'sole') continue
    const key = domainByRoot.get(own.owners[0])
    if (key) domainByFile.set(own.relPath, key)
  }
  for (const cand of candidates.candidates) {
    const key = domainByKey.get(cand.key)
    if (!key) continue
    for (const f of cand.files) {
      if (!domainByFile.has(f.relPath)) domainByFile.set(f.relPath, key)
    }
  }
  for (const [root, key] of domainByRoot) domainByFile.set(root, key)

  const fileCountByDomain = new Map<string, number>()
  for (const key of domainByFile.values()) {
    fileCountByDomain.set(key, (fileCountByDomain.get(key) ?? 0) + 1)
  }

  // ── 보조 인덱스(루프 밖 1회 구성) ─────────────────────────────────────────
  const routesByFile = new Map<string, RoutesReport['routes']>()
  for (const r of routes.routes) {
    const list = routesByFile.get(r.filePath)
    if (list) list.push(r)
    else routesByFile.set(r.filePath, [r])
  }
  const batchByFile = new Map<string, RoutesReport['batchEntries']>()
  for (const b of routes.batchEntries) {
    const list = batchByFile.get(b.filePath)
    if (list) list.push(b)
    else batchByFile.set(b.filePath, [b])
  }
  const reachedByRoot = new Map<string, Set<string>>()
  for (const s of slices.slices) reachedByRoot.set(s.root, new Set(s.reached))

  // 파일 단위 의존 인접(edges report) — calls 엣지 판정에 쓴다.
  const edgeAdjacency = new Map<string, Set<string>>()
  for (const e of edges.edges) {
    let set = edgeAdjacency.get(e.source)
    if (!set) {
      set = new Set<string>()
      edgeAdjacency.set(e.source, set)
    }
    set.add(e.target)
  }

  const layerSignals: LayerSignals = buildLayerSignals(routes, edges)

  // java-facts: step/route 파일의 클래스명 + 선언 라인. census 의 java 파일만 1회 파싱.
  const javaFacts = await loadJavaFacts(projectRoot, census)

  // ── 노드/엣지 조립 ────────────────────────────────────────────────────────
  const nodes: UaGraphNode[] = []
  const edgeList: UaGraphEdge[] = []
  const stepSources: StepSource[] = []
  const truncatedSteps: SkeletonReport['truncatedSteps'] = []

  for (const d of domains) {
    const fileCount = fileCountByDomain.get(d.key) ?? d.roots.length
    nodes.push({
      id: `domain:${d.key}`,
      type: 'domain',
      name: SKELETON_BLANK,
      summary: SKELETON_BLANK,
      tags: [d.key],
      complexity: domainComplexity(fileCount),
      domainMeta: {},
    })

    for (const root of [...d.roots].sort(cmp)) {
      const flows = collectFlows(root, routesByFile, batchByFile)
      for (const flow of flows) {
        const flowKey = stripPrefix(flow.flowId, 'flow:')

        // step = 이 root 의 슬라이스 도달 파일(파일 단위, P2 폴백). root 는 흐름의
        // 닻이라 첫 step 으로 항상 보존하고, 나머지는 relPath 정렬. cap 초과는 보고.
        const reached = reachedByRoot.get(root) ?? new Set<string>([root])
        const rest = [...reached].filter((f) => f !== root).sort(cmp)
        const ordered = [root, ...rest]
        const stepFiles = ordered.slice(0, stepCap)
        const dropped = ordered.slice(stepCap)

        nodes.push({
          id: flow.flowId,
          type: 'flow',
          name: SKELETON_BLANK,
          summary: SKELETON_BLANK,
          tags: [d.key],
          complexity: flowComplexity(stepFiles.length),
          filePath: root,
          lineRange: [flow.line, flow.line],
          domainMeta: { entryPoint: flow.entryPoint, entryType: flow.entryType },
        })
        edgeList.push({
          source: `domain:${d.key}`,
          target: flow.flowId,
          type: 'contains_flow',
          weight: 1,
        })

        stepFiles.forEach((file, i) => {
          const stepId = `step:${flowKey}:${file}`
          const anchor = stepAnchor(file, javaFacts, file === root ? flow.line : null)
          nodes.push({
            id: stepId,
            type: 'step',
            name: SKELETON_BLANK,
            summary: SKELETON_BLANK,
            tags: [d.key],
            complexity: 'simple',
            filePath: file,
            lineRange: [anchor.line, anchor.line],
            layer: deriveStepLayer(file, anchor.className, layerSignals),
          })
          stepSources.push({
            stepId,
            relPath: file,
            line: anchor.line,
            className: anchor.className,
          })
          // weight = (position+1)/total — 단조 증가, 마지막 step ≈ 1.
          edgeList.push({
            source: flow.flowId,
            target: stepId,
            type: 'flow_step',
            weight: round4((i + 1) / stepFiles.length),
          })
        })

        // calls(step→step): edges report 에 두 step 파일 사이 의존 엣지가 실제로
        // 있을 때만 등재(합성 순서가 아니라 진짜 파일 인접). 양 끝 모두 이 flow 의 step.
        const inChain = new Set(stepFiles)
        for (const fileA of stepFiles) {
          const targets = edgeAdjacency.get(fileA)
          if (!targets) continue
          for (const fileB of [...targets].sort(cmp)) {
            if (fileB === fileA || !inChain.has(fileB)) continue
            edgeList.push({
              source: `step:${flowKey}:${fileA}`,
              target: `step:${flowKey}:${fileB}`,
              type: 'calls',
              weight: 1,
            })
          }
        }

        if (dropped.length > 0) {
          truncatedSteps.push({ flowId: flow.flowId, dropped })
        }
      }
    }
  }

  // ── 결정론 경계: 모든 배열을 자연키로 정렬 ────────────────────────────────
  const nodeTypeOrder: Record<UaGraphNode['type'], number> = { domain: 0, flow: 1, step: 2 }
  nodes.sort((a, b) => nodeTypeOrder[a.type] - nodeTypeOrder[b.type] || cmp(a.id, b.id))
  const edgeTypeOrder: Record<UaGraphEdge['type'], number> = {
    contains_flow: 0,
    flow_step: 1,
    calls: 2,
  }
  edgeList.sort(
    (a, b) =>
      edgeTypeOrder[a.type] - edgeTypeOrder[b.type] ||
      cmp(a.source, b.source) ||
      (a.weight ?? 0) - (b.weight ?? 0) ||
      cmp(a.target, b.target),
  )
  stepSources.sort((a, b) => cmp(a.stepId, b.stepId))
  truncatedSteps.sort((a, b) => cmp(a.flowId, b.flowId))

  assertUniqueNodeIds(nodes)

  return {
    schemaVersion: 1,
    gitCommit: candidates.gitCommit,
    stepCap,
    nodes,
    edges: edgeList,
    stepSources,
    truncatedSteps,
  }
}

interface FlowSpec {
  flowId: string
  entryPoint: string
  entryType: 'http' | 'cron' | 'cli'
  line: number
}

/** 한 root 가 선언한 라우트/배치 진입을 flow 스펙으로 모은다(flowId 정렬). */
function collectFlows(
  root: string,
  routesByFile: Map<string, RoutesReport['routes']>,
  batchByFile: Map<string, RoutesReport['batchEntries']>,
): FlowSpec[] {
  const flows: FlowSpec[] = []
  for (const r of routesByFile.get(root) ?? []) {
    flows.push({
      flowId: `flow:${stripPrefix(r.routeId, 'route:')}`,
      entryPoint: r.handler ?? `${r.method} ${r.path}`,
      entryType: 'http',
      line: r.line,
    })
  }
  for (const b of batchByFile.get(root) ?? []) {
    flows.push({
      flowId: `flow:${b.entryId}`,
      entryPoint: b.handler ?? b.entryId,
      entryType: b.trigger === 'main' ? 'cli' : 'cron',
      line: b.line,
    })
  }
  return flows.sort((a, b) => cmp(a.flowId, b.flowId))
}

/** census 의 java 파일을 1회씩 파싱해 relPath→facts 맵을 만든다(파싱 실패는 제외). */
async function loadJavaFacts(
  projectRoot: string,
  census: CensusReport,
): Promise<Map<string, JavaFileFacts>> {
  const out = new Map<string, JavaFileFacts>()
  const javaRels = census.files
    .filter((f) => f.lang === 'java')
    .map((f) => f.relPath)
    .sort(cmp)
  for (const rel of javaRels) {
    let src: string
    try {
      src = readFileSync(join(projectRoot, rel), 'utf8')
    } catch {
      continue
    }
    try {
      out.set(rel, await extractJavaFacts(rel, src))
    } catch {
      // 파싱 실패 파일은 facts 없이 둔다(stepAnchor 가 line 1/className null 폴백).
    }
  }
  return out
}

/**
 * step 앵커 — java 파일의 주 클래스 선언 라인 + 클래스명. facts 없으면 line 1.
 * overrideLine(라우트 진입 라인)이 주어지면 그 라인을 쓰되 className 은 facts 에서.
 */
function stepAnchor(
  relPath: string,
  javaFacts: Map<string, JavaFileFacts>,
  overrideLine: number | null,
): { line: number; className: string | null } {
  const cls = javaFacts.get(relPath)?.classes[0]
  if (overrideLine !== null) {
    return { line: overrideLine, className: cls?.name ?? null }
  }
  if (cls) return { line: cls.line, className: cls.name }
  return { line: 1, className: null }
}

function assertUniqueNodeIds(nodes: UaGraphNode[]): void {
  const seen = new Set<string>()
  for (const n of nodes) {
    if (seen.has(n.id)) {
      throw new Error(`skeleton invariant violation: duplicate node id "${n.id}"`)
    }
    seen.add(n.id)
  }
}

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s
}
