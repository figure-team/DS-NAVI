import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { Node, NodeProps } from "@xyflow/react";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";

export interface StepNodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  filePath?: string;
  stepId: string;
  order: number;
  // ktds-fork: step 파일의 diff 상태 배지 + 무관 step 흐림
  diffStatus?: "changed" | "affected";
  isDiffFaded?: boolean;
}

export type StepFlowNode = Node<StepNodeData, "step-node">;

function StepNode({ data }: NodeProps<StepFlowNode>) {
  const selectNode = useDashboardStore((s) => s.selectNode);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const isSelected = selectedNodeId === data.stepId;
  const { t } = useI18n();
  // ktds: 활성 채널 라벨 (diff="변경됨/영향받음", impact="시드/영향")
  const overlaySource = useDashboardStore((s) => s.overlaySource);
  const lblChanged = overlaySource === "impact" ? t.impactToggle.seed : t.diffToggle.changed;
  const lblAffected = overlaySource === "impact" ? t.impactToggle.affected : t.diffToggle.affected;

  // ktds-fork: 변경=적, 영향=호박 (구조 뷰 노드 배지와 동일 시각 언어)
  const diffStyle =
    data.diffStatus === "changed"
      ? { borderColor: "var(--color-diff-changed)", boxShadow: "0 0 10px rgba(224, 82, 82, 0.3)" }
      : data.diffStatus === "affected"
        ? { borderColor: "var(--color-diff-affected)", boxShadow: "0 0 8px rgba(212, 160, 48, 0.25)" }
        : undefined;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 min-w-[180px] max-w-[240px] cursor-pointer transition-all ${
        isSelected
          ? "border-accent bg-accent/10"
          : "border-border-subtle bg-elevated hover:border-accent/40"
      }${data.isDiffFaded ? " diff-faded" : ""}`}
      style={diffStyle}
      onClick={() => selectNode(data.stepId)}
    >
      <Handle type="target" position={Position.Left} className="!bg-text-muted/40 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Right} className="!bg-text-muted/40 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] font-mono text-accent/60 shrink-0">
          {data.order}
        </span>
        <span className="text-[11px] font-medium text-text-primary truncate">
          {data.label}
        </span>
        {/* ktds-fork: 명시 배지 */}
        {data.diffStatus === "changed" && (
          <span className="ml-auto shrink-0 text-[8px] font-semibold px-1 py-px rounded whitespace-nowrap bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]">
            {lblChanged}
          </span>
        )}
        {data.diffStatus === "affected" && (
          <span className="ml-auto shrink-0 text-[8px] font-semibold px-1 py-px rounded whitespace-nowrap bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
            {lblAffected}
          </span>
        )}
      </div>
      <div className="text-[10px] text-text-secondary line-clamp-2">
        {data.summary}
      </div>
      {data.filePath && (
        <div className="text-[9px] font-mono text-text-muted mt-1 truncate">
          {data.filePath}
        </div>
      )}
    </div>
  );
}

export default memo(StepNode);
