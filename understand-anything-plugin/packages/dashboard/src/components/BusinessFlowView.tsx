import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Handle,
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
  start: { w: 140, h: 40 },
  end: { w: 140, h: 40 },
  activity: { w: 210, h: 64 },
  decision: { w: 180, h: 96 },
};

interface BizNodeData {
  biz: BizFlowNode;
  accent: string;
  selected: boolean;
  [key: string]: unknown;
}

function BizNode({ data }: NodeProps) {
  const { biz, accent, selected } = data as BizNodeData;
  const { w, h } = SIZE[biz.kind];
  const review = biz.verdict === "NEEDS_REVIEW";
  const borderColor = selected ? accent : review ? "#f59e0b" : "var(--color-border-medium)";

  if (biz.kind === "start" || biz.kind === "end") {
    return (
      <div
        className="flex items-center justify-center text-text-primary"
        style={{
          width: w,
          height: h,
          borderRadius: h / 2,
          border: `1.5px solid ${borderColor}`,
          background:
            biz.kind === "start"
              ? `color-mix(in srgb, ${accent} 12%, var(--color-elevated))`
              : "var(--color-elevated)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        {biz.label}
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  if (biz.kind === "decision") {
    return (
      <div className="relative" style={{ width: w, height: h }}>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          className="absolute inset-0"
          style={{
            clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
            background: `color-mix(in srgb, ${accent} 9%, var(--color-elevated))`,
            border: "none",
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
            stroke={borderColor}
            strokeWidth={1.5}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-center text-text-primary overflow-hidden"
          style={{ fontSize: 11.5, padding: "0 30px", lineHeight: 1.3, wordBreak: "keep-all" }}
          title={biz.label}
        >
          {review && <span className="mr-1">⚠</span>}
          {biz.label}
        </div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </div>
    );
  }

  // activity — rounded rect(기존 카드 토큰).
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 rounded-xl text-text-primary"
      style={{
        width: w,
        height: h,
        border: `1.5px solid ${borderColor}`,
        background: "var(--color-elevated)",
        padding: "6px 12px",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span
        className="text-center overflow-hidden"
        style={{ fontSize: 12, lineHeight: 1.35, maxHeight: 34, wordBreak: "keep-all" }}
        title={biz.label}
      >
        {review && <span className="mr-1" title="[확인 필요]">⚠</span>}
        {biz.label}
      </span>
      {biz.flowRef && (
        <span
          className="rounded-full border"
          style={{
            fontSize: 9.5,
            padding: "1px 8px",
            color: accent,
            borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
            background: `color-mix(in srgb, ${accent} 8%, transparent)`,
          }}
        >
          ƒ
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
    const input = {
      id: "bizflow",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "44",
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
      labelStyle: { fontSize: 10, fill: "var(--color-text-secondary)", fontWeight: 600 },
      style: { stroke: "var(--color-border-medium)", strokeWidth: 1.5 },
      data: { points: layout.edgePoints.get(`be${i}`) },
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
      {/* 근거 바 — 선택 노드의 verdict + 인용 칩(기존 규약). */}
      {selected && (
        <div
          className="shrink-0 border-t border-border-subtle bg-panel flex items-center flex-wrap gap-1.5"
          style={{ padding: "8px 20px" }}
        >
          <span className="text-text-primary" style={{ fontSize: 12, fontWeight: 600 }}>
            {selected.label}
          </span>
          {selected.verdict && <VerdictBadge verdict={selected.verdict} />}
          {selected.flowRef && (
            <button
              type="button"
              onClick={() => openFlow(selected.flowRef!)}
              className="rounded-full border cursor-pointer transition-colors hover:opacity-80"
              style={{
                fontSize: 10.5,
                padding: "2px 10px",
                color: accent,
                borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
                background: `color-mix(in srgb, ${accent} 8%, transparent)`,
              }}
            >
              {t.flowList.bfOpenFlow}
            </button>
          )}
          <span className="uppercase text-text-muted ml-2" style={{ fontSize: 10, letterSpacing: "0.08em" }}>
            {t.grounding.evidence}
          </span>
          {selected.citations.length > 0 ? (
            selected.citations.map((c, i) => (
              <CitationChip key={`${c.filePath}:${c.line}:${i}`} filePath={c.filePath} line={c.line} status={c.status} />
            ))
          ) : (
            <span className="text-text-muted" style={{ fontSize: 10 }}>
              {t.grounding.noCitations}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
