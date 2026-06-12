import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { getLayerColor } from "./LayerLegend";
import { useI18n } from "../contexts/I18nContext";
import { useDashboardStore } from "../store";

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
  /** ktds-fork: diff 모드에서 변경/영향이 없는 계층 — 노드 fade와 동일하게 흐림 */
  isDiffFaded?: boolean;
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
  // ktds: 활성 채널 라벨 (diff="변경됨/영향받음", impact="변경예정/영향받음")
  const overlaySource = useDashboardStore((s) => s.overlaySource);
  const lblChanged = overlaySource === "impact" ? t.impactToggle.seed : t.diffToggle.changed;
  const lblAffected = overlaySource === "impact" ? t.impactToggle.affected : t.diffToggle.affected;

  // ktds-fork: 변경 포함=적색, 영향만=호박색 테두리 + 글로우, 무관 계층=흐림.
  // 글로우는 인라인 boxShadow가 .diff-*-glow 클래스를 덮어쓰므로 인라인으로 합성
  // (값은 index.css .diff-changed-glow/.diff-affected-glow와 동일 계열).
  const diffChanged = data.diffChangedCount ?? 0;
  const diffAffected = data.diffAffectedCount ?? 0;
  const diffBorder =
    diffChanged > 0
      ? { borderColor: "var(--color-diff-changed)" }
      : diffAffected > 0
        ? { borderColor: "var(--color-diff-affected)" }
        : {};
  const baseShadow = "0 4px 16px rgba(0,0,0,0.4)";
  const boxShadow =
    diffChanged > 0
      ? `${baseShadow}, 0 0 16px rgba(224, 82, 82, 0.35)`
      : diffAffected > 0
        ? `${baseShadow}, 0 0 12px rgba(212, 160, 48, 0.3)`
        : baseShadow;

  return (
    <div
      className={`relative rounded-xl bg-elevated border border-border-subtle overflow-hidden cursor-pointer transition-all duration-200 hover:border-gold/40 hover:shadow-lg group${data.isDiffFaded ? " diff-faded" : ""}`}
      style={{
        width: 300,
        boxShadow,
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
                {lblChanged} {diffChanged}
              </span>
            )}
            {diffAffected > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap bg-[var(--color-diff-affected-dim)] text-[var(--color-diff-affected)]">
                {lblAffected} {diffAffected}
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
