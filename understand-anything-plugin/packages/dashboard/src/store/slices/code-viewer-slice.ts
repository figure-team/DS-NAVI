// 슬라이스 소유: 공용(셸 레이어 — ShellLayout이 렌더, 전 메뉴가 openCodeViewerAt으로 사용).
// 병렬 워크트리 규약: 필드 추가/변경 금지 — 필요 시 셸 소유 세션에 요청.
import type { StateCreator } from "zustand";
import type { DashboardStore } from "../index";

export interface CodeViewerSlice {
  codeViewerOpen: boolean;
  codeViewerNodeId: string | null;
  /** 노드 없이 임의 (filePath, line)로 열 때 사용 — 인용 칩 점프(근거). nodeId와 배타적. */
  codeViewerFilePath: string | null;
  codeViewerLine: number | null;
  codeViewerExpanded: boolean;

  openCodeViewer: (nodeId: string) => void;
  /** 인용(file:line) 칩 클릭 → 노드 없이 임의 파일의 단일 라인으로 코드뷰어 열기. */
  openCodeViewerAt: (filePath: string, line: number) => void;
  closeCodeViewer: () => void;
  expandCodeViewer: () => void;
  collapseCodeViewer: () => void;
}

export const createCodeViewerSlice: StateCreator<DashboardStore, [], [], CodeViewerSlice> = (set) => ({
  codeViewerOpen: false,
  codeViewerNodeId: null,
  codeViewerFilePath: null,
  codeViewerLine: null,
  codeViewerExpanded: false,

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
});
