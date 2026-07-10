// 슬라이스 소유: WT-A(구조·지식그래프·위키) — 가이드 투어 상태.
import type { KnowledgeGraph, TourStep } from "@understand-anything/core/types";
import type { StateCreator } from "zustand";
import type { DashboardStore } from "../index";

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

export interface TourSlice {
  tourActive: boolean;
  currentTourStep: number;
  tourHighlightedNodeIds: string[];

  startTour: () => void;
  stopTour: () => void;
  setTourStep: (step: number) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;

  /** True while TourFitView is waiting for highlighted nodes to materialise (Stage 2 layout in progress). Drives the "Computing layout…" overlay. */
  tourFitPending: boolean;
  setTourFitPending: (pending: boolean) => void;
}

export const createTourSlice: StateCreator<DashboardStore, [], [], TourSlice> = (set, get) => ({
  tourActive: false,
  currentTourStep: 0,
  tourHighlightedNodeIds: [],

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

  tourFitPending: false,
  setTourFitPending: (pending) => set({ tourFitPending: pending }),
});
