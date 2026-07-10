// 슬라이스 소유: WT-A(구조·지식그래프·위키) — 캔버스 렌더 상태(필터·컨테이너·레이아웃 캐시·이슈).
// 다른 워크트리는 읽기만. 필드 추가/변경은 A 세션에서.
import type { ReactFlowInstance } from "@xyflow/react";
import type { GraphIssue } from "@understand-anything/core/schema";
import type { StateCreator } from "zustand";
import {
  ALL_NODE_TYPES,
  ALL_COMPLEXITIES,
  ALL_EDGE_CATEGORIES,
} from "../types";
import type {
  Complexity,
  EdgeCategory,
  FilterState,
  NodeCategory,
  NodeType,
} from "../types";
import type { DashboardStore } from "../index";

const DEFAULT_FILTERS: FilterState = {
  nodeTypes: new Set<NodeType>(ALL_NODE_TYPES),
  complexities: new Set<Complexity>(ALL_COMPLEXITIES),
  layerIds: new Set<string>(),
  edgeCategories: new Set<EdgeCategory>(ALL_EDGE_CATEGORIES),
};

export interface CanvasSlice {
  // Filter & Export features
  filters: FilterState;
  filterPanelOpen: boolean;
  exportMenuOpen: boolean;
  pathFinderOpen: boolean;
  reactFlowInstance: ReactFlowInstance | null;

  // Node type category filters
  nodeTypeFilters: Record<NodeCategory, boolean>;
  toggleNodeTypeFilter: (category: NodeCategory) => void;

  toggleFilterPanel: () => void;
  toggleExportMenu: () => void;
  togglePathFinder: () => void;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;
  hasActiveFilters: () => boolean;

  // Container expand/collapse + lazy layout caches
  expandedContainers: Set<string>;
  toggleContainer: (containerId: string) => void;
  expandContainer: (containerId: string) => void;
  collapseContainer: (containerId: string) => void;
  collapseAllContainers: () => void;
  /** Container the user just manually expanded; viewport should lock onto it. Cleared by GraphView once the lock is applied. */
  pendingFocusContainer: string | null;
  setPendingFocusContainer: (containerId: string | null) => void;

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

export const createCanvasSlice: StateCreator<DashboardStore, [], [], CanvasSlice> = (set, get) => ({
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

  expandedContainers: new Set<string>(),
  pendingFocusContainer: null,
  setPendingFocusContainer: (containerId) =>
    set({ pendingFocusContainer: containerId }),
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
});
