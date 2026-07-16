import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECONCILE_GRACE_MS } from "./job-ledger";
import {
  isValidSid,
  latestRtmSession,
  listRtmSessions,
  pruneRtmSessions,
  readAllRtmSessions,
  readRtmSession,
  reconcileRtmSessions,
  RTM_SESSION_SCHEMA_VERSION,
  rtmSessionDir,
  writeRtmSession,
  type RtmSession,
  type RtmStepStatus,
} from "./rtm-sessions";

let base: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), "rtm-sessions-"));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

const sid = (n: number): string => n.toString(16).padStart(16, "0");
const never = (): boolean => false;

/**
 * 세션 1건 생성 — steps 는 전부 pending, createdAt 은 인자로 고정(정렬 검증용).
 * **현행 스키마(v2 = 6단계)로 쓴다** — 구 5단계 세션의 마이그레이션은 아래 전용 describe 가 다룬다.
 */
function seed(n: number, createdAt: string, over: Partial<RtmSession> = {}): RtmSession {
  const s: RtmSession = {
    schemaVersion: RTM_SESSION_SCHEMA_VERSION,
    sid: sid(n),
    request: `요청 ${n}`,
    createdAt,
    producedStep: 0,
    confirmedStep: 0,
    targetStep: 6,
    discarded: false,
    steps: { "1": { status: "pending" }, "2": { status: "pending" } },
    ...over,
  };
  writeRtmSession(base, s);
  return s;
}

/** 구 5단계 세션(schemaVersion 없음)을 **날것으로** 디스크에 쓴다 — 마이그레이션 입력. */
function seedLegacy(n: number, over: Record<string, unknown> = {}): void {
  const dir = path.join(base, sid(n));
  fs.mkdirSync(dir, { recursive: true });
  const s = {
    sid: sid(n),
    request: `구 요청 ${n}`,
    createdAt: "2026-07-16T00:00:00.000Z",
    producedStep: 1,
    confirmedStep: 0,
    targetStep: 1,
    discarded: false,
    steps: {
      "1": { status: "produced" },
      "2": { status: "pending" },
      "3": { status: "pending" },
      "4": { status: "pending" },
      "5": { status: "pending" },
    },
    ...over,
  };
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(s, null, 2) + "\n", "utf8");
}

/** 구 ①이 코드영향까지 돌린 흔적 — 마이그레이션이 ② 승격 근거로 삼는 관측 사실. */
function seedImpactRun(n: number): void {
  fs.writeFileSync(path.join(base, sid(n), "impact-run.json"), JSON.stringify({ jobId: "j1" }), "utf8");
}

/** session.json 의 mtime 을 과거로 밀어 "마지막 전이 이후 경과"를 흉내낸다. */
function backdate(n: number, agoMs: number): void {
  const file = path.join(base, sid(n), "session.json");
  const t = new Date(Date.now() - agoMs);
  fs.utimesSync(file, t, t);
}

const stepStatus = (n: number, k: string): RtmStepStatus | undefined =>
  readRtmSession(base, sid(n))?.steps[k]?.status;

describe("isValidSid / rtmSessionDir", () => {
  it("16진 8~32자만 통과 — traversal 은 차단", () => {
    expect(isValidSid(sid(1))).toBe(true);
    expect(isValidSid("../../etc")).toBe(false);
    expect(isValidSid("ABCDEF12")).toBe(false); // 대문자 불가
    expect(isValidSid("abc")).toBe(false); // 8자 미만
  });

  it("무효 sid 는 경로를 내주지 않는다", () => {
    expect(rtmSessionDir(base, sid(1))).toBe(path.resolve(base, sid(1)));
    expect(rtmSessionDir(base, "../escape")).toBeNull();
    expect(rtmSessionDir(base, "")).toBeNull();
  });
});

describe("readAllRtmSessions / listRtmSessions", () => {
  it("base 부재는 빈 배열(정직한 empty)", () => {
    expect(readAllRtmSessions(path.join(base, "nope"))).toEqual([]);
    expect(listRtmSessions(path.join(base, "nope"), never)).toEqual([]);
  });

  it("세션 3개 → 목록 3건, createdAt 내림차순 + 폐기 포함", () => {
    seed(1, "2026-07-12T00:00:00.000Z");
    seed(2, "2026-07-16T00:00:00.000Z");
    seed(3, "2026-07-14T00:00:00.000Z", { discarded: true });

    const list = listRtmSessions(base, never);
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.sid)).toEqual([sid(2), sid(3), sid(1)]);
    expect(list.map((s) => s.discarded)).toEqual([false, true, false]);
  });

  it("요약 필드 일습 + running 은 주입된 판정을 따른다", () => {
    seed(1, "2026-07-16T00:00:00.000Z", { producedStep: 2, confirmedStep: 1, targetStep: 3 });
    const [row] = listRtmSessions(base, (s) => s === sid(1));
    expect(row).toEqual({
      sid: sid(1),
      request: "요청 1",
      createdAt: "2026-07-16T00:00:00.000Z",
      producedStep: 2,
      confirmedStep: 1,
      targetStep: 3,
      discarded: false,
      running: true,
    });
  });

  it("전역 뮤텍스 — 여러 건이어도 running 은 최대 1건(C1)", () => {
    seed(1, "2026-07-12T00:00:00.000Z");
    seed(2, "2026-07-16T00:00:00.000Z");
    seed(3, "2026-07-14T00:00:00.000Z");
    // rtmTracker 는 sid 하나만 들고 있다 — 나머지는 "대기"가 아니라 running=false(중단됨).
    const list = listRtmSessions(base, (s) => s === sid(3));
    expect(list.filter((s) => s.running).map((s) => s.sid)).toEqual([sid(3)]);
  });

  it("무효 디렉터리·파손 session.json 은 건너뛴다", () => {
    seed(1, "2026-07-16T00:00:00.000Z");
    fs.mkdirSync(path.join(base, "not-a-sid"), { recursive: true });
    fs.mkdirSync(path.join(base, sid(9)), { recursive: true });
    fs.writeFileSync(path.join(base, sid(9), "session.json"), "not json", "utf8");
    expect(listRtmSessions(base, never).map((s) => s.sid)).toEqual([sid(1)]);
  });
});

describe("latestRtmSession", () => {
  it("가장 최근 비폐기 세션 — 폐기는 건너뛴다", () => {
    seed(1, "2026-07-12T00:00:00.000Z");
    seed(2, "2026-07-16T00:00:00.000Z", { discarded: true }); // 최신이지만 폐기
    seed(3, "2026-07-14T00:00:00.000Z");
    expect(latestRtmSession(base)?.sid).toBe(sid(3));
  });

  it("전부 폐기면 null", () => {
    seed(1, "2026-07-12T00:00:00.000Z", { discarded: true });
    expect(latestRtmSession(base)).toBeNull();
  });
});

describe("reconcileRtmSessions", () => {
  it("고착된 running → failed 로 영속(C3)", () => {
    seed(1, "2026-07-16T00:00:00.000Z", {
      steps: { "1": { status: "produced" }, "2": { status: "running" } },
    });
    backdate(1, RECONCILE_GRACE_MS + 60_000); // 유예 경과 = 죽은 프로세스

    expect(reconcileRtmSessions(base, never)).toBe(1);
    expect(stepStatus(1, "2")).toBe("failed");
    expect(stepStatus(1, "1")).toBe("produced"); // 다른 단계는 손대지 않는다
  });

  it("추적 중인 세션은 유예를 넘겨도 건드리지 않는다", () => {
    seed(1, "2026-07-16T00:00:00.000Z", { steps: { "1": { status: "running" } } });
    backdate(1, RECONCILE_GRACE_MS + 60_000);

    expect(reconcileRtmSessions(base, (s) => s === sid(1))).toBe(0);
    expect(stepStatus(1, "1")).toBe("running");
  });

  it("유예 내면 아직 돌고 있을 수 있어 보류 — 다음 조회 때 재판정", () => {
    seed(1, "2026-07-16T00:00:00.000Z", { steps: { "1": { status: "running" } } });
    backdate(1, RECONCILE_GRACE_MS - 60_000);

    expect(reconcileRtmSessions(base, never)).toBe(0);
    expect(stepStatus(1, "1")).toBe("running");
  });

  it("running 이 없으면 무변경(멱등)", () => {
    seed(1, "2026-07-16T00:00:00.000Z", { steps: { "1": { status: "confirmed" } } });
    backdate(1, RECONCILE_GRACE_MS + 60_000);
    expect(reconcileRtmSessions(base, never)).toBe(0);
    expect(reconcileRtmSessions(base, never)).toBe(0);
    expect(stepStatus(1, "1")).toBe("confirmed");
  });

  it("복원 후 목록은 고착된 실행 중을 더는 보여주지 않는다", () => {
    seed(1, "2026-07-16T00:00:00.000Z", { steps: { "1": { status: "running" } } });
    backdate(1, RECONCILE_GRACE_MS + 60_000);
    reconcileRtmSessions(base, never);
    expect(listRtmSessions(base, never)[0].running).toBe(false);
    expect(stepStatus(1, "1")).toBe("failed");
  });
});

describe("pruneRtmSessions", () => {
  const day = (n: number): string => `2026-07-${String(n).padStart(2, "0")}T00:00:00.000Z`;

  it("상한 이하면 아무것도 지우지 않는다", () => {
    for (let n = 1; n <= 3; n++) seed(n, day(n));
    expect(pruneRtmSessions(base, never, 3)).toEqual([]);
    expect(readAllRtmSessions(base)).toHaveLength(3);
  });

  it("초과분은 오래된 것부터 디렉터리째 삭제", () => {
    for (let n = 1; n <= 5; n++) seed(n, day(n)); // sid(1) 이 가장 오래됨
    expect(pruneRtmSessions(base, never, 2)).toEqual([sid(3), sid(2), sid(1)]);
    expect(readAllRtmSessions(base).map((s) => s.sid)).toEqual([sid(5), sid(4)]);
    expect(fs.existsSync(path.join(base, sid(1)))).toBe(false); // 디렉터리 자체가 사라짐
  });

  it("진행 중 세션은 상한 밖이어도 보존", () => {
    for (let n = 1; n <= 5; n++) seed(n, day(n));
    // sid(1) 은 가장 오래됐지만 실행 중 — 절대 삭제 금지.
    expect(pruneRtmSessions(base, (s) => s === sid(1), 2)).toEqual([sid(3), sid(2)]);
    expect(readAllRtmSessions(base).map((s) => s.sid)).toEqual([sid(5), sid(4), sid(1)]);
    expect(fs.existsSync(path.join(base, sid(1), "session.json"))).toBe(true);
  });

  it("세션 디렉터리만 지운다 — base 의 다른 파일은 무사", () => {
    for (let n = 1; n <= 3; n++) seed(n, day(n));
    const bystander = path.join(base, "keep-me.json");
    fs.writeFileSync(bystander, "{}", "utf8");
    pruneRtmSessions(base, never, 1);
    expect(fs.existsSync(bystander)).toBe(true);
    expect(readAllRtmSessions(base).map((s) => s.sid)).toEqual([sid(3)]);
  });
});

// ── 구 5단계 → 6단계 마이그레이션(2026-07-16) ────────────────────────────────
describe("migrateRtmSession — 구 5단계 세션", () => {
  it("schemaVersion 부재 = 구 세션 → v2 로 재사상", () => {
    seedLegacy(1);
    const s = readRtmSession(base, sid(1))!;
    expect(s.schemaVersion).toBe(RTM_SESSION_SCHEMA_VERSION);
  });

  it("★ producedStep 1 + impact-run.json → ②까지 산출됨(구 ①이 code-impact 를 돌렸다)", () => {
    seedLegacy(1);
    seedImpactRun(1);
    const s = readRtmSession(base, sid(1))!;
    expect(s.producedStep).toBe(2);
    expect(s.steps["1"].status).toBe("produced");
    expect(s.steps["2"].status).toBe("produced");
  });

  it("★ impact-run.json 이 없으면 ①에 그대로 — 거짓 완료를 만들지 않는다", () => {
    seedLegacy(1);
    const s = readRtmSession(base, sid(1))!;
    expect(s.producedStep).toBe(1);
    expect(s.steps["2"].status).toBe("pending");
  });

  it("★ 구 ②③④⑤ → 신 ③④⑤⑥ (k+1) — 라벨이 따라간다", () => {
    // 구 producedStep 5 = 구 ⑤RTM 까지 = 신 ⑥RTM. 신 ⑤(명세서)로 오독하면 안 된다.
    seedLegacy(1, {
      producedStep: 5,
      confirmedStep: 4,
      targetStep: 5,
      steps: {
        "1": { status: "confirmed" }, "2": { status: "confirmed" }, "3": { status: "confirmed" },
        "4": { status: "confirmed" }, "5": { status: "produced" },
      },
    });
    const s = readRtmSession(base, sid(1))!;
    expect(s.producedStep).toBe(6);
    expect(s.confirmedStep).toBe(5);
    expect(s.steps["6"].status).toBe("produced"); // 구 ⑤RTM 이 신 ⑥RTM 자리로
  });

  it("★ confirmedStep 은 승격하지 않는다 — 안 누른 컨펌을 만들지 않는다", () => {
    // 구 ① 컨펌 + impact-run 존재 → produced 2 지만 confirmed 는 1 에 머문다.
    // 결과 confirmed(1) < produced(2) 라 서버 게이트가 ②를 컨펌하라고 정직하게 막는다.
    seedLegacy(1, { confirmedStep: 1, steps: { "1": { status: "confirmed" } } });
    seedImpactRun(1);
    const s = readRtmSession(base, sid(1))!;
    expect(s.producedStep).toBe(2);
    expect(s.confirmedStep).toBe(1);
    expect(s.steps["2"].status).toBe("produced");
  });

  it("★ 멱등 — 두 번 읽어도 단계가 또 밀리지 않는다(schemaVersion 이 막는다)", () => {
    seedLegacy(1, { producedStep: 3, targetStep: 5 });
    const once = readRtmSession(base, sid(1))!;
    writeRtmSession(base, once); // 정상 쓰기 경로가 v2 로 굳힌다
    const twice = readRtmSession(base, sid(1))!;
    expect(twice.producedStep).toBe(once.producedStep);
    expect(twice.producedStep).toBe(4);
    expect(twice.targetStep).toBe(once.targetStep);
  });

  it("★ 읽기는 디스크를 건드리지 않는다 — mtime 이 밀리면 reconcile 이 무력화된다", () => {
    seedLegacy(1);
    const file = path.join(base, sid(1), "session.json");
    const before = fs.statSync(file).mtimeMs;
    readRtmSession(base, sid(1));
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it("구 세션의 고착 running 도 reconcile 이 복원한다(마이그레이션과 공존)", () => {
    seedLegacy(1, { steps: { "1": { status: "running" } } });
    backdate(1, RECONCILE_GRACE_MS + 1000);
    expect(reconcileRtmSessions(base, never)).toBe(1);
    expect(stepStatus(1, "1")).toBe("failed");
  });
});
