import { useEffect, useRef } from "react";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import type { AggregatedEdge } from "../../utils/structureGraph";

/** 팝오버에 나열할 근거 파일 관계 상한 — 초과분은 "+N건" 집계(설계 §4 확정 ①). */
const EVIDENCE_CAP = 8;

/**
 * 뎁스1·2 엣지 클릭 팝오버 — kind·source→target 파일 목록(확정 ①). 클릭 지점
 * 근처에 고정 위치로 뜨고, 바깥 클릭/Escape 로 닫힌다. 파일 경로는 CitationChip과
 * 같은 코드뷰어 점프(openCodeViewerAt)를 재사용해 "근거 확인"을 한 클릭으로 잇는다.
 */
export default function EdgeEvidencePopover({
  edge,
  anchor,
  fromLabel,
  toLabel,
  onClose,
}: {
  edge: AggregatedEdge;
  anchor: { x: number; y: number };
  fromLabel: string;
  toLabel: string;
  onClose: () => void;
}) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    // capture=true — 그래프 캔버스 클릭(엣지 재클릭 포함)이 버블 전에 먼저 닫히지 않게.
    document.addEventListener("mousedown", onOutside, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutside, true);
    };
  }, [onClose]);

  // 뷰포트 밖으로 나가지 않도록 clamp(팝오버 폭 320 가정).
  const width = 320;
  const left = Math.min(Math.max(anchor.x - width / 2, 12), window.innerWidth - width - 12);
  const top = Math.min(anchor.y + 12, window.innerHeight - 60);

  const shown = edge.evidence.slice(0, EVIDENCE_CAP);
  const hidden = edge.evidence.length - shown.length;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t.structure.evidenceTitle}
      className="fixed z-[60] rounded-lg border border-border-medium bg-surface shadow-2xl flex flex-col"
      style={{ left, top, width, maxHeight: 360, padding: "10px 12px" }}
    >
      <div className="flex items-center gap-2 shrink-0" style={{ marginBottom: 6 }}>
        <span className="text-text-primary font-semibold truncate" style={{ fontSize: 12.5 }}>
          {fromLabel} → {toLabel}
        </span>
        <span className="ml-auto text-text-muted tabular-nums shrink-0" style={{ fontSize: 11 }}>
          {t.structure.evidenceWeight.replace("{count}", String(edge.weight))}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.structure.evidenceClose}
          className="shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent transition-colors cursor-pointer"
          style={{ width: 18, height: 18, fontSize: 11, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ gap: 4 }}>
        {shown.map((ev, i) => (
          <div
            key={`${ev.source}:${ev.target}:${i}`}
            className="rounded border border-border-subtle"
            style={{ padding: "5px 8px" }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="uppercase font-semibold rounded"
                style={{
                  fontSize: 9,
                  padding: "1px 5px",
                  color: "var(--color-accent)",
                  background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                }}
              >
                {ev.kind}
              </span>
            </div>
            <div className="flex flex-col" style={{ marginTop: 3, gap: 1 }}>
              <button
                type="button"
                onClick={() => openCodeViewerAt(ev.source, ev.line ?? 1)}
                className="text-left truncate text-text-secondary hover:text-accent transition-colors cursor-pointer"
                style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}
                title={ev.source}
              >
                {ev.source}
              </button>
              <span className="text-text-muted" style={{ fontSize: 9 }}>↓</span>
              <button
                type="button"
                onClick={() => openCodeViewerAt(ev.target, 1)}
                className="text-left truncate text-text-secondary hover:text-accent transition-colors cursor-pointer"
                style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}
                title={ev.target}
              >
                {ev.target}
              </button>
            </div>
          </div>
        ))}
        {hidden > 0 && (
          <p className="text-text-muted text-center" style={{ fontSize: 10.5, padding: "4px 0" }}>
            {t.structure.evidenceMore.replace("{count}", String(hidden))}
          </p>
        )}
      </div>
    </div>
  );
}
