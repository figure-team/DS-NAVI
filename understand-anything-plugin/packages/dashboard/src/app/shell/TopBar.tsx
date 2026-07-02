import { useMemo } from "react";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { useViewMode } from "../../hooks/useViewMode";
import ImpactJobIndicator from "../../components/ImpactJobIndicator";
import { ThemePicker } from "../../components/ThemePicker";

interface Props {
  onShowKeyboardHelp: () => void;
}

/**
 * 상단 TopBar (FRONT_REDESIGN §4) — 프로젝트명 + 브레드크럼 + 전역 액션.
 * 도메인 섹션에서는 지도→흐름목록→스파인 브레드크럼을 렌더한다(구 레거시 헤더에서 승격).
 * 옴니박스(Cmd+K)는 P3에서 합류.
 */
export default function TopBar({ onShowKeyboardHelp }: Props) {
  const graph = useDashboardStore((s) => s.graph);
  const { t } = useI18n();
  const mode = useViewMode();

  const sectionLabel =
    mode === "structural" ? t.drawer.structural
    : mode === "domain" ? t.drawer.domain
    : mode === "wiki" ? "문서"
    : mode === "docs" ? "산출물"
    : mode === "rtm" ? "추적표"
    : mode === "knowledge" ? "지식그래프"
    : null;

  return (
    <header className="h-[52px] shrink-0 flex items-center gap-3 px-4 bg-surface border-b border-border-subtle">
      <h1 className="font-heading text-base text-text-primary tracking-wide truncate max-w-[280px]">
        {graph?.project.name ?? t.common.appName}
      </h1>
      {mode === "domain" ? (
        <DomainBreadcrumb />
      ) : (
        sectionLabel && (
          <>
            <span className="text-text-muted/50 select-none text-sm">›</span>
            <span className="text-sm font-medium text-text-secondary whitespace-nowrap">
              {sectionLabel}
            </span>
          </>
        )
      )}
      <div className="flex-1" />
      {/* 영향도 분석 진행 인디케이터 + 완료 토스트 — 전역 레이어(항상 마운트). */}
      <ImpactJobIndicator />
      <ThemePicker />
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
  const clearActiveDomain = useDashboardStore((s) => s.clearActiveDomain);
  const clearActiveFlow = useDashboardStore((s) => s.clearActiveFlow);
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
      <span className="text-text-muted/50 select-none">›</span>
      <button
        type="button"
        onClick={() => clearActiveDomain()}
        className={`whitespace-nowrap transition-colors ${
          activeDomainId ? "text-text-muted hover:text-text-secondary" : "text-accent"
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
              activeFlowId ? "text-text-muted hover:text-text-secondary" : "text-accent"
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
