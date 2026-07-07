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
import { useSearchParams } from "react-router";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import CitationChip from "./CitationChip";
import VerdictBadge from "./VerdictBadge";
import ElkEdge from "./ElkEdge";
import { applyElkLayout, elkEdgePointMap, type ElkPoint } from "../utils/elk-layout";
import { domainColor } from "../utils/domainData";
import type { BizFlow, BizFlowNode, BizNodeKind } from "../utils/businessFlow";

/**
 * 업무 흐름도 탭(WORK_MAP §4-1, P4) — 도메인당 1장의 업무 프로세스 순서도.
 *
 * 렌더 스택은 기존 자산 재사용: React Flow + ELK(direction=DOWN) + ElkEdge
 * (ELK 라우팅 폴리라인 — [[dashboard-edge-routing]]). 노드 3종은 work_flow.png
 * 어휘 — 시작/종료(pill)·활동(rounded rect)·판단(diamond, 나가는 엣지 YES/NO 라벨).
 * 색은 도메인 색 + 기존 토큰 조합(신규 팔레트 금지).
 *
 * 근거 표면: 노드 선택 시 하단 바에 verdict + CitationChip(기존 규약). 검증 실패
 * (NEEDS_REVIEW) 노드는 [확인 필요] 배지. fallback(fill 미채움)이면 "순차 근사" 배너.
 * 활동 노드의 flowRef 뱃지 클릭 → code 탭 + 해당 기능 선택(업무→코드 드릴다운).
 */

const SIZE: Record<BizNodeKind, { w: number; h: number }> = {
  start: { w: 130, h: 36 },
  end: { w: 130, h: 36 },
  activity: { w: 220, h: 72 },
  decision: { w: 180, h: 96 },
};

interface BizNodeData {
  biz: BizFlowNode;
  accent: string;
  selected: boolean;
  [key: string]: unknown;
}

/** flowRef → 짧은 핸들러 표기(프로토 .fref "flow: viewCart") — ?쿼리 우선, 없으면 경로 꼬리. */
function flowRefShort(flowRef: string): string {
  const body = flowRef.replace(/^flow:/, "");
  const q = body.split("?")[1];
  if (q) return q;
  const tail = body.trim().split(/[/\s]/).filter(Boolean).pop() ?? body;
  return tail;
}

function BizNode({ data }: NodeProps) {
  const { biz, accent, selected } = data as BizNodeData;
  const { w, h } = SIZE[biz.kind];
  const review = biz.verdict === "NEEDS_REVIEW";

  // 프로토(P6) 노드 어휘 — pill: border-medium/bg-surface, activity: 카드+그림자,
  // decision: status-warn 윤곽. 선택 = accent, 검토필요 = warn 강조(정직성 유지).
  if (biz.kind === "start" || biz.kind === "end") {
    return (
      <div
        className="flex items-center justify-center text-text-secondary"
        style={{
          width: w,
          height: h,
          borderRadius: h / 2,
          border: `1.5px solid ${selected ? accent : "var(--color-border-medium)"}`,
          background: "var(--color-surface)",
          fontSize: 12.5,
          fontWeight: 650,
        }}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        {biz.label}
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  if (biz.kind === "decision") {
    const stroke = selected ? accent : "var(--color-status-warn)";
    return (
      <div className="relative" style={{ width: w, height: h }}>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          className="absolute inset-0"
          style={{
            clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
            background: "var(--color-panel)",
          }}
        />
        {/* clip-path 는 border 를 못 그린다 — SVG 외곽선으로 다이아몬드 윤곽 표시. */}
        <svg
          className="absolute inset-0"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          <polygon
            points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`}
            fill="none"
            stroke={stroke}
            strokeWidth={selected ? 1.5 : 1}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-center overflow-hidden"
          style={{
            fontSize: 12,
            fontWeight: 650,
            color: "var(--color-status-warn)",
            padding: "0 30px",
            lineHeight: 1.3,
            wordBreak: "keep-all",
          }}
          title={biz.label}
        >
          {review && <span className="mr-1">⚠</span>}
          {biz.label}
        </div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  // activity — 프로토 .fc-act: 카드 배경 + 그림자 + hover accent, fref 파란 칩.
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 text-text-primary"
      style={{
        width: w,
        height: h,
        borderRadius: 10,
        border: `1px solid ${
          selected ? accent : review ? "var(--color-status-warn)" : "var(--color-border-subtle)"
        }`,
        background: "var(--color-panel)",
        boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
        padding: "6px 12px",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span
        className="text-center overflow-hidden"
        style={{ fontSize: 13, fontWeight: 550, lineHeight: 1.35, maxHeight: 36, wordBreak: "keep-all" }}
        title={biz.label}
      >
        {review && <span className="mr-1" title="[확인 필요]">⚠</span>}
        {biz.label}
      </span>
      {biz.flowRef && (
        <span
          className="rounded font-bold"
          style={{
            fontSize: 10,
            padding: "1px 6px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-status-info)",
            background: "color-mix(in srgb, var(--color-status-info) 10%, transparent)",
          }}
        >
          flow: {flowRefShort(biz.flowRef)}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { biz: BizNode };
const EDGE_TYPES = { elk: ElkEdge };

export default function BusinessFlowView({
  domainId,
  biz,
  rejectedReason,
}: {
  domainId: string;
  biz: BizFlow;
  /** emit 이 businessFlow 를 기각한 사유 — "미채움"과 구별해 배너 분기(리뷰 C2). */
  rejectedReason?: string | null;
}) {
  const { t } = useI18n();
  const [, setSearchParams] = useSearchParams();
  const setSelectedFlow = useDashboardStore((s) => s.setSelectedFlow);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<{
    positions: Map<string, { x: number; y: number }>;
    edgePoints: Map<string, ElkPoint[]>;
  } | null>(null);

  const accent = domainColor(domainId);

  // ELK direction=DOWN — 순서도는 위→아래(work_flow.png 어휘).
  useEffect(() => {
    let cancelled = false;
    // 순방향 본 체인 우선 정렬 — start 에서 BFS 깊이를 재고, 깊이가 늘지 않는
    // 엣지(재시도 루프백)는 직선 우선순위 0 으로 강등한다. NETWORK_SIMPLEX 가
    // 루프백을 직선화하려고 본 체인(시작→활동→판단)을 축에서 끌어내는 문제 차단.
    // 무라벨 순방향 = 본 체인(5) > 분기 라벨 엣지(1, 어차피 옆으로 꺾임) > 루프백(0).
    const depth = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const e of biz.edges) {
      const list = adj.get(e.from) ?? [];
      list.push(e.to);
      adj.set(e.from, list);
    }
    const queue = biz.nodes.filter((n) => n.kind === "start").map((n) => n.id);
    for (const id of queue) depth.set(id, 0);
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const next of adj.get(id) ?? []) {
        if (!depth.has(next)) {
          depth.set(next, depth.get(id)! + 1);
          queue.push(next);
        }
      }
    }
    const straightness = (e: { from: string; to: string; label?: string }): string => {
      const back = (depth.get(e.to) ?? Infinity) <= (depth.get(e.from) ?? -1);
      return back ? "0" : e.label ? "1" : "5";
    };
    const input = {
      id: "bizflow",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        // 가시성 조정: NETWORK_SIMPLEX 는 직선 체인을 같은 축에 정렬한다(기본
        // BRANDES_KOEPF 는 폭이 다른 노드들이 지그재그로 흘렀음 — 사용자 지적).
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.nodePlacement.favorStraightEdges": "true",
        "elk.spacing.nodeNode": "36",
        // 계층 간격을 넓혀 분기 라벨 칩이 놓일 코리도어를 확보한다.
        "elk.layered.spacing.nodeNodeBetweenLayers": "60",
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "14",
        "elk.layered.spacing.edgeNodeBetweenLayers": "20",
        "elk.edgeRouting": "ORTHOGONAL",
      },
      children: biz.nodes.map((n) => ({
        id: n.id,
        width: SIZE[n.kind].w,
        height: SIZE[n.kind].h,
      })),
      edges: biz.edges.map((e, i) => ({
        id: `be${i}`,
        sources: [e.from],
        targets: [e.to],
        layoutOptions: { "elk.layered.priority.straightness": straightness(e) },
      })),
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
  }, [biz]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return biz.nodes.map((n) => ({
      id: n.id,
      type: "biz",
      position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
      width: SIZE[n.kind].w,
      height: SIZE[n.kind].h,
      data: { biz: n, accent, selected: n.id === selectedId } satisfies BizNodeData,
      draggable: false,
      connectable: false,
      selectable: true,
    }));
  }, [biz, layout, accent, selectedId]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    return biz.edges.map((e, i) => ({
      id: `be${i}`,
      source: e.from,
      target: e.to,
      type: "elk",
      label: e.label,
      // 방향 화살표 — 순서도 판독성(흐름 방향)의 기본기.
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: "var(--color-border-medium)" },
      style: { stroke: "var(--color-border-medium)", strokeWidth: 1.5 },
      // labelChip: 분기 라벨을 노드 위 레이어의 칩으로(경로 중간점 SVG 텍스트는
      // 노드에 가려짐), 앵커는 계층 사이 수평 런(ElkEdge.chipAnchor).
      // snapHandles:false — 렌더 크기 == ELK 크기라 스냅 불필요, 루프백 왜곡 방지.
      data: { points: layout.edgePoints.get(`be${i}`), labelChip: true, snapHandles: false },
    }));
  }, [biz, layout]);

  const selected = useMemo(
    () => biz.nodes.find((n) => n.id === selectedId) ?? null,
    [biz, selectedId],
  );

  // 업무→코드 드릴다운: 활동 노드의 기능 앵커 → code 탭 + 해당 기능 선택.
  // view+flow 를 한 번의 내비게이션으로 쓰고(라이브 location 기준 — 라이터 경합 방지),
  // store 선택은 별도 반영(URL→store 복원은 1회 게이트라 직접 세팅).
  const openFlow = (flowRef: string) => {
    const p = new URLSearchParams(window.location.search);
    p.set("view", "code");
    p.set("flow", flowRef);
    setSearchParams(p, { replace: true });
    setSelectedFlow(flowRef);
  };

  return (
    <div className="h-full w-full flex flex-col">
      {biz.fallback && (
        <div
          className="shrink-0 flex items-center gap-2 border-b border-border-subtle text-text-secondary"
          style={{
            padding: "7px 20px",
            fontSize: 11.5,
            background: rejectedReason
              ? "color-mix(in srgb, #ef4444 8%, transparent)"
              : "color-mix(in srgb, #f59e0b 8%, transparent)",
          }}
          role="note"
          title={rejectedReason ?? undefined}
        >
          <span aria-hidden>{rejectedReason ? "⚠" : "ℹ"}</span>
          {rejectedReason
            ? t.flowList.businessRejectedBanner.replace("{reason}", rejectedReason)
            : t.flowList.businessFallbackBanner}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {layout && (
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
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
      {/* 근거 바 — 프로토(P6): 중앙 정렬 "선택 노드 근거:" + 인용 칩 + 검증 배지. */}
      {selected && (
        <div
          className="shrink-0 border-t border-border-subtle bg-panel flex items-center justify-center flex-wrap gap-2"
          style={{ padding: "10px 20px" }}
        >
          <span className="text-text-muted" style={{ fontSize: 12 }}>
            {t.flowList.bfEvidenceSelected}
          </span>
          <span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600 }}>
            {selected.label}
          </span>
          {selected.citations.length > 0 ? (
            selected.citations.map((c, i) => (
              <CitationChip key={`${c.filePath}:${c.line}:${i}`} filePath={c.filePath} line={c.line} status={c.status} />
            ))
          ) : (
            <span className="text-text-muted" style={{ fontSize: 10.5 }}>
              {t.grounding.noCitations}
            </span>
          )}
          {selected.verdict && <VerdictBadge verdict={selected.verdict} />}
          {selected.flowRef && (
            <button
              type="button"
              onClick={() => openFlow(selected.flowRef!)}
              className="rounded-full cursor-pointer transition-colors hover:opacity-80 font-semibold"
              style={{
                fontSize: 11,
                padding: "2px 10px",
                // 노드의 flow: 칩(status-info)과 동일 색 — 기능 연결 표식의 색 언어 통일.
                color: "var(--color-status-info)",
                background: "color-mix(in srgb, var(--color-status-info) 10%, transparent)",
              }}
            >
              {t.flowList.bfOpenFlow}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
