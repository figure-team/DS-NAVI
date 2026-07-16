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

/**
 * 현행 단계 체계 버전. **2 = 6단계**(①식별 ②영향분석 ③목록표 ④정의서 ⑤명세서 ⑥RTM).
 * `schemaVersion` 부재 = **구 5단계**(①식별+영향 ②목록표 ③정의서 ④명세서 ⑤RTM) → `migrateRtmSession`.
 */
export const RTM_SESSION_SCHEMA_VERSION = 2;

export interface RtmSession {
  /**
   * 단계 체계 버전(§ RTM_STEP_FLOW_DESIGN.md §4.2). 없으면 구 5단계 세션이다.
   *
   * ★ 이 필드가 **마이그레이션의 멱등성을 지탱하는 유일한 장치**다. 구 세션의 단계 번호는 신 체계로
   * 옮길 때 재사상(k≥2 → k+1)되는데, 버전 표식이 없으면 읽을 때마다 또 +1 되어 producedStep 이
   * 무한히 커진다. 그래서 "legacy 를 표시만 하고 둔다"는 선택지에도 이 필드는 필요하다.
   */
  schemaVersion?: number;
  /**
   * ① 대화의 claude 세션 UUID(A2 · RTM_INTAKE_ANSWER_DESIGN.md §3.3 · D1 하이브리드).
   *
   * ① 첫 spawn 이 `--session-id <uuid>` 로 이 값을 쓰고, 답변 개정은 `--resume <uuid>` 로 **그 대화를
   * 이어** 맥락(번들을 읽은 대화)을 재주입 없이 쓴다. **optional 인 이유**: 이 필드를 모르는 구세션이
   * 디스크에 실재한다. 없으면 개정은 fresh `-p` 로 폴백하며(§4.3), 개정 디렉티브가 자기완결형이라
   * 결과는 같다(토큰만 더 씀) — 그래서 부재가 결함이 아니다.
   */
  identifyClaudeSession?: string;
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

/**
 * 구 5단계 세션 → 6단계 재사상(2026-07-16). 이미 v2 면 그대로 돌려준다(멱등).
 *
 * **왜 재사상인가 — "legacy 로 두고 UI 에서 표시"를 고른 게 아니다.** 두 체계는 같은 정수 k 에
 * 다른 뜻을 담는다(구 ⑤=RTM · 신 ⑤=명세서). 세션을 legacy 로 두면 스테퍼·배지·`STEP_DOC_KIND` 가
 * 행마다 두 체계를 갈라 렌더해야 하고, 원장의 "⑤" 배지가 세션마다 다른 뜻이 된다 —
 * **그게 더 조용히 오해시킨다**(§4.1 "없음 vs 못 봄"과 같은 축의 죄). 재사상은 반대로
 * **의미 보존적**이다: 구 세션이 실제로 한 일을 신 체계 번호로 정확히 옮길 뿐이다.
 *
 * 규칙:
 * | 구 | 신 | 근거 |
 * |---|---|---|
 * | ①(식별+코드영향) | ①식별 | 분해·근거·validate 는 그대로 ① |
 * | ① + `impact-run.json` 존재 | **②까지 produced** | 구 ①의 9번 지시가 `code-impact` 를 돌렸다. 포인터가 디스크에 실재하므로 "②를 했다"는 **관측 사실**이지 추정이 아니다 |
 * | ②③④⑤ | ③④⑤⑥ | k+1 — 라벨이 그대로 따라간다(목록표→목록표) |
 *
 * `confirmedStep` 은 **승격하지 않는다**(구 1 → 신 1). 구 ① 컨펌 때 영향분석을 같이 봤을 개연성은
 * 있으나 신 체계에서 ②는 독립 게이트다 — 안 누른 컨펌을 눌린 것으로 만드는 건 조용한 거짓이다.
 * 결과는 `confirmed(1) < produced(2)` 라 서버 컨펌 게이트가 **②를 컨펌하라고 정직하게 막는다**.
 *
 * `impact-run.json` 이 **없는** 구 ① 세션은 ①에 그대로 둔다. 시드가 전부 `to-be:` 라 포인터를 안
 * 쓴 것(=실질 ② 완료)일 수도 있으나 파일만으로는 미실행과 구별되지 않는다 — **거짓 완료를 만드느니
 * 미산출로 두고 ②를 돌리게 한다**(그러면 `code-impact` 가 시드 없음으로 정상 종료하며 produced 된다).
 */
export function migrateRtmSession(base: string, s: RtmSession): { session: RtmSession; changed: boolean } {
  if (typeof s.schemaVersion === "number" && s.schemaVersion >= RTM_SESSION_SCHEMA_VERSION) {
    return { session: s, changed: false };
  }
  const dir = rtmSessionDir(base, s.sid);
  const ranImpact = !!dir && fs.existsSync(path.join(dir, "impact-run.json"));
  /** 구 k → 신 k. ①은 제자리(영향분석이 ①에서 갈라져 나온 것이지 ①이 밀린 게 아니다). */
  const remap = (k: number): number => (k <= 1 ? k : k + 1);

  const oldProduced = Number.isFinite(s.producedStep) ? s.producedStep : 0;
  const oldConfirmed = Number.isFinite(s.confirmedStep) ? s.confirmedStep : 0;
  const oldTarget = Number.isFinite(s.targetStep) ? s.targetStep : 0;
  // 구 ①만 산출된 세션에서 impact-run.json 이 있으면 ②까지 실제로 한 것이다.
  const producedStep = oldProduced === 1 && ranImpact ? 2 : remap(oldProduced);
  const confirmedStep = Math.min(remap(oldConfirmed), producedStep);

  const steps: Record<string, { status: RtmStepStatus }> = {};
  for (let k = 1; k <= 6; k++) steps[String(k)] = { status: "pending" };
  for (const [k, v] of Object.entries(s.steps ?? {})) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1) continue;
    steps[String(remap(n))] = { status: v?.status ?? "pending" };
  }
  // 승격된 ②의 상태를 명시적으로 채운다 — 구 세션엔 ② 슬롯 자체가 없었다.
  if (producedStep >= 2 && steps["2"]?.status === "pending") steps["2"] = { status: "produced" };
  for (let k = 1; k <= confirmedStep; k++) steps[String(k)] = { status: "confirmed" };

  return {
    session: {
      ...s,
      schemaVersion: RTM_SESSION_SCHEMA_VERSION,
      producedStep,
      confirmedStep,
      // 구 targetStep 도 같은 사상 — 다만 producedStep 밑으로 내려가지 않게 올린다.
      targetStep: Math.max(remap(oldTarget), producedStep),
      steps,
    },
    changed: true,
  };
}

/**
 * 세션 1건 읽기 + **구 5단계면 6단계로 재사상해 반환**. 원장 조회·상태 폴링·컨펌·진행이 전부 이
 * 함수를 거치므로(readAllRtmSessions 포함) 여기 한 곳이면 모든 경로가 6단계 세션만 본다.
 *
 * ★ **읽기는 디스크를 건드리지 않는다(순수 변환).** 처음엔 여기서 마이그레이션 결과를 write-back
 * 했으나 그게 `session.json` 의 **mtime 을 갱신해 `reconcileRtmSessions` 를 무력화**했다 — 그 함수는
 * mtime 을 "마지막 상태 전이 시각"으로 읽어 유예를 재므로(§C3), 조회할 때마다 mtime 이 now 로 밀리면
 * 고착된 `running` 이 **영원히 유예 안**에 머문다. 영속은 정상 쓰기 경로가 알아서 한다 —
 * 반환 객체가 이미 `schemaVersion: 2` 라 다음 `writeRtmSession` 이 v2 로 굳힌다.
 */
export function readRtmSession(base: string, sid: string): RtmSession | null {
  const file = sessionFile(base, sid);
  if (!file) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return migrateRtmSession(base, raw as RtmSession).session;
}

export function writeRtmSession(base: string, s: RtmSession): void {
  const dir = rtmSessionDir(base, s.sid);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(s, null, 2) + "\n", "utf8");
}

// ── A2: 답변 원장 qa-history.json (RTM_INTAKE_ANSWER_DESIGN.md §3.2) ──────────
// D1 의 "Q&A 를 우리 파일에도 기록" 이 이것 — `--resume` 대화는 `~/.claude` 에 살아 **프로젝트 밖**
// 이라, 인테이크 산출의 "무엇을 보고/듣고 그렇게 말했나" 계보가 그쪽에만 있으면 감사가 반쪽이 된다.
// 이 파일이 답변의 **영속 진실원본**이고, identified.json 의 questions[].answer 는 LLM 이 유지하는
// 현재 상태다(개정이 실패해도 답은 여기 남는다).

/** 답변 원장 파일명. 세션 디렉터리 직하. */
const QA_HISTORY_FILE = "qa-history.json";

/** ①식별 단계 번호 — 답변 게이트가 "① 최전선"을 재는 기준(vite.config.ts RTM_STEP_MIN 과 같은 값). */
const RTM_STEP_IDENTIFY = 1;

/**
 * ★ 답변 게이트(D2 · RTM_INTAKE_ANSWER_DESIGN.md §5) — **판정만** 한다. HTTP 응답은 호출자 몫.
 *
 * legacy-core `checkMinimalSet` 과 같은 꼴이다(판정은 순수 함수, fail-closed 처리는 경계). 게이트를
 * vite.config.ts 안 핸들러에 인라인하면 **테스트가 불가능**해지고, 그러면 "게이트는 코드로"가
 * 산문으로 되돌아간다(RTM_IMPACT_GATE_DESIGN §7 C8 이 정확히 금지한 것).
 *
 * 막는 건 **"이미 지나간 단계를 뒤늦게 흔드는 것"뿐**이다. 미답변이 컨펌을 막지는 않는다(D2) —
 * 그건 여기가 아니라 컨펌 경로의 문제고, 컨펌은 질문을 보지 않는다.
 */
export function checkAnswerGate(
  session: Pick<RtmSession, "producedStep" | "confirmedStep" | "discarded">,
): { ok: true } | { ok: false; status: number; error: string } {
  // 폐기 세션은 ① 컨펌 루프 **밖**이다 — UI 는 이미 막지만 게이트가 스스로 알아야 한다
  // (API 직접 호출로 도달 가능하고, 그때 원장 append + claude spawn 이 일어난다).
  if (session.discarded) {
    return { ok: false, status: 409, error: "폐기된 세션입니다 — 답변할 수 없습니다." };
  }
  if (session.producedStep !== RTM_STEP_IDENTIFY) {
    return {
      ok: false,
      status: 409,
      error:
        session.producedStep === 0
          ? "①이 아직 산출되지 않았습니다."
          : `①이 최전선일 때만 답변할 수 있습니다(현재 산출 단계 ${session.producedStep}).`,
    };
  }
  // 컨펌했다 = ②로 넘어갔다. 되돌리면 ②~⑥이 틀린 ① 위에 서게 되므로 잠근다(롤백은 별도 과제).
  if (session.confirmedStep >= RTM_STEP_IDENTIFY) {
    return {
      ok: false,
      status: 409,
      error: "①을 이미 컨펌해 답변이 잠겼습니다 — 되돌리려면 세션을 새로 시작하세요.",
    };
  }
  return { ok: true };
}

/** 문답 1건 — 질문 원문을 함께 싣는다(질문이 개정으로 바뀌어도 "그때 뭘 묻고 답했나"가 보존된다). */
export interface QaEntry {
  qid: string;
  question: string;
  answer: string;
}
/** 답변 제출 1회(여러 질문 일괄) = revision 1건. 인터뷰가 여러 턴이면 rev 가 쌓인다. */
export interface QaRevision {
  rev: number;
  answeredAt: string;
  qas: QaEntry[];
}
export interface QaHistory {
  revisions: QaRevision[];
  /**
   * 파일이 **있는데 못 읽었다**(파싱 불가/모양 위반). `revisions: []` 만으로는 "아직 아무도 안 답함"
   * 과 구별되지 않아 append 가 남은 이력을 조용히 파기한다 — 저장소 불변식 "없음 vs 못 봄" 그대로다.
   */
  corrupt?: boolean;
}

/** qa-history.json 절대경로(sid 검증·base 이탈 방지는 rtmSessionDir 이 맡는다). null=무효 sid. */
function qaHistoryFile(base: string, sid: string): string | null {
  const dir = rtmSessionDir(base, sid);
  return dir ? path.join(dir, QA_HISTORY_FILE) : null;
}

/** revision 1건의 모양 검사 — 원소를 안 보면 쓰레기가 원장에 눌러앉아 조용히 오염된다. */
function isQaRevision(v: unknown): v is QaRevision {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Partial<QaRevision>;
  return typeof r.rev === "number" && Array.isArray(r.qas);
}

/**
 * 답변 원장 읽기. **부재와 손상을 가른다** — 부재는 `{revisions: []}`, 손상은 `corrupt: true`.
 *
 * 둘을 같은 빈 원장으로 뭉개면 `appendQaRevision` 이 남은 이력을 조용히 덮어쓴다(불변식 "없음 vs
 * 못 봄"). 읽기 자체는 여전히 throw 하지 않는다 — 판단은 호출자 몫이다.
 */
export function readQaHistory(base: string, sid: string): QaHistory {
  const file = qaHistoryFile(base, sid);
  if (!file) return { revisions: [] };
  if (!fs.existsSync(file)) return { revisions: [] }; // 부재 = 아직 아무도 안 답함(정직한 empty)
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return { revisions: [], corrupt: true }; // 파일은 있는데 못 읽음
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { revisions: [], corrupt: true };
  const revs = (raw as QaHistory).revisions;
  if (!Array.isArray(revs)) return { revisions: [], corrupt: true };
  const clean = revs.filter(isQaRevision);
  // 원소 일부가 쓰레기면 그것도 손상이다 — 걸러낸 채 되쓰면 그 항목이 소리 없이 사라진다.
  return clean.length === revs.length
    ? { revisions: clean }
    : { revisions: clean, corrupt: true };
}

/**
 * 답변 revision append — 신규 파일 생성·기존 append 둘 다. 붙인 revision 을 반환.
 *
 * **null 을 돌려주는 두 경우**(호출자는 반드시 실패로 다뤄야 한다):
 *  1. 무효 sid(traversal 차단)
 *  2. **원장이 손상됨** — 덮어쓰면 rev 1~N 의 문답 계보가 경고 없이 사라진다. 답변 원장은 설계 §3.2
 *     가 "영속 진실원본·append-only" 로 규정한 파일이라 **파기보다 거절이 맞다**. 사람이 파일을
 *     보고 고치거나 치우게 한다(자동 rename 은 "고쳤다"는 착각을 준다).
 *
 * `rev` 는 **기존 최대 rev + 1**이다(길이+1 이 아니라) — 수기편집으로 배열이 짧아져도 번호가
 * 뒤로 감기지 않는다. 번호가 겹치면 "언제 뭘 답했나"의 순서가 무너진다.
 *
 * 쓰기는 **tmp + rename** 으로 원자화한다 — 직접 쓰다 크래시하면 절단된 파일이 남고, 그게 바로
 * 위 2번(손상)을 만드는 경로다.
 */
export function appendQaRevision(base: string, sid: string, qas: QaEntry[]): QaRevision | null {
  const file = qaHistoryFile(base, sid);
  const dir = rtmSessionDir(base, sid);
  if (!file || !dir) return null;
  const history = readQaHistory(base, sid);
  if (history.corrupt) return null; // ★ 조용한 파기 금지 — 거절한다
  const maxRev = history.revisions.reduce((m, r) => Math.max(m, Number(r?.rev) || 0), 0);
  const revision: QaRevision = { rev: maxRev + 1, answeredAt: new Date().toISOString(), qas };
  const next: QaHistory = { revisions: [...history.revisions, revision] };
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
  return revision;
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
