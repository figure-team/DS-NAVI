import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useDashboardStore } from "../../store";
import GraphWorkbench from "./GraphWorkbench";

/** 세분화 위키 문서 섹션 (ktds-fork ADR-004). */
export default function WikiPage() {
  useWikiUrlSync();
  return <GraphWorkbench mode="wiki" />;
}

/**
 * P5 잔여 해소: /wiki?doc=<위키노드 id> — 선택 문서 딥링크.
 * 위키 그래프 로드 후 1회 적용(URL→store), 이후 replace 미러(store→URL).
 */
function useWikiUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const wikiGraph = useDashboardStore((s) => s.wikiGraph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !wikiGraph) return;
    applied.current = true;
    const doc = searchParams.get("doc");
    if (doc && wikiGraph.nodes.some((n) => n.id === doc)) {
      useDashboardStore.getState().openWikiDoc(doc);
    }
  }, [wikiGraph, searchParams]);

  useEffect(() => {
    if (!applied.current) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedNodeId) next.set("doc", selectedNodeId);
        else next.delete("doc");
        return next;
      },
      { replace: true },
    );
  }, [selectedNodeId, setSearchParams]);
}
