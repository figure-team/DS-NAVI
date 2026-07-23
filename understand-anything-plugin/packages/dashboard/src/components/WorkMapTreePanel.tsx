import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../contexts/I18nContext";
import SearchInput from "./ui/SearchInput";
import { filterTreeDomains, type TreeDomainNode, type TreeFlowItem } from "../utils/groupWorkspaceTree";

/**
 * 업무 지도 워크스페이스 좌측 트리 패널(공용) — 서브도메인/도메인 ▸ 업무흐름 2레벨.
 * 그룹(GroupWorkspaceView, 서브도메인 여러 개)과 평면(FlatWorkspaceView, 도메인 1개)이 공유.
 * 디자인 통일(2026-07-15 사용자 결정): 좌측 내비 디자인을 화면설계서(ScreenSpecView) 계열
 * (.proto-tree/.doc)로 맞춘다 — 그룹 헤더=회전 셰브런+볼드 라벨+카운트 알약, 리프=.doc 행,
 * 검색=공용 SearchInput. 동작(선택 도메인 자동 펼침·검색 필터·리프 내비)은 유지.
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

  // 펼침 상태 — 선택 도메인은 항상 펼침(딥링크 하위호환·현재 흐름이 바로 보이게), 토글 다중 허용.
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
  // 검색 중엔 결과 도메인 강제 펼침, 지우면 토글 상태 복귀.
  const searching = query.trim().length > 0;
  const isExpanded = (id: string) => searching || expandedIds.has(id);

  return (
    <>
      {header}
      <div className="shrink-0" style={{ padding: header ? "0 12px 8px" : "12px 12px 8px" }}>
        <SearchInput value={query} onChange={setQuery} placeholder={searchPlaceholder} width="full" />
      </div>
      {/* 화면설계서(ScreenSpecView) 계열 — .proto-tree 컨텍스트에서 .doc 리프 스타일 적용. */}
      <div className="flex-1 min-h-0 overflow-y-auto proto-tree" style={{ padding: "0 8px 10px" }}>
        {filteredDomains.map((d) => {
          const expanded = isExpanded(d.id);
          const expandable = d.items.length > 0;
          return (
            <div key={d.id} style={{ marginTop: 2 }}>
              {/* 그룹 헤더 — 회전 셰브런 + 도메인명(볼드) + 우측 카운트 알약(화면설계서 그룹 행). */}
              <button
                type="button"
                onClick={() => toggleExpand(d.id)}
                className="flex items-center w-full text-left cursor-pointer bg-transparent border-0 rounded-[7px] hover:bg-elevated"
                style={{ padding: "6px 8px", gap: 7, fontFamily: "inherit" }}
                aria-expanded={expandable ? expanded : undefined}
                aria-current={d.id === selectedDomainId ? "true" : undefined}
              >
                <span
                  className="inline-flex justify-center text-text-muted"
                  style={{
                    fontSize: 9,
                    width: 10,
                    flex: "none",
                    transition: "transform 0.12s ease",
                    transform: expanded ? "rotate(90deg)" : "none",
                    opacity: expandable ? 1 : 0,
                  }}
                >
                  ▸
                </span>
                <span className="truncate text-text-primary" style={{ fontSize: 12.5, fontWeight: 650 }} title={d.name}>
                  {d.name}
                </span>
                <span
                  className="tabular-nums text-text-muted bg-elevated rounded-full"
                  style={{ marginLeft: "auto", flex: "none", fontSize: 10.5, fontWeight: 600, padding: "1px 7px" }}
                  // 이 화면은 "업무 흐름도"이고 자식 리프가 업무이므로 알약도 업무(items) 수를 센다
                  // (기능 flowCount 는 상세 패널에서 별도로 본다). 머리 숫자 = 펼친 자식 행 수로 일치.
                  title={t.domainMap.workCount.replace("{count}", String(d.items.length))}
                  aria-label={t.domainMap.workCount.replace("{count}", String(d.items.length))}
                >
                  {d.items.length}
                </span>
              </button>
              {/* 자식(업무흐름 리프) — 셰브런 축 가이드 라인 + .doc 행. */}
              {expanded && (
                <div style={{ margin: "2px 0 6px 12px", paddingLeft: 6, borderLeft: "1px solid var(--color-border-subtle)" }}>
                  {d.items.map((item) => {
                    const active = d.id === selectedDomainId && item.key === activeKey;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onOpenLeaf(item)}
                        className={`doc ${active ? "on" : ""}`}
                        aria-current={active ? "page" : undefined}
                        title={item.title}
                      >
                        <span className="truncate" style={{ minWidth: 0 }}>
                          {item.title}
                        </span>
                      </button>
                    );
                  })}
                  {d.items.length === 0 && (
                    <div className="text-text-muted" style={{ fontSize: 11, padding: "4px 8px" }}>
                      {t.groupWorkspace.noFlows}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filteredDomains.length === 0 && (
          <div className="text-text-muted" style={{ fontSize: 12, padding: "10px 8px" }}>
            {t.flowList.noMatches}
          </div>
        )}
      </div>
    </>
  );
}
