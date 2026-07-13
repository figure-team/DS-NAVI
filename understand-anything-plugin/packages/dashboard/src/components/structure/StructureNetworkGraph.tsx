import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import GroundedBar from "../GroundedBar";
import ElkEdge from "../ElkEdge";
import { applyElkLayout, elkEdgePointMap, type ElkPoint } from "../../utils/elk-layout";
import type { AggregatedEdge, ImpactMark } from "../../utils/structureGraph";

/**
 * 뎁스1(그룹)·뎁스2(서브도메인) 공용 그래프 렌더러(STRUCTURE_FROM_MAP_DESIGN §4) —
 * 신규 렌더러는 이 하나뿐(나머지는 BusinessFlowView/FlowSpineView 재사용). ELK
 * 레이어드 레이아웃 + ElkEdge 라우팅 포인트 직접 렌더([[dashboard-edge-routing]]
 * 교훈 재사용) + 노드/엣지 카드형. 관계선(엣지)은 구조 메뉴의 정체성이라 허용
 * (설계 §1 주석 — 업무 지도의 "관계선 금지"는 이 메뉴에 적용되지 않는다).
 */

export interface StructureGraphNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** 카드 우측 통계 한 줄(예: "서브도메인 6개 · 기능 42개"). */
  statLine: string;
  groundedPct: number | null;
  groundedCount: number;
  reviewCount: number;
  impact: ImpactMark;
}

const NODE_W = 236;
const NODE_H = 92;

interface StructNodeData {
  n: StructureGraphNode;
  onOpen: (id: string) => void;
  [key: string]: unknown;
}

function StructNode({ data }: NodeProps) {
  const { n, onOpen } = data as StructNodeData;
  const impactBorder =
    n.impact === "changed"
      ? "var(--color-diff-changed)"
      : n.impact === "affected"
        ? "var(--color-diff-affected)"
        : "var(--color-border-subtle)";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(n.id);
        }
      }}
      className="cursor-pointer transition-colors hover:border-accent"
      style={{
        width: NODE_W,
        height: NODE_H,
        borderRadius: 10,
        border: `1.5px solid ${impactBorder}`,
        background: "var(--color-panel)",
        boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
        padding: "10px 12px",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5 min-w-0">
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{n.icon}</span>
        <span className="text-text-primary font-semibold truncate" style={{ fontSize: 13.5 }} title={n.name}>
          {n.name}
        </span>
      </div>
      <div className="text-text-muted truncate" style={{ fontSize: 11, marginTop: 3 }} title={n.statLine}>
        {n.statLine}
      </div>
      {n.groundedPct !== null && (
        <div style={{ marginTop: 7 }}>
          <GroundedBar pct={n.groundedPct} grounded={n.groundedCount} review={n.reviewCount} />
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { struct: StructNode };
const EDGE_TYPES = { elk: ElkEdge };

export default function StructureNetworkGraph({
  nodes,
  edges,
  onOpenNode,
  onEdgeClick,
  emptyLabel,
}: {
  nodes: StructureGraphNode[];
  edges: AggregatedEdge[];
  onOpenNode: (id: string) => void;
  onEdgeClick: (edge: AggregatedEdge, point: { x: number; y: number }) => void;
  emptyLabel: string;
}) {
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
    const input = {
      id: "structure",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
        "elk.spacing.edgeNode": "24",
        "elk.spacing.edgeEdge": "16",
        "elk.edgeRouting": "ORTHOGONAL",
      },
      children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
      edges: edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
    };
    applyElkLayout(input).then(({ positioned }) => {
      if (cancelled) return;
      const positions = new Map(
        (positioned.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
      );
      setLayout({ positions, edgePoints: elkEdgePointMap(positioned) });
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return nodes.map((n) => ({
      id: n.id,
      type: "struct",
      position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
      width: NODE_W,
      height: NODE_H,
      data: { n, onOpen: onOpenNode } satisfies StructNodeData,
      draggable: false,
      connectable: false,
      // selectable:false makes React Flow set pointer-events:none on the node
      // wrapper, which blocks clicks from ever reaching the inner onClick div
      // (BusinessFlowView hits the same constraint — selectable:true there too).
      selectable: true,
    }));
  }, [nodes, layout, onOpenNode]);

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
            onInit={(rf) => void rf.fitView({ padding: 0.2, maxZoom: 1.1 })}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background gap={24} size={1} />
          </ReactFlow>
        </ReactFlowProvider>
      )}
    </div>
  );
}
