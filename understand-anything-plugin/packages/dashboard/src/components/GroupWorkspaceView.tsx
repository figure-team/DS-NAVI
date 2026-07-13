import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import FlowListView from "./FlowListView";
import { buildDomainCards, domainIcon } from "../utils/domainData";
import { buildGroupMembers, type ResolvedGroup } from "../utils/domainGroups";

/**
 * 상단도메인(그룹) 워크스페이스 (DOMAIN_HIERARCHY §7 D3) — 좌측 내비에 그룹
 * 소속 서브도메인 목록, 서브도메인 선택 시 본문에 **기존 도메인 워크스페이스
 * (FlowListView, 화면 B)를 그대로** 렌더한다. 새 그래프/레이아웃 없음 — 좌측
 * 내비 하나만 씌운 래핑 구조(회귀 0, 관계선·분산배치 재도입 금지 준수).
 *
 * 서브도메인 선택은 URL(`/domains/:groupKey/:domainId`)이 진실 — 이 컴포넌트는
 * store.activeDomainId가 선택과 일치할 때만 FlowListView를 그린다(DomainsPage의
 * navigateToDomain 동기화 이펙트가 아직 안 돈 한 프레임의 깜빡임 방지, 기존
 * ":domainId 딥링크" 가드와 동일 원칙).
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const members = useMemo(
    () => (domainGraph ? buildGroupMembers(group, buildDomainCards(domainGraph).cards) : []),
    [domainGraph, group],
  );

  const filteredMembers = useMemo(() => {
    const q = query.trim().normalize("NFC").toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.normalize("NFC").toLowerCase().includes(q));
  }, [members, query]);

  const groupIcon = group.isUnclassified ? "🗂️" : domainIcon(group.name, group.key);

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* 좌측 내비 — 그룹 소속 서브도메인 목록(§7 D3). */}
      <nav
        className="w-[248px] shrink-0 border-r border-border-subtle bg-panel flex flex-col overflow-hidden"
        aria-label={t.groupWorkspace.navTitle}
      >
        <div className="shrink-0" style={{ padding: "12px 14px 8px" }}>
          <button
            type="button"
            onClick={() => navigate("/domains")}
            className="text-text-muted hover:text-accent transition-colors cursor-pointer font-bold"
            style={{ fontSize: 11.5, letterSpacing: "0.06em" }}
          >
            {t.domainMap.breadcrumbRoot}
          </button>
          <div className="flex items-center gap-2 min-w-0" style={{ marginTop: 4 }}>
            <span aria-hidden className="shrink-0" style={{ fontSize: 15, lineHeight: 1 }}>
              {groupIcon}
            </span>
            <span
              className="text-text-primary font-bold truncate"
              style={{ fontSize: 15 }}
              title={group.name}
            >
              {group.name}
            </span>
          </div>
          <p className="text-text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            {t.domainMap.subDomainCount.replace("{count}", String(members.length))}
          </p>
        </div>
        <div className="shrink-0" style={{ padding: "0 14px 8px" }}>
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
          {filteredMembers.map((m) => {
            const active = m.id === selectedDomainId;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/domains/${group.key}/${m.id}`)}
                  aria-current={active ? "page" : undefined}
                  className="w-full flex items-center gap-2 rounded-md text-left transition-colors cursor-pointer"
                  style={{
                    padding: "7px 8px",
                    fontSize: 12.5,
                    marginBottom: 2,
                    background: active
                      ? "color-mix(in srgb, var(--color-accent) 9%, transparent)"
                      : "transparent",
                    color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span aria-hidden className="shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>
                    {m.icon}
                  </span>
                  <span className="truncate flex-1" title={m.name}>
                    {m.name}
                  </span>
                  <span className="shrink-0 text-text-muted tabular-nums" style={{ fontSize: 11 }}>
                    {m.flowCount}
                  </span>
                </button>
              </li>
            );
          })}
          {filteredMembers.length === 0 && (
            <li className="text-text-muted" style={{ fontSize: 12, padding: "10px 8px" }}>
              {t.flowList.noMatches}
            </li>
          )}
        </ul>
      </nav>
      {/* 본문 — 기존 도메인 워크스페이스(FlowListView) 그대로 재사용. */}
      <div className="flex-1 min-w-0 min-h-0">
        {activeDomainId === selectedDomainId ? <FlowListView /> : null}
      </div>
    </div>
  );
}
