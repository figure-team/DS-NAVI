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
import { DETAIL_NODE_HEIGHT, DETAIL_NODE_WIDTH, ELK_DETAIL_LAYOUT_OPTIONS, mergeElkPositions, nodesToElkInput } from "../../utils/layout";
import ElkEdge from "../ElkEdge";
import CustomNode, { type CustomNodeData } from "../CustomNode";
import ContainerNode, { type ContainerNodeData } from "../ContainerNode";
import MoreChipNode, { type MoreChipNodeData } from "../MoreChipNode";
import { useI18n } from "../../contexts/I18nContext";
import type { AggregatedEdge } from "../../utils/structureGraph";
import type { StructureGraphNode } from "./StructureNetworkGraph";

const NODE_TYPES = { custom: CustomNode, container: ContainerNode, "more-chip": MoreChipNode };
const EDGE_TYPES = { elk: ElkEdge };

/** 한 번에 그리는 pill 상한 — 초과분은 MoreChipNode("+N개")로 집계(원본 점진 공개 관례). */
const PILL_CAP = 18;
const CONTAINER_PADDING = 28;
const CONTAINER_HEADER_H = 44;

/** 그룹 key 문자열 → 안정적 팔레트 인덱스(그룹마다 다른 색, 결정론). */
function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

/**
 * 뎁스2 그래프형(U-A) 탭 — 은퇴한 구 GraphView "레이어 상세"(펼친 컨테이너 + 내부
 * pill) 화면의 실제 룩앤필을 부활(c4e4856e). 선택 그룹 전체를 ContainerNode
 * 박스 하나(항상 펼침 상태)로, 그 안에 서브도메인들을 CustomNode pill로 배치한다
 * (ContainerNode/CustomNode 는 원본 그대로 — 좌표만 겹쳐 시각적으로 "안에 담긴"
 * 것처럼 보이게 함, ELK 계층 레이아웃 없이 단일 좌표계 공유로 단순화). 서브 간
 * 엣지는 뎁스1과 같은 ElkEdge 직각 라우팅. 그룹 밖으로 나가는 엣지는 생략
 * (미니멀 — 그 관계는 뎁스1 화면이 이미 보여준다).
 */
export default function StructureContainerGraphUA({
  groupKey,
  groupName,
  nodes,
  edges,
  onOpenNode,
  onEdgeClick,
  emptyLabel,
}: {
  /** null = groups 없는 프로젝트의 평면 폴백 — 이 경우 컨테이너 박스 없이 pill만. */
  groupKey: string | null;
  groupName: string | null;
  nodes: StructureGraphNode[];
  edges: AggregatedEdge[];
  onOpenNode: (id: string) => void;
  onEdgeClick: (edge: AggregatedEdge, point: { x: number; y: number }) => void;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);

  const shown = useMemo(() => (showAll ? nodes : nodes.slice(0, PILL_CAP)), [nodes, showAll]);
  const hiddenCount = nodes.length - shown.length;
  const shownIds = useMemo(() => new Set(shown.map((n) => n.id)), [shown]);
  const shownEdges = useMemo(
    () => edges.filter((e) => shownIds.has(e.from) && shownIds.has(e.to)),
    [edges, shownIds],
  );

  const [layout, setLayout] = useState<{
    positions: Map<string, { x: number; y: number }>;
    edgePoints: Map<string, ElkPoint[]>;
  } | null>(null);

  useEffect(() => {
    if (shown.length === 0) {
      setLayout(null);
      return;
    }
    let cancelled = false;
    const rfNodes: Node[] = shown.map((n) => ({ id: n.id, type: "custom", position: { x: 0, y: 0 }, data: {} }));
    const rfEdges: Edge[] = shownEdges.map((e) => ({ id: e.id, source: e.from, target: e.to }));
    const dims = new Map(shown.map((n) => [n.id, { width: DETAIL_NODE_WIDTH, height: DETAIL_NODE_HEIGHT }]));
    const input = nodesToElkInput(rfNodes, rfEdges, dims, ELK_DETAIL_LAYOUT_OPTIONS);
    applyElkLayout(input).then(({ positioned }) => {
      if (cancelled) return;
      const positions = new Map(mergeElkPositions(rfNodes, positioned).map((n) => [n.id, n.position]));
      setLayout({ positions, edgePoints: elkEdgePointMap(positioned) });
    });
    return () => {
      cancelled = true;
    };
  }, [shown, shownEdges]);

  const pillNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return shown.map(
      (n): Node => ({
        id: n.id,
        type: "custom",
        position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: n.name,
          nodeType: "domain",
          summary: n.statLine,
          complexity: "",
          isHighlighted: false,
          isSelected: false,
          isDiffChanged: n.impact === "changed",
          isDiffAffected: n.impact === "affected",
          isDiffFaded: false,
          isNeighbor: false,
          isSelectionFaded: false,
          tags: [],
          onNodeClick: onOpenNode,
        } satisfies CustomNodeData,
      }),
    );
  }, [shown, layout, onOpenNode]);

  // "+N개" 칩 — 원본 MoreChipNode 위치는 pill 그리드 바로 옆(마지막 랭크 오른쪽).
  const moreChipNode = useMemo<Node | null>(() => {
    if (!layout || hiddenCount <= 0) return null;
    let maxX = -Infinity;
    let refY = 0;
    for (const n of shown) {
      const p = layout.positions.get(n.id);
      if (!p) continue;
      if (p.x > maxX) {
        maxX = p.x;
        refY = p.y;
      }
    }
    if (maxX === -Infinity) return null;
    return {
      id: "__more_chip",
      type: "more-chip",
      position: { x: maxX + DETAIL_NODE_WIDTH + 40, y: refY },
      data: {
        containerId: groupKey ?? "flat",
        hiddenCount,
        label: t.structure.evidenceMore.replace("{count}", String(hiddenCount)),
        hint: t.containerNode.showAll,
        onShowAll: () => setShowAll(true),
      } satisfies MoreChipNodeData,
    };
  }, [layout, shown, hiddenCount, groupKey, t]);

  // 컨테이너 박스 — pill 좌표 bbox 를 감싸도록 위치/크기만 계산(ELK 계층 레이아웃 없이
  // 같은 좌표계에 겹쳐 그린다 — 낮은 배열 순서로 pill 아래 깔림).
  const containerNode = useMemo<Node | null>(() => {
    if (!layout || !groupName || shown.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of shown) {
      const p = layout.positions.get(n.id);
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + DETAIL_NODE_WIDTH);
      maxY = Math.max(maxY, p.y + DETAIL_NODE_HEIGHT);
    }
    if (moreChipNode) {
      maxX = Math.max(maxX, moreChipNode.position.x + DETAIL_NODE_WIDTH);
      maxY = Math.max(maxY, moreChipNode.position.y + DETAIL_NODE_HEIGHT);
    }
    if (minX === Infinity) return null;
    const changedCount = nodes.filter((n) => n.impact === "changed").length;
    const affectedCount = nodes.filter((n) => n.impact === "affected").length;
    return {
      id: "__container",
      type: "container",
      position: { x: minX - CONTAINER_PADDING, y: minY - CONTAINER_PADDING - CONTAINER_HEADER_H },
      width: maxX - minX + CONTAINER_PADDING * 2,
      height: maxY - minY + CONTAINER_PADDING * 2 + CONTAINER_HEADER_H,
      draggable: false,
      selectable: false,
      zIndex: -1,
      data: {
        containerId: groupKey ?? "flat",
        name: groupName,
        childCount: nodes.length,
        strategy: "folder",
        colorIndex: hashIndex(groupKey ?? groupName, 7),
        isExpanded: true,
        hasSearchHits: false,
        isDiffAffected: affectedCount > 0,
        diffChangedCount: changedCount,
        diffAffectedCount: affectedCount,
        isFocusedViaChild: false,
        onToggle: () => {},
      } satisfies ContainerNodeData,
    };
  }, [layout, groupName, groupKey, shown, nodes, moreChipNode]);

  const rfNodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    if (containerNode) out.push(containerNode);
    out.push(...pillNodes);
    if (moreChipNode) out.push(moreChipNode);
    return out;
  }, [containerNode, pillNodes, moreChipNode]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    return shownEdges.map((e) => ({
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
  }, [shownEdges, layout]);

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
