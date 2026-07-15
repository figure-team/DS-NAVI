import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import FlowListView from "./FlowListView";
import WorkMapTreePanel from "./WorkMapTreePanel";
import { buildDomainCards, buildDomainFlows, domainIcon, findDomain, hasBusinessFlow, resolveWorkspaceView } from "../utils/domainData";
import { buildGroupMembers, type ResolvedGroup } from "../utils/domainGroups";
import { parseBusinessFlows } from "../utils/businessFlow";
import { activeLeafKey, buildTreeFlowItems, type TreeDomainNode, type TreeFlowItem } from "../utils/groupWorkspaceTree";

/**
 * 상단도메인(그룹) 워크스페이스 (DOMAIN_HIERARCHY §7 D3) — 서브도메인▸업무흐름도 2레벨
 * 트리를 FlowListView 업무 흐름도 탭의 프로세스 목록 자리(processPanel)에 넣는다.
 * 트리 UI 자체는 공용 WorkMapTreePanel(평면 워크스페이스와 공유). 이 컴포넌트는 그룹 멤버로
 * treeDomains 를 만들고 리프 클릭 내비게이션(그룹 경로)만 주입한다.
 *
 * 서브도메인/흐름 선택은 URL(`/domains/:groupKey/:domainId?view=&bf=`)이 진실.
 */
export default function GroupWorkspaceView({
  group,
  selectedDomainId,
}: {
  group: ResolvedGroup;
  selectedDomainId: string;
}) {
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
    const members = buildGroupMembers(group, buildDomainCards(domainGraph).cards);
    return members.map((m): TreeDomainNode => {
      const node = findDomain(domainGraph, m.id);
      const processes = parseBusinessFlows(node);
      const hasAnyFlow = buildDomainFlows(domainGraph, m.id).length > 0;
      return {
        id: m.id,
        name: m.name,
        icon: m.icon,
        flowCount: m.flowCount,
        items: buildTreeFlowItems(m.id, processes, hasAnyFlow, labels),
      };
    });
  }, [domainGraph, group, t]);

  // 현재 선택 서브도메인의 활성 리프 — FlowListView 의 view/bfIdx 해석과 동일 규칙.
  const selectedNode = useMemo(
    () => (domainGraph ? findDomain(domainGraph, selectedDomainId) : undefined),
    [domainGraph, selectedDomainId],
  );
  const selectedProcesses = useMemo(() => parseBusinessFlows(selectedNode), [selectedNode]);
  const view = resolveWorkspaceView(searchParams.get("view"), searchParams.get("flow"), hasBusinessFlow(selectedNode));
  const bfParam = Number.parseInt(searchParams.get("bf") ?? "", 10);
  const bfIdx = Number.isFinite(bfParam)
    ? Math.min(Math.max(bfParam, 0), Math.max(selectedProcesses.length - 1, 0))
    : 0;
  const activeKey = view === "business" ? activeLeafKey(selectedDomainId, selectedProcesses.length > 0, bfIdx) : null;

  const openLeaf = (item: TreeFlowItem) => {
    const params = new URLSearchParams();
    params.set("view", "business");
    if (item.bfIndex) params.set("bf", String(item.bfIndex));
    navigate(`/domains/${group.key}/${item.domainId}?${params.toString()}`);
  };

  const groupIcon = group.isUnclassified ? "🗂️" : domainIcon(group.name, group.key);

  // 트리 패널 헤더 — 그룹 컨텍스트 1줄(아이콘·그룹명·서브도메인 수). 검색은 패널이 담당.
  const groupHeader = (
    <div
      className="shrink-0 flex items-center gap-2 min-w-0"
      aria-label={t.groupWorkspace.navTitle}
      style={{ padding: "12px 16px 6px" }}
    >
      <span aria-hidden className="shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>
        {groupIcon}
      </span>
      <span className="text-text-primary font-bold truncate" style={{ fontSize: 12.5 }} title={group.name}>
        {group.name}
      </span>
      <span className="ml-auto shrink-0 text-text-muted tabular-nums" style={{ fontSize: 11 }}>
        {t.domainMap.subDomainCount.replace("{count}", String(treeDomains.length))}
      </span>
    </div>
  );

  const treePanel = (
    <WorkMapTreePanel
      treeDomains={treeDomains}
      selectedDomainId={selectedDomainId}
      activeKey={activeKey}
      onOpenLeaf={openLeaf}
      header={groupHeader}
      searchPlaceholder={t.groupWorkspace.searchPlaceholder}
    />
  );

  return (
    <div className="h-full w-full min-h-0">
      {activeDomainId === selectedDomainId ? <FlowListView processPanel={treePanel} /> : null}
    </div>
  );
}
