import { useEffect } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { useDashboardStore } from "../../store";
import { BORDER, FAINT, WARN } from "./types";
import type { Evidence } from "./types";

// ── P9: 근거 축 공통부 — IntakePanel 에서 이동(2026-07-17, ② ImpactStepView 와 공유) ──
export const REF_ROW = "flex flex-wrap items-baseline";
export const REF_GAP: CSSProperties = { gap: 6, minWidth: 0 };

/**
 * 축 한 줄. `state` 가 세 갈래인 것이 이 컴포넌트의 존재 이유다(설계 §4.1 "없음 vs 못 봄"):
 *  - `filled`  — 근거를 그린다.
 *  - `none`    — **찾았는데 없다**. `evidence: []`(명시적 빈 배열)만 이 상태가 될 수 있다.
 *  - `omitted` — **못 봤다**. 축이 통째로 비었거나(화면·정책 축은 생산자 default 가 `[]` 라
 *                부재와 구별할 수 없다) 인용을 기록하지 않던 시대의 산출(`evidence: undefined`).
 *
 * 둘을 "근거 없음" 한 문구로 뭉치면 축소 모드(§10-1: "없으면 생략하되 그 사실을 명시")에서
 * **생략된 축이 '근거가 없는 축'으로 위장**한다 — 정확히 §4.1 이 경고한 오독이다.
 *
 * W5: `noneLabel`/`noneTitle` 은 코드영향 축(ImpactStepView)이 쓴다 — 거기서 `[]` 는 "근거가 없다"
 * 가 아니라 "엔진이 계산했고 영향받는 게 0건"이다. 기본값은 근거 축(AcRow)의 종전 문구 그대로다.
 */
export function Axis({ label, state, noneLabel = "근거 없음", noneTitle = "이 축을 봤으나 근거가 없습니다 — '생략됨'(못 봄)과 다릅니다.", children }: {
  label: string; state: "filled" | "none" | "omitted"; noneLabel?: string; noneTitle?: string; children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline" style={{ gap: 6, padding: "1px 0" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: FAINT, flex: "none" }}>{label}</span>
      {state === "filled" ? children
        : state === "none"
          ? <span title={noneTitle} style={{ fontSize: 10.5, color: WARN }}>{noneLabel}</span>
          : <span title="이 축은 이 산출에 기록되지 않았습니다 — 근거가 없다는 뜻이 아닙니다(축소 모드: 있으면 포함·없으면 생략)." style={{ fontSize: 10.5, color: FAINT }}>생략됨</span>}
    </div>
  );
}

/** 다크 테마 마크다운 컴포넌트(GFM 표 포함) — DocsView 와 동일 패턴(태그별 타이핑). */
export const MD = {
  h1: (p: ComponentPropsWithoutRef<"h1">) => <h1 style={{ fontSize: 17, color: "var(--color-text-primary)", margin: "2px 0 12px", fontFamily: "var(--font-heading)" }} {...p} />,
  h2: (p: ComponentPropsWithoutRef<"h2">) => <h2 style={{ fontSize: 14, color: "var(--color-accent)", margin: "18px 0 9px", paddingBottom: 4, borderBottom: "1px solid var(--color-border-subtle)" }} {...p} />,
  h3: (p: ComponentPropsWithoutRef<"h3">) => <h3 style={{ fontSize: 12.5, color: "var(--color-text-primary)", margin: "13px 0 7px" }} {...p} />,
  h4: (p: ComponentPropsWithoutRef<"h4">) => <h4 style={{ fontSize: 12, color: "var(--color-text-primary)", margin: "11px 0 6px" }} {...p} />,
  p: (p: ComponentPropsWithoutRef<"p">) => <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "7px 0" }} {...p} />,
  ul: (p: ComponentPropsWithoutRef<"ul">) => <ul style={{ margin: "7px 0", paddingLeft: 18, listStyle: "disc" }} {...p} />,
  ol: (p: ComponentPropsWithoutRef<"ol">) => <ol style={{ margin: "7px 0", paddingLeft: 18, listStyle: "decimal" }} {...p} />,
  li: (p: ComponentPropsWithoutRef<"li">) => <li style={{ fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "2px 0" }} {...p} />,
  table: (p: ComponentPropsWithoutRef<"table">) => <div style={{ overflowX: "auto", margin: "8px 0" }}><table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }} {...p} /></div>,
  th: (p: ComponentPropsWithoutRef<"th">) => <th style={{ border: BORDER, padding: "5px 9px", background: "var(--color-elevated)", color: "var(--color-text-muted)", textAlign: "left", whiteSpace: "nowrap" }} {...p} />,
  td: (p: ComponentPropsWithoutRef<"td">) => <td style={{ border: BORDER, padding: "5px 9px", color: "var(--color-text-secondary)", verticalAlign: "top" }} {...p} />,
  code: (p: ComponentPropsWithoutRef<"code">) => <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--color-elevated)", padding: "1px 4px", borderRadius: 4 }} {...p} />,
  blockquote: (p: ComponentPropsWithoutRef<"blockquote">) => <blockquote style={{ borderLeft: `2px solid ${WARN}`, margin: "8px 0", padding: "2px 0 2px 11px", color: "var(--color-text-muted)", fontSize: 12 }} {...p} />,
  a: (p: ComponentPropsWithoutRef<"a">) => <a style={{ color: "var(--color-accent)" }} {...p} />,
};

/** 실행 중 스피너 — 종전 RTM 헤더의 인테이크 진행 표시(2026-07-16 헤더 제거로 세션 원장 행·세션 카드로 이사). */
export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg className="animate-spin" style={{ width: size, height: size, flex: "none" }} fill="none" viewBox="0 0 24 24" aria-label="진행 중">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, display: "inline-flex", width: "max-content", color, background: bg ?? "color-mix(in srgb,currentColor 10%,transparent)", boxShadow: `inset 0 0 0 1px color-mix(in srgb,${color} 22%,transparent)` }}>{label}</span>;
}

// pmpl-proto .conf 배지 — 톤 배경(color-mix)을 두른 필. title 로 기계 판정 여부를 명시(CONF_TITLE).
export const confChip = (label: string, color: string, title?: string, style?: React.CSSProperties) => (
  <span title={title} style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", color, background: "color-mix(in srgb, currentColor 12%, transparent)", ...style }}>{label}</span>
);

// pmpl-proto .stat 타일(+진행 바 확장). onClick 지정 시 필터 토글 버튼이 된다(active=적용 중), sub=산정 기준 한 줄 캡션.
export function Tile({ lbl, n, d, pct, bar, onClick, active, title, sub }: { lbl: string; n: number | string; d?: string; pct?: number; bar?: string; onClick?: () => void; active?: boolean; title?: string; sub?: string }) {
  const style: React.CSSProperties = {
    flex: 1, background: active ? "color-mix(in srgb, var(--color-accent) 4%, var(--color-panel))" : "var(--color-panel)",
    border: active ? "1px solid var(--color-accent)" : BORDER, borderRadius: 10, padding: "14px 16px",
  };
  const inner = (
    <>
      <div className="text-text-muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{lbl}</div>
      <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.5px", color: "var(--color-text-primary)", lineHeight: 1 }}>{n}{d && <span className="text-text-muted" style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: 0 }}>{d}</span>}</div>
      {sub && <div className="text-text-muted" style={{ fontSize: 10.5, lineHeight: 1.45, marginTop: 7 }}>{sub}</div>}
      {pct !== undefined && <div style={{ height: 5, borderRadius: 3, background: "var(--color-elevated)", overflow: "hidden", marginTop: sub ? 7 : 9 }}><i style={{ display: "block", height: "100%", width: `${pct}%`, background: bar }} /></div>}
    </>
  );
  if (!onClick) return <div className="card-shadow" style={style} title={title}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active} className="card-shadow cursor-pointer hover:border-accent transition-colors" style={{ ...style, font: "inherit", textAlign: "left", display: "block" }}>
      {inner}
    </button>
  );
}

/** 검색 매치 하이라이트 — 첫 매치를 accent 톤 mark 로 감싼다(대소문자 무시). */
export function Hl({ text, q }: { text: string; q: string }) {
  const needle = q.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: "color-mix(in srgb, var(--color-accent) 26%, transparent)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

/** 드로어/모달 공용 — Esc 로 닫기(gap9 접근성). */
export function useEscClose(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

/** 행 클릭 핸들러의 키보드 등가(Enter/Space) — tr 등 비버튼 요소용(gap9). */
export function rowKeyHandler(open: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target !== e.currentTarget) return; // 내부 버튼/입력의 Enter 는 그대로 둔다.
    e.preventDefault();
    open();
  };
}

export interface EvPopoverState { key: string; evidence: Evidence[]; right: number; top: number }

/** 근거 popover(고정 위치) — CrudTab 과 동일 패턴: 백드롭 클릭 닫기 + 항목 클릭 → 코드 뷰어. */
export function EvidencePopover({ pop, onClose }: { pop: EvPopoverState; onClose: () => void }) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  return (
    <>
      <button
        type="button"
        aria-label="근거 목록 닫기"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent", border: 0, cursor: "default" }}
      />
      <div
        className="rounded-lg border border-border-medium bg-panel card-shadow"
        style={{ position: "fixed", right: pop.right, top: pop.top, zIndex: 31, padding: 6, maxWidth: 420 }}
      >
        {pop.evidence.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { openCodeViewerAt(e.file, e.line ?? 1); onClose(); }}
            className="block w-full text-left cursor-pointer bg-transparent border-0 hover:bg-elevated rounded-md"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, padding: "5px 8px", color: "var(--color-status-info)", whiteSpace: "normal", wordBreak: "break-all" }}
          >
            {e.line === null ? e.file : `${e.file}:${e.line}`}
          </button>
        ))}
      </div>
    </>
  );
}

/** 테이블 sticky 헤더(스크롤 컨테이너 기준 top 0) — gap5. 셀별 th 스타일에 병합해 쓴다. */
export const STICKY_TH: React.CSSProperties = { position: "sticky", top: 0, background: "var(--color-panel)", zIndex: 2 };
