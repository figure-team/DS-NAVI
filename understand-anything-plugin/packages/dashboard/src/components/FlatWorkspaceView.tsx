import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import FlowListView from "./FlowListView";
import WorkMapTreePanel from "./WorkMapTreePanel";
import { buildDomainCards, buildDomainFlows, domainIcon, findDomain, hasBusinessFlow, resolveWorkspaceView } from "../utils/domainData";
import { parseBusinessFlows } from "../utils/businessFlow";
import { activeLeafKey, buildTreeFlowItems, type TreeDomainNode, type TreeFlowItem } from "../utils/groupWorkspaceTree";

/**
 * 평면(그룹 미구성) 도메인 워크스페이스 — 그룹 워크스페이스(GroupWorkspaceView)와 좌측
 * 트리를 통일한다(2026-07-15 사용자 결정: "둘 다 mmobile 형식으로"). 서브도메인 층이 없으므로
 * 트리는 **도메인 1개를 최상위 노드**로(자동 펼침) → 업무흐름 리프. 검색·스타일은 공용
 * WorkMapTreePanel 그대로. 리프 클릭 = 평면 경로(/domains/:domainId?view=business&bf=).
 */
export default function FlatWorkspaceView({ domainId }: { domainId: string }) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();

  const treeDomains = useMemo<TreeDomainNode[]>(() => {
    if (!domainGraph) return [];
    const labels = {
      defaultTitle: (n: number) => t.flowList.bizProcessDefault.replace("{n}", String(n)),
      fallbackTitle: t.structure.sequentialFallbackCard,
    };
    const card = buildDomainCards(domainGraph).cards.find((c) => c.id === domainId);
    const node = findDomain(domainGraph, domainId);
    const processes = parseBusinessFlows(node);
    const hasAnyFlow = buildDomainFlows(domainGraph, domainId).length > 0;
    // 도메인 1개짜리 트리 — 그룹의 서브도메인 노드와 동일 형태(자동 펼침으로 흐름이 바로 보임).
    return [
      {
        id: domainId,
        name: card?.name ?? node?.name ?? domainId,
        icon: card?.icon ?? domainIcon(node?.name ?? domainId, domainId),
        flowCount: card?.flowCount ?? 0,
        items: buildTreeFlowItems(domainId, processes, hasAnyFlow, labels),
      },
    ];
  }, [domainGraph, domainId, t]);

  const selectedNode = useMemo(
    () => (domainGraph ? findDomain(domainGraph, domainId) : undefined),
    [domainGraph, domainId],
  );
  const selectedProcesses = useMemo(() => parseBusinessFlows(selectedNode), [selectedNode]);
  const view = resolveWorkspaceView(searchParams.get("view"), searchParams.get("flow"), hasBusinessFlow(selectedNode));
  const bfParam = Number.parseInt(searchParams.get("bf") ?? "", 10);
  const bfIdx = Number.isFinite(bfParam)
    ? Math.min(Math.max(bfParam, 0), Math.max(selectedProcesses.length - 1, 0))
    : 0;
  const activeKey = view === "business" ? activeLeafKey(domainId, selectedProcesses.length > 0, bfIdx) : null;

  const openLeaf = (item: TreeFlowItem) => {
    const params = new URLSearchParams();
    params.set("view", "business");
    if (item.bfIndex) params.set("bf", String(item.bfIndex));
    navigate(`/domains/${item.domainId}?${params.toString()}`);
  };

  const treePanel = (
    <WorkMapTreePanel
      treeDomains={treeDomains}
      selectedDomainId={domainId}
      activeKey={activeKey}
      onOpenLeaf={openLeaf}
      searchPlaceholder={t.groupWorkspace.searchPlaceholder}
    />
  );

  return (
    <div className="h-full w-full min-h-0">
      {activeDomainId === domainId ? <FlowListView processPanel={treePanel} /> : null}
    </div>
  );
}
