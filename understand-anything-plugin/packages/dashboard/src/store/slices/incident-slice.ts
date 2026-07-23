// 슬라이스 소유: 장애 분석 메뉴(/incident) — INCIDENT_ANALYSIS_DESIGN §2.4.
// 서버 계약: /incident-history(원장+드롭+job) · /incident-run(prepare|resolve) ·
// /incident-status(폴링) · /incident-item(건별 파일). 원장은 CLI 자가 append 라 여기선 읽기만.
import type { StateCreator } from "zustand";
import type { DashboardStore } from "../index";

/** incident-history/ledger.json 의 항목 — incident.mjs 가 쓴다(전이형 상태 머신). */
export interface IncidentLedgerEntry {
  runId: string;
  sourceFile?: string;
  service?: string | null;
  title?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  baselineCommit?: string | null;
  reportCreatedAt?: string | null;
  ingestedAt?: string;
  status: "unparseable" | "ingested" | "seeded" | "analyzed" | "resolved";
  reasons?: string[];
  seeds?: number;
  allNotInProject?: boolean;
  jobId?: string;
  seedGate?: "user-confirmed" | null;
  analyzedGitCommit?: string | null;
  resolvedAt?: string;
}

export interface IncidentDrop {
  file: string;
  ingested: boolean;
  // 미수령 건의 목록 프리뷰(서버 경량 파싱). 수령된 건은 원장이 정본이라 null.
  runId?: string | null;
  service?: string | null;
  title?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  baselineCommit?: string | null;
  reportCreatedAt?: string | null;
  parseable?: boolean;
}

export interface IncidentJobSnapshot {
  status: "idle" | "running" | "done" | "failed";
  jobId: string | null;
  exitCode: number | null;
  error: string | null;
  runId: string | null;
  phase: "prepare" | "resolve" | null;
  tail?: string;
}

const IDLE_JOB: IncidentJobSnapshot = {
  status: "idle",
  jobId: null,
  exitCode: null,
  error: null,
  runId: null,
  phase: null,
};

export interface IncidentSlice {
  incidentEntries: IncidentLedgerEntry[];
  incidentDrops: IncidentDrop[];
  incidentJob: IncidentJobSnapshot;
  incidentLoaded: boolean;
  /** 원장+드롭+job 재조회 — 진입 시·job 종료 시 호출. 실패는 조용히 빈 목록(읽기 전용 뷰). */
  loadIncidentHistory: () => Promise<void>;
  /** prepare(수령+시드 판정, 결정론) 실행. runId 생략 = 신규 전건. */
  startIncidentPrepare: (runId?: string | null) => Promise<{ ok: boolean; error?: string }>;
  /** resolve(analyze+해결방안서+finalize) 실행 — 사용자 확정 시드 필수(시드 게이트). */
  startIncidentResolve: (
    runId: string,
    confirmedPaths: string[],
  ) => Promise<{ ok: boolean; error?: string }>;
  /** running 인 동안 3s 폴링 — running→종료 전이 시 원장 재조회. 컴포넌트 마운트가 시동. */
  pollIncidentStatus: () => void;
}

// 폴러 단일화 플래그 — `pollTimer` 만으로는 tick 이 fetch await 중일 때(타이머 없음) 가드가
// 뚫려 이중 루프가 생겼다(P2-5). loop 전 구간을 pollActive 로 감싼다.
let pollActive = false;

export const createIncidentSlice: StateCreator<DashboardStore, [], [], IncidentSlice> = (
  set,
  get,
) => ({
  incidentEntries: [],
  incidentDrops: [],
  incidentJob: IDLE_JOB,
  incidentLoaded: false,

  loadIncidentHistory: async () => {
    const { accessToken } = get();
    if (!accessToken) {
      set({ incidentEntries: [], incidentDrops: [], incidentLoaded: true });
      return;
    }
    try {
      const res = await fetch(`/incident-history?token=${encodeURIComponent(accessToken)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        entries?: IncidentLedgerEntry[];
        drops?: IncidentDrop[];
        job?: IncidentJobSnapshot;
      };
      set({
        incidentEntries: Array.isArray(data.entries) ? data.entries : [],
        incidentDrops: Array.isArray(data.drops) ? data.drops : [],
        incidentJob: data.job ?? IDLE_JOB,
        incidentLoaded: true,
      });
      if (data.job?.status === "running") get().pollIncidentStatus();
    } catch {
      set({ incidentLoaded: true });
    }
  },

  startIncidentPrepare: async (runId) => {
    return postIncidentRun(set, get, { phase: "prepare", runId: runId ?? undefined });
  },

  startIncidentResolve: async (runId, confirmedPaths) => {
    return postIncidentRun(set, get, { phase: "resolve", runId, confirmedPaths });
  },

  pollIncidentStatus: () => {
    if (pollActive) return; // 이미 폴링 중(await 구간 포함) — 중복 루프 금지
    pollActive = true;
    const running = () => get().incidentJob.status === "running";
    const stop = () => {
      pollActive = false;
    };
    const tick = async () => {
      const { accessToken } = get();
      if (!accessToken) {
        // 토큰 일시 부재 — 진행 중이었다면 재시도(복귀 시 전이를 놓치지 않게), 아니면 종료.
        if (running()) setTimeout(tick, 3000);
        else stop();
        return;
      }
      try {
        const res = await fetch(`/incident-status?token=${encodeURIComponent(accessToken)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { job?: IncidentJobSnapshot };
        const job = data.job ?? IDLE_JOB;
        const prev = get().incidentJob;
        set({ incidentJob: job });
        if (job.status === "running") {
          setTimeout(tick, 3000);
        } else {
          stop();
          // running → 종료 전이: CLI 가 원장을 갱신했다 — 목록·선택 건을 다시 읽는다.
          if (prev.status === "running") void get().loadIncidentHistory();
        }
      } catch {
        // 서버 순단은 다음 폴에서 회복 — 진행 중이었다면 계속 시도, 아니면 종료.
        if (running()) setTimeout(tick, 3000);
        else stop();
      }
    };
    setTimeout(tick, 3000);
  },
});

async function postIncidentRun(
  set: (partial: Partial<IncidentSlice>) => void,
  get: () => DashboardStore,
  body: { phase: "prepare" | "resolve"; runId?: string; confirmedPaths?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const { accessToken } = get();
  if (!accessToken) return { ok: false, error: "no-write-server" };
  try {
    const res = await fetch(`/incident-run?token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      | { job?: IncidentJobSnapshot; error?: string }
      | null;
    if (!res.ok || !data?.job) return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
    set({ incidentJob: data.job });
    get().pollIncidentStatus();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
