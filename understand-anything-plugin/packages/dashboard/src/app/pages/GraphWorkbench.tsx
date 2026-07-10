import { useEffect, useState } from "react";
import { useDashboardStore } from "../../store";
import GraphView from "../../components/GraphView";
import SearchBar from "../../components/SearchBar";
import NodeInfo from "../../components/NodeInfo";
import LayerLegend from "../../components/LayerLegend";
import DiffToggle from "../../components/DiffToggle";
import FilterPanel from "../../components/FilterPanel";
import ExportMenu from "../../components/ExportMenu";
import ProjectOverview from "../../components/ProjectOverview";
import FileExplorer from "../../components/FileExplorer";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useI18n } from "../../contexts/I18nContext";

type SidebarTab = "info" | "files";
type MobilePane = "main" | "info" | "files";

/**
 * 그래프 워크벤치 (FRONT_REDESIGN P2) — 구조 섹션의
 * "툴바 + 그래프 + 우측 사이드바" 본체 (위키·지식그래프 섹션은 2026-07-11 은퇴).
 * 모바일(반응형 통합, 구 MobileLayout 폐기): 사이드바 대신 그래프/정보/파일 콘텐츠 탭 —
 * 비활성 패널은 invisible로 유지해 ReactFlow 치수를 보존한다(구 MobileLayout 기법).
 */
export default function GraphWorkbench() {
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const nodeTypeFilters = useDashboardStore((s) => s.nodeTypeFilters);
  const toggleNodeTypeFilter = useDashboardStore((s) => s.toggleNodeTypeFilter);
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
  // NodeInfo always takes priority when a node is selected; ProjectOverview shows when idle.
  // (학습 페르소나/LearnPanel 은 구조 탭에서 제거 — 코드 읽기 투어는 PM/PL 대상이 아니고
  //  lite 분석은 투어를 생성하지 않음. 투어의 후속 형태는 홈·업무지도 쪽 제안으로 이관, 2026-07-10)
  const infoSidebarContent = (
    <>
      {selectedNodeId && <NodeInfo />}
      {!selectedNodeId && <ProjectOverview />}
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

  // 메인 뷰(그래프) — 데스크톱·모바일 공유.
  const mainView = <GraphView />;

  // 컨텍스트 툴바 — 구 레거시 헤더의 워크벤치 전용 액션(데스크톱·모바일 공유, 가로 스크롤).
  const toolbar = (
    <header className="flex items-center px-3 sm:px-5 py-2.5 bg-surface border-b border-border-subtle shrink-0 gap-2 sm:gap-4">
      {/* Middle — scrollable legends */}
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-4 w-max">
          <DiffToggle />
          {/* 영향도 분석 실행 진입점은 변경·영향 메뉴(ChangeImpactView)로 일원화 —
              구조 탭은 결과 소비(?overlay=impact)만 담당한다(2026-07-10 결정). */}
          {/* 상세도 토글(개요/파일/+클래스)은 제거됨 — 구조 탭은 항상 파일 수준 뷰(2026-07-10 확정,
              detailLevel 상태 자체도 2026-07-11 제거). "개요"는 노드 폭발 개편 때 레이어 요약 뷰로 재도입 예정. */}
          <div className="flex items-center gap-1">
            {([
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
      { key: "main", label: t.drawer.structural },
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
        <aside className="w-[260px] md:w-[300px] lg:w-[360px] shrink-0 bg-surface border-l border-border-subtle overflow-auto">
          {sidebarContent}
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
