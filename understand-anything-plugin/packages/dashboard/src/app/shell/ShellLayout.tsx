import { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense } from "react";
import { Outlet } from "react-router";
import { useDashboardStore } from "../../store";
import NavRail from "./NavRail";
import TopBar from "./TopBar";
import MobileTabBar from "./MobileTabBar";
import WarningBanner from "../../components/WarningBanner";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useViewMode } from "../../hooks/useViewMode";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import type { KeyboardShortcut } from "../../hooks/useKeyboardShortcuts";
import { useI18n } from "../../contexts/I18nContext";
import { currentMode } from "../viewModePaths";
import type { ShellContext } from "../Root";

const CodeViewer = lazy(() => import("../../components/CodeViewer"));
const PathFinderModal = lazy(() => import("../../components/PathFinderModal"));
const ImpactAnalysisModal = lazy(() => import("../../components/ImpactAnalysisModal"));
const KeyboardShortcutsHelp = lazy(
  () => import("../../components/KeyboardShortcutsHelp"),
);
const OnboardingOverlay = lazy(() => import("../../components/OnboardingOverlay"));

const ONBOARDING_DISMISSED_KEY = "ua-onboarding-dismissed-v1";

function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("onboard") === "force") return true;
  if (params.get("onboard") === "skip") return false; // 헤드리스 QA — localStorage 사전 주입 불가 환경
  return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== "1";
}

/**
 * 셸 골격 (FRONT_REDESIGN §4, P2) — NavRail + TopBar + Outlet에 더해
 * 전역 레이어(코드뷰어, 단축키+도움말, 온보딩, 경로찾기/영향도 모달, 검증 배너)를
 * 1회 마운트한다. 모바일은 NavRail 대신 하단 섹션 탭바(MobileTabBar) — 반응형 통합.
 */
export default function ShellLayout(ctx: ShellContext) {
  const { accessToken, loadError, graphIssues } = ctx;
  const codeViewerOpen = useDashboardStore((s) => s.codeViewerOpen);
  const codeViewerExpanded = useDashboardStore((s) => s.codeViewerExpanded);
  const expandCodeViewer = useDashboardStore((s) => s.expandCodeViewer);
  const collapseCodeViewer = useDashboardStore((s) => s.collapseCodeViewer);
  const pathFinderOpen = useDashboardStore((s) => s.pathFinderOpen);
  const togglePathFinder = useDashboardStore((s) => s.togglePathFinder);
  const impactModalOpen = useDashboardStore((s) => s.impactModalOpen);
  const layoutIssues = useDashboardStore((s) => s.layoutIssues);
  const resetTransientOnSectionChange = useDashboardStore(
    (s) => s.resetTransientOnSectionChange,
  );
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const isMobile = useIsMobile();
  const mode = useViewMode();
  const { t } = useI18n();

  // 브라우저 탭 타이틀 — 프로젝트가 로드되면 "프로젝트명 · DS-NAVI".
  const projectName = useDashboardStore((s) => s.graph?.project.name);
  useEffect(() => {
    document.title = projectName ? `${projectName} · DS-NAVI` : "DS-NAVI";
  }, [projectName]);

  const dismissOnboarding = useCallback((remember: boolean) => {
    if (remember && typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    }
    setShowOnboarding(false);
  }, []);

  const allIssues = useMemo(
    () => [...graphIssues, ...layoutIssues],
    [graphIssues, layoutIssues],
  );

  // 구 setViewMode의 정리 동작 계승 — 섹션이 바뀌면 선택/흐름/코드뷰어를 닫는다.
  // 마운트(딥링크 최초 진입)에는 발화하지 않고, "선택을 들고 점프"(openWikiDoc,
  // 도메인 점프)가 preserveTransientOnce를 켠 경우 1회 건너뛴다.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current !== mode) {
      prevMode.current = mode;
      const state = useDashboardStore.getState();
      if (state.preserveTransientOnce) {
        state.consumePreserveTransientOnce();
      } else {
        resetTransientOnSectionChange();
      }
    }
  }, [mode, resetTransientOnSectionChange]);

  // Define keyboard shortcuts (구 LegacyDashboard에서 셸로 승격 — 전역 1회 등록)
  const shortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      // Help
      {
        key: "?",
        shiftKey: true,
        description: t.keyboardShortcuts.showHelp,
        action: () => setShowKeyboardHelp((prev) => !prev),
        category: "General",
      },
      // Navigation
      {
        key: "Escape",
        description: t.keyboardShortcuts.escapeDesc,
        action: () => {
          // Read from store at invocation time to avoid stale closures
          const state = useDashboardStore.getState();
          if (state.pathFinderOpen) {
            state.togglePathFinder();
          } else if (state.filterPanelOpen) {
            state.toggleFilterPanel();
          } else if (state.exportMenuOpen) {
            state.toggleExportMenu();
          } else if (state.codeViewerExpanded) {
            state.collapseCodeViewer();
          } else if (state.codeViewerOpen) {
            state.closeCodeViewer();
          } else if (state.selectedNodeId) {
            state.selectNode(null);
          } else if (state.activeFlowId) {
            // ktds-fork: 선택 없는 흐름 스파인에서 Escape → 흐름 목록(도메인)으로 복귀
            state.clearActiveFlow();
          } else if (state.navigationLevel === "layer-detail") {
            state.navigateToOverview();
          } else if (state.tourActive) {
            state.stopTour();
          } else {
            setShowKeyboardHelp(false);
          }
        },
        category: "Navigation",
      },
      {
        key: "/",
        description: t.keyboardShortcuts.focusSearch,
        action: () => {
          const searchInput = document.querySelector<HTMLInputElement>(
            '[data-testid="search-input"]'
          );
          searchInput?.focus();
        },
        category: "Navigation",
      },
      // Tour controls
      {
        key: "ArrowRight",
        description: t.keyboardShortcuts.nextStep,
        action: () => {
          const state = useDashboardStore.getState();
          if (state.tourActive) {
            state.nextTourStep();
          }
        },
        category: "Tour",
      },
      {
        key: "ArrowLeft",
        description: t.keyboardShortcuts.prevStep,
        action: () => {
          const state = useDashboardStore.getState();
          if (state.tourActive) {
            state.prevTourStep();
          }
        },
        category: "Tour",
      },
      // View toggles
      {
        key: "d",
        description: t.keyboardShortcuts.toggleDiff,
        action: () => {
          if (currentMode() === "wiki") return; // ktds-fork (ADR-004): 문서 모드는 오버레이 비해당
          useDashboardStore.getState().toggleOverlay("diff");
        },
        category: "View",
      },
      {
        key: "i",
        description: t.keyboardShortcuts.toggleImpact,
        action: () => {
          if (currentMode() === "wiki") return; // ktds-fork (ADR-004): 문서 모드는 오버레이 비해당
          useDashboardStore.getState().toggleOverlay("impact");
        },
        category: "View",
      },
      {
        key: "r",
        description: "위험 오버레이 토글",
        action: () => {
          if (currentMode() === "wiki") return; // 문서 모드는 오버레이 비해당
          useDashboardStore.getState().toggleOverlay("risk");
        },
        category: "View",
      },
      {
        key: "f",
        description: t.keyboardShortcuts.toggleFilter,
        action: () => {
          useDashboardStore.getState().toggleFilterPanel();
        },
        category: "View",
      },
      {
        key: "e",
        description: t.keyboardShortcuts.toggleExport,
        action: () => {
          useDashboardStore.getState().toggleExportMenu();
        },
        category: "View",
      },
      {
        key: "p",
        description: t.keyboardShortcuts.openPathFinder,
        action: () => {
          useDashboardStore.getState().togglePathFinder();
        },
        category: "View",
      },
    ],
    [t]
  );

  // Register keyboard shortcuts
  useKeyboardShortcuts(shortcuts);

  return (
    <div className="h-screen w-screen flex bg-root text-text-primary noise-overlay">
      {!isMobile && <NavRail onShowKeyboardHelp={() => setShowKeyboardHelp(true)} />}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar accessToken={accessToken} onShowKeyboardHelp={() => setShowKeyboardHelp(true)} />

        {/* Validation warning banner */}
        {allIssues.length > 0 && !loadError && <WarningBanner issues={allIssues} />}

        {/* Error banner */}
        {loadError && (
          <div className="px-5 py-3 bg-red-900/30 border-b border-red-700 text-red-200 text-sm">
            {loadError}
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <Outlet context={ctx satisfies ShellContext} />

          {/* Code viewer slide-up overlay (collapsed state) — 전역 1회 마운트 */}
          {codeViewerOpen && !codeViewerExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-[40vh] bg-surface border-t border-border-subtle animate-slide-up z-20 overflow-hidden">
              <Suspense fallback={null}>
                <CodeViewer accessToken={accessToken} onExpand={expandCodeViewer} />
              </Suspense>
            </div>
          )}
        </div>

        {/* 모바일 — NavRail 대신 하단 섹션 탭바(반응형 통합, 구 MobileLayout 폐기) */}
        {isMobile && <MobileTabBar />}
      </div>

      {/* Expanded code viewer modal */}
      {codeViewerOpen && codeViewerExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 sm:p-6"
          onMouseDown={collapseCodeViewer}
        >
          <div
            className="w-[calc(100vw-32px)] max-w-[1120px] h-[calc(100vh-32px)] sm:h-[calc(100vh-48px)] max-h-[820px] rounded-lg border border-border-medium bg-surface shadow-2xl overflow-hidden"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Suspense fallback={null}>
              <CodeViewer
                accessToken={accessToken}
                presentation="modal"
                onClose={collapseCodeViewer}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts help modal */}
      {showKeyboardHelp && (
        <Suspense fallback={null}>
          <KeyboardShortcutsHelp
            shortcuts={shortcuts}
            onClose={() => setShowKeyboardHelp(false)}
          />
        </Suspense>
      )}

      {/* Path Finder Modal — only mounted when open so its chunk is lazy-loaded on demand. */}
      {pathFinderOpen && (
        <Suspense fallback={null}>
          <PathFinderModal isOpen={pathFinderOpen} onClose={togglePathFinder} />
        </Suspense>
      )}

      {/* ktds: 영향도 분석 자연어 입력 모달 — 열렸을 때만 마운트(lazy 청크). */}
      {impactModalOpen && (
        <Suspense fallback={null}>
          <ImpactAnalysisModal />
        </Suspense>
      )}

      {/* First-visit onboarding overlay */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingOverlay onDismiss={dismissOnboarding} />
        </Suspense>
      )}
    </div>
  );
}
