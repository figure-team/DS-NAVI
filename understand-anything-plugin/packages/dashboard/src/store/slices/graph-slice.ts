// 슬라이스 소유: WT-A(구조·지식그래프·위키) — 그래프 데이터·인덱스·선택·탐색·검색·페르소나.
// 다른 워크트리는 읽기(셀렉터)만. 필드 추가/변경은 A 세션에서.
import { SearchEngine } from "@understand-anything/core/search";
import type { SearchResult } from "@understand-anything/core/search";
import type { GraphNode, KnowledgeGraph } from "@understand-anything/core/types";
import type { StateCreator } from "zustand";
import type { Persona, NavigationLevel } from "../types";
import type { DashboardStore } from "../index";

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

export interface GraphSlice {
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

  persona: Persona;

  // Focus mode: isolate a node's 1-hop neighborhood
  focusNodeId: string | null;

  // Sidebar navigation history (stack of visited node IDs)
  nodeHistory: string[];

  isKnowledgeGraph: boolean;

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
  setIsKnowledgeGraph: (value: boolean) => void;
}

export const createGraphSlice: StateCreator<DashboardStore, [], [], GraphSlice> = (set, get) => ({
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

  // 기본 "experienced" — 구 PersonaSelector(개요/학습/심층) 제거 후 "junior"(학습)는
  // 설정 경로가 없고, "non-technical"(개요)만 상세도 토글이 매핑한다 (2026-07-10).
  persona: "experienced",

  focusNodeId: null,
  nodeHistory: [],

  isKnowledgeGraph: false,

  setGraph: (graph) => {
    const searchEngine = new SearchEngine(graph.nodes);
    const query = get().searchQuery;
    const searchResults = query.trim() ? searchEngine.search(query) : [];
    const { domainGraph, activeDomainId, selectedNodeId } = get();
    // ktds-fork (FRONT_REDESIGN P2): 네비게이션(어느 섹션인가)은 URL이 결정 — 여기서는
    // 도메인 그래프가 이미 있으면 도메인 탐색 위치(activeDomainId)만 보존한다.
    const keepDomainView = domainGraph !== null;
    const { nodesById, nodeIdToLayerId, nodeIdToLayerIds } = buildGraphIndexes(graph);
    // ktds-fork (FRONT_REDESIGN P3): 새 그래프에도 존재하는 선택은 보존 — ?node= 딥링크가
    // StrictMode 이중 fetch(setGraph 2회)에 지워지는 버그 + 재분석 리로드 시 선택 유지.
    const keepSelection = selectedNodeId !== null && nodesById.has(selectedNodeId);
    set({
      graph,
      nodesById,
      nodeIdToLayerId,
      nodeIdToLayerIds,
      searchEngine,
      searchResults,
      navigationLevel: "overview",
      activeLayerId: null,
      selectedNodeId: keepSelection ? selectedNodeId : null,
      focusNodeId: null,
      nodeHistory: [],
      activeDomainId: keepDomainView ? activeDomainId : null,
      activeFlowId: keepDomainView ? get().activeFlowId : null,
      selectedFlowId: keepDomainView ? get().selectedFlowId : null,
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

  setIsKnowledgeGraph: (value) => {
    set({ isKnowledgeGraph: value });
  },
});
