import { useEffect, useRef } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useDashboardStore } from "../../store";
import GraphWorkbench from "./GraphWorkbench";

/** 구조 그래프 섹션. 지식그래프(kind: "knowledge") 프로젝트면 /knowledge로 보낸다. */
export default function StructurePage() {
  const isKnowledgeGraph = useDashboardStore((s) => s.isKnowledgeGraph);
  useStructureUrlSync();
  if (isKnowledgeGraph) return <Navigate to="/knowledge" replace />;
  return <GraphWorkbench mode="structural" />;
}

/**
 * P3: 구조 뷰 상태 ↔ URL 쿼리 동기화 — 공유 가능한 "이 노드 봐" 링크.
 * ?node=<id>  선택 노드   ?level=class  상세도(file이 기본값이라 생략)
 * URL→store는 그래프 로드 완료 후 1회(setGraph가 선택을 리셋하므로), store→URL은
 * 적용 이후 replace로 미러링(히스토리 오염 없음).
 */
function useStructureUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const graph = useDashboardStore((s) => s.graph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const detailLevel = useDashboardStore((s) => s.detailLevel);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !graph) return;
    applied.current = true;
    const s = useDashboardStore.getState();
    const level = searchParams.get("level");
    if ((level === "file" || level === "class") && s.detailLevel !== level) {
      s.setDetailLevel(level);
    }
    const node = searchParams.get("node");
    if (node && graph.nodes.some((n) => n.id === node) && s.selectedNodeId !== node) {
      s.selectNode(node);
    }
  }, [graph, searchParams]);

  useEffect(() => {
    if (!applied.current) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedNodeId) next.set("node", selectedNodeId);
        else next.delete("node");
        if (detailLevel === "class") next.set("level", "class");
        else next.delete("level");
        return next;
      },
      { replace: true },
    );
  }, [selectedNodeId, detailLevel, setSearchParams]);
}
