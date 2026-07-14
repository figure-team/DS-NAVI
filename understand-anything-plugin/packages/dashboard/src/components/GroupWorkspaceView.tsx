import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import FlowListView from "./FlowListView";
import { buildDomainCards, buildDomainFlows, domainIcon, findDomain, hasBusinessFlow, resolveWorkspaceView } from "../utils/domainData";
import { buildGroupMembers, type ResolvedGroup } from "../utils/domainGroups";
import { parseBusinessFlows } from "../utils/businessFlow";
import {
  activeLeafKey,
  buildTreeFlowItems,
  filterTreeDomains,
  type TreeDomainNode,
  type TreeFlowItem,
} from "../utils/groupWorkspaceTree";

/**
 * 상단도메인(그룹) 워크스페이스 (DOMAIN_HIERARCHY §7 D3, 2026-07-14 트리 통합 v2) —
 * 서브도메인▸업무흐름도 2레벨 트리를 **기존 업무 프로세스 목록 패널 자리**
 * (FlowListView 업무 흐름도 탭 내부, processPanel 주입)에 넣는다. 별도 외곽
 * 컬럼은 없다(사용자 확정: "트리는 기존 업무흐름도 목록에 들어간다") — 화면은
 * FlowListView 단일 레이아웃 그대로이고, 그 안의 좌측 패널만 목록→트리가 된다.
 * 기능(코드 흐름) 탭은 완전히 그대로(트리는 업무 흐름도 탭 전용 패널).
 *
 * 서브도메인/흐름 선택은 URL(`/domains/:groupKey/:domainId?view=&bf=`)이 진실 —
 * 트리는 그 상태의 표시일 뿐이다(리프 클릭이 navigate 를 호출, store 동기화는
 * DomainsPage 가 기존과 동일하게 전담).
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
  const [query, setQuery] = useState("");

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

  const filteredDomains = useMemo(() => filterTreeDomains(treeDomains, query), [treeDomains, query]);

  // 펼침 상태 — 사용자 토글(다중 펼침 허용) + 딥링크로 도착한 선택 도메인은 항상 펼침에
  // 포함(§ URL 하위호환: 트리에서 해당 도메인 펼침+흐름 선택 상태로 열리게).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set([selectedDomainId]));
  useEffect(() => {
    setExpandedIds((prev) => (prev.has(selectedDomainId) ? prev : new Set(prev).add(selectedDomainId)));
  }, [selectedDomainId]);
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  // 검색 중엔 결과에 남은 도메인을 전부 강제 펼침(매칭된 흐름 제목이 바로 보이게) —
  // 지운 뒤에는 직전 토글 상태로 그대로 복귀(별도 상태를 건드리지 않음).
  const searching = query.trim().length > 0;
  const isExpanded = (id: string) => searching || expandedIds.has(id);

  // 현재 선택된 서브도메인의 활성 리프 — FlowListView 의 view/bfIdx 해석과 동일 규칙
  // (resolveWorkspaceView + 클램프)이라야 트리 강조와 본문이 항상 같은 흐름을 가리킨다.
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
    if (item.bfIndex) params.set("bf", String(item.bfIndex)); // 0/null(fallback) 둘 다 생략 = 기본값과 동치.
    navigate(`/domains/${group.key}/${item.domainId}?${params.toString()}`);
  };

  const groupIcon = group.isUnclassified ? "🗂️" : domainIcon(group.name, group.key);

  // 트리 패널 — FlowListView 업무 흐름도 탭의 프로세스 목록 자리(processPanel)에
  // 주입된다. 그룹명/뒤로가기는 상단 브레드크럼이 담당하므로 패널 헤더는
  // 그룹 컨텍스트 1줄 + 검색으로 최소화.
  const treePanel = (
    <>
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
      <div className="shrink-0" style={{ padding: "0 12px 8px" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.groupWorkspace.searchPlaceholder}
            aria-label={t.groupWorkspace.searchPlaceholder}
            className="w-full rounded-md border border-border-subtle bg-elevated text-text-primary placeholder:text-text-muted"
            style={{ fontSize: 12.5, padding: "5px 9px" }}
          />
        </div>
      <ul className="flex-1 min-h-0 overflow-y-auto" style={{ padding: "0 6px 10px" }}>
          {filteredDomains.map((d) => {
            const expanded = isExpanded(d.id);
            const isSelectedDomain = d.id === selectedDomainId;
            const expandable = d.items.length > 0;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => toggleExpand(d.id)}
                  aria-expanded={expandable ? expanded : undefined}
                  aria-current={isSelectedDomain ? "page" : undefined}
                  className="w-full flex items-center gap-1.5 rounded-md text-left transition-colors cursor-pointer"
                  style={{
                    padding: "7px 8px",
                    fontSize: 12.5,
                    marginBottom: 2,
                    background: isSelectedDomain
                      ? "color-mix(in srgb, var(--color-accent) 9%, transparent)"
                      : "transparent",
                    color: isSelectedDomain ? "var(--color-accent)" : "var(--color-text-secondary)",
                    fontWeight: isSelectedDomain ? 600 : 400,
                  }}
                >
                  <span
                    aria-hidden
                    className="shrink-0"
                    style={{ width: 10, fontSize: 9, opacity: expandable ? 1 : 0, textAlign: "center" }}
                  >
                    {expanded ? "▼" : "▶"}
                  </span>
                  <span aria-hidden className="shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>
                    {d.icon}
                  </span>
                  <span className="truncate flex-1" title={d.name}>
                    {d.name}
                  </span>
                  <span className="shrink-0 text-text-muted tabular-nums" style={{ fontSize: 11 }}>
                    {d.flowCount}
                  </span>
                </button>
                {expanded && (
                  <ul style={{ paddingLeft: 26 }}>
                    {d.items.map((item) => {
                      const active = isSelectedDomain && item.key === activeKey;
                      return (
                        <li key={item.key}>
                          <button
                            type="button"
                            onClick={() => openLeaf(item)}
                            aria-current={active ? "page" : undefined}
                            className="w-full flex items-center text-left rounded-md transition-colors cursor-pointer"
                            style={{
                              padding: "5px 8px",
                              fontSize: 11.5,
                              marginBottom: 1,
                              background: active
                                ? "color-mix(in srgb, var(--color-accent) 9%, transparent)"
                                : "transparent",
                              color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                              fontWeight: active ? 600 : 400,
                            }}
                          >
                            <span className="truncate" title={item.title}>
                              {item.title}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {d.items.length === 0 && (
                      <li className="text-text-muted" style={{ fontSize: 11, padding: "4px 8px" }}>
                        {t.groupWorkspace.noFlows}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        {filteredDomains.length === 0 && (
          <li className="text-text-muted" style={{ fontSize: 12, padding: "10px 8px" }}>
            {t.flowList.noMatches}
          </li>
        )}
      </ul>
    </>
  );

  // 화면 = 기존 도메인 워크스페이스(FlowListView) 단일 레이아웃. 업무 흐름도 탭의
  // 프로세스 목록 자리에만 트리가 들어간다(기능 탭은 그대로).
  return (
    <div className="h-full w-full min-h-0">
      {activeDomainId === selectedDomainId ? <FlowListView processPanel={treePanel} /> : null}
    </div>
  );
}
