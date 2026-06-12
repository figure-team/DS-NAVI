import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { getLayerColor } from "./LayerLegend";
import { useI18n } from "../contexts/I18nContext";

const complexityColors: Record<string, string> = {
  simple: "text-node-function",
  moderate: "text-gold-dim",
  complex: "text-[#c97070]",
};

export interface LayerClusterData extends Record<string, unknown> {
  layerId: string;
  layerName: string;
  layerDescription: string;
  fileCount: number;
  aggregateComplexity: string;
  layerColorIndex: number;
  searchMatchCount?: number;
  // ktds-fork: 계층 내 변경/영향 노드 수 — 첫 화면에서 어느 계층을 봐야 하는지
  diffChangedCount?: number;
  diffAffectedCount?: number;
  onDrillIn: (layerId: string) => void;
}

export type LayerClusterFlowNode = Node<LayerClusterData, "layer-cluster">;

function LayerClusterNode({
  data,
}: NodeProps<LayerClusterFlowNode>) {
  const color = getLayerColor(data.layerColorIndex);
  const complexityColor =
    complexityColors[data.aggregateComplexity] ?? complexityColors.simple;
  const { t } = useI18n();

  // ktds-fork: 변경 포함=적색, 영향만=호박색 테두리
  const diffChanged = data.diffChangedCount ?? 0;
  const diffAffected = data.diffAffectedCount ?? 0;
  const diffBorder =
    diffChanged > 0
      ? { borderColor: "var(--color-diff-changed)" }
      : diffAffected > 0
        ? { borderColor: "var(--color-diff-affected)" }
        : {};

  return (
    <div
      className="relative rounded-xl bg-elevated border border-border-subtle overflow-hidden cursor-pointer transition-all duration-200 hover:border-gold/40 hover:shadow-lg group"
      style={{
        width: 300,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        ...diffBorder,
      }}
      onClick={() => data.onDrillIn(data.layerId)}
    >
      {/* Left color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
        style={{ backgroundColor: color.label }}
      />

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-text-muted !w-2 !h-2"
      />

      <div className="pl-5 pr-4 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: color.label }}
          >
            Layer
          </span>
          <div className="flex items-center gap-2">
            {data.searchMatchCount != null && data.searchMatchCount > 0 && (
              <span className="text-[10px] font-mono bg-gold/20 text-gold px-1.5 py-0.5 rounded">
                {data.searchMatchCount} match{data.searchMatchCount !== 1 ? "es" : ""}
              </span>
            )}
            {/* ktds-fork: 계층 diff 칩 — 드릴인 없이 변경/영향 위치 식별 */}
            {diffChanged > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-changed-dim)] text-[var(--color-diff-changed)]">
                {t.diffToggle.changed} {diffChanged}
              </span>
            )}
            {diffAffected > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
                {t.diffToggle.affected} {diffAffected}
              </span>
            )}
            <span className={`text-[10px] font-mono ${complexityColor}`}>
              {data.aggregateComplexity}
            </span>
          </div>
        </div>

        {/* Layer name */}
        <div className="text-lg font-heading text-text-primary mb-1">
          {data.layerName}
        </div>

        {/* Description */}
        <div className="text-[11px] text-text-secondary line-clamp-2 leading-tight mb-3">
          {data.layerDescription}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">
            {data.fileCount} file{data.fileCount !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            Click to explore →
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-text-muted !w-2 !h-2"
      />
    </div>
  );
}

export default memo(LayerClusterNode);
