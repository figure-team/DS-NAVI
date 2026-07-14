import { memo, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { applyElkLayout } from "../../utils/elk-layout";
import { mergeElkPositions, nodesToElkInput } from "../../utils/layout";
import { useDiffLabels } from "../../hooks/useDiffLabels";
import { useI18n } from "../../contexts/I18nContext";
import type { AggregatedEdge, ImpactMark } from "../../utils/structureGraph";

/**
 * 뎁스1·2 공용 그래프형(U-A) 렌더러 — understand-anything.com/demo 의 "Domain" 탭
 * (은퇴한 DomainGraphView + DomainClusterNode, c4e4856e 직전 상태)의 실제 룩앤필을
 * 부활: 도메인 클러스터 카드(accent 테두리 라운드 박스 + 요약 + 칩 + 하단 통계) +
 * accent 점선 애니메이션 엣지 + ELK direction=RIGHT + 점 배경/컨트롤/미니맵.
 * 카드 스타일·엣지 스타일은 원본 무수정, 데이터만 4뎁스 구조(그룹/서브도메인)에
 * 맞춰 주입한다(뎁스1=그룹 카드+서브도메인 칩, 뎁스2=서브도메인 카드+엔티티 칩).
 * 원본의 클릭=선택/더블클릭=드릴다운 대신, 다른 구조 렌더러와 동일하게
 * 클릭=드릴다운(onOpenNode) 하나로 통일한다.
 */

/** 원본 DomainGraphView 가 ELK 에 먹이던 카드 추정 크기(320×180) 그대로. */
const NODE_W = 320;
const NODE_H = 180;
/** 원본 DomainClusterNode 의 Entities 칩 표시 상한. */
const CHIP_CAP = 5;

export interface DomainStyleGraphNode {
  id: string;
  name: string;
  icon: string;
  /** 카드 본문 요약 — 뎁스1은 집계 한 줄, 뎁스2는 도메인 설명(prose). */
  summary: string;
  /** 칩 목록(뎁스1=서브도메인, 뎁스2=엔티티) — CHIP_CAP 초과분은 "+N"으로 접힘. */
  chips: string[];
  /** 칩 섹션 라벨(원본의 "Entities" 자리). */
  chipsLabel: string;
  /** 카드 하단 한 줄(원본의 "N flows" 자리 — 기능 수 · 근거율). */
  footer: string;
  impact: ImpactMark;
  /** 임팩트 오버레이 개수 칩(뎁스1 그룹 집계) — 0이면 숨김. */
  diffChangedCount: number;
  diffAffectedCount: number;
}

interface CardData {
  n: DomainStyleGraphNode;
  onOpen: (id: string) => void;
  [key: string]: unknown;
}

/** DomainClusterNode 시각 언어 무수정 클론 — 데이터 주입만 구조 탭용 prop 으로. */
const DomainStyleCard = memo(function DomainStyleCard({ data }: NodeProps) {
  const { n, onOpen } = data as CardData;
  const { lblChanged, lblAffected } = useDiffLabels();

  // ktds-fork (ADR-003): 변경 포함=적, 영향만=호박 (테두리+글로우 — DomainClusterNode 와 동일)
  const impactStyle =
    n.impact === "changed"
      ? { borderColor: "var(--color-diff-changed)", boxShadow: "0 0 16px rgba(224, 82, 82, 0.35)" }
      : n.impact === "affected"
        ? { borderColor: "var(--color-diff-affected)", boxShadow: "0 0 12px rgba(212, 160, 48, 0.3)" }
        : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-xl border-2 px-5 py-4 min-w-[280px] max-w-[360px] cursor-pointer transition-all border-accent/40 bg-surface hover:border-accent/70"
      style={impactStyle}
      onClick={() => onOpen(n.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(n.id);
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent/60 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent/60 !w-2 !h-2" />

      <div className="flex items-center gap-1.5 mb-1">
        {n.icon && <span aria-hidden className="shrink-0 text-sm leading-none">{n.icon}</span>}
        <span className="font-heading text-sm text-accent font-semibold truncate">{n.name}</span>
        {n.diffChangedCount > 0 && (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]">
            {lblChanged} {n.diffChangedCount}
          </span>
        )}
        {n.diffAffectedCount > 0 && (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
            {lblAffected} {n.diffAffectedCount}
          </span>
        )}
      </div>
      <div className="text-[11px] text-text-secondary line-clamp-2 mb-2">{n.summary}</div>

      {n.chips.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-wider text-text-muted mb-1">{n.chipsLabel}</div>
          <div className="flex flex-wrap gap-1">
            {n.chips.slice(0, CHIP_CAP).map((c, i) => (
              // truncate — 엔티티가 "이름 — 설명" 프로즈일 수 있어(칩이 문단으로
              // 불어나면 ELK 추정 높이 180 을 초과해 카드가 겹친다) 한 줄로 자른다.
              <span key={`${i}-${c}`} className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-text-secondary max-w-[140px] truncate" title={c}>
                {c}
              </span>
            ))}
            {n.chips.length > CHIP_CAP && (
              <span className="text-[10px] text-text-muted">+{n.chips.length - CHIP_CAP}</span>
            )}
          </div>
        </div>
      )}

      {n.footer && <div className="text-[10px] text-text-muted">{n.footer}</div>}
    </div>
  );
});

const NODE_TYPES = { "domain-cluster": DomainStyleCard };

export default function StructureDomainGraphUA({
  nodes,
  edges,
  onOpenNode,
  onEdgeClick,
  emptyLabel,
}: {
  nodes: DomainStyleGraphNode[];
  edges: AggregatedEdge[];
  onOpenNode: (id: string) => void;
  onEdgeClick: (edge: AggregatedEdge, point: { x: number; y: number }) => void;
  emptyLabel: string;
}) {
  const { t } = useI18n();
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }> | null>(null);

  useEffect(() => {
    if (nodes.length === 0) {
      setPositions(null);
      return;
    }
    let cancelled = false;
    const rfNodes: Node[] = nodes.map((n) => ({ id: n.id, type: "domain-cluster", position: { x: 0, y: 0 }, data: {} }));
    const rfEdges: Edge[] = edges.map((e) => ({ id: e.id, source: e.from, target: e.to }));
    const dims = new Map(nodes.map((n) => [n.id, { width: NODE_W, height: NODE_H }]));
    // 원본 DomainGraphView 와 동일 — 공용 기본 옵션 위에 direction=RIGHT 만 덮어쓴다.
    const input = nodesToElkInput(rfNodes, rfEdges, dims, { "elk.direction": "RIGHT" });
    applyElkLayout(input).then(({ positioned }) => {
      if (cancelled) return;
      setPositions(new Map(mergeElkPositions(rfNodes, positioned).map((n) => [n.id, n.position])));
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!positions) return [];
    return nodes.map(
      (n): Node => ({
        id: n.id,
        type: "domain-cluster",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { n, onOpen: onOpenNode } satisfies CardData,
        draggable: false,
        connectable: false,
        selectable: true,
      }),
    );
  }, [nodes, positions, onOpenNode]);

  // 원본 cross_domain 엣지 스타일 무수정(accent 점선 + 애니메이션 + 라벨 칩) —
  // 라벨만 description 대신 근거 파일 수(클릭 시 EdgeEvidencePopover 와 동일 어휘).
  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: t.structure.evidenceWeight.replace("{count}", String(e.weight)),
        style: { stroke: "var(--color-accent)", strokeDasharray: "6 3", strokeWidth: 2 },
        labelStyle: { fill: "var(--color-text-muted)", fontSize: 10 },
        labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.9 },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 4,
        animated: true,
      })),
    [edges, t],
  );

  if (nodes.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {positions && (
        <ReactFlowProvider>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onEdgeClick={(evt, edge) => {
              const src = edges.find((e) => e.id === edge.id);
              if (src) onEdgeClick(src, { x: evt.clientX, y: evt.clientY });
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border-subtle)" />
            <Controls />
            <MiniMap
              nodeColor="var(--color-accent)"
              maskColor="var(--glass-bg)"
              className="!bg-surface !border !border-border-subtle"
            />
          </ReactFlow>
        </ReactFlowProvider>
      )}
    </div>
  );
}
