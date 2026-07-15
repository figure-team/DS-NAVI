// ── 대시보드 dev server: RTM 인테이크 세션 원장(<base>/<sid>/session.json) ──────
// impact 는 ledger.json 이라는 별도 원장 파일을 두지만, 인테이크는 <base> 직하의 세션
// 디렉터리 자체가 원장이다 — 인덱스 없이 readdir 순회로 목록을 만든다(설계상 스키마 변경 0).
// 설계: docs/ktds/RTM_INTAKE_WORKSPACE_DESIGN.md §3(N1,N3) · §4(C1,C3)
//
// ★ 불변식(C1): 동시 실행은 전역 뮤텍스 1개(vite.config.ts 의 rtmTracker 싱글턴)다. 목록이
//   여러 건이어도 running 이 true 인 세션은 최대 1건이며, 나머지 미완 세션은 "대기"가 아니라
//   "중단됨"이다 — 이 모듈은 running 판정을 주입받기만 하고 큐를 만들지 않는다.
import fs from "fs";
import path from "path";
import { RECONCILE_GRACE_MS } from "./job-ledger";

/** 보존할 세션 수 상한(impact 의 IMPACT_HISTORY_MAX 와 동일 계열). 초과분은 오래된 것부터 삭제. */
export const RTM_SESSION_MAX = 50;

export type RtmStepStatus = "pending" | "running" | "produced" | "confirmed" | "failed";

export interface RtmSession {
  sid: string;
  request: string;
  createdAt: string;
  producedStep: number; // 산출물이 존재하는 최고 단계(0=없음)
  confirmedStep: number; // 사용자가 컨펌한 최고 단계
  targetStep: number;
  discarded: boolean;
  steps: Record<string, { status: RtmStepStatus }>;
}

/** 원장 행 — 세션 1건의 요약 + 이 서버가 실제로 돌리고 있는지(running). */
export interface RtmSessionSummary {
  sid: string;
  request: string;
  createdAt: string;
  producedStep: number;
  confirmedStep: number;
  targetStep: number;
  discarded: boolean;
  /** rtmTracker 가 지금 이 sid 를 돌리는 중인가. 목록 전체에서 최대 1건만 true(C1). */
  running: boolean;
}

/** 현재 실행 중 여부 판정 주입 — vite.config.ts 의 rtmTracker 싱글턴을 감싼다. */
export type IsRunning = (sid: string) => boolean;

/** sid 형식 검증(경로 traversal 방지) — 16진 8~32자. */
export function isValidSid(sid: string): boolean {
  return /^[a-f0-9]{8,32}$/.test(sid);
}

/** 세션 디렉터리 절대경로. sid 무효거나 base 를 이탈하면 null — 파일 조작 경로는 전부 여길 거친다. */
export function rtmSessionDir(base: string, sid: string): string | null {
  if (!isValidSid(sid)) return null;
  const full = path.resolve(base, sid);
  if (!full.startsWith(path.resolve(base) + path.sep)) return null;
  return full;
}

function sessionFile(base: string, sid: string): string | null {
  const dir = rtmSessionDir(base, sid);
  return dir ? path.join(dir, "session.json") : null;
}

export function readRtmSession(base: string, sid: string): RtmSession | null {
  const file = sessionFile(base, sid);
  if (!file) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RtmSession) : null;
  } catch {
    return null;
  }
}

export function writeRtmSession(base: string, s: RtmSession): void {
  const dir = rtmSessionDir(base, s.sid);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(s, null, 2) + "\n", "utf8");
}

/**
 * <base> 직하 세션 전부 — createdAt 내림차순(폐기 포함). 무효 sid·파손 session.json 은 건너뛴다.
 * listRtmSessions 와 latestRtmSession 이 공유하는 단일 순회(중복 readdir 제거).
 */
export function readAllRtmSessions(base: string): RtmSession[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    return []; // base 부재 = 세션 없음(정직한 empty)
  }
  const out: RtmSession[] = [];
  for (const name of names) {
    if (!isValidSid(name)) continue;
    const s = readRtmSession(base, name);
    if (s) out.push(s);
  }
  // createdAt 동률은 sid 로 안정 정렬 — 목록 순서가 readdir 순서에 흔들리지 않게.
  out.sort(
    (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.sid.localeCompare(b.sid),
  );
  return out;
}

/** 세션 원장 목록 — createdAt 내림차순 전체(폐기 포함). N1. */
export function listRtmSessions(base: string, isRunning: IsRunning): RtmSessionSummary[] {
  return readAllRtmSessions(base).map((s) => ({
    sid: s.sid,
    request: s.request,
    createdAt: s.createdAt,
    producedStep: s.producedStep,
    confirmedStep: s.confirmedStep,
    targetStep: s.targetStep,
    discarded: s.discarded,
    running: isRunning(s.sid),
  }));
}

/** 마운트 복구용 — 가장 최근 생성된 비폐기 세션. 목록이 내림차순이라 첫 비폐기가 곧 최신. */
export function latestRtmSession(base: string): RtmSession | null {
  return readAllRtmSessions(base).find((s) => !s.discarded) ?? null;
}

/**
 * 서버 재시작으로 onClose 를 잃어 "running" 에 고착된 단계 복원(C3) — 조회 시 lazy 호출.
 * impact 의 reconcilePendingJobs 와 같은 취지지만 판정 재료가 다르다: 인테이크는 pending 마커가
 * 아니라 세션 디렉터리가 원장이므로 session.json 의 step status + 파일 mtime 으로 판정한다.
 * mtime 은 마지막 상태 전이 시각(setStepStatus 가 매 전이마다 세션을 다시 쓴다) — createdAt 보다
 * 정확한 "이 단계가 running 이 된 때"다. rtmTracker 가 들고 있는 세션은 건드리지 않는다.
 * 복원된 세션 수를 반환.
 */
export function reconcileRtmSessions(base: string, isRunning: IsRunning): number {
  let fixed = 0;
  for (const s of readAllRtmSessions(base)) {
    if (isRunning(s.sid)) continue; // 이 서버가 추적 중 — 정상 진행
    const stuck = Object.keys(s.steps ?? {}).filter((k) => s.steps[k]?.status === "running");
    if (stuck.length === 0) continue;
    const file = sessionFile(base, s.sid);
    if (!file) continue;
    let lastMs: number;
    try {
      lastMs = fs.statSync(file).mtimeMs;
    } catch {
      lastMs = Date.parse(s.createdAt ?? ""); // mtime 유실 시 createdAt 로 대체
    }
    // 유예 내면 고아 claude 가 아직 돌고 있을 수 있음 — 다음 조회 때 재판정(impact 와 동일 정책).
    if (!Number.isNaN(lastMs) && Date.now() - lastMs < RECONCILE_GRACE_MS) continue;
    for (const k of stuck) s.steps[k] = { status: "failed" };
    writeRtmSession(base, s);
    fixed++;
  }
  return fixed;
}

/**
 * 세션 상한(N3) — createdAt 오래된 것부터 디렉터리째 삭제. 삭제된 sid 목록 반환.
 * 진행 중(running) 세션은 상한 밖이어도 절대 지우지 않는다 — 그만큼 보존 수가 일시적으로
 * max 를 넘을 수 있으나(최대 +1, C1 상 running 은 1건), 실행 중 데이터 삭제보다 안전하다.
 */
export function pruneRtmSessions(
  base: string,
  isRunning: IsRunning,
  max: number = RTM_SESSION_MAX,
): string[] {
  const all = readAllRtmSessions(base);
  if (all.length <= max) return [];
  const dropped: string[] = [];
  for (const s of all.slice(max)) {
    if (isRunning(s.sid)) continue;
    const dir = rtmSessionDir(base, s.sid); // base 이탈·무효 sid 는 여기서 null → 삭제 안 함
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      dropped.push(s.sid);
    } catch {
      // 개별 삭제 실패는 무시(다음 정리 때 재시도)
    }
  }
  return dropped;
}
