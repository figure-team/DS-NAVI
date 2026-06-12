import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  entryPoint?: string;
  entryType?: string;
  stepCount: number;
  flowId: string;
  // ktds-fork: 흐름(entry+step) 내 변경/영향 파일 수 + 무관 흐름 흐림
  diffChangedCount?: number;
  diffAffectedCount?: number;
  isDiffFaded?: boolean;
}

export type FlowFlowNode = Node<FlowNodeData, "flow-node">;

function FlowNode({ data }: NodeProps<FlowFlowNode>) {
  const selectNode = useDashboardStore((s) => s.selectNode);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const isSelected = selectedNodeId === data.flowId;
  const { t } = useI18n();

  // ktds-fork: 변경 포함=적, 영향만=호박
  const diffChanged = data.diffChangedCount ?? 0;
  const diffAffected = data.diffAffectedCount ?? 0;
  const diffStyle =
    diffChanged > 0
      ? { borderColor: "var(--color-diff-changed)", boxShadow: "0 0 12px rgba(224, 82, 82, 0.3)" }
      : diffAffected > 0
        ? { borderColor: "var(--color-diff-affected)", boxShadow: "0 0 10px rgba(212, 160, 48, 0.25)" }
        : undefined;

  return (
    <div
      className={`rounded-lg border px-4 py-3 min-w-[240px] max-w-[320px] cursor-pointer transition-all ${
        isSelected
          ? "border-accent bg-accent/10"
          : "border-border-medium bg-surface hover:border-accent/50"
      }${data.isDiffFaded ? " diff-faded" : ""}`}
      style={diffStyle}
      onClick={() => selectNode(data.flowId)}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent/60 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-accent/60 !w-2 !h-2" />

      {data.entryPoint && (
        <div className="text-[9px] font-mono text-accent/70 mb-1 truncate">
          {data.entryPoint}
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-semibold text-text-primary truncate">
          {data.label}
        </span>
        {/* ktds-fork: 변경/영향 개수 칩 */}
        {diffChanged > 0 && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-px rounded whitespace-nowrap bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]">
            {t.diffToggle.changed} {diffChanged}
          </span>
        )}
        {diffAffected > 0 && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-px rounded whitespace-nowrap bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
            {t.diffToggle.affected} {diffAffected}
          </span>
        )}
      </div>
      <div className="text-[10px] text-text-secondary line-clamp-2">
        {data.summary}
      </div>
      <div className="text-[9px] text-text-muted mt-1">
        {data.stepCount} step{data.stepCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default memo(FlowNode);
