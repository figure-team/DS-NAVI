// 슬라이스 소유: WT-A(위키) — 세분화 위키 그래프·문서 열기.
import type { KnowledgeGraph } from "@understand-anything/core/types";
import type { StateCreator } from "zustand";
import type { DashboardStore } from "../index";

export interface WikiSlice {
  /** ktds-fork (ADR-004): 세분화 위키 그래프(별도 wiki-graph.json). "문서" 토글 소스. */
  wikiGraph: KnowledgeGraph | null;
  setWikiGraph: (graph: KnowledgeGraph) => void; // ktds-fork (ADR-004)
  /** ktds-fork: 위키 문서 노드를 선택(코드뷰어 정리 포함). 호출측이 navigate("/wiki") 동반. */
  openWikiDoc: (nodeId: string) => void;
}

export const createWikiSlice: StateCreator<DashboardStore, [], [], WikiSlice> = (set) => ({
  wikiGraph: null, // ktds-fork (ADR-004)

  setWikiGraph: (graph) => { // ktds-fork (ADR-004)
    set({ wikiGraph: graph });
  },

  // ktds-fork: 문서 노드 선택 + 코드뷰어 정리(원자적). /wiki 이동은 호출측 navigate가 담당 —
  // 선택을 비우는 resetTransientOnSectionChange보다 나중에 실행되도록 호출측에서 순서 주의.
  openWikiDoc: (nodeId) =>
    set({
      selectedNodeId: nodeId,
      focusNodeId: null,
      codeViewerOpen: false,
      codeViewerNodeId: null,
      codeViewerExpanded: false,
    }),
});
