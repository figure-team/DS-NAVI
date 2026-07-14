import { useNavigate } from "react-router";
import { useI18n } from "../contexts/I18nContext";

/**
 * 업무 지도 메뉴 상단 탭 — 메뉴 병합(2026-07-14 사용자 결정): 구조 메뉴를 업무
 * 지도 안 탭으로 흡수. 탭 = 라우트(시스템 구성도 ↔ /domains, 구조 ↔ /structure)라
 * 기존 /structure 딥링크(?overlay= 브리지·홈 카드·품질 링크)가 전부 그대로 유효하고,
 * NavRail 은 두 경로 모두에서 업무 지도를 활성으로 표시한다. 시각 언어는
 * FlowListView 의 업무 흐름도/기능 탭(accent 밑줄)과 동일.
 */
export default function WorkMapTabs({ active }: { active: "map" | "structure" }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const tabs = [
    { key: "map" as const, label: t.domainMap.title, to: "/domains" },
    { key: "structure" as const, label: t.drawer.structural, to: "/structure" },
  ];

  return (
    <div
      className="flex items-center gap-1"
      role="tablist"
      aria-label={t.drawer.domain}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next = tabs.find((tab) => tab.key !== active)!;
        navigate(next.to);
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            id={`workmap-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              if (!isActive) navigate(tab.to);
            }}
            className="cursor-pointer transition-colors border-b-2"
            style={{
              fontSize: 13.5,
              padding: "7px 10px 9px",
              color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
              borderBottomColor: isActive ? "var(--color-accent)" : "transparent",
              fontWeight: isActive ? 650 : 550,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
