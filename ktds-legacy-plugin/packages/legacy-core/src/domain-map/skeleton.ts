import type { JavaFileFacts } from "./java-facts.js";
import {
  SKELETON_BLANK,
  type CandidatesReport,
  type ConfirmedPlan,
  type EdgesReport,
  type RoutesReport,
  type SkeletonReport,
  type SlicesReport,
  type StepSource,
  type UaGraphEdge,
  type UaGraphNode,
} from "./types.js";
import { buildLayerSignals, deriveStepLayer } from "./step-layer.js";
import { cmp } from "../utils/cmp.js";
import { groupBy } from "../utils/collections.js";

// S6 skeleton 조립기 (Stage-16, task 16.4).
// U-A domain-graph 호환 domain/flow/step 노드와 contains_flow/flow_step/
// cross_domain 엣지를 결정론으로 조립한다. 의미 필드(name/summary/domainMeta
// 서술)는 SKELETON_BLANK — S8 LLM이 채우고, 구조 필드(ID/엣지/순서/filePath/
// lineRange/weight)는 read-only다(변경 시 기각, M1의 닻).
// ID 규칙 (A15 — ordinal 금지):
//   domain:<key>            key = 확정된 후보 자연키
//   flow:<METHOD> <path>    routeId "route:..."의 자연키 재사용
//   flow:batch:<rel>#<sym>  batch entryId 재사용
//   step:<flow 자연키>:<relPath>

/** flow당 step 상한 — 초과분은 truncatedSteps로 보고 (조용한 누락 금지). */
export const DEFAULT_STEP_CAP = 8;
/** step 체인 BFS 깊이 상한 — controller→service→mapper→XML이 3-4 hop. */
export const STEP_DEPTH_CAP = 4;

export function buildSkeleton(
  plan: ConfirmedPlan,
  candidates: CandidatesReport,
  routes: RoutesReport,
  slices: SlicesReport,
  edgesReport: EdgesReport,
  javaFacts: Map<string, JavaFileFacts>,
  options: { stepCap?: number } = {},
): SkeletonReport {
  const stepCap = options.stepCap ?? DEFAULT_STEP_CAP;

  // ── 확정 플랜 사상: root→도메인, 후보 key→도메인 ────────────────────────
  const domains = [...plan.domains].sort((a, b) => cmp(a.key, b.key));
  const domainByRoot = new Map<string, string>();
  const domainByKey = new Map<string, string>();
  for (const d of domains) {
    domainByKey.set(d.key, d.key);
    for (const alias of d.aliasKeys) domainByKey.set(alias, d.key);
    for (const root of d.roots) domainByRoot.set(root, d.key);
  }

  // 파일→도메인 (sole 도달 = 주 신호, 후보의 directory/prefix 배정 포함).
  // 게이트에서 제외된 도메인의 파일은 skeleton에 의도적으로 등장하지 않는다
  // — 사람의 제외 결정이며, candidates.json + excludedKeys로 추적 가능하다
  // (미해소 큐 원칙 위반 아님: 증거는 후보 산출물에 보존).
  const domainByFile = new Map<string, string>();
  // 도달성(sole) 배정 — cross_domain의 근거가 되는 강한 신호
  const reachAssigned = new Set<string>();
  for (const own of slices.ownership) {
    if (own.status !== "sole") continue;
    const key = domainByRoot.get(own.owners[0]);
    if (key) {
      domainByFile.set(own.relPath, key);
      reachAssigned.add(own.relPath);
    }
  }
  for (const cand of candidates.candidates) {
    const key = domainByKey.get(cand.key);
    if (!key) continue; // 게이트에서 제외된 후보
    for (const f of cand.files) {
      if (!domainByFile.has(f.relPath)) domainByFile.set(f.relPath, key);
    }
  }
  for (const [root, key] of domainByRoot) {
    domainByFile.set(root, key);
    reachAssigned.add(root);
  }

  // ── 노드/엣지 조립 ───────────────────────────────────────────────────────
  const nodes: UaGraphNode[] = [];
  const edges: UaGraphEdge[] = [];
  const stepSources: StepSource[] = [];
  const truncatedSteps: SkeletonReport["truncatedSteps"] = [];

  const routesByFile = groupBy(routes.routes, (r) => r.filePath);
  const batchByFile = groupBy(routes.batchEntries, (b) => b.filePath);
  const adjacency = buildAdjacency(edgesReport);
  // layer 신호 집합은 루프 밖에서 한 번만 도출(파일당 재계산 금지).
  const layerSignals = buildLayerSignals(routes, edgesReport);

  for (const d of domains) {
    const fileCount = [...domainByFile.values()].filter((k) => k === d.key).length;
    nodes.push({
      id: `domain:${d.key}`,
      type: "domain",
      name: d.name,
      summary: SKELETON_BLANK,
      tags: [d.key],
      complexity: fileCount < 8 ? "simple" : fileCount < 20 ? "moderate" : "complex",
      domainMeta: {},
    });

    for (const root of [...d.roots].sort()) {
      const flows: Array<{
        flowId: string;
        entryPoint: string;
        entryType: "http" | "cron" | "cli";
        line: number;
      }> = [];
      for (const r of routesByFile.get(root) ?? []) {
        flows.push({
          flowId: `flow:${stripPrefix(r.routeId, "route:")}`,
          entryPoint: `${r.method} ${r.path}`,
          entryType: "http",
          line: r.line,
        });
      }
      for (const b of batchByFile.get(root) ?? []) {
        flows.push({
          flowId: `flow:${b.entryId}`,
          entryPoint: b.handler ?? b.entryId,
          entryType: b.trigger === "main" ? "cli" : "cron",
          line: b.line,
        });
      }
      flows.sort((a, b) => cmp(a.flowId, b.flowId));

      // step 체인은 flow가 아니라 루트 파일에 결정된다(동일 파일의 모든
      // flow가 같은 체인을 공유) — flow마다 동일 체인을 복제 등재한다.
      const chain = stepChain(root, adjacency, stepCap);
      // 곁가지 접기(v1): 추상 베이스 클래스는 흐름의 독립 단계가 아니라 하위
      // 구현이 상속하는 공통 인프라(부모 플레이밍)다 — 하위 step과 중복이므로
      // step에서 접는다. 루트(진입 파일)는 라우트의 닻이라 항상 보존한다.
      const stepFiles = chain.files.filter((f) => f === root || !isAbstractBase(f, javaFacts));

      for (const flow of flows) {
        const flowKey = stripPrefix(flow.flowId, "flow:");
        nodes.push({
          id: flow.flowId,
          type: "flow",
          name: SKELETON_BLANK,
          summary: SKELETON_BLANK,
          tags: [d.key],
          complexity:
            stepFiles.length <= 3
              ? "simple"
              : stepFiles.length <= 6
                ? "moderate"
                : "complex",
          filePath: root,
          lineRange: [flow.line, flow.line],
          domainMeta: { entryPoint: flow.entryPoint, entryType: flow.entryType },
        });
        edges.push({
          source: `domain:${d.key}`,
          target: flow.flowId,
          type: "contains_flow",
          direction: "forward",
          weight: 1,
        });

        stepFiles.forEach((file, i) => {
          const stepId = `step:${flowKey}:${file}`;
          const anchor = stepAnchor(file, javaFacts, file === root ? flow.line : null);
          nodes.push({
            id: stepId,
            type: "step",
            name: SKELETON_BLANK,
            summary: SKELETON_BLANK,
            tags: [d.key],
            complexity: "simple",
            filePath: file,
            lineRange: [anchor.line, anchor.line],
            // 엔진 ground-truth layer (api/service/dao/db/unknown) — 대시보드가
            // 파일명 추측 대신 진실을 읽는다. routes/edges 간선 신호 + 파일명 폴백.
            layer: deriveStepLayer(file, anchor.className, layerSignals),
          });
          stepSources.push({
            stepId,
            relPath: file,
            line: anchor.line,
            className: anchor.className,
          });
          edges.push({
            source: flow.flowId,
            target: stepId,
            type: "flow_step",
            direction: "forward",
            weight: round4((i + 1) / stepFiles.length),
          });
        });
        // 실제 호출/의존 토폴로지(부모→자식) — 합성 순서가 아니라 진짜 파일
        // 인접을 step→step 'calls' 엣지로 emit한다. 대시보드가 이것으로 팬아웃/
        // 분기를 정확히 그린다(예: ActionBean이 두 서비스를 각각 호출 = fan-out이지,
        // 서비스끼리 호출 아님). 양 끝이 모두 이 flow의 step일 때만 등재.
        const inChain = new Set(stepFiles);
        for (const fileA of stepFiles) {
          for (const fileB of adjacency.get(fileA) ?? []) {
            if (!inChain.has(fileB)) continue;
            edges.push({
              source: `step:${flowKey}:${fileA}`,
              target: `step:${flowKey}:${fileB}`,
              type: "calls",
              direction: "forward",
              weight: 1,
            });
          }
        }
        if (chain.dropped.length > 0) {
          truncatedSteps.push({ flowId: flow.flowId, dropped: chain.dropped });
        }
      }
    }
  }

  // cross_domain: 서로 다른 도메인의 파일 간 직접 간선. 양 끝 모두 도달성
  // (sole/루트) 배정 파일로 제한한다 — 디렉토리/prefix 휴리스틱 배정 파일은
  // 폴더 위치만으로 도메인 상호작용을 주장하게 되므로 제외(리뷰 반영).
  // shared(공용) 파일 경유는 도메인 무소속이라 자연히 빠진다.
  const crossSeen = new Set<string>();
  for (const e of edgesReport.edges) {
    if (!reachAssigned.has(e.source) || !reachAssigned.has(e.target)) continue;
    const from = domainByFile.get(e.source);
    const to = domainByFile.get(e.target);
    if (!from || !to || from === to) continue;
    const key = `${from} ${to}`;
    if (crossSeen.has(key)) continue;
    crossSeen.add(key);
    edges.push({
      source: `domain:${from}`,
      target: `domain:${to}`,
      type: "cross_domain",
      direction: "forward",
      weight: 1,
    });
  }

  // ── 결정론 경계: 고정 정렬 (노드 type→id, 엣지 type→source→weight→target) ──
  const typeOrder: Record<UaGraphNode["type"], number> = { domain: 0, flow: 1, step: 2 };
  nodes.sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || cmp(a.id, b.id));
  const edgeTypeOrder: Record<UaGraphEdge["type"], number> = {
    contains_flow: 0,
    flow_step: 1,
    cross_domain: 2,
    calls: 3,
  };
  edges.sort(
    (a, b) =>
      edgeTypeOrder[a.type] - edgeTypeOrder[b.type] ||
      cmp(a.source, b.source) ||
      a.weight - b.weight ||
      cmp(a.target, b.target),
  );
  stepSources.sort((a, b) => cmp(a.stepId, b.stepId));
  truncatedSteps.sort((a, b) => cmp(a.flowId, b.flowId));

  assertUniqueNodeIds(nodes);

  return {
    schemaVersion: 1,
    gitCommit: candidates.gitCommit,
    stepCap,
    nodes,
    edges,
    stepSources,
    truncatedSteps,
  };
}

/** 루트에서 간선을 따라가는 step 체인 — (깊이, 경로) 정렬, cap 초과는 보고. */
function stepChain(
  root: string,
  adjacency: Map<string, string[]>,
  stepCap: number,
): { files: string[]; dropped: string[] } {
  const depthOf = new Map<string, number>([[root, 0]]);
  let frontier = [root];
  for (let depth = 0; depth < STEP_DEPTH_CAP && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const file of frontier) {
      for (const target of adjacency.get(file) ?? []) {
        if (!depthOf.has(target)) {
          depthOf.set(target, depth + 1);
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  const ordered = [...depthOf.entries()]
    .sort((a, b) => a[1] - b[1] || cmp(a[0], b[0]))
    .map(([file]) => file);
  return { files: ordered.slice(0, stepCap), dropped: ordered.slice(stepCap) };
}

function stepAnchor(
  relPath: string,
  javaFacts: Map<string, JavaFileFacts>,
  overrideLine: number | null,
): { line: number; className: string | null } {
  if (overrideLine !== null) {
    const cls = javaFacts.get(relPath)?.classes[0];
    return { line: overrideLine, className: cls?.name ?? null };
  }
  const cls = javaFacts.get(relPath)?.classes[0];
  if (cls) return { line: cls.line, className: cls.name };
  return { line: 1, className: null };
}

/** 주 클래스가 abstract인 파일 = 추상 베이스(공통 인프라). 곁가지 접기 대상. */
function isAbstractBase(relPath: string, javaFacts: Map<string, JavaFileFacts>): boolean {
  return javaFacts.get(relPath)?.classes[0]?.isAbstract ?? false;
}

function buildAdjacency(edgesReport: EdgesReport): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const e of edgesReport.edges) {
    const list = adjacency.get(e.source);
    if (list) list.push(e.target);
    else adjacency.set(e.source, [e.target]);
  }
  for (const [source, targets] of adjacency) {
    adjacency.set(source, [...new Set(targets)].sort());
  }
  return adjacency;
}

function assertUniqueNodeIds(nodes: UaGraphNode[]): void {
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) {
      throw new Error(`skeleton invariant violation: duplicate node id "${n.id}"`);
    }
    seen.add(n.id);
  }
}

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

