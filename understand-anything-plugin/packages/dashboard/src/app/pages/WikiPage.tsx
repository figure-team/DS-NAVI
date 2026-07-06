import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { useDashboardStore } from "../../store";
import WikiReader from "../../components/WikiReader";

/** 세분화 위키 문서 섹션 (ktds-fork ADR-004) — pmpl-proto .docs 레이아웃(트리+본문 카드).
 *  워크벤치(그래프+사이드바) 대신 문서 전용 페이지로 직접 렌더한다. */
export default function WikiPage() {
  useWikiUrlSync();
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <WikiReader />
    </div>
  );
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
