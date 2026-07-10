// 슬라이스 소유: WT-E(변경·영향) + WT-A(구조 탭 오버레이 토글) 공동 — 수정 전 상호 조율.
// diff/impact/risk 3채널 오버레이 + 영향도 분석 job.
import type { StateCreator } from "zustand";
import type {
  ImpactJobState,
  ImpactJobStatus,
  OverlayChannelData,
  OverlaySource,
} from "../types";
import type { DashboardStore } from "../index";

export interface OverlaySlice {
  // 오버레이 3채널 (ktds): diff=실측(git 변경, /understand-review·understand-diff),
  // impact=예측(/understand-impact 시드 기반 도달성), risk=정적 품질(risk-report
  // 등급 상→changed / 중→affected 매핑, 자동 활성 없음 — 토글 전용). diffMode/
  // changedNodeIds/affectedNodeIds는 "활성 채널"의 뷰 상태 — 모든 뷰가 이것만 읽는다.
  diffMode: boolean;
  changedNodeIds: Set<string>;
  affectedNodeIds: Set<string>;
  overlaySource: OverlaySource | null;
  diffOverlayData: OverlayChannelData | null;
  impactOverlayData: OverlayChannelData | null;
  riskOverlayData: OverlayChannelData | null;

  setDiffOverlay: (changed: string[], affected: string[]) => void;
  toggleDiffMode: () => void;
  /** 채널 원본 적재 + 자동 활성(시드 보유 && 더 최신이거나 유일할 때 — risk 채널은 자동 활성 제외). */
  setOverlayData: (source: OverlaySource, data: OverlayChannelData) => void;
  /** 채널 토글 — 활성 채널 재토글=숨김, 비활성 채널=전환 (동시 표시 없음). */
  toggleOverlay: (source: OverlaySource) => void;
  clearDiffOverlay: () => void;

  // ktds: 구조 탭 "영향도 분석" — 자연어 입력 모달 + claude -p 실행 job(전역 상태).
  impactModalOpen: boolean;
  impactJob: ImpactJobState;
  openImpactModal: () => void;
  closeImpactModal: () => void;
  /** 자연어 query를 POST /impact-analyze로 보내 분석 시작(running). */
  startImpactAnalysis: (query: string) => Promise<{ ok: boolean; error?: string }>;
  /** GET /impact-status 폴링 결과로 job 상태 동기화. */
  pollImpactStatus: () => Promise<void>;
  /** impact-overlay.json 재fetch → impact 채널 적재 + 명시 활성. */
  reloadImpactOverlay: () => Promise<void>;
}

export const createOverlaySlice: StateCreator<DashboardStore, [], [], OverlaySlice> = (set, get) => ({
  diffMode: false,
  changedNodeIds: new Set<string>(),
  affectedNodeIds: new Set<string>(),
  overlaySource: null,
  diffOverlayData: null,
  impactOverlayData: null,
  riskOverlayData: null,

  // 하위호환 별칭 — diff 채널 적재 (generatedAt 미상 = 빈 문자열: 항상 최저 우선)
  setDiffOverlay: (changed, affected) =>
    get().setOverlayData("diff", { changed, affected, generatedAt: "" }),

  toggleDiffMode: () => get().toggleOverlay("diff"),

  setOverlayData: (source, data) =>
    set(() => {
      // 적재만 한다 — 모든 채널 토글 전용(자동 활성 제거, 2026-07-10). 디스크에 남은
      // 과거 impact/diff 산출이 첫 진입부터 그래프 전체를 흐리게 만들던 것을 중단.
      // 활성 경로는 ①DiffToggle 칩 ②?overlay= 딥링크 ③분석 직후(reloadImpactOverlay).
      const next: Partial<DashboardStore> =
        source === "diff"
          ? { diffOverlayData: data }
          : source === "impact"
            ? { impactOverlayData: data }
            : { riskOverlayData: data };
      return next;
    }),

  toggleOverlay: (source) =>
    set((state) => {
      const data =
        source === "diff"
          ? state.diffOverlayData
          : source === "impact"
            ? state.impactOverlayData
            : state.riskOverlayData;
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

  // ── ktds: 구조 탭 "영향도 분석" job ────────────────────────────────────────
  impactModalOpen: false,
  impactJob: { status: "idle", jobId: null, query: null, exitCode: null, error: null },
  openImpactModal: () => set({ impactModalOpen: true }),
  closeImpactModal: () => set({ impactModalOpen: false }),

  startImpactAnalysis: async (query) => {
    const q = query.trim();
    if (!q) return { ok: false, error: "empty-query" };
    const { accessToken } = get();
    if (!accessToken) return { ok: false, error: "no-write-server" };
    try {
      const res = await fetch(`/impact-analyze?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json().catch(() => null)) as
        | { job?: { jobId?: string | null; query?: string | null }; error?: string }
        | null;
      // 409 = 이미 실행 중 → running 으로 동기화하고 성공 취급(모달 닫힘).
      if (!res.ok && res.status !== 409) {
        return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
      }
      set({
        impactJob: {
          status: "running",
          jobId: data?.job?.jobId ?? null,
          query: data?.job?.query ?? q,
          exitCode: null,
          error: null,
        },
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  pollImpactStatus: async () => {
    const { accessToken } = get();
    if (!accessToken) return;
    try {
      const res = await fetch(`/impact-status?token=${encodeURIComponent(accessToken)}`);
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { job?: { status?: ImpactJobStatus; jobId?: string | null; exitCode?: number | null } }
        | null;
      const job = data?.job;
      if (!job?.status) return;
      set((s) => ({
        impactJob: {
          ...s.impactJob,
          status: job.status as ImpactJobStatus,
          jobId: job.jobId ?? s.impactJob.jobId,
          exitCode: job.exitCode ?? null,
        },
      }));
    } catch {
      // 폴링 실패는 조용히 무시(다음 틱 재시도).
    }
  },

  reloadImpactOverlay: async () => {
    const { accessToken, setOverlayData } = get();
    try {
      const base = import.meta.env.BASE_URL; // "/demo/" (demo) | "/" (라이브 서버)
      const url = accessToken
        ? `${base}impact-overlay.json?token=${encodeURIComponent(accessToken)}&t=${Date.now()}`
        : `${base}impact-overlay.json?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { changedNodeIds?: unknown; affectedNodeIds?: unknown; generatedAt?: unknown }
        | null;
      if (
        !data ||
        !Array.isArray(data.changedNodeIds) ||
        !Array.isArray(data.affectedNodeIds)
      ) {
        return;
      }
      const changed = data.changedNodeIds as string[];
      const affected = data.affectedNodeIds as string[];
      setOverlayData("impact", {
        changed,
        affected,
        generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : "",
      });
      // 분석 직후엔 impact 채널을 명시적으로 활성(자동 활성 우선순위와 무관하게 보이도록).
      if (changed.length > 0) {
        set({
          overlaySource: "impact",
          diffMode: true,
          changedNodeIds: new Set<string>(changed),
          affectedNodeIds: new Set<string>(affected),
        });
      }
    } catch {
      // 무시.
    }
  },
});
