import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { applyElkLayout, elkEdgePointMap, type ElkPoint } from "../../utils/elk-layout";
import { mergeElkPositions, nodesToElkInput } from "../../utils/layout";
import ElkEdge from "../ElkEdge";
import { useDiffLabels } from "../../hooks/useDiffLabels";
import { useI18n } from "../../contexts/I18nContext";
import {
  mergeBidirectionalEdges,
  type AggregatedEdge,
  type ImpactMark,
  type MergedStructureEdge,
} from "../../utils/structureGraph";

/**
 * 뎁스1·2·3 공용 그래프형(U-A) 렌더러 — understand-anything.com/demo 의 "Domain" 탭
 * (은퇴한 DomainGraphView + DomainClusterNode, c4e4856e 직전 상태)의 카드 룩앤필을
 * 부활: 도메인 클러스터 카드(accent 테두리 라운드 박스 + 요약 + 칩 + 하단 통계) +
 * accent 점선 엣지 + 점 배경/컨트롤/미니맵. 데이터만 4뎁스 구조에 맞춰 주입한다
 * (뎁스1=그룹 카드+서브도메인 칩, 뎁스2=서브도메인 카드+엔티티 칩, 뎁스3=업무
 * 프로세스 카드+기능 칩). 클릭=드릴다운(onOpenNode) 하나로 통일.
 *
 * 엣지 규약(2026-07-14 사용자 확정 4건):
 * ① 양방향(A→B/B→A)은 선 하나로 병합(mergeBidirectionalEdges — 방향별 근거 보존)
 * ② 선 클릭 = 우측 근거 패널(onEdgeClick 에 병합 엣지 전달 — 방향별 섹션 표시)
 * ③④ 원본 베지어 대신 ELK ORTHOGONAL 라우팅(ElkEdge) — 선이 노드를 피해 직각으로
 *     꺾이고, 끝점을 공유하지 않는 선끼리는 전용 트랙(spacing.edgeEdge)으로 분리.
 */

/** 원본 DomainClusterNode 의 Entities 칩 표시 상한. */
const CHIP_CAP = 5;

/**
 * 밀집 그래프 판정 — 평균 차수(2E/N, 병합 후)가 이 값을 넘으면(예: mmobile 그룹
 * 13개) 상시 라벨이 소음이 된다. 밀집이면 라벨은 호버 포커스 시에만 복원하고,
 * 휴지 상태 불투명도를 가중치에 비례시켜 강한 연결만 도드라지게 한다.
 */
const DENSE_AVG_DEGREE = 5;

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
              // 불어나면 실측 높이가 폭주해 카드가 비대해진다) 한 줄로 자른다.
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
const EDGE_TYPES = { elk: ElkEdge };

function StructureDomainGraphUAInner({
  nodes,
  edges,
  onOpenNode,
  onEdgeClick,
}: {
  nodes: DomainStyleGraphNode[];
  edges: AggregatedEdge[];
  onOpenNode: (id: string) => void;
  onEdgeClick: (edge: MergedStructureEdge, point: { x: number; y: number }) => void;
}) {
  const { t } = useI18n();
  const rf = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{
    positions: Map<string, { x: number; y: number }>;
    edgePoints: Map<string, ElkPoint[]>;
  } | null>(null);

  // ① 양방향 병합 — 화면의 선 개수 기준은 이후 전부 merged.
  const merged = useMemo(() => mergeBidirectionalEdges(edges), [edges]);
  const dense = nodes.length > 0 && (2 * merged.length) / nodes.length > DENSE_AVG_DEGREE;

  // 호버 포커스 — 밀집 그래프에서 "어디에 어디가 연결됐는지"는 전체 동시 표시로는
  // 못 읽는다. 카드 호버 시 그 카드의 엣지만 선명하게(+카드 위로 승격, 라벨 복원)
  // 나머지는 흐린다.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverNeighbors = useMemo(() => {
    if (!hoveredId) return null;
    const s = new Set<string>([hoveredId]);
    for (const e of merged) {
      if (e.from === hoveredId) s.add(e.to);
      if (e.to === hoveredId) s.add(e.from);
    }
    return s;
  }, [hoveredId, merged]);

  // 데이터가 바뀌면 재측정·재배치(뎁스 전환 시 스테일 좌표 방지).
  useEffect(() => {
    setLayout(null);
  }, [nodes, merged]);

  // 2패스 레이아웃 — 카드는 내용에 따라 280~360×가변 높이라 고정 추정치를 ELK 에
  // 먹이면 겹친다. 1패스에서 숨김 렌더한 카드를 DOM 에서 직접 실측(offsetWidth —
  // 뷰포트 transform 무관, rAF 재시도)한 뒤, 실측 크기로 ELK 를 돌린다(layout.ts 의
  // "near-real sizes" 교훈). ORTHOGONAL 라우팅 포인트도 이때 함께 받아 ElkEdge 로
  // 그대로 그린다(③ 노드 회피·④ 엣지별 전용 트랙 — [[dashboard-edge-routing]]).
  useEffect(() => {
    if (layout || nodes.length === 0) return;
    let cancelled = false;
    let raf = 0;
    const tryMeasure = () => {
      if (cancelled) return;
      const els = [...(containerRef.current?.querySelectorAll<HTMLElement>(".react-flow__node") ?? [])];
      if (els.length !== nodes.length || els.some((el) => el.offsetWidth === 0)) {
        raf = requestAnimationFrame(tryMeasure); // 아직 미마운트/미측정 — 다음 프레임 재시도.
        return;
      }
      const measured = new Map(
        els.map((el) => [el.getAttribute("data-id") ?? "", { width: el.offsetWidth, height: el.offsetHeight }]),
      );
      const rfNodes: Node[] = nodes.map((n) => ({ id: n.id, type: "domain-cluster", position: { x: 0, y: 0 }, data: {} }));
      const rfEdges: Edge[] = merged.map((e) => ({ id: e.id, source: e.from, target: e.to }));
      const input = nodesToElkInput(rfNodes, rfEdges, measured, { "elk.direction": "RIGHT" });
      applyElkLayout(input).then(({ positioned }) => {
        if (cancelled) return;
        setLayout({
          positions: new Map(mergeElkPositions(rfNodes, positioned).map((n) => [n.id, n.position])),
          edgePoints: elkEdgePointMap(positioned),
        });
      });
    };
    raf = requestAnimationFrame(tryMeasure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [layout, nodes, merged]);

  // 배치 확정 후 1회 fitView — fitView prop 은 위치 갱신에 재반응하지 않는다.
  useEffect(() => {
    if (layout) rf.fitView({ padding: 0.2, maxZoom: 1 });
  }, [layout, rf]);

  const rfNodes = useMemo<Node[]>(
    () =>
      nodes.map(
        (n): Node => ({
          id: n.id,
          type: "domain-cluster",
          position: layout?.positions.get(n.id) ?? { x: 0, y: 0 },
          data: { n, onOpen: onOpenNode } satisfies CardData,
          draggable: false,
          connectable: false,
          selectable: true,
          // 측정 패스(위치 미확정) 동안 숨김 — visibility 는 레이아웃 크기를 유지해
          // 실측이 가능하다(display:none 불가). 호버 포커스 중엔 무관 카드를 흐린다.
          style: layout
            ? {
                opacity: hoverNeighbors && !hoverNeighbors.has(n.id) ? 0.3 : 1,
                transition: "opacity 120ms",
              }
            : { visibility: "hidden" as const },
        }),
      ),
    [nodes, layout, onOpenNode, hoverNeighbors],
  );

  // 병합 무방향 선 — accent 점선 + ELK 직각 라우팅(ElkEdge, 화살표 없음), 라벨은
  // 근거 파일 수 칩(노드 위 레이어라 가려지지 않음). 밀집 모드는 라벨을 호버
  // 포커스 시에만 복원하고 휴지 불투명도를 가중치 비례로. 포커스 엣지는 zIndex 로
  // 카드 위 승격 + 이벤트 통과(index.css .workmap-focus-edge — 호버 깜빡임 방지).
  const rfEdges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    const maxWeight = Math.max(1, ...merged.map((e) => e.weight));
    return merged.map((e) => {
      const focused = hoveredId !== null && (e.from === hoveredId || e.to === hoveredId);
      const restingOpacity = dense ? 0.25 + 0.75 * (e.weight / maxWeight) : 1;
      const showLabel = !dense || focused;
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        type: "elk",
        label: showLabel ? t.structure.evidenceWeight.replace("{count}", String(e.weight)) : undefined,
        style: {
          stroke: "var(--color-accent)",
          strokeDasharray: "6 3",
          strokeWidth: focused ? 2.5 : 2,
          opacity: hoveredId === null ? restingOpacity : focused ? 1 : 0.05,
          transition: "opacity 120ms",
        },
        zIndex: focused ? 1000 : 0,
        className: focused ? "workmap-focus-edge" : undefined,
        data: { points: layout.edgePoints.get(e.id), labelChip: true },
      };
    });
  }, [merged, layout, dense, hoveredId, t]);

  return (
    // data-hover — 헤드리스 QA 가 호버 포커스 상태를 결정론적으로 검증하는 훅.
    <div ref={containerRef} className="h-full w-full" data-hover={hoveredId ?? ""}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onEdgeClick={(evt, edge) => {
          const src = merged.find((e) => e.id === edge.id);
          if (src) onEdgeClick(src, { x: evt.clientX, y: evt.clientY });
        }}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
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
    </div>
  );
}

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
  onEdgeClick: (edge: MergedStructureEdge, point: { x: number; y: number }) => void;
  emptyLabel: string;
}) {
  if (nodes.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="h-full w-full relative">
      <ReactFlowProvider>
        <StructureDomainGraphUAInner nodes={nodes} edges={edges} onOpenNode={onOpenNode} onEdgeClick={onEdgeClick} />
      </ReactFlowProvider>
    </div>
  );
}
