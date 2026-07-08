import { useEffect } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { useDashboardStore } from "../../store";
import { BORDER, WARN } from "./types";
import type { Evidence } from "./types";

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

export function Pill({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, display: "inline-flex", width: "max-content", color, background: bg ?? "color-mix(in srgb,currentColor 10%,transparent)", boxShadow: `inset 0 0 0 1px color-mix(in srgb,${color} 22%,transparent)` }}>{label}</span>;
}

// pmpl-proto .conf 배지 — 톤 배경(color-mix)을 두른 필. title 로 기계 판정 여부를 명시(CONF_TITLE).
export const confChip = (label: string, color: string, title?: string) => (
  <span title={title} style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", color, background: "color-mix(in srgb, currentColor 12%, transparent)" }}>{label}</span>
);

// pmpl-proto .stat 타일(+진행 바 확장).
export function Tile({ lbl, n, d, pct, bar }: { lbl: string; n: number | string; d?: string; pct?: number; bar?: string }) {
  return (
    <div className="card-shadow" style={{ flex: 1, background: "var(--color-panel)", border: BORDER, borderRadius: 10, padding: "14px 16px" }}>
      <div className="text-text-muted" style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{lbl}</div>
      <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.5px", color: "var(--color-text-primary)", lineHeight: 1 }}>{n}{d && <span className="text-text-muted" style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: 0 }}>{d}</span>}</div>
      {pct !== undefined && <div style={{ height: 5, borderRadius: 3, background: "var(--color-elevated)", overflow: "hidden", marginTop: 9 }}><i style={{ display: "block", height: "100%", width: `${pct}%`, background: bar }} /></div>}
    </div>
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

/** 근거 file:line 링크 — 클릭 시 코드 뷰어를 그 위치로 연다(title 툴팁 대체, gap2). */
export function EvidenceLink({ e }: { e: Evidence }) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  return (
    <button
      type="button"
      onClick={(ev) => { ev.stopPropagation(); openCodeViewerAt(e.file, e.line ?? 1); }}
      title={`${e.file}${e.line !== null ? `:${e.line}` : ""} — 코드 뷰어로 열기`}
      className="cursor-pointer bg-transparent border-0 hover:bg-elevated rounded"
      style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-status-info)", padding: "1px 4px", wordBreak: "break-all", textAlign: "left" }}
    >
      {e.line === null ? e.file : `${e.file}:${e.line}`}
    </button>
  );
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
