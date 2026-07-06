import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { useViewMode } from "../../hooks/useViewMode";
import ImpactJobIndicator from "../../components/ImpactJobIndicator";
import Omnibox from "./Omnibox";

interface Props {
  accessToken: string;
  onShowKeyboardHelp: () => void;
}

/**
 * 상단 TopBar (FRONT_REDESIGN §4, 시안 mockup-shell-home 정합) —
 * 좌측 홈 아이콘 + 섹션 브레드크럼, 우측 옴니박스(⌘K) + 전역 액션.
 */
export default function TopBar({ accessToken, onShowKeyboardHelp }: Props) {
  const { t } = useI18n();
  const mode = useViewMode();

  const sectionLabel =
    mode === "structural" ? t.drawer.structural
    : mode === "domain" ? t.drawer.domain
    : mode === "wiki" ? "문서"
    : mode === "docs" ? "산출물"
    : mode === "rtm" ? "추적표"
    : mode === "screenspec" ? "화면설계서"
    : mode === "knowledge" ? "지식그래프"
    : mode === "data" ? "데이터"
    : mode === "change" ? "변경·영향"
    : mode === "programs" ? "프로그램"
    : mode === "quality" ? "품질·위험"
    : mode === "report" ? "보고서"
    : mode === "policy" ? "정책서"
    : "홈"; // "/"(홈)과 그 외 미매핑 경로(전부 홈으로 리다이렉트)

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-surface border-b border-border-subtle">
      {/* 좌측 — 시안: 홈 아이콘 + 섹션명 */}
      <Link
        to="/"
        title="홈"
        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />
        </svg>
      </Link>
      {mode === "domain" ? (
        <DomainBreadcrumb />
      ) : (
        <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
          {sectionLabel}
        </span>
      )}
      <div className="flex-1 min-w-0" />
      {/* 옴니박스 — ⌘K 전역 검색 (시안) */}
      <Omnibox accessToken={accessToken} />
      {/* 영향도 분석 진행 인디케이터 + 완료 토스트 — 전역 레이어(항상 마운트). */}
      <ImpactJobIndicator />
      <button
        onClick={onShowKeyboardHelp}
        className="text-text-muted hover:text-accent transition-colors"
        title={t.keyboardShortcuts.showHelp}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </header>
  );
}

/** ktds-fork: 도메인 3화면(지도→흐름목록→스파인) 브레드크럼 — 구 레거시 헤더에서 이관. */
function DomainBreadcrumb() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const activeFlowId = useDashboardStore((s) => s.activeFlowId);
  const clearActiveFlow = useDashboardStore((s) => s.clearActiveFlow);
  const navigate = useNavigate(); // P3: 지도 복귀는 URL로
  const { t } = useI18n();

  const activeDomainName = useMemo(() => {
    if (!domainGraph || !activeDomainId) return null;
    return domainGraph.nodes.find((n) => n.id === activeDomainId)?.name ?? null;
  }, [domainGraph, activeDomainId]);
  const activeFlowName = useMemo(() => {
    if (!domainGraph || !activeFlowId) return null;
    return domainGraph.nodes.find((n) => n.id === activeFlowId)?.name ?? null;
  }, [domainGraph, activeFlowId]);

  return (
    <nav
      className="min-w-0 overflow-x-auto scrollbar-hide flex items-center gap-1.5 text-sm font-medium"
      aria-label="breadcrumb"
    >
      <button
        type="button"
        onClick={() => navigate("/domains")}
        className={`whitespace-nowrap font-semibold transition-colors ${
          activeDomainId ? "text-text-muted hover:text-text-secondary" : "text-text-primary"
        }`}
      >
        {t.domainMap.breadcrumbRoot}
      </button>
      {activeDomainName && (
        <>
          <span className="text-text-muted/50 select-none">›</span>
          <button
            type="button"
            onClick={() => clearActiveFlow()}
            className={`whitespace-nowrap transition-colors truncate max-w-[200px] ${
              activeFlowId ? "text-text-muted hover:text-text-secondary" : "text-text-primary font-semibold"
            }`}
          >
            {activeDomainName}
          </button>
        </>
      )}
      {activeFlowName && (
        <>
          <span className="text-text-muted/50 select-none">›</span>
          <span className="whitespace-nowrap text-accent truncate max-w-[260px]">
            {activeFlowName}
          </span>
        </>
      )}
    </nav>
  );
}
