import { useI18n } from "../../contexts/I18nContext";
import { useViewMode } from "../../hooks/useViewMode";
import ImpactJobIndicator from "../../components/ImpactJobIndicator";
import Omnibox from "./Omnibox";
import { TOPBAR_SLOT_ID, TOPBAR_ACTIONS_SLOT_ID } from "./TopBarSlot";
import { iconForMode } from "./menuIcons";

interface Props {
  accessToken: string;
  onShowHelp: () => void;
}

/**
 * 상단 TopBar (FRONT_REDESIGN §4, 시안 mockup-shell-home 정합) —
 * 좌측 홈 아이콘 + 섹션 브레드크럼, 우측 옴니박스(⌘K) + 전역 액션.
 */
export default function TopBar({ accessToken, onShowHelp }: Props) {
  const { t } = useI18n();
  const mode = useViewMode();

  const sectionLabel =
    // 라우트 통일: 구조는 /domains?tab=structure 라 mode 는 "domain" 하나로 승계.
    mode === "domain" ? t.drawer.domain
    : mode === "docs" ? "산출물"
    : mode === "rtm" ? "추적표"
    : mode === "request" ? "작업 요청"
    : mode === "screenspec" ? "화면설계서"
    : mode === "data" ? "데이터"
    : mode === "change" ? "변경·영향"
    : mode === "incident" ? "장애 분석"
    : mode === "programs" ? "프로그램"
    : mode === "quality" ? "품질·위험"
    : mode === "report" ? "보고서"
    : mode === "policy" ? "정책서"
    : "홈"; // "/"(홈)과 그 외 미매핑 경로(전부 홈으로 리다이렉트)

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 bg-surface border-b border-border-subtle">
      {/* 좌측 — 현재 섹션 아이콘 + 섹션명. 구 고정 홈 아이콘을 메뉴별 아이콘으로 교체하고
          아이콘↔이름을 한 그룹(gap-1.5)으로 묶어 간격을 좁힘(2026-07-15). */}
      <div className="min-w-0 flex items-center gap-1.5">
        <span className="shrink-0 w-[18px] h-[18px] flex items-center justify-center text-text-secondary">
          {iconForMode(mode)}
        </span>
        {/* 모든 메뉴 동일 — 섹션명(메뉴 이름)만. 도메인 드릴다운(도메인·흐름)은 본문
            브레드크럼(StructureBreadcrumb)이 담당하므로 TopBar 에는 중복 표기하지 않는다. */}
        <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
          {sectionLabel}
        </span>
      </div>
      {/* 페이지별 메타/액션 슬롯 — 각 메뉴가 자기 페이지 헤더 대신 여기로 텔레포트(2026-07-15). */}
      <div id={TOPBAR_SLOT_ID} className="min-w-0 flex items-center gap-2" />
      <div className="flex-1 min-w-0" />
      {/* 페이지별 기능 버튼 슬롯 — 옴니박스 앞(오른쪽). 구 PageHead actions 이관(2026-07-15). */}
      <div id={TOPBAR_ACTIONS_SLOT_ID} className="shrink-0 flex items-center gap-2" />
      {/* 옴니박스 — ⌘K 전역 검색 (시안) */}
      <Omnibox accessToken={accessToken} />
      {/* 영향도 분석 진행 인디케이터 + 완료 토스트 — 전역 레이어(항상 마운트). */}
      <ImpactJobIndicator />
      <button
        onClick={onShowHelp}
        className="text-text-muted hover:text-accent transition-colors"
        title={t.drawer.help}
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
