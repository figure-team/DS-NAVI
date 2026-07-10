// 슬라이스 소유: 공용(셸) — 토큰·승인자·노드 오버라이드·섹션 전환 정리.
// 병렬 워크트리 규약: 필드 추가/변경 금지 — 필요 시 셸 소유 세션에 요청.
import type { StateCreator } from "zustand";
import type { NodeOverride } from "../types";
import type { DashboardStore } from "../index";

export interface SessionSlice {
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

  /** P2: 섹션(URL) 전환 시 선택/흐름/코드뷰어 등 휘발 상태 정리 — 구 setViewMode의 정리 반쪽. */
  resetTransientOnSectionChange: () => void;
  /** P2: "선택을 들고 섹션 점프"(도메인 점프)가 다음 1회 정리를 건너뛰게 표시. */
  preserveTransientOnce: boolean;
  markPreserveTransientOnce: () => void;
  consumePreserveTransientOnce: () => void;
}

export const createSessionSlice: StateCreator<DashboardStore, [], [], SessionSlice> = (set, get) => ({
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

  // P2: 구 setViewMode의 정리 동작만 계승 — 섹션(URL) 전환 시 셸이 호출한다.
  preserveTransientOnce: false,
  markPreserveTransientOnce: () => set({ preserveTransientOnce: true }),
  consumePreserveTransientOnce: () => set({ preserveTransientOnce: false }),
  resetTransientOnSectionChange: () => {
    set({
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
});
