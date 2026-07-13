// 슬라이스 소유: WT-B(업무지도·정책서) — 도메인 그래프·흐름 탐색 상태.
// 다른 워크트리는 읽기만. 필드 추가/변경은 B 세션에서.
import type { KnowledgeGraph } from "@understand-anything/core/types";
import type { StateCreator } from "zustand";
import type { DashboardStore } from "../index";
import type { DomainGroup } from "../../utils/domainGroups";

/** Maximum number of entries in the sidebar navigation history. */
const MAX_HISTORY = 50;

export interface DomainSlice {
  domainGraph: KnowledgeGraph | null;
  /**
   * 도메인 계층(DOMAIN_HIERARCHY §7) — `domain-graph.json` raw ktdsMap.groups 를
   * 파싱한 결과. core 의 validateGraph 는 이 필드를 모르므로(passthrough 아님),
   * Root.tsx 가 검증 *전* raw fetch 데이터에서 별도로 채운다. 빈 배열 = 그룹 없는
   * 프로젝트(D2 폴백) — 소비측(DomainMapView/DomainsPage)의 유일한 분기점.
   */
  domainGroups: DomainGroup[];
  setDomainGroups: (groups: DomainGroup[]) => void;
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

  setDomainGraph: (graph: KnowledgeGraph) => void;
  navigateToDomain: (domainId: string) => void;
  clearActiveDomain: () => void;
  /** US-002: drill into flow spine view within the current domain. */
  navigateToFlow: (flowId: string) => void;
  /** US-002: return from flow spine to the flow list; leaves activeDomainId intact. */
  clearActiveFlow: () => void;
}

export const createDomainSlice: StateCreator<DashboardStore, [], [], DomainSlice> = (set, get) => ({
  domainGraph: null,
  domainGroups: [],
  setDomainGroups: (groups) => set({ domainGroups: groups }),
  activeDomainId: null,
  activeFlowId: null,
  selectedFlowId: null,

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
    // ktds-fork (FRONT_REDESIGN P1): "열자마자 도메인 지도 랜딩"(di-ds-navi-001)은 이제
    // 라우터의 index 리다이렉트("/" → /domains)가 담당한다. 여기서 viewMode를 플립하면
    // /structure 딥링크가 로드 시점에 도메인으로 뺏기므로 데이터만 싣는다.
    set({ domainGraph: graph });
  },

  navigateToDomain: (domainId) => {
    const { selectedNodeId, nodeHistory } = get();
    const newHistory = selectedNodeId
      ? [...nodeHistory, selectedNodeId].slice(-MAX_HISTORY)
      : nodeHistory;
    set({
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
});
