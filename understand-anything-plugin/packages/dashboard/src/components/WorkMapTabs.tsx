import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../contexts/I18nContext";

/**
 * 업무 지도 메뉴 상단 탭 — 메뉴 병합(2026-07-14): 구조 메뉴를 업무 지도 안 탭으로 흡수.
 * 라우트 통일(2026-07-15): 다른 메뉴처럼 1라우트 + 쿼리 탭 — 시스템 구성도=/domains,
 * 구조=/domains?tab=structure(구 /structure 라우트는 리다이렉트만). 같은 페이지라
 * 탭 전환 시 언마운트가 없다. NavRail 은 /domains 항목이 자연히 활성.
 *
 * 하위탭 승격(2026-07-15 사용자 결정): 도메인 워크스페이스 안에 있던 하위 탭
 * [업무 흐름도 / 기능]을 없애고 「기능」을 이 상단 행으로 올렸다. 도메인 밖(지도
 * 랜딩·구조)에는 가리킬 도메인이 없어 기능 탭을 아예 내지 않는다(사용자 확정) —
 * `onDomainView` 가 곧 "도메인 진입 중" 신호다. 나머지 두 탭과 달리 map↔기능
 * 전환은 라우트가 아니라 ?view= 토글이라(도메인 컨텍스트·?flow=·?bf= 보존)
 * 전환 동작을 호출측(DomainsPage)이 주입한다.
 *
 * 시각 언어 = pmpl-proto `.tabs`(Proto.tsx ProtoTabs — 데이터·추적표·프로그램·품질
 * 메뉴 공용 하단 보더 탭)와 동일. ProtoTabs 를 직접 쓰지 않는 이유: 탭 전환이
 * setState 가 아니라 라우트 내비게이션이고, 우측 액션 슬롯(구조 탭의 오버레이
 * 토글)이 같은 행에 실려야 해서 — 스타일 수치는 ProtoTabs 를 그대로 복제한다.
 *
 * 층위(2026-07-15 사용자 정리) — 이 메뉴에 메뉴 헤더(다른 메뉴의 PageHead h1)는
 * **두지 않는다**(사용자 확정). 이 컴포넌트는 탭 행만 내고, 탭 안의 현재 위치는
 * 각 페이지가 내는 탭 헤더(StructureBreadcrumb)가 맡는다 — 둘은 다른 층위다.
 */
export default function WorkMapTabs({
  active,
  right,
  onDomainView,
}: {
  active: "map" | "structure" | "code";
  right?: ReactNode;
  /** 도메인 진입 중일 때만 전달 — 있으면 「기능」 탭이 붙는다. */
  onDomainView?: (next: "business" | "code") => void;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const tabs = [
    {
      key: "map" as const,
      label: t.domainMap.title,
      // 도메인 안에서의 map 탭 = 업무 흐름도(?view=business). 밖에서는 지도 랜딩.
      select: () => (onDomainView ? onDomainView("business") : navigate("/domains")),
    },
    {
      key: "structure" as const,
      label: t.drawer.structural,
      // 라우트 통일: 구조는 같은 /domains 의 ?tab=structure 탭(별도 /structure 라우트 은퇴).
      select: () => navigate("/domains?tab=structure"),
    },
    // {count} 는 탭에 안 쓴다(갯수는 목록 그룹 헤더 담당) — 기존 하위탭 규약 유지.
    ...(onDomainView
      ? [
          {
            key: "code" as const,
            label: t.flowList.tabCode.replace("{count}", "").trim(),
            select: () => onDomainView("code"),
          },
        ]
      : []),
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
        // roving tabindex — 3탭이 될 수 있으므로 인덱스 순환(2탭 시절의 "다른 하나"
        // 탐색은 기능 탭에서 오작동한다).
        const i = tabs.findIndex((tab) => tab.key === active);
        const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        next.select();
        document.getElementById(`workmap-tab-${next.key}`)?.focus();
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
              if (!on) tab.select();
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
