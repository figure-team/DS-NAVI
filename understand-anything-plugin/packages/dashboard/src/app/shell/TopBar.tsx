import { useLocation } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { modeForPath } from "../viewModePaths";
import ImpactJobIndicator from "../../components/ImpactJobIndicator";
import { ThemePicker } from "../../components/ThemePicker";

/**
 * 상단 TopBar (FRONT_REDESIGN §4) — P1 뼈대: 프로젝트명 + 섹션 브레드크럼 + 전역 액션.
 * 옴니박스(Cmd+K)와 컨텍스트 액션 슬롯은 P2~P3에서 합류.
 */
export default function TopBar() {
  const graph = useDashboardStore((s) => s.graph);
  const { t } = useI18n();
  const location = useLocation();

  const mode = modeForPath(location.pathname);
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
      {sectionLabel && (
        <>
          <span className="text-text-muted/50 select-none text-sm">›</span>
          <span className="text-sm font-medium text-text-secondary whitespace-nowrap">
            {sectionLabel}
          </span>
        </>
      )}
      <div className="flex-1" />
      {/* 영향도 분석 진행 인디케이터 + 완료 토스트 — 전역 레이어(항상 마운트). */}
      <ImpactJobIndicator />
      <ThemePicker />
    </header>
  );
}
