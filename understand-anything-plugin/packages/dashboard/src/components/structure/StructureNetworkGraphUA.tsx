import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import { applyElkLayout, elkEdgePointMap, type ElkPoint } from "../../utils/elk-layout";
import { ELK_OVERVIEW_LAYOUT_OPTIONS, LAYER_CLUSTER_HEIGHT, LAYER_CLUSTER_WIDTH, mergeElkPositions, nodesToElkInput } from "../../utils/layout";
import ElkEdge from "../ElkEdge";
import LayerClusterNode, { type LayerClusterData } from "../LayerClusterNode";
import { useI18n } from "../../contexts/I18nContext";
import type { AggregatedEdge } from "../../utils/structureGraph";
import type { StructureGraphNode } from "./StructureNetworkGraph";

const NODE_TYPES = { "layer-cluster": LayerClusterNode };
const EDGE_TYPES = { elk: ElkEdge };

/**
 * 뎁스1 그래프형(U-A) 탭 — 은퇴한 구 GraphView "오버뷰"(계층 클러스터) 화면의
 * 실제 룩앤필을 부활(c4e4856e, GraphView 은퇴 직전 상태 — LayerClusterNode 는
 * 무수정 스타일로 재사용, 도메인 데이터에 맞춘 최소 어댑터는 LayerClusterNode.tsx
 * 자체 주석 참조). 상단도메인(그룹)마다 박스 하나, 그룹 간 집계 엣지는 ElkEdge
 * 직각 라우팅 — 카드형(StructureNetworkGraph)과 같은 ELK 파이프라인
 * (nodesToElkInput/applyElkLayout/mergeElkPositions, ELK_OVERVIEW_LAYOUT_OPTIONS)
 * 을 그대로 재사용해 옛 오버뷰와 동일한 레이아웃 알고리즘으로 배치한다. 박스
 * 클릭 = 뎁스2 드릴다운(onOpenNode).
 */
export default function StructureNetworkGraphUA({
  nodes,
  edges,
  changedCounts,
  affectedCounts,
  onOpenNode,
  onEdgeClick,
  emptyLabel,
}: {
  nodes: StructureGraphNode[];
  edges: AggregatedEdge[];
  /** 그룹 key → 소속 서브도메인 중 changed/affected 개수(LayerClusterNode diff 칩). */
  changedCounts: Map<string, number>;
  affectedCounts: Map<string, number>;
  onOpenNode: (id: string) => void;
  onEdgeClick: (edge: AggregatedEdge, point: { x: number; y: number }) => void;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const [layout, setLayout] = useState<{
    positions: Map<string, { x: number; y: number }>;
    edgePoints: Map<string, ElkPoint[]>;
  } | null>(null);

  useEffect(() => {
    if (nodes.length === 0) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    const rfNodes: Node[] = nodes.map((n) => ({ id: n.id, type: "layer-cluster", position: { x: 0, y: 0 }, data: {} }));
    const rfEdges: Edge[] = edges.map((e) => ({ id: e.id, source: e.from, target: e.to }));
    const dims = new Map(nodes.map((n) => [n.id, { width: LAYER_CLUSTER_WIDTH, height: LAYER_CLUSTER_HEIGHT }]));
    const input = nodesToElkInput(rfNodes, rfEdges, dims, ELK_OVERVIEW_LAYOUT_OPTIONS);
    applyElkLayout(input).then(({ positioned }) => {
      if (cancelled) return;
      const positions = new Map(mergeElkPositions(rfNodes, positioned).map((n) => [n.id, n.position]));
      setLayout({ positions, edgePoints: elkEdgePointMap(positioned) });
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return nodes.map(
      (n, i): Node => ({
        id: n.id,
        type: "layer-cluster",
        position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          layerId: n.id,
          layerName: n.name,
          layerDescription: n.statLine,
          kindLabel: n.icon,
          footerLabel: n.groundedPct !== null ? `${t.grounding.rate} ${n.groundedPct}%` : "",
          hoverHint: t.structure.clickToExplore,
          layerColorIndex: i,
          diffChangedCount: changedCounts.get(n.id) ?? 0,
          diffAffectedCount: affectedCounts.get(n.id) ?? 0,
          onDrillIn: onOpenNode,
        } satisfies LayerClusterData,
      }),
    );
  }, [nodes, layout, changedCounts, affectedCounts, onOpenNode, t]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    return edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: "elk",
      label: String(e.weight),
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--color-border-medium)" },
      style: { stroke: "var(--color-border-medium)", strokeWidth: Math.min(1 + Math.log2(e.weight + 1), 4) },
      labelStyle: { fill: "var(--color-text-muted)", fontSize: 10.5, fontWeight: 600 },
      data: { points: layout.edgePoints.get(e.id), labelChip: true },
    }));
  }, [edges, layout]);

  if (nodes.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {layout && (
        <ReactFlowProvider>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onEdgeClick={(evt, edge) => {
              const src = edges.find((e) => e.id === edge.id);
              if (src) onEdgeClick(src, { x: evt.clientX, y: evt.clientY });
            }}
            onInit={(rf) => void rf.fitView({ padding: 0.15, maxZoom: 1 })}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background variant={BackgroundVariant.Dots} color="var(--color-edge-dot)" gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor="var(--color-elevated)"
              maskColor="var(--glass-bg)"
              className="!bg-surface !border !border-border-subtle"
            />
          </ReactFlow>
        </ReactFlowProvider>
      )}
    </div>
  );
}
