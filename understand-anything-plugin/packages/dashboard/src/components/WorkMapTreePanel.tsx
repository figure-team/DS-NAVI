import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../contexts/I18nContext";
import { filterTreeDomains, type TreeDomainNode, type TreeFlowItem } from "../utils/groupWorkspaceTree";

/**
 * 업무 지도 워크스페이스 좌측 트리 패널(공용) — 서브도메인/도메인 ▸ 업무흐름 2레벨.
 * 그룹(GroupWorkspaceView, 서브도메인 여러 개)과 평면(FlatWorkspaceView, 도메인 1개)이
 * 같은 트리 UI를 쓰도록 GroupWorkspaceView 에서 추출(2026-07-15, 평면도 mmobile 트리 형식 통일).
 * 검색·펼침 상태는 이 패널이 소유하고, 리프 클릭 내비게이션(openLeaf)만 호출측이 주입한다.
 */
export default function WorkMapTreePanel({
  treeDomains,
  selectedDomainId,
  activeKey,
  onOpenLeaf,
  header,
  searchPlaceholder,
}: {
  treeDomains: TreeDomainNode[];
  selectedDomainId: string;
  /** 현재 활성 리프 key(강조용). 없으면 null. */
  activeKey: string | null;
  onOpenLeaf: (item: TreeFlowItem) => void;
  /** 검색창 위 컨텍스트 행(그룹명·건수 등). 없으면 검색창만. */
  header?: ReactNode;
  searchPlaceholder: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const filteredDomains = useMemo(() => filterTreeDomains(treeDomains, query), [treeDomains, query]);

  // 펼침 상태 — 선택 도메인은 항상 펼침(딥링크 하위호환), 사용자 토글 다중 허용.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set([selectedDomainId]));
  useEffect(() => {
    setExpandedIds((prev) => (prev.has(selectedDomainId) ? prev : new Set(prev).add(selectedDomainId)));
  }, [selectedDomainId]);
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // 검색 중엔 결과 도메인 강제 펼침(매칭 흐름이 바로 보이게), 지우면 토글 상태 복귀.
  const searching = query.trim().length > 0;
  const isExpanded = (id: string) => searching || expandedIds.has(id);

  return (
    <>
      {header}
      <div className="shrink-0" style={{ padding: header ? "0 12px 8px" : "12px 12px 8px" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
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
                          onClick={() => onOpenLeaf(item)}
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
}
