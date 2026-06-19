import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { validateGraph } from "@understand-anything/core/schema";
import type { GraphIssue } from "@understand-anything/core/schema";
import { useDashboardStore } from "./store";
import GraphView from "./components/GraphView";
import DomainMapView from "./components/DomainMapView"; // ktds-fork: 도메인 지도 랜딩 (화면 1)
import FlowListView from "./components/FlowListView"; // ktds-fork: 기능 목록 + 인라인 스파인 (화면 2)
// ktds-fork: 화면3(전체화면 스파인) 제거 — 스파인은 화면2 인라인으로만, 목록 접기로 공간 확보.
import KnowledgeGraphView from "./components/KnowledgeGraphView";
import WikiReader from "./components/WikiReader"; // ktds-fork (ADR-004): 문서 모드 리더
import SearchBar from "./components/SearchBar";
import NodeInfo from "./components/NodeInfo";
import LayerLegend from "./components/LayerLegend";
import DiffToggle from "./components/DiffToggle";
import FilterPanel from "./components/FilterPanel";
import ExportMenu from "./components/ExportMenu";
import PersonaSelector from "./components/PersonaSelector";
import ProjectOverview from "./components/ProjectOverview";
import FileExplorer from "./components/FileExplorer";
import WarningBanner from "./components/WarningBanner";
import TokenGate from "./components/TokenGate";
import MobileLayout from "./components/MobileLayout";
import { useIsMobile } from "./hooks/useIsMobile";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import type { KeyboardShortcut } from "./hooks/useKeyboardShortcuts";
import { ThemeProvider } from "./themes/index.ts";
import { ThemePicker } from "./components/ThemePicker.tsx";
import type { ThemeConfig } from "./themes/index.ts";
import { I18nProvider, useI18n } from "./contexts/I18nContext.tsx";

// Lazy-load heavy / optional components so they ship in separate chunks.
const CodeViewer = lazy(() => import("./components/CodeViewer"));
const LearnPanel = lazy(() => import("./components/LearnPanel"));
const PathFinderModal = lazy(() => import("./components/PathFinderModal"));
const KeyboardShortcutsHelp = lazy(
  () => import("./components/KeyboardShortcutsHelp"),
);
const OnboardingOverlay = lazy(() => import("./components/OnboardingOverlay"));

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const SESSION_TOKEN_KEY = "understand-anything-token";
const ONBOARDING_DISMISSED_KEY = "ua-onboarding-dismissed-v1";
type SidebarTab = "info" | "files";

function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("onboard") === "force") return true;
  return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== "1";
}

/** Resolve data file URL — in demo mode, use env var URLs; otherwise use local paths with token. */
function dataUrl(fileName: string, token: string | null): string {
  if (DEMO_MODE) {
    const envMap: Record<string, string | undefined> = {
      "knowledge-graph.json": import.meta.env.VITE_GRAPH_URL,
      "domain-graph.json": import.meta.env.VITE_DOMAIN_GRAPH_URL,
      "meta.json": import.meta.env.VITE_META_URL,
      "diff-overlay.json": import.meta.env.VITE_DIFF_OVERLAY_URL,
      "impact-overlay.json": import.meta.env.VITE_IMPACT_OVERLAY_URL,
      "config.json": import.meta.env.VITE_CONFIG_URL,
    };
    const url = envMap[fileName];
    if (url) return url;
    const base = import.meta.env.BASE_URL || "/";
    return `${base.endsWith("/") ? base : `${base}/`}${fileName}`;
  }
  const path = `/${fileName}`;
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

/**
 * Resolve the access token from the URL query string or sessionStorage.
 * If found in the URL, persist to sessionStorage and strip the param from the address bar.
 */
function resolveInitialToken(): string | null {
  if (DEMO_MODE) return "__demo__";
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, urlToken);
    // Clean the URL
    params.delete("token");
    const cleanSearch = params.toString();
    const newUrl =
      window.location.pathname + (cleanSearch ? `?${cleanSearch}` : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);
    return urlToken;
  }
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(resolveInitialToken);

  const handleTokenValid = useCallback((token: string) => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    setAccessToken(token);
  }, []);

  // In demo mode, skip token gate entirely
  if (DEMO_MODE) {
    return <Dashboard accessToken="__demo__" />;
  }

  // Show the token gate when no token is available
  if (accessToken === null) {
    return <TokenGate onTokenValid={handleTokenValid} />;
  }

  return <Dashboard accessToken={accessToken} />;
}

function Dashboard({ accessToken }: { accessToken: string }) {
  const setGraph = useDashboardStore((s) => s.setGraph);
  const setDomainGraph = useDashboardStore((s) => s.setDomainGraph);
  const setWikiGraph = useDashboardStore((s) => s.setWikiGraph); // ktds-fork (ADR-004)
  const setOverlayData = useDashboardStore((s) => s.setOverlayData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [graphIssues, setGraphIssues] = useState<GraphIssue[]>([]);
  const [metaTheme, setMetaTheme] = useState<ThemeConfig | null>(null);
  const [outputLanguage, setOutputLanguage] = useState<string | undefined>();

  useEffect(() => {
    fetch(dataUrl("meta.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (meta?.theme) setMetaTheme(meta.theme);
      })
      .catch(() => {});
    fetch(dataUrl("config.json", accessToken))
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        if (config?.outputLanguage) setOutputLanguage(config.outputLanguage);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(dataUrl("knowledge-graph.json", accessToken))
      .then((res) => res.json())
      .then((data: unknown) => {
        const result = validateGraph(data);
        if (result.success && result.data) {
          setGraph(result.data);
          setGraphIssues(result.issues);
          if ((data as Record<string, unknown>).kind === "knowledge") {
            useDashboardStore.getState().setViewMode("knowledge");
            useDashboardStore.getState().setIsKnowledgeGraph(true);
          }
          for (const issue of result.issues) {
            if (issue.level === "auto-corrected") {
              console.warn(`[graph] auto-corrected: ${issue.message}`);
            } else if (issue.level === "dropped") {
              console.error(`[graph] dropped: ${issue.message}`);
            }
          }
        } else if (result.fatal) {
          console.error("Knowledge graph validation failed:", result.fatal);
          setLoadError(`Invalid knowledge graph: ${result.fatal}`);
        } else {
          console.error("Knowledge graph validation failed: unknown error");
          setLoadError("Invalid knowledge graph: unknown validation error");
        }
      })
      .catch((err) => {
        console.error("Failed to load knowledge graph:", err);
        setLoadError(`Failed to load knowledge graph: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, [setGraph]);

  // ktds: 오버레이 2채널 로드 — diff(실측: review/understand-diff)와
  // impact(예측: understand-impact). 자동 활성은 store가 generatedAt 최신으로 결정.
  useEffect(() => {
    const loadOverlay = (fileName: string, source: "diff" | "impact") =>
      fetch(dataUrl(fileName, accessToken))
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data: unknown) => {
          if (
            data &&
            typeof data === "object" &&
            "changedNodeIds" in data &&
            "affectedNodeIds" in data &&
            Array.isArray((data as Record<string, unknown>).changedNodeIds) &&
            Array.isArray((data as Record<string, unknown>).affectedNodeIds)
          ) {
            const d = data as {
              changedNodeIds: string[];
              affectedNodeIds: string[];
              generatedAt?: unknown;
            };
            setOverlayData(source, {
              changed: d.changedNodeIds,
              affected: d.affectedNodeIds,
              generatedAt: typeof d.generatedAt === "string" ? d.generatedAt : "",
            });
          }
        })
        .catch(() => {});
    loadOverlay("diff-overlay.json", "diff");
    loadOverlay("impact-overlay.json", "impact");
  }, [setOverlayData]);

  useEffect(() => {
    fetch(dataUrl("domain-graph.json", accessToken))
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data: unknown) => {
        if (!data) return;
        const result = validateGraph(data);
        if (result.success && result.data) {
          setDomainGraph(result.data);
        } else if (result.fatal) {
          console.warn(`[domain-graph] validation failed: ${result.fatal}`);
        }
      })
      .catch(() => {});
  }, [setDomainGraph]);

  // ktds-fork (ADR-004): 세분화 위키 그래프 로드 → "문서" 토글 소스. 없으면 토글 미표시.
  useEffect(() => {
    fetch(dataUrl("wiki-graph.json", accessToken))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!data) return;
        const result = validateGraph(data);
        if (result.success && result.data) {
          setWikiGraph(result.data);
        } else if (result.fatal) {
          console.warn(`[wiki-graph] validation failed: ${result.fatal}`);
        }
      })
      .catch(() => {});
  }, [setWikiGraph]);

  return (
    <I18nProvider language={outputLanguage ?? "ko"}>
      <ThemeProvider metaTheme={metaTheme}>
        <DashboardContent
          accessToken={accessToken}
          loadError={loadError}
          graphIssues={graphIssues}
        />
      </ThemeProvider>
    </I18nProvider>
  );
}

function DashboardContent({
  accessToken,
  loadError,
  graphIssues,
}: {
  accessToken: string;
  loadError: string | null;
  graphIssues: GraphIssue[];
}) {
  const graph = useDashboardStore((s) => s.graph);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const tourActive = useDashboardStore((s) => s.tourActive);
  const persona = useDashboardStore((s) => s.persona);
  const codeViewerOpen = useDashboardStore((s) => s.codeViewerOpen);
  const codeViewerExpanded = useDashboardStore((s) => s.codeViewerExpanded);
  const expandCodeViewer = useDashboardStore((s) => s.expandCodeViewer);
  const collapseCodeViewer = useDashboardStore((s) => s.collapseCodeViewer);
  const pathFinderOpen = useDashboardStore((s) => s.pathFinderOpen);
  const togglePathFinder = useDashboardStore((s) => s.togglePathFinder);
  const nodeTypeFilters = useDashboardStore((s) => s.nodeTypeFilters);
  const toggleNodeTypeFilter = useDashboardStore((s) => s.toggleNodeTypeFilter);
  const detailLevel = useDashboardStore((s) => s.detailLevel);
  const setDetailLevel = useDashboardStore((s) => s.setDetailLevel);
  const showFunctionsInClassView = useDashboardStore((s) => s.showFunctionsInClassView);
  const toggleShowFunctionsInClassView = useDashboardStore((s) => s.toggleShowFunctionsInClassView);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("info");
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const dismissOnboarding = useCallback((remember: boolean) => {
    if (remember && typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    }
    setShowOnboarding(false);
  }, []);
  const viewMode = useDashboardStore((s) => s.viewMode);
  const setViewMode = useDashboardStore((s) => s.setViewMode);
  const isKnowledgeGraph = useDashboardStore((s) => s.isKnowledgeGraph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId); // ktds-fork: 흐름 목록(화면 2) 활성 여부
  const activeFlowId = useDashboardStore((s) => s.activeFlowId); // ktds-fork: 흐름 스파인 활성 여부
  const clearActiveDomain = useDashboardStore((s) => s.clearActiveDomain); // ktds-fork: 도메인 풀페이지 브레드크럼 네비게이션
  const clearActiveFlow = useDashboardStore((s) => s.clearActiveFlow); // ktds-fork: 도메인 풀페이지 브레드크럼 네비게이션
  const wikiGraph = useDashboardStore((s) => s.wikiGraph); // ktds-fork (ADR-004)
  const layoutIssues = useDashboardStore((s) => s.layoutIssues);
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const allIssues = useMemo(
    () => [...graphIssues, ...layoutIssues],
    [graphIssues, layoutIssues],
  );

  // ktds-fork: 도메인 탭 = 완전 독립 풀페이지. U-A 크롬(사이드바/검색/코드뷰어/범례/토글)을
  // 전부 숨기고 도메인 3화면(지도→흐름목록→흐름스파인)만 헤더 아래 전면 노출한다.
  const isDomainPage = viewMode === "domain" && Boolean(domainGraph);

  // 브레드크럼 세그먼트 이름 — 도메인/흐름 노드는 domainGraph에서 id로 조회.
  const activeDomainName = useMemo(() => {
    if (!domainGraph || !activeDomainId) return null;
    return domainGraph.nodes.find((n) => n.id === activeDomainId)?.name ?? null;
  }, [domainGraph, activeDomainId]);
  const activeFlowName = useMemo(() => {
    if (!domainGraph || !activeFlowId) return null;
    return domainGraph.nodes.find((n) => n.id === activeFlowId)?.name ?? null;
  }, [domainGraph, activeFlowId]);

  useEffect(() => {
    if (selectedNodeId) setSidebarTab("info");
  }, [selectedNodeId]);

  // Define keyboard shortcuts
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
          const state = useDashboardStore.getState();
          if (state.viewMode === "wiki") return; // ktds-fork (ADR-004): 문서 모드는 오버레이 비해당
          state.toggleOverlay("diff");
        },
        category: "View",
      },
      {
        key: "i",
        description: t.keyboardShortcuts.toggleImpact,
        action: () => {
          const state = useDashboardStore.getState();
          if (state.viewMode === "wiki") return; // ktds-fork (ADR-004): 문서 모드는 오버레이 비해당
          state.toggleOverlay("impact");
        },
        category: "View",
      },
      {
        key: "f",
        description: t.keyboardShortcuts.toggleFilter,
        action: () => {
          const state = useDashboardStore.getState();
          state.toggleFilterPanel();
        },
        category: "View",
      },
      {
        key: "e",
        description: t.keyboardShortcuts.toggleExport,
        action: () => {
          const state = useDashboardStore.getState();
          state.toggleExportMenu();
        },
        category: "View",
      },
      {
        key: "p",
        description: t.keyboardShortcuts.openPathFinder,
        action: () => {
          const state = useDashboardStore.getState();
          state.togglePathFinder();
        },
        category: "View",
      },
    ],
    [t]
  );

  // Register keyboard shortcuts
  useKeyboardShortcuts(shortcuts);

  // Determine sidebar content
  // NodeInfo always takes priority when a node is selected.
  // Learn mode adds LearnPanel below it; otherwise ProjectOverview shows when idle.
  const isLearnMode = tourActive || persona === "junior";
  const infoSidebarContent = (
    <>
      {selectedNodeId && <NodeInfo />}
      {isLearnMode && (
        <Suspense fallback={null}>
          <LearnPanel />
        </Suspense>
      )}
      {!selectedNodeId && !isLearnMode && <ProjectOverview />}
    </>
  );

  const sidebarContent = (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 p-2 border-b border-border-subtle bg-surface shrink-0">
        {(["info", "files"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSidebarTab(tab)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
              sidebarTab === tab
                ? "bg-accent/15 text-accent"
                : "text-text-muted hover:text-text-primary hover:bg-elevated"
            }`}
          >
            {tab === "info" ? t.sidebar.info : t.sidebar.files}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {sidebarTab === "files" ? <FileExplorer /> : infoSidebarContent}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileLayout
        accessToken={accessToken}
        showKeyboardHelp={showKeyboardHelp}
        setShowKeyboardHelp={setShowKeyboardHelp}
        loadError={loadError}
        allIssues={allIssues}
        shortcuts={shortcuts}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-root text-text-primary noise-overlay">
      {/* Header */}
      <header className="flex items-center px-3 sm:px-5 py-3 bg-surface border-b border-border-subtle shrink-0 gap-2 sm:gap-4">
        {/* Left — fixed */}
        <div className="flex items-center gap-3 sm:gap-5 shrink-0 min-w-0">
          <h1 className="font-heading text-base sm:text-lg text-text-primary tracking-wide truncate max-w-[160px] sm:max-w-[220px] lg:max-w-none">
            {graph?.project.name ?? t.common.appName}
          </h1>
          {/* ktds-fork: [구조/도메인/문서] 탭을 프로젝트명 바로 뒤(PersonaSelector 앞)에 고정 —
              모든 메인 페이지에서 탭 위치를 동일하게(도메인 화면 기준). wikiGraph 또는 domainGraph가
              있을 때 토글 그룹 표시(둘 중 하나만 있어도 코드↔해당 전환). */}
          {graph && !isKnowledgeGraph && (domainGraph || wikiGraph) && (
            <>
              <div className="w-px h-5 bg-border-subtle" />
              <div className="flex items-center bg-elevated rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("structural")}
                  title={t.drawer.structural}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "structural"
                      ? "bg-accent/20 text-accent"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {t.drawer.structural}
                </button>
                {domainGraph && (
                  <button
                    type="button"
                    onClick={() => setViewMode("domain")}
                    title={t.drawer.domain}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      viewMode === "domain"
                        ? "bg-accent/20 text-accent"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t.drawer.domain}
                  </button>
                )}
                {wikiGraph && (
                  <button
                    type="button"
                    onClick={() => setViewMode("wiki")}
                    title="세분화 위키 문서"
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      viewMode === "wiki"
                        ? "bg-accent/20 text-accent"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    문서
                  </button>
                )}
              </div>
            </>
          )}
          {/* ktds-fork: PersonaSelector는 구조 전용 — 도메인 풀페이지에서는 숨김. 탭 뒤에 배치. */}
          {!isDomainPage && (
            <>
              <div className="w-px h-5 bg-border-subtle hidden sm:block" />
              <PersonaSelector />
            </>
          )}
        </div>

        {/* Middle — scrollable legends */}
        {/* ktds-fork (ADR-004): "문서"(wiki) 모드는 헤더 범례·레이어 전부 숨김(flex-1 스페이서만 유지) */}
        {/* ktds-fork: 도메인 풀페이지에서는 구조 전용 범례 대신 브레드크럼을 노출한다. */}
        {isDomainPage ? (
          <nav
            className="flex-1 min-w-0 overflow-x-auto scrollbar-hide flex items-center gap-1.5 text-sm font-medium"
            aria-label="breadcrumb"
          >
            <button
              type="button"
              onClick={() => clearActiveDomain()}
              className={`whitespace-nowrap transition-colors ${
                activeDomainId
                  ? "text-text-muted hover:text-text-secondary"
                  : "text-accent"
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
                    activeFlowId
                      ? "text-text-muted hover:text-text-secondary"
                      : "text-accent"
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
        ) : (
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          {/* ktds-fork (ADR-004): 문서 모드는 이 블록 전체를 숨김(아래 개별 가드 불필요) */}
          {viewMode !== "wiki" && (
          <div className="flex items-center gap-4 w-max">
            <DiffToggle />
            {/* Detail level: file view (architecture) / class view (code structure) */}
            {!isKnowledgeGraph && viewMode !== "domain" && (
              <>
                <div className="w-px h-5 bg-border-subtle" />
                <div className="flex items-center bg-elevated rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setDetailLevel("file")}
                    title={t.detailLevel.filesTitle}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      detailLevel === "file"
                        ? "bg-accent/20 text-accent"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t.detailLevel.files}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailLevel("class")}
                    title={t.detailLevel.classesTitle}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      detailLevel === "class"
                        ? "bg-accent/20 text-accent"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t.detailLevel.classes}
                  </button>
                </div>
                {detailLevel === "class" && (
                  <button
                    type="button"
                    onClick={toggleShowFunctionsInClassView}
                    title={t.detailLevel.fnTitle}
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
                      showFunctionsInClassView
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                        : "border-border-medium bg-elevated text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t.detailLevel.fn}
                  </button>
                )}
              </>
            )}
            <div className="flex items-center gap-1">
              {(isKnowledgeGraph ? [
                { key: "knowledge" as const, label: t.nodeTypeLabels.all, color: "var(--color-node-article)" },
              ] : [
                { key: "code" as const, label: t.nodeTypeLabels.code, color: "var(--color-node-file)" },
                { key: "config" as const, label: t.nodeTypeLabels.config, color: "var(--color-node-config)" },
                { key: "docs" as const, label: t.nodeTypeLabels.docs, color: "var(--color-node-document)" },
                { key: "infra" as const, label: t.nodeTypeLabels.infra, color: "var(--color-node-service)" },
                { key: "data" as const, label: t.nodeTypeLabels.data, color: "var(--color-node-table)" },
                { key: "domain" as const, label: t.nodeTypeLabels.domain, color: "var(--color-node-concept)" },
                { key: "knowledge" as const, label: t.nodeTypeLabels.knowledge, color: "var(--color-node-article)" },
              ]).map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => toggleNodeTypeFilter(cat.key)}
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    nodeTypeFilters[cat.key] !== false
                      ? "border-border-medium bg-elevated text-text-secondary hover:text-text-primary"
                      : "border-transparent bg-transparent text-text-muted/40 line-through hover:text-text-muted"
                  }`}
                  title={`${nodeTypeFilters[cat.key] !== false ? "Hide" : "Show"} ${cat.label} nodes`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: cat.color,
                      opacity: nodeTypeFilters[cat.key] !== false ? 1 : 0.3,
                    }}
                  />
                  {cat.label}
                </button>
              ))}
            </div>
            <LayerLegend />
          </div>
          )}
        </div>
        )}

        {/* Right — fixed actions */}
        {/* ktds-fork: 도메인 풀페이지에서는 구조 전용 액션(FilterPanel/ExportMenu/PathFinder)을
            숨기고 ThemePicker + 키보드 도움말만 유지한다. */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {!isDomainPage && (
            <>
              <FilterPanel />
              <ExportMenu />
              <button
                onClick={togglePathFinder}
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors"
                title={t.pathFinder.title}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
                <span className="hidden md:inline">{t.common.path}</span>
              </button>
            </>
          )}
          <ThemePicker />
          <button
            onClick={() => setShowKeyboardHelp(true)}
            className="text-text-muted hover:text-accent transition-colors"
            title={t.keyboardShortcuts.showHelp}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Search */}
      {/* ktds-fork: 도메인 풀페이지에서는 SearchBar 숨김. */}
      {!isDomainPage && <SearchBar />}

      {/* Validation warning banner */}
      {allIssues.length > 0 && !loadError && (
        <WarningBanner issues={allIssues} />
      )}

      {/* Error banner */}
      {loadError && (
        <div className="px-5 py-3 bg-red-900/30 border-b border-red-700 text-red-200 text-sm">
          {loadError}
        </div>
      )}

      {/* ktds-fork: 도메인 풀페이지 — 사이드바·코드뷰어 없이 3화면을 전면 노출. */}
      {isDomainPage ? (
        <div className="flex-1 min-h-0 relative">
          {activeDomainId ? (
            <FlowListView />
          ) : (
            <DomainMapView />
          )}
          {/* ktds-fork: 도메인 화면에서도 인용 칩(근거) 점프가 코드뷰어를 열 수 있게 슬라이드업 마운트. */}
          {codeViewerOpen && !codeViewerExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-[40vh] bg-surface border-t border-border-subtle animate-slide-up z-20 overflow-hidden">
              <Suspense fallback={null}>
                <CodeViewer accessToken={accessToken} onExpand={expandCodeViewer} />
              </Suspense>
            </div>
          )}
        </div>
      ) : (
      /* Main content: Graph + Sidebar */
      <div className="flex-1 flex min-h-0 relative">
        {/* Graph area */}
        <div className="flex-1 min-w-0 min-h-0 relative">
          {viewMode === "knowledge" ? (
            <KnowledgeGraphView />
          ) : /* ktds-fork (ADR-004): "문서" 모드 = 그래프 대신 문서 리더(메타+전체 본문) */
          viewMode === "wiki" && wikiGraph ? (
            <WikiReader />
          ) : (
            /* 도메인 풀페이지는 위 isDomainPage 분기에서 처리 — 여기서는 구조 그래프만. */
            <GraphView />
          )}
          <div className="absolute top-3 right-3 text-sm text-text-muted/60 pointer-events-none select-none">
            {t.common.pressKeyboard}
          </div>
        </div>

        {/* Right sidebar — telescopes at narrower widths */}
        {/* ktds-fork (ADR-004): "문서" 모드 사이드바 = 폴더 트리(네비게이션). 정보는 메인 리더로. */}
        <aside className="w-[260px] md:w-[300px] lg:w-[360px] shrink-0 bg-surface border-l border-border-subtle overflow-auto">
          {viewMode === "wiki" && wikiGraph ? (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex items-center px-3 py-2 border-b border-border-subtle bg-surface shrink-0 text-xs font-semibold uppercase tracking-wider text-text-muted">
                문서 폴더
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <FileExplorer />
              </div>
            </div>
          ) : (
            sidebarContent
          )}
        </aside>

        {/* Code viewer slide-up overlay (collapsed state) */}
        {codeViewerOpen && !codeViewerExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-[40vh] bg-surface border-t border-border-subtle animate-slide-up z-20 overflow-hidden">
            <Suspense fallback={null}>
              <CodeViewer accessToken={accessToken} onExpand={expandCodeViewer} />
            </Suspense>
          </div>
        )}
      </div>
      )}

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

      {/* First-visit onboarding overlay — only mounted when needed so its chunk is lazy-loaded on demand. */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingOverlay onDismiss={dismissOnboarding} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
