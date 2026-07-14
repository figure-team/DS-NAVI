import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../contexts/I18nContext";

/**
 * 업무 지도 메뉴 상단 탭 — 메뉴 병합(2026-07-14 사용자 결정): 구조 메뉴를 업무
 * 지도 안 탭으로 흡수. 탭 = 라우트(시스템 구성도 ↔ /domains, 구조 ↔ /structure)라
 * 기존 /structure 딥링크(?overlay= 브리지·홈 카드·품질 링크)가 전부 그대로 유효하고,
 * NavRail 은 두 경로 모두에서 업무 지도를 활성으로 표시한다.
 *
 * 시각 언어 = pmpl-proto `.tabs`(Proto.tsx ProtoTabs — 데이터·추적표·프로그램·품질
 * 메뉴 공용 하단 보더 탭)와 동일. ProtoTabs 를 직접 쓰지 않는 이유: 탭 전환이
 * setState 가 아니라 라우트 내비게이션이고, 우측 액션 슬롯(구조 탭의 오버레이
 * 토글)이 같은 행에 실려야 해서 — 스타일 수치는 ProtoTabs 를 그대로 복제한다.
 */
export default function WorkMapTabs({ active, right }: { active: "map" | "structure"; right?: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const tabs = [
    { key: "map" as const, label: t.domainMap.title, to: "/domains" },
    { key: "structure" as const, label: t.drawer.structural, to: "/structure" },
  ];

  return (
    <div
      className="shrink-0 flex items-center border-b border-border-subtle"
      style={{ margin: "10px 24px 0", gap: 2 }}
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
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            id={`workmap-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!on) navigate(tab.to);
            }}
            className={`cursor-pointer transition-colors ${on ? "text-accent" : "text-text-muted hover:text-text-primary"}`}
            style={{
              fontSize: 13.5,
              fontWeight: on ? 650 : 550,
              padding: "8px 14px",
              border: "none",
              background: "none",
              borderBottom: `2px solid ${on ? "var(--color-accent)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
      {right != null && (
        <>
          <div className="flex-1" />
          <div className="flex items-center gap-3" style={{ paddingBottom: 6 }}>
            {right}
          </div>
        </>
      )}
    </div>
  );
}
