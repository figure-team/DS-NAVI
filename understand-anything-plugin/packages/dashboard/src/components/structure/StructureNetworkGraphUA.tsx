import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { applyElkLayout } from "../../utils/elk-layout";
import type { AggregatedEdge } from "../../utils/structureGraph";
import type { StructureGraphNode } from "./StructureNetworkGraph";

/**
 * 뎁스1·2 그래프 렌더러 — "그래프형(U-A)" 탭(사용자가 카드형과 비교 후 택1 예정).
 * 은퇴한 구 U-A KG 뷰(CustomNode/GraphView, c4e4856e 이전)의 시각 언어를 같은
 * 데이터(StructureNetworkGraph 와 동일한 nodes/edges)에 재적용한다:
 * 컴팩트 노드(아이콘+이름+최소 배지) + 곡선 관계선(화살표) + MiniMap/Controls +
 * 자유 드래그. 레이아웃 알고리즘(ELK)만 카드형과 공유하고, 노드·엣지 렌더링은
 * 전혀 다른 컴포넌트 — 카드형(StructureNetworkGraph)은 이 파일이 손대지 않는다.
 */

const NODE_W = 168;
const NODE_H = 48;

interface CompactNodeData {
  n: StructureGraphNode;
  onOpen: (id: string) => void;
  [key: string]: unknown;
}

function CompactNode({ data }: NodeProps) {
  const { n, onOpen } = data as CompactNodeData;
  const impactColor =
    n.impact === "changed"
      ? "var(--color-diff-changed)"
      : n.impact === "affected"
        ? "var(--color-diff-affected)"
        : null;
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
      className="cursor-pointer transition-shadow hover:shadow-md"
      style={{
        width: NODE_W,
        height: NODE_H,
        borderRadius: 8,
        border: `1.5px solid ${impactColor ?? "var(--color-border-subtle)"}`,
        background: "var(--color-elevated)",
        boxShadow: impactColor
          ? `0 0 0 2px color-mix(in srgb, ${impactColor} 25%, transparent)`
          : "0 1px 2px rgba(26,27,31,.06)",
        display: "flex",
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ width: 4, flexShrink: 0, background: n.color }} />
      <div
        style={{
          minWidth: 0,
          flex: 1,
          padding: "5px 8px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{n.icon}</span>
          <span className="text-text-primary font-semibold truncate" style={{ fontSize: 12 }} title={n.name}>
            {n.name}
          </span>
        </div>
        {n.groundedPct !== null && (
          <span className="text-text-muted tabular-nums" style={{ fontSize: 9.5 }} title={n.statLine}>
            {n.groundedPct}%
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { compact: CompactNode };

export default function StructureNetworkGraphUA({
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
  const [layout, setLayout] = useState<Map<string, { x: number; y: number }> | null>(null);

  useEffect(() => {
    if (nodes.length === 0) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    const input = {
      id: "structure-ua",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "64",
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "14",
      },
      children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
      edges: edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
    };
    applyElkLayout(input).then(({ positioned }) => {
      if (cancelled) return;
      setLayout(new Map((positioned.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])));
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return nodes.map((n) => ({
      id: n.id,
      type: "compact",
      position: layout.get(n.id) ?? { x: 0, y: 0 },
      width: NODE_W,
      height: NODE_H,
      data: { n, onOpen: onOpenNode } satisfies CompactNodeData,
      // draggable(기본값) — 조감도 느낌으로 자유 재배치 허용(카드형은 고정).
      connectable: false,
      selectable: true,
    }));
  }, [nodes, layout, onOpenNode]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    return edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      // 기본(bezier) 곡선 — 카드형의 ELK 직각 라우팅과 대비되는 핵심 시각 차이.
      type: "default",
      label: String(e.weight),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--color-accent)" },
      style: { stroke: "var(--color-accent)", strokeWidth: Math.min(1 + Math.log2(e.weight + 1), 4), opacity: 0.75 },
      labelStyle: { fill: "var(--color-text-muted)", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "var(--color-panel)", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
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
            onEdgeClick={(evt, edge) => {
              const src = edges.find((e) => e.id === edge.id);
              if (src) onEdgeClick(src, { x: evt.clientX, y: evt.clientY });
            }}
            onInit={(rf) => void rf.fitView({ padding: 0.25, maxZoom: 1.1 })}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background variant={BackgroundVariant.Dots} color="var(--color-edge-dot)" gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => (node.data as unknown as CompactNodeData)?.n?.color ?? "var(--color-elevated)"}
              maskColor="var(--glass-bg)"
              className="!bg-surface !border !border-border-subtle"
            />
          </ReactFlow>
        </ReactFlowProvider>
      )}
    </div>
  );
}
