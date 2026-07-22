import fs from "node:fs";
import path from "node:path";

/**
 * 영향 이력 연합(IMPACT_LEDGER_FEDERATION_DESIGN.md) — 단일 기록자 + 읽기 병합.
 *
 * impact-history 원장에는 변경·영향 메뉴(서버 잡)만 쓴다. 작업 요청(세션 디렉터리)과
 * 장애 분석(incidents/<runId>/ + incident-history 원장)은 자기 정본만 기록하고,
 * `/impact-history` 응답은 이 모듈이 세 출처를 병합해 만든다. 스냅샷 서빙은 jobId 단일 키
 * 리졸버(§2.3 v1.1) — 세 위치를 순차 해석하므로 프런트 fetch 계약(`?id=<jobId>`)이 불변이고,
 * 인테이크 ② 인라인과 /change 가 같은 파일을 읽는 "두 표면 동일" 불변식이 자명하게 유지된다.
 */

/** 원장 행 최소 형태 — vite.config 의 ImpactHistoryEntry 가 그대로 대입되는 상위 타입. */
export interface LedgerRowLike {
  jobId: string;
  query: string;
  model?: string | null;
  startedAt?: string;
  finishedAt: string;
  exitCode?: number | null;
  status?: string;
  gitCommit?: string | null;
  files: string[];
  rootSlot?: boolean;
  seedGate?: "user-confirmed" | null;
  seedMatch?: boolean | null;
  kind?: string | null;
}

export type ImpactSource = "change" | "intake" | "incident";

export interface MergedImpactRow extends LedgerRowLike {
  /** 병합 시 서버가 부여 — 어느 원장에서 왔나(레거시 행은 kind/query 접두로 후행 태깅). */
  source: ImpactSource;
  /** 열람 참조 키 — 파생 행에만(레거시 행은 스냅샷이 impact-history/<jobId>/ 에 있음). */
  ref?: { sid?: string; runId?: string };
  /** intake 파생 행 — 폐기 세션은 숨기지 않고 배지를 승계한다(원장은 폐기를 숨기지 않는다). */
  discarded?: boolean;
  /** incident 파생 행 — incident-history 가 정본인 상태(analyzed/resolved)를 그대로 병기. */
  incidentStatus?: string;
  /**
   * 탐색(change) 행 전용 — 이 탐색에서 시작된 작업 요청 세션(sid). 있으면 /change 버튼이
   * "작업 요청 →"(시작) 대신 "작업 요청 열기 →"(이동)가 된다. 폐기 세션은 제외(다시 시작 허용).
   */
  promotedSid?: string;
}

/** 세션 요약 최소 형태(server/rtm-sessions RtmSessionSummary 부분집합). */
export interface IntakeSessionLike {
  sid: string;
  request: string;
  discarded: boolean;
}

/** 파생 행 공통 골격 — 서버 잡 전용 필드는 정직한 기본값(파생 행은 spawn 실행이 아니다). */
function baseRow(jobId: string, query: string, finishedAt: string, files: string[]): LedgerRowLike {
  return {
    jobId,
    query,
    model: null,
    startedAt: finishedAt,
    finishedAt,
    exitCode: 0,
    status: "done",
    gitCommit: null,
    files,
    rootSlot: false,
    seedGate: null,
    seedMatch: null,
  };
}

const SNAP_FILES = ["impact.json", "impact-verify-report.json"];

/** 작업 요청 파생 행 — 세션 포인터(impact-run.json)가 있는 세션마다 1행. */
export function deriveIntakeRows(rtmBase: string, sessions: IntakeSessionLike[]): MergedImpactRow[] {
  const rows: MergedImpactRow[] = [];
  for (const s of sessions) {
    const ptrFile = path.join(rtmBase, s.sid, "impact-run.json");
    let ptr: Record<string, unknown> | null = null;
    try {
      const raw = JSON.parse(fs.readFileSync(ptrFile, "utf-8")) as unknown;
      if (raw && typeof raw === "object") ptr = raw as Record<string, unknown>;
    } catch {
      continue; // 포인터 없음/파손 = ② 미실행 세션(정상) — 행 없음
    }
    const jobId = typeof ptr?.jobId === "string" ? ptr.jobId : null;
    if (!jobId) continue;
    // 스냅샷 위치: 신규 = 세션 디렉터리, 레거시 = 구 원장 스냅샷(연합 이전 기록) — 리졸버와 동일 순서.
    const hasSnap =
      fs.existsSync(path.join(rtmBase, s.sid, "impact", "impact.json")) ||
      fs.existsSync(path.join(legacyHistorySnapDir(rtmBase), jobId, "impact.json"));
    let finishedAt = typeof ptr.finishedAt === "string" ? ptr.finishedAt : null;
    if (!finishedAt) {
      try {
        finishedAt = fs.statSync(ptrFile).mtime.toISOString(); // 구 포인터(필드 도입 전) 근사
      } catch {
        finishedAt = "";
      }
    }
    const row = baseRow(jobId, typeof ptr.query === "string" ? ptr.query : s.request, finishedAt, hasSnap ? SNAP_FILES : []);
    if (typeof ptr.startedAt === "string") row.startedAt = ptr.startedAt;
    if (typeof ptr.gitCommit === "string") row.gitCommit = ptr.gitCommit;
    rows.push({ ...row, kind: "intake", source: "intake", ref: { sid: s.sid }, discarded: s.discarded });
  }
  return rows;
}

/** rtm-intake 베이스에서 구 원장 스냅샷 디렉터리를 역산 — <ua>/rtm-intake → <ua>/impact-history. */
function legacyHistorySnapDir(rtmBase: string): string {
  return path.join(path.dirname(rtmBase), "impact-history");
}

/** 장애 파생 행 — incident-history 원장(runId 키, 상태 병합)에서 jobId 가 박힌 건(analyzed 이상). */
export function deriveIncidentRows(
  incidentsDir: string,
  entries: Array<Record<string, unknown>>,
): MergedImpactRow[] {
  const rows: MergedImpactRow[] = [];
  for (const e of entries) {
    const runId = typeof e.runId === "string" ? e.runId : null;
    const jobId = typeof e.jobId === "string" ? e.jobId : null;
    if (!runId || !jobId) continue;
    const snapFile = path.join(incidentsDir, runId, "impact.json");
    const hasSnap = fs.existsSync(snapFile);
    // 분석 완료 시각 — analyzedAt(연합 이후 CLI 가 기록) → 스냅샷 mtime → 수령 시각 근사.
    let finishedAt = typeof e.analyzedAt === "string" ? e.analyzedAt : null;
    if (!finishedAt && hasSnap) {
      try {
        finishedAt = fs.statSync(snapFile).mtime.toISOString();
      } catch {
        finishedAt = null;
      }
    }
    if (!finishedAt) finishedAt = typeof e.ingestedAt === "string" ? e.ingestedAt : "";
    const title = typeof e.title === "string" ? e.title : typeof e.sourceFile === "string" ? e.sourceFile : runId;
    const row = baseRow(jobId, `[장애] ${title}`, finishedAt, hasSnap ? SNAP_FILES : []);
    if (typeof e.analyzedGitCommit === "string") row.gitCommit = e.analyzedGitCommit;
    if (e.seedGate === "user-confirmed") row.seedGate = "user-confirmed";
    rows.push({
      ...row,
      kind: "incident",
      source: "incident",
      ref: { runId },
      incidentStatus: typeof e.status === "string" ? e.status : undefined,
    });
  }
  return rows;
}

/** 레거시 원장 행의 출처 후행 태깅 — 연합 이전에 CLI 가 남긴 rootSlot:false 행 판별(§2.2). */
function legacySourceOf(e: LedgerRowLike): ImpactSource {
  if (e.kind === "incident" || (e.kind == null && e.rootSlot === false && e.query.startsWith("[장애]"))) return "incident";
  if (e.kind === "intake" || e.rootSlot === false) return "intake";
  return "change";
}

/**
 * 병합 — 파생 행이 레거시 짝(jobId 동일)을 이긴다. 짝 없는 레거시 행은 그대로 노출
 * (kind/query 폴백 배지). finishedAt 내림차순, max 로 표시 상한.
 */
export function mergeImpactHistory(
  ledger: LedgerRowLike[],
  intake: MergedImpactRow[],
  incident: MergedImpactRow[],
  max: number,
): MergedImpactRow[] {
  const derived = [...intake, ...incident];
  const derivedIds = new Set(derived.map((d) => d.jobId));
  const legacy: MergedImpactRow[] = ledger
    .filter((e) => !derivedIds.has(e.jobId))
    .map((e) => ({ ...e, source: legacySourceOf(e) }));
  return [...legacy, ...derived]
    .sort((a, b) => (b.finishedAt || "").localeCompare(a.finishedAt || ""))
    .slice(0, max);
}

/**
 * 승격 역인덱스(EXPLORE_PROMOTION) — 세션들의 origin.jobId → sid. 탐색 기록은 승격 후에도
 * 사라지지 않으므로(원장은 기록을 숨기지 않는다 + ② 델타가 유래 스냅샷을 계속 참조),
 * /change 는 이 맵으로 "시작"과 "열기"를 가른다. 폐기 세션은 제외(다시 시작 허용),
 * sessions 는 최신 우선 순서라 같은 탐색의 복수 세션은 최신이 이긴다.
 */
export function mapPromotedSids(rtmBase: string, sessions: IntakeSessionLike[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of sessions) {
    if (s.discarded) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(rtmBase, s.sid, "session.json"), "utf-8")) as {
        origin?: { jobId?: unknown } | null;
      };
      const jobId = raw?.origin?.jobId;
      if (typeof jobId === "string" && !(jobId in map)) map[jobId] = s.sid;
    } catch {
      // 세션 파일 부재/파손 — 유래 없음으로 취급
    }
  }
  return map;
}

/**
 * 스냅샷 리졸버(§2.3 v1.1) — jobId 하나로 세 위치를 순차 해석해 실존 파일 경로를 돌려준다.
 * 검증(16hex jobId·name 화이트리스트)은 호출부(vite) 몫 — 여기 인자는 이미 신뢰된 값이다.
 * 순서: ① 원장 스냅샷(change+레거시) ② 세션 스냅샷(intake) ③ 건 디렉터리(incident).
 */
export function resolveImpactSnapshot(
  opts: {
    historyDir: string;
    rtmBase: string | null;
    intakeSessions: IntakeSessionLike[];
    incidentsDir: string;
    incidentEntries: Array<Record<string, unknown>>;
  },
  jobId: string,
  name: string,
): string | null {
  const inHistory = path.join(opts.historyDir, jobId, name);
  if (fs.existsSync(inHistory)) return inHistory;
  if (opts.rtmBase) {
    for (const s of opts.intakeSessions) {
      const ptrFile = path.join(opts.rtmBase, s.sid, "impact-run.json");
      try {
        const ptr = JSON.parse(fs.readFileSync(ptrFile, "utf-8")) as { jobId?: unknown };
        if (ptr?.jobId !== jobId) continue;
      } catch {
        continue;
      }
      const inSession = path.join(opts.rtmBase, s.sid, "impact", name);
      if (fs.existsSync(inSession)) return inSession;
    }
  }
  for (const e of opts.incidentEntries) {
    if (e.jobId !== jobId || typeof e.runId !== "string") continue;
    const inIncident = path.join(opts.incidentsDir, e.runId, name);
    if (fs.existsSync(inIncident)) return inIncident;
  }
  return null;
}
