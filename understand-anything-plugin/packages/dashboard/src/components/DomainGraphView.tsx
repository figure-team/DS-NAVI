import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import DomainClusterNode from "./DomainClusterNode";
import type { DomainClusterFlowNode } from "./DomainClusterNode";
import FlowNode from "./FlowNode";
import type { FlowFlowNode } from "./FlowNode";
import StepNode from "./StepNode";
import type { StepFlowNode } from "./StepNode";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { mergeElkPositions, nodesToElkInput } from "../utils/layout";
import { applyElkLayout } from "../utils/elk-layout";
import type { KnowledgeGraph, GraphNode } from "@understand-anything/core/types";

const nodeTypes = {
  "domain-cluster": DomainClusterNode,
  "flow-node": FlowNode,
  "step-node": StepNode,
};

function getDomainMeta(node: GraphNode) {
  return node.domainMeta;
}

interface BuiltGraph {
  nodes: Node[];
  edges: Edge[];
  dims: Map<string, { width: number; height: number }>;
}

// ktds-fork: 영향도(diff) 오버레이의 도메인 뷰 투영 — 변경/영향 "파일 경로" 집합.
// 오버레이의 노드 id는 KG(file:/config:) id라 도메인 그래프 id와 직접 매칭이
// 안 되고, step/flow 노드의 filePath로 조인한다(둘 다 서버가 상대화해 서빙).
interface DomainDiffSets {
  changed: Set<string>;
  affected: Set<string>;
}

function buildDomainOverview(graph: KnowledgeGraph, diff: DomainDiffSets | null): BuiltGraph {
  const dims = new Map<string, { width: number; height: number }>();
  const domainNodes = graph.nodes.filter((n) => n.type === "domain");

  // Count flows per domain
  const flowCountMap = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "contains_flow") {
      flowCountMap.set(edge.source, (flowCountMap.get(edge.source) ?? 0) + 1);
    }
  }

  // ktds-fork: 도메인별 변경/영향 파일 수 — 멤버 = 흐름 entry 파일 ∪ step 파일
  // (경로 단위 dedupe). 한 파일이 여러 도메인에 도달하면 각 도메인에 계상.
  let diffByDomain: Map<string, { changed: number; affected: number }> | null = null;
  if (diff) {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const flowToDomain = new Map<string, string>();
    for (const e of graph.edges) {
      if (e.type === "contains_flow") flowToDomain.set(e.target, e.source);
    }
    const members = new Map<string, Set<string>>();
    const addMember = (domainId: string | undefined, filePath: string | undefined) => {
      if (!domainId || !filePath) return;
      let s = members.get(domainId);
      if (!s) {
        s = new Set();
        members.set(domainId, s);
      }
      s.add(filePath);
    };
    for (const [flowId, domId] of flowToDomain) addMember(domId, nodeById.get(flowId)?.filePath);
    for (const e of graph.edges) {
      if (e.type === "flow_step") addMember(flowToDomain.get(e.source), nodeById.get(e.target)?.filePath);
    }
    diffByDomain = new Map();
    for (const [domId, paths] of members) {
      let changed = 0;
      let affected = 0;
      for (const p of paths) {
        if (diff.changed.has(p)) changed += 1;
        else if (diff.affected.has(p)) affected += 1;
      }
      if (changed + affected > 0) diffByDomain.set(domId, { changed, affected });
    }
  }
  // 어떤 도메인에도 diff가 안 잡히면 전체 fade 방지 (계층 뷰와 동일 가드)
  const anyDomainDiff = (diffByDomain?.size ?? 0) > 0;

  const rfNodes: DomainClusterFlowNode[] = domainNodes.map((node) => {
    const meta = getDomainMeta(node);
    const data = {
      label: node.name,
      summary: node.summary,
      entities: meta?.entities as string[] | undefined,
      flowCount: flowCountMap.get(node.id) ?? 0,
      businessRules: meta?.businessRules as string[] | undefined,
      domainId: node.id,
      // ktds-fork: diff 칩 + 무관 도메인 흐림
      diffChangedCount: diffByDomain?.get(node.id)?.changed,
      diffAffectedCount: diffByDomain?.get(node.id)?.affected,
      isDiffFaded: anyDomainDiff && !diffByDomain?.has(node.id),
    };
    dims.set(node.id, { width: 320, height: 180 });
    return {
      id: node.id,
      type: "domain-cluster" as const,
      position: { x: 0, y: 0 },
      data,
    };
  });

  const rfEdges: Edge[] = graph.edges
    .filter((e) => e.type === "cross_domain")
    .map((e, i) => ({
      id: `cd-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.description ?? "",
      style: { stroke: "var(--color-accent)", strokeDasharray: "6 3", strokeWidth: 2 },
      labelStyle: { fill: "var(--color-text-muted)", fontSize: 10 },
      labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.9 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      animated: true,
    }));

  return { nodes: rfNodes as unknown as Node[], edges: rfEdges, dims };
}

function buildDomainDetail(
  graph: KnowledgeGraph,
  domainId: string,
  diff: DomainDiffSets | null,
): BuiltGraph {
  // Find flows for this domain
  const flowIds = new Set(
    graph.edges
      .filter((e) => e.type === "contains_flow" && e.source === domainId)
      .map((e) => e.target),
  );

  const flowNodes = graph.nodes.filter((n) => flowIds.has(n.id));
  const stepEdges = graph.edges.filter(
    (e) => e.type === "flow_step" && flowIds.has(e.source),
  );
  const stepIds = new Set(stepEdges.map((e) => e.target));
  const stepNodes = graph.nodes.filter((n) => stepIds.has(n.id));

  // Build step order map
  const stepOrderMap = new Map<string, number>();
  for (const edge of stepEdges) {
    stepOrderMap.set(edge.target, edge.weight);
  }

  // Count steps per flow
  const stepCountMap = new Map<string, number>();
  for (const edge of stepEdges) {
    stepCountMap.set(edge.source, (stepCountMap.get(edge.source) ?? 0) + 1);
  }

  const dims = new Map<string, { width: number; height: number }>();

  // ktds-fork: step 파일 경로 ↔ 변경/영향 집합 조인. 흐름은 entry 파일 ∪
  // 소속 step 파일을 멤버로 집계(경로 dedupe).
  let stepStatus: Map<string, "changed" | "affected"> | null = null;
  let flowDiff: Map<string, { changed: number; affected: number }> | null = null;
  if (diff) {
    stepStatus = new Map();
    for (const n of stepNodes) {
      if (!n.filePath) continue;
      if (diff.changed.has(n.filePath)) stepStatus.set(n.id, "changed");
      else if (diff.affected.has(n.filePath)) stepStatus.set(n.id, "affected");
    }
    const stepById = new Map(stepNodes.map((n) => [n.id, n]));
    const flowMembers = new Map<string, Set<string>>();
    for (const f of flowNodes) {
      const s = new Set<string>();
      if (f.filePath) s.add(f.filePath);
      flowMembers.set(f.id, s);
    }
    for (const e of stepEdges) {
      const p = stepById.get(e.target)?.filePath;
      if (p) flowMembers.get(e.source)?.add(p);
    }
    flowDiff = new Map();
    for (const [fid, paths] of flowMembers) {
      let changed = 0;
      let affected = 0;
      for (const p of paths) {
        if (diff.changed.has(p)) changed += 1;
        else if (diff.affected.has(p)) affected += 1;
      }
      if (changed + affected > 0) flowDiff.set(fid, { changed, affected });
    }
  }
  const anyDetailDiff = (flowDiff?.size ?? 0) > 0 || (stepStatus?.size ?? 0) > 0;

  const flowRfNodes: FlowFlowNode[] = flowNodes.map((node) => {
    const meta = getDomainMeta(node);
    dims.set(node.id, { width: 260, height: 120 });
    return {
      id: node.id,
      type: "flow-node" as const,
      position: { x: 0, y: 0 },
      data: {
        label: node.name,
        summary: node.summary,
        entryPoint: meta?.entryPoint as string | undefined,
        entryType: meta?.entryType as string | undefined,
        stepCount: stepCountMap.get(node.id) ?? 0,
        flowId: node.id,
        // ktds-fork
        diffChangedCount: flowDiff?.get(node.id)?.changed,
        diffAffectedCount: flowDiff?.get(node.id)?.affected,
        isDiffFaded: anyDetailDiff && !flowDiff?.has(node.id),
      },
    };
  });
  const stepRfNodes: StepFlowNode[] = stepNodes.map((node) => {
    dims.set(node.id, { width: 200, height: 90 });
    return {
      id: node.id,
      type: "step-node" as const,
      position: { x: 0, y: 0 },
      data: {
        label: node.name,
        summary: node.summary,
        filePath: node.filePath,
        stepId: node.id,
        order: Math.round((stepOrderMap.get(node.id) ?? 0) * 10),
        // ktds-fork
        diffStatus: stepStatus?.get(node.id),
        isDiffFaded: anyDetailDiff && !stepStatus?.has(node.id),
      },
    };
  });
  const rfNodes: Node[] = [...flowRfNodes, ...stepRfNodes];

  const rfEdges: Edge[] = stepEdges.map((e, i) => ({
    id: `fs-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    style: { stroke: "var(--color-border-medium)", strokeWidth: 1.5 },
    animated: false,
  }));

  return { nodes: rfNodes, edges: rfEdges, dims };
}

function DomainGraphViewInner() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const clearActiveDomain = useDashboardStore((s) => s.clearActiveDomain);
  const { t } = useI18n();

  // ktds-fork: diff 오버레이를 도메인 뷰에 투영 — 오버레이의 KG 노드 id를
  // 구조 그래프 인덱스(nodesById)로 filePath 집합으로 환산한다.
  const diffMode = useDashboardStore((s) => s.diffMode);
  const changedNodeIds = useDashboardStore((s) => s.changedNodeIds);
  const affectedNodeIds = useDashboardStore((s) => s.affectedNodeIds);
  const nodesById = useDashboardStore((s) => s.nodesById);

  const diff = useMemo<DomainDiffSets | null>(() => {
    if (!diffMode || changedNodeIds.size === 0) return null;
    const toPaths = (ids: Set<string>) => {
      const out = new Set<string>();
      for (const id of ids) {
        const fp = nodesById.get(id)?.filePath;
        if (fp) out.add(fp);
      }
      return out;
    };
    return { changed: toPaths(changedNodeIds), affected: toPaths(affectedNodeIds) };
  }, [diffMode, changedNodeIds, affectedNodeIds, nodesById]);

  // Build structural nodes/edges/dims synchronously; only the layout call
  // itself is async, so we memo the structural pieces and run ELK in an
  // effect.
  const built = useMemo<BuiltGraph | null>(() => {
    if (!domainGraph) return null;
    if (activeDomainId) {
      return buildDomainDetail(domainGraph, activeDomainId, diff);
    }
    return buildDomainOverview(domainGraph, diff);
  }, [domainGraph, activeDomainId, diff]);

  const [layout, setLayout] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });

  useEffect(() => {
    if (!built) {
      setLayout({ nodes: [], edges: [] });
      return;
    }
    let cancelled = false;
    const { nodes: nodesArray, edges: edgesArray, dims } = built;
    // DomainGraphView used dagre LR; preserve that direction with ELK.
    const elkInput = nodesToElkInput(nodesArray, edgesArray, dims, {
      "elk.direction": "RIGHT",
    });
    applyElkLayout(elkInput, { strict: import.meta.env.DEV })
      .then(({ positioned, issues }) => {
        if (cancelled) return;
        if (issues.length > 0) {
          // Funnel into store so WarningBanner surfaces them.
          useDashboardStore.getState().appendLayoutIssues(issues);
        }
        setLayout({
          nodes: mergeElkPositions(nodesArray, positioned),
          edges: edgesArray,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[domain ELK] layout failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [built]);

  const { nodes, edges } = layout;

  // Double-click is handled by individual node components (e.g. DomainClusterNode)

  if (!domainGraph) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No domain graph available. Run /understand-domain to generate one.
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {activeDomainId && (
        <div className="absolute top-3 left-3 z-10">
          <button
            type="button"
            onClick={() => clearActiveDomain()}
            className="px-3 py-1.5 text-xs rounded-lg bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
          >
            {t.domainView.backToDomains}
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-border-subtle)"
        />
        <Controls />
        <MiniMap
          nodeColor="var(--color-accent)"
          maskColor="var(--glass-bg)"
          className="!bg-surface !border !border-border-subtle"
        />
      </ReactFlow>
    </div>
  );
}

export default function DomainGraphView() {
  return (
    <ReactFlowProvider>
      <DomainGraphViewInner />
    </ReactFlowProvider>
  );
}
