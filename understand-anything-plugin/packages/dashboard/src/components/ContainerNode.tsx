import { memo } from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { getLayerColor } from "./LayerLegend";
import { useI18n } from "../contexts/I18nContext";
import { useDashboardStore } from "../store";

export interface ContainerNodeData extends Record<string, unknown> {
  containerId: string;
  name: string;
  childCount: number;
  strategy: "folder" | "community";
  colorIndex: number;
  isExpanded: boolean;
  hasSearchHits: boolean;
  searchHitCount?: number;
  isDiffAffected: boolean;
  // ktds-fork: 컨테이너 내 변경/영향 노드 수 — 단일 플래그(빨강)만으로는
  // 변경 포함 여부와 규모를 알 수 없다는 PL 피드백
  diffChangedCount?: number;
  diffAffectedCount?: number;
  isFocusedViaChild: boolean;
  onToggle: (containerId: string) => void;
}

export type ContainerFlowNode = Node<ContainerNodeData, "container">;

function ContainerNodeComponent({ data, width, height }: NodeProps<ContainerFlowNode>) {
  const color = getLayerColor(data.colorIndex);
  const { t } = useI18n();
  // ktds: 활성 채널 라벨 (diff="변경됨/영향받음", impact="시드/영향")
  const overlaySource = useDashboardStore((s) => s.overlaySource);
  const lblChanged = overlaySource === "impact" ? t.impactToggle.seed : t.diffToggle.changed;
  const lblAffected = overlaySource === "impact" ? t.impactToggle.affected : t.diffToggle.affected;

  // ktds-fork: 변경 포함=적색, 영향만=호박색 (기존: 둘 다 적색)
  const diffChanged = data.diffChangedCount ?? 0;
  const diffAffected = data.diffAffectedCount ?? 0;
  const borderColor = diffChanged > 0
    ? "var(--color-diff-changed)"
    : diffAffected > 0 || data.isDiffAffected
      ? "var(--color-diff-affected)"
      : data.isExpanded || data.isFocusedViaChild
        ? "rgba(212,165,116,0.6)"
        : "rgba(212,165,116,0.25)";
  const borderWidth = data.isExpanded || data.isFocusedViaChild ? 1.5 : 1;

  const labelDimmed = data.name === "~";
  const labelText = labelDimmed ? "(root)" : data.name;

  const handleToggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    data.onToggle(data.containerId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={data.isExpanded}
      aria-label={`${labelText} container, ${data.childCount} item${data.childCount !== 1 ? "s" : ""}, ${data.isExpanded ? "expanded" : "collapsed"}`}
      className="rounded-xl cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[rgba(212,165,116,0.6)]"
      style={{
        width,
        height,
        background: "rgba(255,255,255,0.02)",
        border: `${borderWidth}px solid ${borderColor}`,
        position: "relative",
      }}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle(e);
        }
      }}
    >
      <div
        className="flex items-center justify-between font-heading"
        style={{
          padding: "12px 16px",
          color: color.label,
          fontSize: 14,
          fontWeight: 400,
        }}
      >
        <span
          className={labelDimmed ? "opacity-50" : ""}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          {data.isExpanded && <span style={{ fontSize: 10 }}>▾</span>}
          {labelText}
          {data.searchHitCount != null && data.searchHitCount > 0 && (
            <span
              className="font-mono"
              style={{
                marginLeft: 6,
                fontSize: 10,
                background: "rgba(212,165,116,0.2)",
                color: "var(--color-gold, #d4a574)",
                padding: "1px 6px",
                borderRadius: 8,
              }}
            >
              {data.searchHitCount} hit{data.searchHitCount !== 1 ? "s" : ""}
            </span>
          )}
          {/* ktds-fork: 변경/영향 개수 칩 — 접힌 상태에서도 내부 규모가 보이게 */}
          {diffChanged > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                background: "var(--color-diff-changed-dim)",
                color: "var(--color-diff-changed)",
                padding: "1px 6px",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
            >
              {lblChanged} {diffChanged}
            </span>
          )}
          {diffAffected > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                background: "var(--color-diff-affected-dim)",
                color: "var(--color-diff-affected)",
                padding: "1px 6px",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
            >
              {lblAffected} {diffAffected}
            </span>
          )}
        </span>
        <span style={{ color: "#a39787", fontSize: 11 }}>{data.childCount}</span>
      </div>
    </div>
  );
}

const ContainerNode = memo(ContainerNodeComponent);
ContainerNode.displayName = "ContainerNode";

export default ContainerNode;
