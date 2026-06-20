import { create } from "zustand";
import { SearchEngine } from "@understand-anything/core/search";
import type { SearchResult } from "@understand-anything/core/search";
import type { GraphIssue } from "@understand-anything/core/schema";
import type {
  GraphNode,
  KnowledgeGraph,
  TourStep,
} from "@understand-anything/core/types";
import type { ReactFlowInstance } from "@xyflow/react";

export type Persona = "non-technical" | "junior" | "experienced";
export type NavigationLevel = "overview" | "layer-detail";
export type NodeType = "file" | "function" | "class" | "module" | "concept" | "config" | "document" | "service" | "table" | "endpoint" | "pipeline" | "schema" | "resource" | "domain" | "flow" | "step" | "article" | "entity" | "topic" | "claim" | "source";
export type Complexity = "simple" | "moderate" | "complex";
export type EdgeCategory = "structural" | "behavioral" | "data-flow" | "dependencies" | "semantic" | "infrastructure" | "domain" | "knowledge";
// ktds-fork (ADR-004): "wiki" = 코드그래프 위에 세분화 위키를 "문서" 토글로 오버레이.
export type ViewMode = "structural" | "domain" | "knowledge" | "wiki" | "docs";
export type DetailLevel = "file" | "class";

export interface FilterState {
  nodeTypes: Set<NodeType>;
  complexities: Set<Complexity>;
  layerIds: Set<string>;
  edgeCategories: Set<EdgeCategory>;
}

export const ALL_NODE_TYPES: NodeType[] = ["file", "function", "class", "module", "concept", "config", "document", "service", "table", "endpoint", "pipeline", "schema", "resource", "domain", "flow", "step", "article", "entity", "topic", "claim", "source"];
export const ALL_COMPLEXITIES: Complexity[] = ["simple", "moderate", "complex"];
export const ALL_EDGE_CATEGORIES: EdgeCategory[] = ["structural", "behavioral", "data-flow", "dependencies", "semantic", "infrastructure", "domain", "knowledge"];

export const EDGE_CATEGORY_MAP: Record<EdgeCategory, string[]> = {
  structural: ["imports", "exports", "contains", "inherits", "implements"],
  behavioral: ["calls", "subscribes", "publishes", "middleware"],
  "data-flow": ["reads_from", "writes_to", "transforms", "validates"],
  dependencies: ["depends_on", "tested_by", "configures"],
  semantic: ["related", "similar_to"],
  infrastructure: ["deploys", "serves", "provisions", "triggers", "migrates", "documents", "routes", "defines_schema"],
  domain: ["contains_flow", "flow_step", "cross_domain"],
  knowledge: ["cites", "contradicts", "builds_on", "exemplifies", "categorized_under", "authored_by"],
};

export const DOMAIN_EDGE_TYPES = EDGE_CATEGORY_MAP.domain;

const DEFAULT_FILTERS: FilterState = {
  nodeTypes: new Set<NodeType>(ALL_NODE_TYPES),
  complexities: new Set<Complexity>(ALL_COMPLEXITIES),
  layerIds: new Set<string>(),
  edgeCategories: new Set<EdgeCategory>(ALL_EDGE_CATEGORIES),
};

/** Categories used for node type filter toggles. Single source of truth for NodeCategory. */
export type NodeCategory = "code" | "config" | "docs" | "infra" | "data" | "domain" | "knowledge";

/**
 * Build the (id → node) and (id → layerId) lookup maps that the rest of
 * the dashboard reads via store selectors. Centralised so `setGraph` and
 * any future graph-replacement path stay in sync.
 *
 * Two layer indexes, intentionally distinct:
 *
 * - `nodeIdToLayerId` preserves the prior `findNodeLayer` "first matching
 *   layer wins" semantics — if a node id appears in multiple layers
 *   (rare but legal in the schema), the first occurrence in `graph.layers`
 *   order is the one we map to. Drives navigation (drillIntoLayer, tour
 *   step → layer, sidebar history) where a single canonical layer is the
 *   right answer.
 *
 * - `nodeIdToLayerIds` records *every* layer a node belongs to. Drives
 *   membership queries (filterNodes) where the prior `Layer[] +
 *   layer.nodeIds.includes` shape was any-layer-wins — a node in L1 and
 *   L2 with only L2 selected must still pass. Collapsing to first-wins
 *   for filtering would be a silent regression.
 */
function buildGraphIndexes(graph: KnowledgeGraph): {
  nodesById: Map<string, GraphNode>;
  nodeIdToLayerId: Map<string, string>;
  nodeIdToLayerIds: Map<string, Set<string>>;
} {
  const nodesById = new Map<string, GraphNode>();
  for (const node of graph.nodes) nodesById.set(node.id, node);
  const nodeIdToLayerId = new Map<string, string>();
  const nodeIdToLayerIds = new Map<string, Set<string>>();
  for (const layer of graph.layers) {
    for (const nid of layer.nodeIds) {
      if (!nodeIdToLayerId.has(nid)) nodeIdToLayerId.set(nid, layer.id);
      let set = nodeIdToLayerIds.get(nid);
      if (!set) {
        set = new Set<string>();
        nodeIdToLayerIds.set(nid, set);
      }
      set.add(layer.id);
    }
  }
  return { nodesById, nodeIdToLayerId, nodeIdToLayerIds };
}

/** Maximum number of entries in the sidebar navigation history. */
const MAX_HISTORY = 50;

/** 오버레이 채널 원본 (ktds) — generatedAt(ISO)으로 자동 활성 우선순위 결정. */
export interface OverlayChannelData {
  changed: string[];
  affected: string[];
  generatedAt: string;
}

/**
 * P3: 노드 사용자 오버레이 레코드(node-overrides.json 의 값). 레코드 존재 = 그 노드
 * 확정(approver). editedClaims 키 = 편집된 의미 주장 필드("summary" | "detail:<id>").
 */
export interface NodeOverride {
  editedClaims: Record<string, string>;
  approver: string;
  at: string;
  audit?: Array<{ event: string; by: string; at: string }>;
}

interface DashboardStore {
  graph: KnowledgeGraph | null;
  /** id → node lookup, rebuilt by setGraph. Empty before any graph loads. */
  nodesById: Map<string, GraphNode>;
  /** id → layer id (first-matching-layer wins), rebuilt by setGraph. Empty before any graph loads. */
  nodeIdToLayerId: Map<string, string>;
  /** id → set of every layer the node belongs to, rebuilt by setGraph. Empty before any graph loads. */
  nodeIdToLayerIds: Map<string, Set<string>>;
  selectedNodeId: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  searchEngine: SearchEngine | null;
  searchMode: "fuzzy" | "semantic";
  setSearchMode: (mode: "fuzzy" | "semantic") => void;

  // Lens navigation
  navigationLevel: NavigationLevel;
  activeLayerId: string | null;

  codeViewerOpen: boolean;
  codeViewerNodeId: string | null;
  /** 노드 없이 임의 (filePath, line)로 열 때 사용 — 인용 칩 점프(근거). nodeId와 배타적. */
  codeViewerFilePath: string | null;
  codeViewerLine: number | null;
  codeViewerExpanded: boolean;

  tourActive: boolean;
  currentTourStep: number;
  tourHighlightedNodeIds: string[];

  persona: Persona;

  // 오버레이 2채널 (ktds): diff=실측(git 변경, /understand-review·understand-diff),
  // impact=예측(/understand-impact 시드 기반 도달성). diffMode/changedNodeIds/
  // affectedNodeIds는 "활성 채널"의 뷰 상태 — 모든 뷰가 이것만 읽는다.
  diffMode: boolean;
  changedNodeIds: Set<string>;
  affectedNodeIds: Set<string>;
  overlaySource: "diff" | "impact" | null;
  diffOverlayData: OverlayChannelData | null;
  impactOverlayData: OverlayChannelData | null;

  // Focus mode: isolate a node's 1-hop neighborhood
  focusNodeId: string | null;

  // Sidebar navigation history (stack of visited node IDs)
  nodeHistory: string[];

  // Filter & Export features
  filters: FilterState;
  filterPanelOpen: boolean;
  exportMenuOpen: boolean;
  pathFinderOpen: boolean;
  reactFlowInstance: ReactFlowInstance | null;

  // Node type category filters
  nodeTypeFilters: Record<NodeCategory, boolean>;
  toggleNodeTypeFilter: (category: NodeCategory) => void;

  // Detail level: "file" shows only file nodes (architecture view),
  // "class" shows files + class nodes (code structure view) with optional function expansion.
  detailLevel: DetailLevel;
  setDetailLevel: (level: DetailLevel) => void;
  showFunctionsInClassView: boolean;
  toggleShowFunctionsInClassView: () => void;

  setGraph: (graph: KnowledgeGraph) => void;
  selectNode: (nodeId: string | null) => void;
  navigateToNode: (nodeId: string) => void;
  navigateToNodeInLayer: (nodeId: string) => void;
  navigateToHistoryIndex: (index: number) => void;
  goBackNode: () => void;
  drillIntoLayer: (layerId: string) => void;
  navigateToOverview: () => void;
  setFocusNode: (nodeId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setPersona: (persona: Persona) => void;
  openCodeViewer: (nodeId: string) => void;
  /** 인용(file:line) 칩 클릭 → 노드 없이 임의 파일의 단일 라인으로 코드뷰어 열기. */
  openCodeViewerAt: (filePath: string, line: number) => void;
  closeCodeViewer: () => void;
  expandCodeViewer: () => void;
  collapseCodeViewer: () => void;

  setDiffOverlay: (changed: string[], affected: string[]) => void;
  toggleDiffMode: () => void;
  /** 채널 원본 적재 + 자동 활성(시드 보유 && 더 최신이거나 유일할 때). */
  setOverlayData: (source: "diff" | "impact", data: OverlayChannelData) => void;
  /** 채널 토글 — 활성 채널 재토글=숨김, 비활성 채널=전환 (동시 표시 없음). */
  toggleOverlay: (source: "diff" | "impact") => void;
  clearDiffOverlay: () => void;

  toggleFilterPanel: () => void;
  toggleExportMenu: () => void;
  togglePathFinder: () => void;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  hasActiveFilters: () => boolean;

  startTour: () => void;
  stopTour: () => void;
  setTourStep: (step: number) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;

  // View mode
  viewMode: ViewMode;
  isKnowledgeGraph: boolean;
  domainGraph: KnowledgeGraph | null;
  /** ktds-fork (ADR-004): 세분화 위키 그래프(별도 wiki-graph.json). "문서" 토글 소스. */
  wikiGraph: KnowledgeGraph | null;
  activeDomainId: string | null;
  /** US-002: active flow sub-level within domain viewMode; null = flow list. */
  activeFlowId: string | null;
  /**
   * FIX 3: the flow selected inline in FlowListView (screen 2). Lifted to the
   * store so it survives the fullscreen round-trip (FlowListView unmounts when
   * `activeFlowId` promotes to the full-screen spine, then remounts on back).
   * Distinct from `activeFlowId`: this drives the inline spine without
   * committing the full-screen view. null = no inline selection.
   */
  selectedFlowId: string | null;
  setSelectedFlow: (flowId: string | null) => void;
  /**
   * 곁가지 접기 (#4): backbone step ids whose folded `unknown`-lane branches
   * (domain entities) are currently disclosed in the spine. Empty = every
   * branch folded (the decluttered backbone-only default). Keyed by backbone
   * step id, which embeds its flow, so entries never collide across flows.
   */
  expandedBranchParents: Set<string>;
  /** Toggle one backbone step's branches between folded and disclosed. */
  toggleBranchParent: (parentId: string) => void;
  /** Disclose every listed parent's branches (expand all), or `null` to fold all. */
  setBranchParentsExpanded: (parentIds: string[] | null) => void;

  /**
   * P3: 노드 사용자 오버레이(편집/확정). nodeId → 레코드. read-time 병합 소스 —
   * 노드에 레코드가 있으면 editedClaims 텍스트가 그래프 주장을 덮고 신뢰 배지가
   * `확정(approver)`. domain-graph.json(결정론)은 불변, 이 레이어는 별도(node-overrides.json).
   */
  nodeOverrides: Record<string, NodeOverride>;
  /** P3: 저장 시 approver 기본값(config.approver). null = 대시보드 1회 입력 폴백. */
  approverHandle: string | null;
  /** P3: 데이터 엔드포인트 토큰(쓰기 POST 게이트). demo 모드/미설정이면 null. */
  accessToken: string | null;
  setNodeOverrides: (overrides: Record<string, NodeOverride>) => void;
  setApproverHandle: (handle: string | null) => void;
  setAccessToken: (token: string | null) => void;
  /**
   * P3: 노드 편집 저장 — POST /node-overrides(토큰+화이트리스트), 성공 시 store 갱신
   * (즉시 확정 배지). 실패/토큰 없음은 {ok:false,error} 로 보고(조용한 실패 금지).
   */
  saveNodeOverride: (
    nodeId: string,
    editedClaims: Record<string, string>,
    approver: string,
  ) => Promise<{ ok: boolean; error?: string }>;

  setDomainGraph: (graph: KnowledgeGraph) => void;
  setWikiGraph: (graph: KnowledgeGraph) => void; // ktds-fork (ADR-004)
  /** ktds-fork: "문서" 뷰로 전환하며 해당 위키 노드를 선택(원자적). NodeInfo "관련 문서"용. */
  openWikiDoc: (nodeId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setIsKnowledgeGraph: (value: boolean) => void;
  navigateToDomain: (domainId: string) => void;
  clearActiveDomain: () => void;
  /** US-002: drill into flow spine view within the current domain. */
  navigateToFlow: (flowId: string) => void;
  /** US-002: return from flow spine to the flow list; leaves activeDomainId intact. */
  clearActiveFlow: () => void;

  // Container expand/collapse + lazy layout caches
  expandedContainers: Set<string>;
  toggleContainer: (containerId: string) => void;
  expandContainer: (containerId: string) => void;
  collapseContainer: (containerId: string) => void;
  collapseAllContainers: () => void;
  /** Container the user just manually expanded; viewport should lock onto it. Cleared by GraphView once the lock is applied. */
  pendingFocusContainer: string | null;
  setPendingFocusContainer: (containerId: string | null) => void;
  /** True while TourFitView is waiting for highlighted nodes to materialise (Stage 2 layout in progress). Drives the "Computing layout…" overlay. */
  tourFitPending: boolean;
  setTourFitPending: (pending: boolean) => void;

  containerLayoutCache: Map<
    string,
    {
      childPositions: Map<string, { x: number; y: number }>;
      actualSize: { width: number; height: number };
    }
  >;
  setContainerLayout: (
    containerId: string,
    childPositions: Map<string, { x: number; y: number }>,
    actualSize: { width: number; height: number },
  ) => void;
  clearContainerLayouts: () => void;

  containerSizeMemory: Map<string, { width: number; height: number }>;

  stage1Tick: number;
  bumpStage1Tick: () => void;

  // Layout-time issues (e.g. ELK input repair). Funneled into the
  // WarningBanner alongside graph-validation issues.
  layoutIssues: GraphIssue[];
  appendLayoutIssues: (issues: GraphIssue[]) => void;
  clearLayoutIssues: () => void;
}

function getSortedTour(graph: KnowledgeGraph): TourStep[] {
  const tour = graph.tour ?? [];
  return [...tour].sort((a, b) => a.order - b.order);
}

/** Navigate tour step to the correct layer for the first highlighted node. */
function navigateTourToLayer(
  nodeIdToLayerId: Map<string, string>,
  nodeIds: string[],
): Partial<DashboardStore> {
  if (nodeIds.length === 0) return {};
  const layerId = nodeIdToLayerId.get(nodeIds[0]);
  if (layerId) {
    return {
      navigationLevel: "layer-detail" as const,
      activeLayerId: layerId,
    };
  }
  return {};
}

/**
 * Container ids derive from per-layer state — folder names in folder-strategy
 * layers, community indices (`container:cluster-N`) in community-strategy
 * layers — and collide across layers (e.g. API Contracts and Load Testing
 * both produce `container:cluster-0`). When a tour step crosses layers we
 * must drop the previous layer's container caches so Stage 2 actually re-
 * runs for the new layer's children. Mirrors the reset block in
 * `drillIntoLayer`.
 */
function layerResetIfChanged(
  layerNav: Partial<DashboardStore>,
  prevLayerId: string | null,
): Partial<DashboardStore> {
  const next = layerNav.activeLayerId;
  if (!next || next === prevLayerId) return {};
  return {
    containerLayoutCache: new Map(),
    containerSizeMemory: new Map(),
    expandedContainers: new Set(),
    // Drop any pending focus too — its id was scoped to the previous
    // layer and would otherwise re-collide with a same-id container in
    // the new layer for the duration of the 1.2s timer.
    pendingFocusContainer: null,
  };
}

export const useDashboardStore = create<DashboardStore>()((set, get) => ({
  graph: null,
  nodesById: new Map<string, GraphNode>(),
  nodeIdToLayerId: new Map<string, string>(),
  nodeIdToLayerIds: new Map<string, Set<string>>(),
  selectedNodeId: null,
  searchQuery: "",
  searchResults: [],
  searchEngine: null,
  searchMode: "fuzzy",

  navigationLevel: "overview",
  activeLayerId: null,
  codeViewerOpen: false,
  codeViewerNodeId: null,
  codeViewerFilePath: null,
  codeViewerLine: null,
  codeViewerExpanded: false,

  tourActive: false,
  currentTourStep: 0,
  tourHighlightedNodeIds: [],

  persona: "junior",

  diffMode: false,
  changedNodeIds: new Set<string>(),
  affectedNodeIds: new Set<string>(),
  overlaySource: null,
  diffOverlayData: null,
  impactOverlayData: null,

  focusNodeId: null,
  nodeHistory: [],

  filters: { ...DEFAULT_FILTERS, nodeTypes: new Set(DEFAULT_FILTERS.nodeTypes), complexities: new Set(DEFAULT_FILTERS.complexities), layerIds: new Set(DEFAULT_FILTERS.layerIds), edgeCategories: new Set(DEFAULT_FILTERS.edgeCategories) },
  filterPanelOpen: false,
  exportMenuOpen: false,
  pathFinderOpen: false,
  reactFlowInstance: null,

  nodeTypeFilters: { code: true, config: true, docs: true, infra: true, data: true, domain: true, knowledge: true },

  toggleNodeTypeFilter: (category) =>
    set((state) => ({
      nodeTypeFilters: {
        ...state.nodeTypeFilters,
        [category]: !state.nodeTypeFilters[category],
      },
      // Filter changes shift container.nodeIds; cached child positions
      // may reference filtered-out children. Drop the cache so Stage 2
      // recomputes against the current set.
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    })),

  detailLevel: "file",
  setDetailLevel: (level) =>
    set({
      detailLevel: level,
      // Detail level changes which nodes are visible; cached positions stale.
      // Reset fn toggle so it doesn't resurrect when re-entering class view.
      showFunctionsInClassView: false,
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    }),

  showFunctionsInClassView: false,
  toggleShowFunctionsInClassView: () =>
    set((state) => ({
      showFunctionsInClassView: !state.showFunctionsInClassView,
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    })),

  setGraph: (graph) => {
    const searchEngine = new SearchEngine(graph.nodes);
    const query = get().searchQuery;
    const searchResults = query.trim() ? searchEngine.search(query) : [];
    const { viewMode, domainGraph, activeDomainId } = get();
    // Preserve domain view if a domain graph is already loaded
    const keepDomainView = viewMode === "domain" && domainGraph !== null;
    const { nodesById, nodeIdToLayerId, nodeIdToLayerIds } = buildGraphIndexes(graph);
    set({
      graph,
      nodesById,
      nodeIdToLayerId,
      nodeIdToLayerIds,
      searchEngine,
      searchResults,
      navigationLevel: "overview",
      activeLayerId: null,
      selectedNodeId: null,
      focusNodeId: null,
      nodeHistory: [],
      viewMode: keepDomainView ? "domain" as const : "structural" as const,
      activeDomainId: keepDomainView ? activeDomainId : null,
      activeFlowId: null,
      selectedFlowId: null,
      expandedBranchParents: new Set(),
      containerLayoutCache: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
      containerSizeMemory: new Map(),
      stage1Tick: 0,
      layoutIssues: [],
    });
  },

  selectNode: (nodeId) => {
    const { selectedNodeId, nodeHistory } = get();
    if (nodeId && selectedNodeId && nodeId !== selectedNodeId) {
      // Push current node to history before navigating away
      set({
        selectedNodeId: nodeId,
        nodeHistory: [...nodeHistory, selectedNodeId].slice(-MAX_HISTORY),
      });
    } else {
      set({ selectedNodeId: nodeId });
    }
  },

  navigateToNode: (nodeId) => {
    get().navigateToNodeInLayer(nodeId);
  },

  navigateToNodeInLayer: (nodeId) => {
    const { graph, selectedNodeId, nodeHistory, nodeIdToLayerId } = get();
    if (!graph) return;
    const layerId = nodeIdToLayerId.get(nodeId) ?? null;
    const newHistory =
      selectedNodeId && nodeId !== selectedNodeId
        ? [...nodeHistory, selectedNodeId].slice(-MAX_HISTORY)
        : nodeHistory;
    if (layerId) {
      set({
        navigationLevel: "layer-detail",
        activeLayerId: layerId,
        selectedNodeId: nodeId,
        focusNodeId: null,
        codeViewerOpen: false,
        codeViewerNodeId: null,
        codeViewerExpanded: false,
        nodeHistory: newHistory,
      });
    } else {
      set({
        selectedNodeId: nodeId,
        nodeHistory: newHistory,
      });
    }
  },

  navigateToHistoryIndex: (index) => {
    const { nodeHistory, graph, nodeIdToLayerId } = get();
    if (!graph || index < 0 || index >= nodeHistory.length) return;
    const targetId = nodeHistory[index];
    const newHistory = nodeHistory.slice(0, index);
    const layerId = nodeIdToLayerId.get(targetId) ?? null;
    set({
      selectedNodeId: targetId,
      nodeHistory: newHistory,
      ...(layerId ? { navigationLevel: "layer-detail" as const, activeLayerId: layerId } : {}),
    });
  },

  goBackNode: () => {
    const { nodeHistory, graph, nodeIdToLayerId } = get();
    if (nodeHistory.length === 0 || !graph) return;
    const prevNodeId = nodeHistory[nodeHistory.length - 1];
    const newHistory = nodeHistory.slice(0, -1);
    const layerId = nodeIdToLayerId.get(prevNodeId) ?? null;
    if (layerId) {
      set({
        navigationLevel: "layer-detail",
        activeLayerId: layerId,
        selectedNodeId: prevNodeId,
        nodeHistory: newHistory,
      });
    } else {
      set({
        selectedNodeId: prevNodeId,
        nodeHistory: newHistory,
      });
    }
  },

  drillIntoLayer: (layerId) =>
    set({
      navigationLevel: "layer-detail",
      activeLayerId: layerId,
      selectedNodeId: null,
      focusNodeId: null,
      codeViewerOpen: false,
      codeViewerNodeId: null,
      codeViewerExpanded: false,
      // Container ids derive from folder names and collide across layers
      // (e.g. `container:auth` exists in many layers). Drop the cache so
      // we don't render stale positions for the new layer's children.
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    }),

  navigateToOverview: () =>
    set({
      navigationLevel: "overview",
      activeLayerId: null,
      selectedNodeId: null,
      focusNodeId: null,
      codeViewerOpen: false,
      codeViewerNodeId: null,
      codeViewerExpanded: false,
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    }),

  setFocusNode: (nodeId) =>
    set({
      focusNodeId: nodeId,
      selectedNodeId: nodeId,
      // Focus mode narrows filteredGraphNodes to focus + 1-hop; the
      // surviving containers have a subset of their original children,
      // and the cache must not return positions for filtered-out ids.
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    }),
  setSearchMode: (mode) => set({ searchMode: mode }),
  setSearchQuery: (query) => {
    const engine = get().searchEngine;
    const mode = get().searchMode;
    if (!engine || !query.trim()) {
      set({ searchQuery: query, searchResults: [] });
      return;
    }
    // Currently both modes use the same fuzzy engine
    // When embeddings are available, "semantic" mode will use SemanticSearchEngine
    void mode;
    const searchResults = engine.search(query);
    set({ searchQuery: query, searchResults });
  },

  setPersona: (persona) =>
    set({
      persona,
      // Persona changes filter node types, which shifts container.nodeIds.
      containerLayoutCache: new Map(),
      containerSizeMemory: new Map(),
      expandedContainers: new Set(),
      pendingFocusContainer: null,
    }),

  openCodeViewer: (nodeId) =>
    set({
      codeViewerOpen: true,
      codeViewerNodeId: nodeId,
      codeViewerFilePath: null,
      codeViewerLine: null,
      codeViewerExpanded: false,
    }),
  openCodeViewerAt: (filePath, line) =>
    set({
      codeViewerOpen: true,
      codeViewerNodeId: null,
      codeViewerFilePath: filePath,
      codeViewerLine: line,
      codeViewerExpanded: false,
    }),
  closeCodeViewer: () =>
    set({
      codeViewerOpen: false,
      codeViewerNodeId: null,
      codeViewerFilePath: null,
      codeViewerLine: null,
      codeViewerExpanded: false,
    }),
  expandCodeViewer: () => set({ codeViewerExpanded: true }),
  collapseCodeViewer: () => set({ codeViewerExpanded: false }),

  // 하위호환 별칭 — diff 채널 적재 (generatedAt 미상 = 빈 문자열: 항상 최저 우선)
  setDiffOverlay: (changed, affected) =>
    get().setOverlayData("diff", { changed, affected, generatedAt: "" }),

  toggleDiffMode: () => get().toggleOverlay("diff"),

  setOverlayData: (source, data) =>
    set((state) => {
      const next: Partial<DashboardStore> =
        source === "diff" ? { diffOverlayData: data } : { impactOverlayData: data };
      // 자동 활성: 시드가 있고, (활성 가능한 다른 채널이 없거나 || 이 채널이 더
      // 최신)일 때. 빈 채널(changed=0 — KG 미조인 발행)은 경쟁자가 아니다(리뷰
      // minor: 빈 채널의 최신 generatedAt이 유효 채널의 자동 활성을 막는 순서
      // 의존 제거). 두 채널이 비동기로 도착해도 최종 활성 = 최신 유효 분석.
      const other = source === "diff" ? state.impactOverlayData : state.diffOverlayData;
      const newer =
        other === null || other.changed.length === 0 || data.generatedAt >= other.generatedAt;
      if (data.changed.length > 0 && newer) {
        next.overlaySource = source;
        next.diffMode = true;
        next.changedNodeIds = new Set(data.changed);
        next.affectedNodeIds = new Set(data.affected);
      }
      return next;
    }),

  toggleOverlay: (source) =>
    set((state) => {
      const data = source === "diff" ? state.diffOverlayData : state.impactOverlayData;
      if (!data || data.changed.length === 0) return {};
      if (state.overlaySource === source && state.diffMode) {
        return { diffMode: false }; // 같은 채널 재토글 = 숨김 (채널 기억)
      }
      return {
        overlaySource: source,
        diffMode: true,
        changedNodeIds: new Set(data.changed),
        affectedNodeIds: new Set(data.affected),
      };
    }),

  clearDiffOverlay: () =>
    set({
      diffMode: false,
      changedNodeIds: new Set<string>(),
      affectedNodeIds: new Set<string>(),
    }),

  toggleFilterPanel: () => set((state) => ({
    filterPanelOpen: !state.filterPanelOpen,
    exportMenuOpen: false,
  })),

  toggleExportMenu: () => set((state) => ({
    exportMenuOpen: !state.exportMenuOpen,
    filterPanelOpen: false,
  })),

  togglePathFinder: () => set((state) => ({
    pathFinderOpen: !state.pathFinderOpen,
  })),

  setReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),

  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters },
  })),

  resetFilters: () => set({
    filters: {
      nodeTypes: new Set<NodeType>(ALL_NODE_TYPES),
      complexities: new Set<Complexity>(ALL_COMPLEXITIES),
      layerIds: new Set<string>(),
      edgeCategories: new Set<EdgeCategory>(ALL_EDGE_CATEGORIES),
    },
  }),

  hasActiveFilters: () => {
    const { filters } = get();
    return filters.nodeTypes.size !== ALL_NODE_TYPES.length
      || filters.complexities.size !== ALL_COMPLEXITIES.length
      || filters.layerIds.size > 0
      || filters.edgeCategories.size !== ALL_EDGE_CATEGORIES.length;
  },

  startTour: () => {
    const { graph, nodeIdToLayerId, activeLayerId } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    const sorted = getSortedTour(graph);
    const layerNav = navigateTourToLayer(nodeIdToLayerId, sorted[0].nodeIds);
    set({
      tourActive: true,
      currentTourStep: 0,
      tourHighlightedNodeIds: sorted[0].nodeIds,
      selectedNodeId: null,
      ...layerNav,
      ...layerResetIfChanged(layerNav, activeLayerId),
    });
  },

  stopTour: () =>
    set({
      tourActive: false,
      currentTourStep: 0,
      tourHighlightedNodeIds: [],
    }),

  setTourStep: (step) => {
    const { graph, nodeIdToLayerId, activeLayerId } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    const sorted = getSortedTour(graph);
    if (step < 0 || step >= sorted.length) return;
    const layerNav = navigateTourToLayer(nodeIdToLayerId, sorted[step].nodeIds);
    set({
      currentTourStep: step,
      tourHighlightedNodeIds: sorted[step].nodeIds,
      ...layerNav,
      ...layerResetIfChanged(layerNav, activeLayerId),
    });
  },

  nextTourStep: () => {
    const { graph, currentTourStep, nodeIdToLayerId, activeLayerId } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    const sorted = getSortedTour(graph);
    if (currentTourStep < sorted.length - 1) {
      const next = currentTourStep + 1;
      const layerNav = navigateTourToLayer(nodeIdToLayerId, sorted[next].nodeIds);
      set({
        currentTourStep: next,
        tourHighlightedNodeIds: sorted[next].nodeIds,
        ...layerNav,
        ...layerResetIfChanged(layerNav, activeLayerId),
      });
    }
  },

  prevTourStep: () => {
    const { graph, currentTourStep, nodeIdToLayerId, activeLayerId } = get();
    if (!graph || !graph.tour || graph.tour.length === 0) return;
    if (currentTourStep > 0) {
      const sorted = getSortedTour(graph);
      const prev = currentTourStep - 1;
      const layerNav = navigateTourToLayer(nodeIdToLayerId, sorted[prev].nodeIds);
      set({
        currentTourStep: prev,
        tourHighlightedNodeIds: sorted[prev].nodeIds,
        ...layerNav,
        ...layerResetIfChanged(layerNav, activeLayerId),
      });
    }
  },

  viewMode: "structural",
  isKnowledgeGraph: false,
  domainGraph: null,
  wikiGraph: null, // ktds-fork (ADR-004)
  activeDomainId: null,
  activeFlowId: null,
  selectedFlowId: null,

  nodeOverrides: {},
  approverHandle: null,
  accessToken: null,
  setNodeOverrides: (overrides) => set({ nodeOverrides: overrides }),
  setApproverHandle: (handle) => set({ approverHandle: handle }),
  setAccessToken: (token) => set({ accessToken: token }),
  saveNodeOverride: async (nodeId, editedClaims, approver) => {
    const { accessToken } = get();
    if (!accessToken) {
      // 읽기전용/demo(라이브 서버 없음) — 저장 불가를 정직히 보고.
      return { ok: false, error: "no-write-server" };
    }
    try {
      const res = await fetch(`/node-overrides?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, editedClaims, approver }),
      });
      const data = (await res.json().catch(() => null)) as
        | (NodeOverride & { error?: string })
        | null;
      if (!res.ok || !data) {
        return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
      }
      // 즉시 확정: store 의 오버레이 맵 갱신(컴포넌트가 배지/텍스트 재렌더).
      set((state) => ({ nodeOverrides: { ...state.nodeOverrides, [nodeId]: data } }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  setSelectedFlow: (flowId) => set({ selectedFlowId: flowId }),

  expandedBranchParents: new Set<string>(),
  toggleBranchParent: (parentId) =>
    set((state) => {
      const next = new Set(state.expandedBranchParents);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return { expandedBranchParents: next };
    }),
  setBranchParentsExpanded: (parentIds) =>
    set({ expandedBranchParents: new Set(parentIds ?? []) }),

  setDomainGraph: (graph) => {
    // Land on the domain map as the opening view when a domain graph is
    // available and the user is still on the initial structural view
    // (spec di-codeatlas-001 success scene ①: "열자마자 도메인 지도 랜딩").
    // Fires once on load; a deliberate later switch to "코드"/"문서" is preserved.
    const { viewMode } = get();
    set({
      domainGraph: graph,
      viewMode: viewMode === "structural" ? "domain" : viewMode,
    });
  },

  setWikiGraph: (graph) => { // ktds-fork (ADR-004)
    set({ wikiGraph: graph });
  },

  // ktds-fork: setViewMode는 selectedNodeId를 비우므로(뷰 전환+선택을 한 번에 못 함)
  // navigateToDomain 패턴을 따라 원자적으로 wiki 뷰 전환 + 문서 선택.
  openWikiDoc: (nodeId) =>
    set({
      viewMode: "wiki" as const,
      selectedNodeId: nodeId,
      focusNodeId: null,
      codeViewerOpen: false,
      codeViewerNodeId: null,
      codeViewerExpanded: false,
    }),

  setIsKnowledgeGraph: (value) => {
    set({ isKnowledgeGraph: value });
  },

  setViewMode: (mode) => {
    set({
      viewMode: mode,
      selectedNodeId: null,
      focusNodeId: null,
      activeFlowId: null,
      selectedFlowId: null,
      expandedBranchParents: new Set(),
      codeViewerOpen: false,
      codeViewerNodeId: null,
      codeViewerExpanded: false,
    });
  },

  navigateToDomain: (domainId) => {
    const { selectedNodeId, nodeHistory } = get();
    const newHistory = selectedNodeId
      ? [...nodeHistory, selectedNodeId].slice(-MAX_HISTORY)
      : nodeHistory;
    set({
      viewMode: "domain" as const,
      activeDomainId: domainId,
      activeFlowId: null,
      selectedFlowId: null,
      focusNodeId: null,
      nodeHistory: newHistory,
    });
  },

  clearActiveDomain: () => {
    set({
      activeDomainId: null,
      activeFlowId: null,
      selectedFlowId: null,
      selectedNodeId: null,
      focusNodeId: null,
    });
  },

  // US-002: flow spine navigation — mirrors navigateToDomain / clearActiveDomain
  navigateToFlow: (flowId) => {
    const { selectedNodeId, nodeHistory } = get();
    const newHistory = selectedNodeId
      ? [...nodeHistory, selectedNodeId].slice(-MAX_HISTORY)
      : nodeHistory;
    set({
      activeFlowId: flowId,
      // FIX 3: keep inline + fullscreen selection in agreement so the back
      // round-trip re-shows the same flow's inline spine.
      selectedFlowId: flowId,
      selectedNodeId: null,
      focusNodeId: null,
      nodeHistory: newHistory,
    });
  },

  clearActiveFlow: () => {
    // FIX 3: clear the full-screen flow but PRESERVE selectedFlowId so that
    // returning to the flow list re-shows the inline spine for the last flow.
    set({
      activeFlowId: null,
      selectedNodeId: null,
      focusNodeId: null,
    });
  },

  expandedContainers: new Set<string>(),
  pendingFocusContainer: null,
  setPendingFocusContainer: (containerId) =>
    set({ pendingFocusContainer: containerId }),
  tourFitPending: false,
  setTourFitPending: (pending) => set({ tourFitPending: pending }),
  toggleContainer: (containerId) =>
    set((state) => {
      const next = new Set(state.expandedContainers);
      const willExpand = !next.has(containerId);
      if (willExpand) next.add(containerId);
      else next.delete(containerId);
      return {
        expandedContainers: next,
        pendingFocusContainer: willExpand
          ? containerId
          : state.pendingFocusContainer,
      };
    }),
  expandContainer: (containerId) =>
    set((state) => {
      if (state.expandedContainers.has(containerId)) return {};
      const next = new Set(state.expandedContainers);
      next.add(containerId);
      return { expandedContainers: next };
    }),
  collapseContainer: (containerId) =>
    set((state) => {
      if (!state.expandedContainers.has(containerId)) return {};
      const next = new Set(state.expandedContainers);
      next.delete(containerId);
      return { expandedContainers: next };
    }),
  collapseAllContainers: () => set({ expandedContainers: new Set() }),

  containerLayoutCache: new Map(),
  setContainerLayout: (containerId, childPositions, actualSize) =>
    set((state) => {
      const next = new Map(state.containerLayoutCache);
      next.set(containerId, { childPositions, actualSize });
      const sizeNext = new Map(state.containerSizeMemory);
      sizeNext.set(containerId, actualSize);
      return { containerLayoutCache: next, containerSizeMemory: sizeNext };
    }),
  clearContainerLayouts: () =>
    set({ containerLayoutCache: new Map(), expandedContainers: new Set(), pendingFocusContainer: null }),

  containerSizeMemory: new Map(),

  stage1Tick: 0,
  bumpStage1Tick: () => set((s) => ({ stage1Tick: s.stage1Tick + 1 })),

  layoutIssues: [],
  appendLayoutIssues: (issues) =>
    set((state) => {
      if (issues.length === 0) return {};
      // Dedupe by level+message so a re-running effect doesn't repeatedly
      // pile up identical issues.
      const seen = new Set(
        state.layoutIssues.map((i) => `${i.level}|${i.message}`),
      );
      const fresh = issues.filter((i) => !seen.has(`${i.level}|${i.message}`));
      if (fresh.length === 0) return {};
      return { layoutIssues: [...state.layoutIssues, ...fresh] };
    }),
  clearLayoutIssues: () => set({ layoutIssues: [] }),
}));

