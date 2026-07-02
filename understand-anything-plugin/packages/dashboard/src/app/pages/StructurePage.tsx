import { Navigate } from "react-router";
import { useDashboardStore } from "../../store";
import GraphWorkbench from "./GraphWorkbench";

/** 구조 그래프 섹션. 지식그래프(kind: "knowledge") 프로젝트면 /knowledge로 보낸다. */
export default function StructurePage() {
  const isKnowledgeGraph = useDashboardStore((s) => s.isKnowledgeGraph);
  if (isKnowledgeGraph) return <Navigate to="/knowledge" replace />;
  return <GraphWorkbench mode="structural" />;
}
