import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

export interface DomainClusterData extends Record<string, unknown> {
  label: string;
  summary: string;
  entities?: string[];
  flowCount: number;
  businessRules?: string[];
  domainId: string;
  // ktds-fork: 도메인 내 변경/영향 파일 수 + 무관 도메인 흐림
  diffChangedCount?: number;
  diffAffectedCount?: number;
  isDiffFaded?: boolean;
}

export type DomainClusterFlowNode = Node<DomainClusterData, "domain-cluster">;

function DomainClusterNode({ data }: NodeProps<DomainClusterFlowNode>) {
  const navigateToDomain = useDashboardStore((s) => s.navigateToDomain);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const selectNode = useDashboardStore((s) => s.selectNode);
  const isSelected = selectedNodeId === data.domainId;
  const { t } = useI18n();

  // ktds-fork: 변경 포함=적, 영향만=호박 (테두리+글로우 — 계층 카드와 동일 시각 언어)
  const diffChanged = data.diffChangedCount ?? 0;
  const diffAffected = data.diffAffectedCount ?? 0;
  const diffStyle =
    diffChanged > 0
      ? { borderColor: "var(--color-diff-changed)", boxShadow: "0 0 16px rgba(224, 82, 82, 0.35)" }
      : diffAffected > 0
        ? { borderColor: "var(--color-diff-affected)", boxShadow: "0 0 12px rgba(212, 160, 48, 0.3)" }
        : undefined;

  return (
    <div
      className={`rounded-xl border-2 px-5 py-4 min-w-[280px] max-w-[360px] cursor-pointer transition-all ${
        isSelected
          ? "border-accent bg-accent/10 shadow-lg shadow-accent/10"
          : "border-accent/40 bg-surface hover:border-accent/70"
      }${data.isDiffFaded ? " diff-faded" : ""}`}
      style={diffStyle}
      onClick={() => selectNode(data.domainId)}
      onDoubleClick={() => navigateToDomain(data.domainId)}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent/60 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent/60 !w-2 !h-2" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-heading text-sm text-accent font-semibold truncate">
          {data.label}
        </span>
        {/* ktds-fork: 변경/영향 개수 칩 */}
        {diffChanged > 0 && (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]">
            {t.diffToggle.changed} {diffChanged}
          </span>
        )}
        {diffAffected > 0 && (
          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
            {t.diffToggle.affected} {diffAffected}
          </span>
        )}
      </div>
      <div className="text-[11px] text-text-secondary line-clamp-2 mb-2">
        {data.summary}
      </div>

      {data.entities && data.entities.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-wider text-text-muted mb-1">Entities</div>
          <div className="flex flex-wrap gap-1">
            {data.entities.slice(0, 5).map((e) => (
              <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-text-secondary">
                {e}
              </span>
            ))}
            {data.entities.length > 5 && (
              <span className="text-[10px] text-text-muted">+{data.entities.length - 5}</span>
            )}
          </div>
        </div>
      )}

      <div className="text-[10px] text-text-muted">
        {data.flowCount} flow{data.flowCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default memo(DomainClusterNode);
