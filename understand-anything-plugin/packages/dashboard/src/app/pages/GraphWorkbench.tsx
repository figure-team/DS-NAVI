import { useEffect, useState, lazy, Suspense } from "react";
import { useDashboardStore } from "../../store";
import GraphView from "../../components/GraphView";
import KnowledgeGraphView from "../../components/KnowledgeGraphView";
import WikiReader from "../../components/WikiReader"; // ktds-fork (ADR-004): 문서 모드 리더
import SearchBar from "../../components/SearchBar";
import NodeInfo from "../../components/NodeInfo";
import LayerLegend from "../../components/LayerLegend";
import DiffToggle from "../../components/DiffToggle";
import FilterPanel from "../../components/FilterPanel";
import ExportMenu from "../../components/ExportMenu";
import PersonaSelector from "../../components/PersonaSelector";
import ProjectOverview from "../../components/ProjectOverview";
import FileExplorer from "../../components/FileExplorer";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useI18n } from "../../contexts/I18nContext";

const LearnPanel = lazy(() => import("../../components/LearnPanel"));

type SidebarTab = "info" | "files";
type MobilePane = "main" | "info" | "files";

interface Props {
  /** 이 워크벤치가 서비스하는 섹션 — 라우트가 결정한다. */
  mode: "structural" | "knowledge" | "wiki";
}

/**
 * 그래프 워크벤치 (FRONT_REDESIGN P2) — 구조/지식그래프/위키 3개 섹션이 공유하는
 * "툴바 + 그래프(또는 리더) + 우측 사이드바" 본체.
 * 모바일(반응형 통합, 구 MobileLayout 폐기): 사이드바 대신 그래프/정보/파일 콘텐츠 탭 —
 * 비활성 패널은 invisible로 유지해 ReactFlow 치수를 보존한다(구 MobileLayout 기법).
 */
export default function GraphWorkbench({ mode }: Props) {
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const tourActive = useDashboardStore((s) => s.tourActive);
  const persona = useDashboardStore((s) => s.persona);
  const openImpactModal = useDashboardStore((s) => s.openImpactModal);
  const nodeTypeFilters = useDashboardStore((s) => s.nodeTypeFilters);
  const toggleNodeTypeFilter = useDashboardStore((s) => s.toggleNodeTypeFilter);
  const detailLevel = useDashboardStore((s) => s.detailLevel);
  const setDetailLevel = useDashboardStore((s) => s.setDetailLevel);
  const showFunctionsInClassView = useDashboardStore((s) => s.showFunctionsInClassView);
  const toggleShowFunctionsInClassView = useDashboardStore((s) => s.toggleShowFunctionsInClassView);
  const isKnowledgeGraph = useDashboardStore((s) => s.isKnowledgeGraph);
  const wikiGraph = useDashboardStore((s) => s.wikiGraph); // ktds-fork (ADR-004)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("info");
  const [mobilePane, setMobilePane] = useState<MobilePane>("main");
  const isMobile = useIsMobile();
  const { t } = useI18n();

  useEffect(() => {
    if (selectedNodeId) {
      setSidebarTab("info");
      if (isMobile) setMobilePane("info"); // 작은 화면: 선택 피드백이 보이도록 자동 피벗
    }
  }, [selectedNodeId, isMobile]);

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

  // 메인 뷰(그래프/리더) — 데스크톱·모바일 공유.
  const mainView =
    mode === "knowledge" ? (
      <KnowledgeGraphView />
    ) : mode === "wiki" && wikiGraph ? (
      <WikiReader />
    ) : (
      <GraphView />
    );

  // 컨텍스트 툴바 — 구 레거시 헤더의 워크벤치 전용 액션(데스크톱·모바일 공유, 가로 스크롤).
  const toolbar = (
    <header className="flex items-center px-3 sm:px-5 py-2.5 bg-surface border-b border-border-subtle shrink-0 gap-2 sm:gap-4">
      <div className="flex items-center gap-3 sm:gap-5 shrink-0 min-w-0">
        <PersonaSelector />
      </div>

      {/* Middle — scrollable legends */}
      {/* ktds-fork (ADR-004): "문서"(wiki) 모드는 범례·레이어 전부 숨김(flex-1 스페이서만 유지) */}
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
        {mode !== "wiki" && (
        <div className="flex items-center gap-4 w-max">
          <DiffToggle />
          {/* ktds: 구조 뷰에서 자연어 → claude -p /understand-impact 영향도 분석 */}
          {!isKnowledgeGraph && (
            <button
              type="button"
              onClick={openImpactModal}
              title={t.impactAnalyze.buttonTitle}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              {t.impactAnalyze.button}
            </button>
          )}
          {/* Detail level: file view (architecture) / class view (code structure) */}
          {!isKnowledgeGraph && (
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

      {/* Right — fixed actions */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <FilterPanel />
        <ExportMenu />
        <PathFinderButton />
      </div>
    </header>
  );

  if (isMobile) {
    // 반응형 통합 — 사이드바 대신 콘텐츠 탭. 패널은 마운트 유지(invisible)로
    // ReactFlow 치수·핀치 상태를 보존한다.
    const panes: Array<{ key: MobilePane; label: string }> = [
      { key: "main", label: mode === "wiki" ? "문서" : t.drawer.structural },
      { key: "info", label: t.sidebar.info },
      { key: "files", label: t.sidebar.files },
    ];
    return (
      <div className="h-full w-full flex flex-col bg-root text-text-primary">
        {toolbar}
        <SearchBar />
        <div className="flex border-b border-border-subtle bg-surface shrink-0">
          {panes.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setMobilePane(p.key)}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                mobilePane === p.key
                  ? "text-accent border-b-2 border-accent"
                  : "text-text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 relative">
          <div
            className={`absolute inset-0 ${mobilePane === "main" ? "" : "invisible pointer-events-none"}`}
            aria-hidden={mobilePane !== "main"}
          >
            {mainView}
          </div>
          <div
            className={`absolute inset-0 overflow-auto bg-surface ${mobilePane === "info" ? "" : "invisible pointer-events-none"}`}
            aria-hidden={mobilePane !== "info"}
          >
            {infoSidebarContent}
          </div>
          <div
            className={`absolute inset-0 overflow-auto bg-surface ${mobilePane === "files" ? "" : "invisible pointer-events-none"}`}
            aria-hidden={mobilePane !== "files"}
          >
            <FileExplorer />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      {toolbar}

      {/* Search */}
      <SearchBar />

      {/* Main content: Graph + Sidebar */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Graph area */}
        <div className="flex-1 min-w-0 min-h-0 relative">
          {mainView}
          <div className="absolute top-3 right-3 text-sm text-text-muted/60 pointer-events-none select-none">
            {t.common.pressKeyboard}
          </div>
        </div>

        {/* Right sidebar — telescopes at narrower widths */}
        {/* ktds-fork (ADR-004): "문서" 모드 사이드바 = 폴더 트리(네비게이션). 정보는 메인 리더로. */}
        <aside className="w-[260px] md:w-[300px] lg:w-[360px] shrink-0 bg-surface border-l border-border-subtle overflow-auto">
          {mode === "wiki" && wikiGraph ? (
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
      </div>
    </div>
  );
}

function PathFinderButton() {
  const togglePathFinder = useDashboardStore((s) => s.togglePathFinder);
  const { t } = useI18n();
  return (
    <button
      onClick={togglePathFinder}
      className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm bg-elevated text-text-secondary hover:text-text-primary transition-colors"
      title={t.pathFinder.title}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
      <span className="hidden md:inline">{t.common.path}</span>
    </button>
  );
}
