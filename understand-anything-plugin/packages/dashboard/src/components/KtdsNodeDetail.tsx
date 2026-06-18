import { getLayerColor } from "./LayerLegend";
import type { NodeDetail, LayerKey } from "../ktds/flowModel";

/**
 * Shared node-detail panel for the ktds Code Atlas views (AC-37).
 *
 * Follows `ktds-legacy-plugin/templates/node-detail-template.md` EXACTLY:
 * - Required fields are always shown: layer badge, symbol, clickable file:line,
 *   confidence.
 * - Optional sections (summary, annotation, calls, branches, tags) are omitted
 *   ENTIRELY when no data — no empty labels.
 *
 * Used by BOTH FlowSpineView and DomainMapView so the two views render the
 * same contract.
 */

const CONFIDENCE_STYLE: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: "CONFIRMED", cls: "text-node-function border-node-function/40 bg-node-function/10" },
  CONFIRMED_AI: { label: "CONFIRMED · AI", cls: "text-accent border-accent/40 bg-accent/10" },
  INFERRED: { label: "추정 · INFERRED", cls: "text-accent-dim border-accent-dim/40 bg-accent-dim/10" },
  UNVERIFIED: { label: "확인필요 · UNVERIFIED", cls: "text-[#c97070] border-[#c97070]/40 bg-[#c97070]/10" },
};

export interface KtdsNodeDetailProps {
  detail: NodeDetail;
  /** Stable layer→palette-index map so the badge color matches the rail. */
  layerIndex?: Map<LayerKey, number>;
  /** Open the source for a file:line anchor (→ CodeViewer). */
  onOpenSource?: (nodeId: string) => void;
  /** Navigate to a `calls` target node. */
  onSelectNode?: (nodeId: string) => void;
}

export default function KtdsNodeDetail({
  detail,
  layerIndex,
  onOpenSource,
  onSelectNode,
}: KtdsNodeDetailProps) {
  const colorIdx =
    detail.layer && layerIndex?.has(detail.layer) ? layerIndex.get(detail.layer)! : 0;
  const color = getLayerColor(colorIdx);
  const conf = CONFIDENCE_STYLE[detail.confidence] ?? CONFIDENCE_STYLE.UNVERIFIED;
  const canOpenSource = Boolean(detail.filePath);

  return (
    <div className="p-4 space-y-3" data-testid="ktds-node-detail">
      {/* 1. Layer badge — always shown */}
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: color.label, backgroundColor: color.bg, border: `1px solid ${color.border}` }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color.label }} />
        {detail.layerLabel ?? detail.layer ?? "—"}
      </div>

      {/* 2. Symbol / name — always shown */}
      <div className="font-mono text-sm text-text-primary break-words">{detail.name}</div>

      {/* 3. file:line — always shown, clickable when a filePath exists */}
      {detail.filePath ? (
        <button
          type="button"
          disabled={!canOpenSource}
          onClick={() => onOpenSource?.(detail.id)}
          className="group flex items-center gap-1.5 text-[11px] font-mono text-text-muted hover:text-accent transition-colors disabled:cursor-default"
          title="소스 보기 (CodeViewer)"
        >
          <span className="break-all text-left">
            {detail.filePath}
            {detail.line != null ? `:${detail.line}` : ""}
          </span>
          <svg className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      ) : (
        <div className="text-[11px] font-mono text-text-muted/60">파일 경로 없음</div>
      )}

      {/* 4. Summary — optional */}
      {detail.summary && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">요약</h4>
          <p className="text-xs text-text-secondary leading-relaxed">{detail.summary}</p>
        </section>
      )}

      {/* 5. Annotation — optional */}
      {detail.annotation && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">어노테이션</h4>
          <code className="text-[11px] text-accent font-mono">{detail.annotation}</code>
        </section>
      )}

      {/* 6. Call targets — optional */}
      {detail.calls && detail.calls.length > 0 && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">호출 대상</h4>
          <ul className="space-y-1">
            {detail.calls.map((c) => (
              <li key={c.targetId}>
                <button
                  type="button"
                  onClick={() => onSelectNode?.(c.targetId)}
                  className="text-[11px] font-mono text-text-secondary hover:text-accent transition-colors text-left"
                >
                  → {c.sym}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 7. Branches — optional */}
      {detail.branches && detail.branches.length > 0 && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">곁가지</h4>
          <ul className="space-y-1">
            {detail.branches.map((b) => (
              <li key={`${b.sym}-${b.type}`} className="text-[11px] font-mono text-text-secondary">
                {b.sym} <span className="text-text-muted">({b.type})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 8 + 9. Confidence (always) + tags (optional) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${conf.cls}`}>
          {conf.label}
        </span>
        {detail.tags?.map((tag) => (
          <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-elevated text-text-muted">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
