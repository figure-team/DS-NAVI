import { useEffect } from "react";
import { useI18n } from "../../contexts/I18nContext";
import { useDiffLabels } from "../../hooks/useDiffLabels";
import type { DomainStyleGraphNode } from "./StructureDomainGraphUA";

/**
 * 구조 그래프 노드 클릭(1클릭) → 우측 도킹 정보 패널. 엣지 클릭의 EdgeEvidencePanel
 * 과 같은 도킹 규약(우측 340px aside, Escape/✕ 로 닫기)을 노드에 대칭 적용한다
 * (2026-07-14 사용자 요청). 드릴다운은 더블클릭 전용으로 분리됐으므로 이 패널은
 * 순수 정보 표시(열기 버튼 없음) — 카드가 압축 표기한 요약·전체 칩·근거율·임팩트를
 * 잘림 없이 펼쳐 보여준다.
 */
export default function NodeInfoPanel({
  node,
  onClose,
}: {
  node: DomainStyleGraphNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { lblChanged, lblAffected } = useDiffLabels();

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
      aria-label={t.structure.nodeInfoTitle}
      className="absolute inset-y-0 right-0 z-20 flex flex-col bg-surface border-l border-border-subtle shadow-xl"
      style={{ width: 340 }}
    >
      <div className="shrink-0 flex items-center gap-2 border-b border-border-subtle" style={{ padding: "12px 14px" }}>
        <div className="min-w-0 flex items-center gap-1.5">
          {node.icon && <span aria-hidden className="shrink-0 text-sm leading-none">{node.icon}</span>}
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">{t.structure.nodeInfoTitle}</div>
            <div className="text-text-primary font-semibold truncate" style={{ fontSize: 13 }}>
              {node.name}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.structure.evidenceClose}
          className="ml-auto shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent transition-colors cursor-pointer"
          style={{ width: 22, height: 22, fontSize: 12, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ padding: "12px 14px", gap: 12 }}>
        {(node.diffChangedCount > 0 || node.diffAffectedCount > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {node.diffChangedCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]">
                {lblChanged} {node.diffChangedCount}
              </span>
            )}
            {node.diffAffectedCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
                {lblAffected} {node.diffAffectedCount}
              </span>
            )}
          </div>
        )}

        {node.summary && (
          <p className="text-text-secondary" style={{ fontSize: 12, lineHeight: 1.55 }}>
            {node.summary}
          </p>
        )}

        {node.chips.length > 0 && (
          <section>
            <div className="text-[9px] uppercase tracking-wider text-text-muted mb-1.5">{node.chipsLabel}</div>
            <div className="flex flex-wrap gap-1">
              {node.chips.map((c, i) => (
                <span
                  key={`${i}-${c}`}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-text-secondary max-w-full truncate"
                  title={c}
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}

        {node.footer && <div className="text-[10px] text-text-muted">{node.footer}</div>}
      </div>
    </aside>
  );
}
