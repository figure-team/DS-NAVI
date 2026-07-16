import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  getNodesBounds,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { toPng } from "html-to-image";
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
  /** flowRef 표시 라벨 — 연결된 기능(flow) 노드의 이름(사람 이름). 미해석 시 핸들러 꼬리 폴백. */
  flowLabel?: string;
  /**
   * 영향·변경 표식(RTM ② 비포·에프터, 2026-07-17) — "seed"=변경 기점(①이 변경 대상으로
   * 지목한 기능의 활동) / "reached"=영향 도달(연쇄) / "added"·"removed"=에프터 초안
   * (after-flow.json)의 신규·삭제. 시드와 도달을 한 라벨로 뭉치면 "영향 = 안 고쳐도 됨"으로
   * 오독된다(사용자 실측 지적) — 넷을 전부 가른다.
   */
  mark?: BizMark;
  [key: string]: unknown;
}

type BizMark = "seed" | "reached" | "added" | "removed";
/** 표식 어휘 — 색·라벨·계약 설명 단일소스(배지·범례가 같이 쓴다). */
const MARK_META: Record<BizMark, { label: string; color: string; title: string }> = {
  seed: { label: "~ 변경 기점", color: "var(--color-status-warn)", title: "변경 기점(시드) — ①식별이 변경 대상으로 지목한 기능의 활동입니다" },
  reached: { label: "영향", color: "var(--color-status-warn)", title: "영향 도달 — 변경 기점에서 연쇄로 닿는 활동입니다. 구현 시 함께 수정될 수 있으나, 수정 여부 판정은 엔진 산출이 아니라 여기서 단언하지 않습니다" },
  added: { label: "+ 신규", color: "var(--color-status-ok)", title: "신규 활동([추정]) — ②가 changeset.added 근거로 제안한 삽입입니다. 연결 위치·순서는 확정 전 초안입니다" },
  removed: { label: "− 삭제", color: "var(--color-status-error)", title: "삭제 예정([추정]) — changeset.removed 의 기능 활동입니다. 무엇이 없어지는지 보이도록 도식에 남겨 그립니다" },
};

/** 표식 코너 배지 — mark 노드 공통(활동·판단). 검토필요 ⚠(라벨 안)와 자리·형태로 구분. */
function ImpactBadge({ mark }: { mark: BizMark }) {
  const m = MARK_META[mark];
  return (
    <span
      className="absolute rounded-full font-bold"
      title={m.title}
      style={{
        top: -9,
        right: -9,
        fontSize: 9,
        lineHeight: 1,
        padding: "3px 6px",
        color: m.color,
        background: `color-mix(in srgb, ${m.color} 14%, var(--color-panel))`,
        border: `1px solid ${m.color}`,
        zIndex: 2,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
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
  const { biz, accent, selected, flowLabel, mark } = data as BizNodeData;
  const { w, h } = SIZE[biz.kind];
  const review = biz.verdict === "NEEDS_REVIEW";
  const markMeta = mark ? MARK_META[mark] : undefined;
  // 영향 링 — 노드 형태를 안 바꾸고(ELK 크기 고정) 바깥 글로우로 두른다. 색은 표식 어휘를 따른다.
  const impactRing = markMeta
    ? `0 0 0 3px color-mix(in srgb, ${markMeta.color} 26%, transparent)`
    : undefined;
  // 에프터 초안 어휘 — 신규·삭제는 점선(확정 전 [추정]), 삭제는 라벨 취소선 + 옅게.
  const dashed = mark === "added" || mark === "removed";

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
    // 판단은 중립색(info) — warn(주황)은 "문제 있는 단계"로 오독되고(PM/PL 리뷰),
    // 진짜 [확인 필요](⚠) 노드와도 구분이 안 됐다. 검토 필요만 warn 유지.
    const stroke = selected
      ? accent
      : review
        ? "var(--color-status-warn)"
        : "var(--color-status-info)";
    return (
      <div className="relative" style={{ width: w, height: h }}>
        {mark && <ImpactBadge mark={mark} />}
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
            color: review ? "var(--color-status-warn)" : "var(--color-status-info)",
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
      className="relative flex flex-col items-center justify-center gap-1 text-text-primary"
      style={{
        width: w,
        height: h,
        borderRadius: 10,
        border: `1px ${dashed ? "dashed" : "solid"} ${
          selected ? accent : markMeta ? markMeta.color : review ? "var(--color-status-warn)" : "var(--color-border-subtle)"
        }`,
        background: "var(--color-panel)",
        boxShadow: impactRing ?? "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
        padding: "6px 12px",
        opacity: mark === "removed" ? 0.72 : 1,
      }}
    >
      {mark && <ImpactBadge mark={mark} />}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <span
        className="text-center overflow-hidden"
        style={{ fontSize: 13, fontWeight: 550, lineHeight: 1.35, maxHeight: 36, wordBreak: "keep-all", textDecoration: mark === "removed" ? "line-through" : undefined }}
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
            // 기능(코드) 연결 색 언어 = 보라(layer-dao 재사용, 다크 변형 보유) —
            // 판단 노드가 info 파랑을 가져가면서 겹쳐 분리(사용자 결정).
            color: "var(--color-layer-dao)",
            background: "color-mix(in srgb, var(--color-layer-dao) 10%, transparent)",
          }}
        >
          flow: {flowLabel ?? flowRefShort(biz.flowRef)}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES = { biz: BizNode };
const EDGE_TYPES = { elk: ElkEdge };

/** 내보내기 여백(px) — 노드 경계 사각형 밖 숨통. */
const EXPORT_PAD = 32;
/** 내보내기 배율 — 문서 첨부용 선명도. */
const EXPORT_RATIO = 2;
/** 내보내기 상단 제목 밴드 높이(css px) — "도메인 — 프로세스" 스탬프. */
const EXPORT_STAMP_H = 56;
/** 초기 표시 배율 하한 — 큰 흐름의 전체 맞춤이 글자를 뭉개면 이 배율로 상단부터. */
const INIT_MIN_ZOOM = 0.7;
/** 미니맵 표시 선택 저장 키 — 프로세스 전환(key remount)·재방문에도 유지. */
const MINIMAP_PREF_KEY = "ua-bizflow-minimap";

/**
 * 순서도 래스터 위에 제목 밴드를 얹는다 — 여러 장 내보내면 파일명만으로 구분이
 * 안 된다(PM/PL 리뷰). 캔버스 fillText 는 문서에 로드된 웹폰트를 그대로 쓴다.
 */
async function stampTitleBand(
  dataUrl: string,
  stamp: string,
  background: string,
): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("export image decode failed"));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height + EXPORT_STAMP_H * EXPORT_RATIO;
  const c = canvas.getContext("2d");
  if (!c) return dataUrl; // 컨텍스트 불가 환경 — 스탬프 없이 원본 유지(다운로드 우선).
  c.fillStyle = background;
  c.fillRect(0, 0, canvas.width, canvas.height);
  const textColor = getComputedStyle(document.body).color;
  const midY = (EXPORT_STAMP_H / 2 + 4) * EXPORT_RATIO;
  c.textBaseline = "middle";
  c.fillStyle = textColor;
  c.font = `700 ${15 * EXPORT_RATIO}px Pretendard, 'Malgun Gothic', sans-serif`;
  c.fillText(stamp, EXPORT_PAD * EXPORT_RATIO, midY);
  c.globalAlpha = 0.55;
  c.font = `400 ${11.5 * EXPORT_RATIO}px Pretendard, 'Malgun Gothic', sans-serif`;
  c.textAlign = "right";
  c.fillText(new Date().toISOString().slice(0, 10), canvas.width - EXPORT_PAD * EXPORT_RATIO, midY);
  // 제목 밴드 아래 얇은 구분선.
  c.globalAlpha = 0.15;
  c.textAlign = "left";
  c.fillRect(
    EXPORT_PAD * EXPORT_RATIO,
    (EXPORT_STAMP_H - 6) * EXPORT_RATIO,
    canvas.width - EXPORT_PAD * 2 * EXPORT_RATIO,
    EXPORT_RATIO,
  );
  c.globalAlpha = 1;
  c.drawImage(img, 0, EXPORT_STAMP_H * EXPORT_RATIO);
  return canvas.toDataURL("image/png");
}

/** 범례 행 — 미니 글리프(실물 축소판) + 설명 한 줄. */
function LegendRow({ glyph, text }: { glyph: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center" style={{ gap: 9 }}>
      <span className="shrink-0 flex items-center justify-center" style={{ width: 30 }}>
        {glyph}
      </span>
      <span className="text-text-secondary" style={{ fontSize: 11, lineHeight: 1.45 }}>
        {text}
      </span>
    </div>
  );
}

/**
 * 범례 — 도형(시작/종료·활동·판단)과 색 표식(보라 코드 연결·주황 확인 필요·
 * 녹색 검증 통과) 설명(PM/PL 요청). 기본 접힘 토글 — 항상 펼치면 캔버스 소음.
 * 글리프는 실제 노드 스타일의 축소판이라 색·형태가 본편과 자동 일치하지는
 * 않으므로, 노드 어휘를 바꿀 때 여기도 함께 갱신할 것.
 */
/** 표식 범례 글리프 — MARK_META 축소판(배지와 색·라벨 자동 일치). */
function MarkGlyph({ mark }: { mark: BizMark }) {
  const m = MARK_META[mark];
  return (
    <span
      aria-hidden
      className="rounded-full font-bold"
      style={{
        fontSize: 7.5,
        padding: "2px 4px",
        whiteSpace: "nowrap",
        color: m.color,
        background: `color-mix(in srgb, ${m.color} 14%, var(--color-panel))`,
        border: `1px solid ${m.color}`,
      }}
    >
      {m.label}
    </span>
  );
}

function LegendPanel({ impactLegend, seedLegend, changeLegend }: { impactLegend?: string; seedLegend?: string; changeLegend?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Panel position="top-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-md border border-border-subtle bg-panel text-text-secondary hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
        style={{ fontSize: 11.5, padding: "4px 10px" }}
      >
        ⓘ {t.flowList.bfLegend}
      </button>
      {open && (
        <div
          className="rounded-lg border border-border-medium bg-surface shadow-xl flex flex-col"
          style={{ marginTop: 6, padding: "10px 12px", width: 250, gap: 7 }}
        >
          <LegendRow
            glyph={
              <span
                aria-hidden
                style={{
                  width: 24,
                  height: 11,
                  borderRadius: 6,
                  border: "1.5px solid var(--color-border-medium)",
                  background: "var(--color-surface)",
                  display: "block",
                }}
              />
            }
            text={t.flowList.bfLegendStartEnd}
          />
          <LegendRow
            glyph={
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 14,
                  borderRadius: 4,
                  border: "1px solid var(--color-border-subtle)",
                  background: "var(--color-panel)",
                  boxShadow: "0 1px 2px rgba(26,27,31,.08)",
                  display: "block",
                }}
              />
            }
            text={t.flowList.bfLegendActivity}
          />
          <LegendRow
            glyph={
              <svg width={26} height={16} viewBox="0 0 26 16" aria-hidden>
                <polygon
                  points="13,1 25,8 13,15 1,8"
                  fill="var(--color-panel)"
                  stroke="var(--color-status-info)"
                  strokeWidth={1.2}
                />
              </svg>
            }
            text={t.flowList.bfLegendDecision}
          />
          <LegendRow
            glyph={
              <span
                aria-hidden
                className="rounded font-bold"
                style={{
                  fontSize: 8.5,
                  padding: "1px 4px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-layer-dao)",
                  background: "color-mix(in srgb, var(--color-layer-dao) 10%, transparent)",
                }}
              >
                flow:
              </span>
            }
            text={t.flowList.bfLegendFlowRef}
          />
          <LegendRow
            glyph={
              <span aria-hidden style={{ color: "var(--color-status-warn)", fontSize: 13 }}>
                ⚠
              </span>
            }
            text={t.flowList.bfLegendReview}
          />
          <LegendRow
            glyph={
              <span aria-hidden style={{ color: "var(--color-status-ok)", fontSize: 13 }}>
                ✓
              </span>
            }
            text={t.flowList.bfLegendGrounded}
          />
          {/* 영향·변경 표식 — RTM ②/변경·영향 비포·에프터 모달에서만 주입된다. */}
          {seedLegend && <LegendRow glyph={<MarkGlyph mark="seed" />} text={seedLegend} />}
          {impactLegend && <LegendRow glyph={<MarkGlyph mark="reached" />} text={impactLegend} />}
          {changeLegend && (
            <>
              <LegendRow glyph={<MarkGlyph mark="added" />} text="신규 활동([추정]) — ②가 changeset 근거로 제안한 삽입, 점선" />
              <LegendRow glyph={<MarkGlyph mark="removed" />} text="삭제 예정([추정]) — 무엇이 없어지는지 보이도록 남겨 그림" />
            </>
          )}
          {/* 근거 확인 안내 — 캔버스 상시 문구에서 이동(사용자 결정, 소음 제거). */}
          <p
            className="text-text-muted border-t border-border-subtle"
            style={{ fontSize: 10.5, lineHeight: 1.5, paddingTop: 7, marginTop: 2 }}
          >
            {t.flowList.bfClickHint}
          </p>
        </div>
      )}
    </Panel>
  );
}

/**
 * PNG 내보내기 — React Flow 공식 패턴: `.react-flow__viewport`(노드+엣지+라벨 칩)를
 * html-to-image 로 노드 경계 사각형에 맞춰 래스터화(pixelRatio 2). 화면 줌/팬과
 * 무관하게 전체 순서도가 담기고, 배경 점·컨트롤·근거 바는 viewport 밖이라 제외된다.
 * Panel(우상단)은 ReactFlow 자식이어야 하므로 버튼을 여기로 분리(useReactFlow 필요).
 */
function ExportPngButton({
  containerRef,
  fileName,
  stamp,
  label,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fileName: string;
  /** 이미지 상단 제목 밴드 텍스트 — "도메인 — 프로세스". */
  stamp: string;
  label: string;
}) {
  const { getNodes } = useReactFlow();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    const viewport = containerRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!viewport || busy) return;
    setBusy(true);
    try {
      const bounds = getNodesBounds(getNodes());
      const width = Math.ceil(bounds.width) + EXPORT_PAD * 2;
      const height = Math.ceil(bounds.height) + EXPORT_PAD * 2;
      // 테마(라이트/다크) 배경을 그대로 — 투명 PNG 는 문서 붙여넣기에서 깨져 보인다.
      const background = getComputedStyle(document.body).backgroundColor;
      const dataUrl = await toPng(viewport, {
        backgroundColor: background,
        // 폰트 임베드는 켠 채로 둔다 — 같은 출처(vite) Pretendard @font-face 가
        // 임베드돼야 화면과 동일한 줄바꿈이 유지된다(skipFonts 로 껐더니 대체
        // 폰트 폭 차이로 노드 라벨 끝이 잘렸음). 크로스오리진 CDN 시트 2건의
        // SecurityError 콘솔 로그는 무해(해당 시트만 건너뛰고 계속 진행).
        width,
        height,
        pixelRatio: EXPORT_RATIO,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${EXPORT_PAD - bounds.x}px, ${EXPORT_PAD - bounds.y}px) scale(1)`,
        },
      });
      const a = document.createElement("a");
      a.href = await stampTitleBand(dataUrl, stamp, background);
      a.download = fileName;
      a.click();
    } catch (err) {
      console.error("business-flow PNG export failed", err);
    } finally {
      setBusy(false);
    }
  };

  // Panel 래핑은 호출측(우상단 툴바) — 미니맵 토글과 한 줄에 놓기 위해 버튼만 반환.
  return (
    <button
      type="button"
      onClick={onExport}
      disabled={busy}
      title={label}
      className="rounded-md border border-border-subtle bg-panel text-text-secondary hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
      style={{ fontSize: 11.5, padding: "4px 10px", opacity: busy ? 0.5 : 1 }}
    >
      ⤓ {label}
    </button>
  );
}

export default function BusinessFlowView({
  domainId,
  biz,
  rejectedReason,
  title,
  domainName,
  impactIds,
  seedIds,
  impactLegend,
  onOpenFlow,
}: {
  domainId: string;
  biz: BizFlow;
  /** emit 이 businessFlow 를 기각한 사유 — "미채움"과 구별해 배너 분기(리뷰 C2). */
  rejectedReason?: string | null;
  /** 선택된 업무 프로세스 제목 — PNG 파일명·제목 스탬프용(없으면 도메인 키 폴백). */
  title?: string | null;
  /** 도메인 표시명 — PNG 제목 스탬프용(없으면 도메인 키 폴백). */
  domainName?: string | null;
  /** 영향 도달 노드 id 집합(RTM ② 비포·에프터의 '에프터', 2026-07-17) — warn 링 + '영향' 배지. */
  impactIds?: Set<string>;
  /**
   * 변경 기점(시드) 노드 id 집합 — ①이 변경 대상으로 지목한 기능(flowRef)의 활동.
   * impactIds 보다 우선 판정('~ 변경 기점' 배지). 도달과 한 라벨로 뭉치면 "영향 = 안 고쳐도 됨"
   * 오독이 난다(사용자 실측 지적, 2026-07-17).
   */
  seedIds?: Set<string>;
  /** 범례의 '영향' 행 설명 — impactIds 렌더에서만 주입(로케일 6종 무접촉, RTM 은 한국어 고정 표면). */
  impactLegend?: string;
  /**
   * "기능 열기" 오버라이드(2026-07-17) — 기본 동작은 현재 URL 에 view=code&flow= 를 얹는
   * 도메인 페이지 전용 내비게이션이라, 비포·에프터 모달(RTM/변경·영향 페이지) 안에서는
   * 남의 페이지 쿼리를 오염시킨다. 모달은 이걸로 기능흐름도 비포·에프터 전환을 받는다.
   */
  onOpenFlow?: (flowRef: string) => void;
}) {
  const { t } = useI18n();
  const [, setSearchParams] = useSearchParams();
  const setSelectedFlow = useDashboardStore((s) => s.setSelectedFlow);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const flowAreaRef = useRef<HTMLDivElement | null>(null);

  // 미니맵 — 사용자 선택(localStorage) 우선, 미선택(null)이면 자동: 흐름이
  // 화면을 넘쳐 줌 하한이 발동했을 때만 기본 열림(작은 흐름에선 소음).
  const [miniMapPref, setMiniMapPref] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(MINIMAP_PREF_KEY);
      return v === null ? null : v === "1";
    } catch {
      return null;
    }
  });
  const [overflows, setOverflows] = useState(false);
  const miniMapVisible = miniMapPref ?? overflows;
  const toggleMiniMap = () => {
    const next = !miniMapVisible;
    setMiniMapPref(next);
    try {
      localStorage.setItem(MINIMAP_PREF_KEY, next ? "1" : "0");
    } catch {
      /* storage 불가 환경 — 세션 상태만 유지 */
    }
  };
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

  // flowRef → 연결된 기능(flow) 노드의 사람 이름. 활동 노드의 "flow: …" 배지를
  // 핸들러 꼬리(versionList.do) 대신 이름(앱 버전 목록 조회)으로 표기하기 위함(2026-07-15).
  const flowNameByRef = useMemo(() => {
    const m = new Map<string, string>();
    for (const node of domainGraph?.nodes ?? []) {
      if (node.type === "flow" && node.name) m.set(node.id, node.name);
    }
    return m;
  }, [domainGraph]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return biz.nodes.map((n) => ({
      id: n.id,
      type: "biz",
      position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
      width: SIZE[n.kind].w,
      height: SIZE[n.kind].h,
      data: {
        biz: n,
        accent,
        selected: n.id === selectedId,
        flowLabel: n.flowRef ? (flowNameByRef.get(n.flowRef) ?? flowRefShort(n.flowRef)) : undefined,
        // 데이터 내장 change(에프터 초안)가 우선 — 주입 집합(seedIds/impactIds)은 표식 오버레이용.
        mark: n.change === "added" ? ("added" as const)
          : n.change === "removed" ? ("removed" as const)
          : n.change === "modified" ? ("seed" as const)
          : seedIds?.has(n.id) ? ("seed" as const)
          : impactIds?.has(n.id) ? ("reached" as const)
          : undefined,
      } satisfies BizNodeData,
      draggable: false,
      connectable: false,
      selectable: true,
    }));
  }, [biz, layout, accent, selectedId, flowNameByRef, impactIds, seedIds]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!layout) return [];
    return biz.edges.map((e, i) => ({
      id: `be${i}`,
      source: e.from,
      target: e.to,
      type: "elk",
      label: e.label,
      // 방향 화살표 — 순서도 판독성(흐름 방향)의 기본기. 에프터 초안의 신규 연결은
      // 점선 + ok 색([추정] 어휘 — 노드의 + 신규와 같은 축).
      markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: e.change === "added" ? "var(--color-status-ok)" : "var(--color-border-medium)" },
      style: e.change === "added"
        ? { stroke: "var(--color-status-ok)", strokeWidth: 1.5, strokeDasharray: "6 4" }
        : { stroke: "var(--color-border-medium)", strokeWidth: 1.5 },
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
  // onOpenFlow 가 오면 그쪽이 전부 진다 — 모달 호스트(비포·에프터)의 기능흐름도 전환.
  const openFlow = (flowRef: string) => {
    if (onOpenFlow) { onOpenFlow(flowRef); return; }
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
      <div ref={flowAreaRef} className="flex-1 min-h-0 relative">
        {layout && (
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              onInit={async (rf) => {
                // 기본은 전체 맞춤 — 단, 큰 흐름에서 글자가 뭉개지는 배율까지
                // 내려가면(PM/PL 리뷰) 판독 하한(INIT_MIN_ZOOM)으로 올리고
                // 상단(시작 노드)부터 보여준다. 전체 조망은 스크롤/축소로.
                // fitView 는 v12에서 비동기 — 적용 전 getZoom() 은 스테일.
                await rf.fitView({ padding: 0.15, maxZoom: 1 });
                if (rf.getZoom() >= INIT_MIN_ZOOM) return;
                // 하한 발동 = 흐름이 화면을 넘침 → 미니맵 자동 표시 신호.
                setOverflows(true);
                const bounds = getNodesBounds(rf.getNodes());
                const w = flowAreaRef.current?.getBoundingClientRect().width ?? 800;
                rf.setViewport({
                  x: w / 2 - (bounds.x + bounds.width / 2) * INIT_MIN_ZOOM,
                  y: 28 - bounds.y * INIT_MIN_ZOOM,
                  zoom: INIT_MIN_ZOOM,
                });
              }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
            >
              <Background gap={24} size={1} />
              <LegendPanel
                impactLegend={impactIds ? impactLegend : undefined}
                seedLegend={(seedIds && seedIds.size > 0) || biz.nodes.some((n) => n.change === "modified")
                  ? "변경 기점(시드) — ①이 변경 대상으로 지목한 기능의 활동" : undefined}
                changeLegend={biz.nodes.some((n) => n.change === "added" || n.change === "removed")}
              />
              {/* 우상단 툴바 — 미니맵 토글 + PNG 내보내기(한 슬롯, Panel 중복 방지). */}
              <Panel position="top-right" className="flex items-center" style={{ gap: 6 }}>
                <button
                  type="button"
                  onClick={toggleMiniMap}
                  aria-pressed={miniMapVisible}
                  className={`rounded-md border transition-colors cursor-pointer ${
                    miniMapVisible
                      ? "border-border-medium bg-elevated text-text-primary"
                      : "border-border-subtle bg-panel text-text-secondary hover:text-accent hover:border-border-medium"
                  }`}
                  style={{ fontSize: 11.5, padding: "4px 10px" }}
                >
                  {t.flowList.bfMiniMap}
                </button>
                <ExportPngButton
                  containerRef={flowAreaRef}
                  // 파일명 금지 문자만 치환 — 한글 제목 유지(문서 첨부 시 식별성).
                  fileName={`업무흐름도_${(title ?? domainId.replace(/^domain:/, "")).replace(/[\\/:*?"<>|]/g, "-")}.png`}
                  stamp={`${domainName ?? domainId.replace(/^domain:/, "")}${title ? ` — ${title}` : ""}`}
                  label={t.flowList.bfExportPng}
                />
              </Panel>
              {miniMapVisible && (
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-right"
                  style={{ width: 150, height: 110 }}
                  bgColor="var(--color-panel)"
                  maskColor="color-mix(in srgb, var(--color-root) 55%, transparent)"
                  nodeColor={(n) =>
                    (n.data as BizNodeData | undefined)?.biz.kind === "decision"
                      ? "var(--color-status-info)"
                      : "var(--color-border-medium)"
                  }
                  nodeStrokeWidth={0}
                />
              )}
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
                // 노드의 flow: 칩(layer-dao 보라)과 동일 색 — 기능 연결 표식의 색 언어 통일.
                color: "var(--color-layer-dao)",
                background: "color-mix(in srgb, var(--color-layer-dao) 10%, transparent)",
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
