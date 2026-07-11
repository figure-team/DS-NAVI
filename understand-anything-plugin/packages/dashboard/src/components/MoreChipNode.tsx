import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { useI18n } from "../contexts/I18nContext";
import { DETAIL_NODE_WIDTH, DETAIL_NODE_HEIGHT } from "../utils/layout";

// 펼친 컨테이너의 "+N개 파일" 집계 칩 — 점진 공개 예산(utils/expandBudget)에서
// 잘린 나머지 자식을 대표한다. 숨은 자식으로 향하던 엣지는 이 칩으로 붙어
// "가려진 파일에도 배선이 있다"는 사실을 유지하고, 클릭하면 전량 표시로 전환.

export interface MoreChipNodeData extends Record<string, unknown> {
  containerId: string;
  hiddenCount: number;
  onShowAll: (containerId: string) => void;
}

export type MoreChipFlowNode = Node<MoreChipNodeData, "more-chip">;

function MoreChipNodeComponent({ data }: NodeProps<MoreChipFlowNode>) {
  const { t } = useI18n();

  const handleShowAll = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    data.onShowAll(data.containerId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`+${data.hiddenCount}${t.containerNode.moreFiles} — ${t.containerNode.showAll}`}
      className="rounded-lg cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-accent)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]"
      style={{
        width: DETAIL_NODE_WIDTH,
        height: DETAIL_NODE_HEIGHT,
        border: "1.5px dashed color-mix(in srgb, var(--color-accent) 35%, transparent)",
        background: "rgba(255,255,255,0.02)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}
      onClick={handleShowAll}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleShowAll(e);
        }
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-text-muted !w-2 !h-2"
        isConnectable={false}
      />
      <span
        className="font-heading"
        style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}
      >
        +{data.hiddenCount}
        {t.containerNode.moreFiles}
      </span>
      <span style={{ fontSize: 11, color: "#a39787" }}>
        {t.containerNode.showAll} ▸
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-text-muted !w-2 !h-2"
        isConnectable={false}
      />
    </div>
  );
}

const MoreChipNode = memo(MoreChipNodeComponent);
MoreChipNode.displayName = "MoreChipNode";

export default MoreChipNode;
