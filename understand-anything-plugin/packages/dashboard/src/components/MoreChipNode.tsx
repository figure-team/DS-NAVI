import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import { DETAIL_NODE_WIDTH, DETAIL_NODE_HEIGHT } from "../utils/layout";

// 펼친 컨테이너의 "+N개" 집계 칩 — 점진 공개 예산에서 잘린 나머지 자식을 대표한다.
// 숨은 자식으로 향하던 엣지는 이 칩으로 붙어 "가려진 노드에도 배선이 있다"는 사실을
// 유지하고, 클릭하면 전량 표시로 전환.
//
// 부활(2026-07-14, 탭 B) — c4e4856e 상태에서 최소 수정: 원본은 `t.containerNode.
// moreFiles`/`showAll` 을 컴포넌트 내부에서 직접 참조했는데, 그 문구가 "개 파일 더"
// 처럼 파일 KG 전용이라 도메인(서브도메인) 맥락에 안 맞는다. 라벨을 호출측이 조립해
// 넘기는 prop(label/hint)으로 바꿔 문구 결합도를 없앴다 — 스타일(점선 보더·레이아웃·
// 포커스 링 등)은 원본 그대로.

export interface MoreChipNodeData extends Record<string, unknown> {
  containerId: string;
  hiddenCount: number;
  /** 칩 본문 — 호출측 i18n으로 조립("+{count}건" 등). */
  label: string;
  /** 칩 하단 힌트 — 호출측 i18n(예: "모두 표시 ▸"). */
  hint: string;
  onShowAll: (containerId: string) => void;
}

export type MoreChipFlowNode = Node<MoreChipNodeData, "more-chip">;

function MoreChipNodeComponent({ data }: NodeProps<MoreChipFlowNode>) {
  const handleShowAll = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    data.onShowAll(data.containerId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${data.label} — ${data.hint}`}
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
        {data.label}
      </span>
      <span style={{ fontSize: 11, color: "#a39787" }}>
        {data.hint} ▸
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
