// 슬라이스 소유: WT-A(구조) — 그래프 데이터·인덱스·선택·검색.
// 다른 워크트리는 읽기(셀렉터)만. 필드 추가/변경은 A 세션에서.
//
// STRUCTURE_FROM_MAP_DESIGN v2(2026-07-14): 파일/클래스 KG 뷰(GraphView/
// GraphWorkbench) 완전 은퇴에 맞춰 그 전용 네비게이션(navigationLevel/activeLayerId/
// drillIntoLayer/navigateToOverview/navigateToNodeInLayer 등)을 제거했다.
// `focusNodeId`/`setFocusNode` 는 session-slice.ts(공용, additive-only 규약)의
// resetTransientOnSectionChange 가, `nodeHistory` 는 domain-slice.ts(WT-B 소유, 이
// 세션에서 수정 금지)의 navigateToDomain/navigateToFlow 가 여전히 참조하므로 유지
// (더 이상 UI 진입점은 없다 — 죽은 상태지만 교차 슬라이스 파손을 막기 위한 최소 보존).
import { SearchEngine } from "@understand-anything/core/search";
import type { SearchResult } from "@understand-anything/core/search";
import type { GraphNode, KnowledgeGraph } from "@understand-anything/core/types";
import type { StateCreator } from "zustand";
import type { DashboardStore } from "../index";

/**
 * Build the (id → node) and (id → layerId) lookup maps that the rest of
 * the dashboard reads via store selectors. Centralised so `setGraph` and
 * any future graph-replacement path stay in sync.
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

  /** 죽은 상태(§ 파일 헤더) — session-slice 의 리셋 로직만 참조. */
  focusNodeId: string | null;
  setFocusNode: (nodeId: string | null) => void;
  /** 죽은 상태(§ 파일 헤더) — domain-slice 의 navigateToDomain/navigateToFlow 만 참조. */
  nodeHistory: string[];

  setGraph: (graph: KnowledgeGraph) => void;
  selectNode: (nodeId: string | null) => void;
  setSearchQuery: (query: string) => void;
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

  focusNodeId: null,
  setFocusNode: (nodeId) => set({ focusNodeId: nodeId, selectedNodeId: nodeId }),
  nodeHistory: [],

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
      selectedNodeId: keepSelection ? selectedNodeId : null,
      focusNodeId: null,
      nodeHistory: [],
      activeDomainId: keepDomainView ? activeDomainId : null,
      activeFlowId: keepDomainView ? get().activeFlowId : null,
      selectedFlowId: keepDomainView ? get().selectedFlowId : null,
      expandedBranchParents: new Set(),
    });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

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
});
