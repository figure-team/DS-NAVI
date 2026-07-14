import { useEffect } from "react";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import type { MergedStructureEdge } from "../../utils/structureGraph";

/** 방향 섹션당 나열할 근거 상한 — 초과분은 "+N건" 집계(패널은 스크롤되지만 수백 건 DOM 방지). */
const EVIDENCE_CAP = 30;

/**
 * 구조 그래프 선 클릭 → 우측 도킹 근거 패널(2026-07-14 사용자 확정 — 플로팅
 * 팝오버 은퇴). 선이 무방향 병합(mergeBidirectionalEdges)이라, 양방향이면
 * "A → B" / "B → A" 섹션으로 나눠 방향별 근거를 전부 보여준다. 파일 경로는
 * 기존 관례대로 코드뷰어 점프(openCodeViewerAt). Escape/✕ 로 닫는다.
 */
export default function EdgeEvidencePanel({
  edge,
  labelOf,
  onClose,
}: {
  edge: MergedStructureEdge;
  /** 노드 id → 표시 이름(뎁스별 소스가 달라 콜백으로 주입). */
  labelOf: (id: string) => string;
  onClose: () => void;
}) {
  const openCodeViewerAt = useDashboardStore((s) => s.openCodeViewerAt);
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-label={t.structure.evidenceTitle}
      className="absolute inset-y-0 right-0 z-20 flex flex-col bg-surface border-l border-border-subtle shadow-xl"
      style={{ width: 340 }}
    >
      <div className="shrink-0 flex items-center gap-2 border-b border-border-subtle" style={{ padding: "12px 14px" }}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">{t.structure.evidenceTitle}</div>
          <div className="text-text-primary font-semibold truncate" style={{ fontSize: 13 }}>
            {labelOf(edge.from)} ↔ {labelOf(edge.to)}
          </div>
        </div>
        <span className="ml-auto text-text-muted tabular-nums shrink-0" style={{ fontSize: 11 }}>
          {t.structure.evidenceWeight.replace("{count}", String(edge.weight))}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.structure.evidenceClose}
          className="shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent transition-colors cursor-pointer"
          style={{ width: 22, height: 22, fontSize: 12, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ padding: "10px 14px", gap: 14 }}>
        {edge.directions.map((dir) => {
          const shown = dir.evidence.slice(0, EVIDENCE_CAP);
          const hidden = dir.evidence.length - shown.length;
          return (
            <section key={`${dir.from}>${dir.to}`}>
              <h3 className="flex items-center gap-2 text-text-primary font-semibold" style={{ fontSize: 12, marginBottom: 6 }}>
                <span className="truncate">
                  {labelOf(dir.from)} → {labelOf(dir.to)}
                </span>
                <span className="ml-auto shrink-0 text-text-muted tabular-nums font-normal" style={{ fontSize: 10.5 }}>
                  {t.structure.evidenceWeight.replace("{count}", String(dir.weight))}
                </span>
              </h3>
              <div className="flex flex-col" style={{ gap: 4 }}>
                {shown.map((ev, i) => (
                  <div
                    key={`${ev.source}:${ev.target}:${i}`}
                    className="rounded border border-border-subtle"
                    style={{ padding: "5px 8px" }}
                  >
                    <span
                      className="uppercase font-semibold rounded inline-block"
                      style={{
                        fontSize: 9,
                        padding: "1px 5px",
                        color: "var(--color-accent)",
                        background: "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                      }}
                    >
                      {ev.kind}
                    </span>
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
                      {/* 공유 파일 근거(뎁스3, source==target)는 단일 행 — 방향 화살표 무의미. */}
                      {ev.target !== ev.source && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {hidden > 0 && (
                  <p className="text-text-muted text-center" style={{ fontSize: 10.5, padding: "4px 0" }}>
                    {t.structure.evidenceMore.replace("{count}", String(hidden))}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
