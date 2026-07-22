import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deriveIncidentRows,
  deriveIntakeRows,
  mapPromotedSids,
  mergeImpactHistory,
  resolveImpactSnapshot,
  type LedgerRowLike,
} from "./impact-federation";

let ua: string; // .understand-anything 상당의 임시 루트
let rtmBase: string;
let incidentsDir: string;
let historyDir: string;

beforeEach(() => {
  ua = fs.mkdtempSync(path.join(os.tmpdir(), "impact-fed-"));
  rtmBase = path.join(ua, "rtm-intake");
  incidentsDir = path.join(ua, "incidents");
  historyDir = path.join(ua, "impact-history");
  fs.mkdirSync(rtmBase, { recursive: true });
  fs.mkdirSync(incidentsDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(ua, { recursive: true, force: true });
});

const JOB_A = "a".repeat(16);
const JOB_B = "b".repeat(16);
const JOB_C = "c".repeat(16);

function writeIntakeSession(sid: string, ptr: Record<string, unknown>, withSnap: boolean): void {
  const dir = path.join(rtmBase, sid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "impact-run.json"), JSON.stringify(ptr));
  if (withSnap) {
    fs.mkdirSync(path.join(dir, "impact"), { recursive: true });
    fs.writeFileSync(path.join(dir, "impact", "impact.json"), "{}");
    fs.writeFileSync(path.join(dir, "impact", "impact-verify-report.json"), "{}");
  }
}

function writeIncidentSnap(runId: string): void {
  fs.mkdirSync(path.join(incidentsDir, runId), { recursive: true });
  fs.writeFileSync(path.join(incidentsDir, runId, "impact.json"), "{}");
}

function ledgerRow(jobId: string, over: Partial<LedgerRowLike> = {}): LedgerRowLike {
  return { jobId, query: "q", finishedAt: "2026-07-01T00:00:00.000Z", files: ["impact.json"], rootSlot: true, ...over };
}

describe("deriveIntakeRows", () => {
  it("포인터 있는 세션마다 행을 만들고 스냅샷 유무를 files 로 말한다", () => {
    writeIntakeSession("s1", { jobId: JOB_A, query: "로그인 추가", finishedAt: "2026-07-20T00:00:00.000Z", gitCommit: "abc" }, true);
    writeIntakeSession("s2", { jobId: JOB_B, query: "탈퇴", finishedAt: "2026-07-19T00:00:00.000Z" }, false);
    const rows = deriveIntakeRows(rtmBase, [
      { sid: "s1", request: "로그인 추가", discarded: false },
      { sid: "s2", request: "탈퇴", discarded: true },
      { sid: "s3", request: "포인터 없음", discarded: false },
    ]);
    expect(rows.map((r) => r.jobId)).toEqual([JOB_A, JOB_B]);
    expect(rows[0]).toMatchObject({ source: "intake", kind: "intake", ref: { sid: "s1" }, rootSlot: false, discarded: false, gitCommit: "abc" });
    expect(rows[0].files).toContain("impact.json");
    expect(rows[1].files).toEqual([]); // 스냅샷 없음 = 정직한 빈 목록(열람 불가 표시)
    expect(rows[1].discarded).toBe(true); // 폐기 세션도 숨기지 않는다
  });

  it("구 포인터(finishedAt 부재)는 mtime 으로 근사한다", () => {
    writeIntakeSession("s1", { jobId: JOB_A, query: "q" }, true);
    const rows = deriveIntakeRows(rtmBase, [{ sid: "s1", request: "q", discarded: false }]);
    expect(rows[0].finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("레거시 스냅샷(구 원장 디렉터리)만 있어도 열람 가능으로 판정한다", () => {
    writeIntakeSession("s1", { jobId: JOB_A, query: "q" }, false);
    fs.mkdirSync(path.join(historyDir, JOB_A), { recursive: true });
    fs.writeFileSync(path.join(historyDir, JOB_A, "impact.json"), "{}");
    const rows = deriveIntakeRows(rtmBase, [{ sid: "s1", request: "q", discarded: false }]);
    expect(rows[0].files).toContain("impact.json");
  });
});

describe("deriveIncidentRows", () => {
  it("jobId 가 박힌 건(analyzed 이상)만 행이 되고 상태를 병기한다", () => {
    writeIncidentSnap("run-1");
    const rows = deriveIncidentRows(incidentsDir, [
      { runId: "run-1", jobId: JOB_A, title: "결제 NPE", status: "resolved", analyzedAt: "2026-07-21T00:00:00.000Z", analyzedGitCommit: "abc", seedGate: "user-confirmed" },
      { runId: "run-2", title: "미분석 건", status: "seeded" }, // jobId 없음 = 행 없음
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      jobId: JOB_A,
      query: "[장애] 결제 NPE",
      source: "incident",
      kind: "incident",
      ref: { runId: "run-1" },
      incidentStatus: "resolved",
      rootSlot: false,
      seedGate: "user-confirmed",
      gitCommit: "abc",
      finishedAt: "2026-07-21T00:00:00.000Z",
    });
  });

  it("analyzedAt 부재(구 항목)는 스냅샷 mtime → ingestedAt 순으로 근사한다", () => {
    const rows = deriveIncidentRows(incidentsDir, [
      { runId: "run-9", jobId: JOB_B, title: "t", status: "analyzed", ingestedAt: "2026-07-10T00:00:00.000Z" },
    ]);
    expect(rows[0].finishedAt).toBe("2026-07-10T00:00:00.000Z"); // 스냅샷 없음 → ingestedAt
    expect(rows[0].files).toEqual([]);
  });
});

describe("mergeImpactHistory", () => {
  it("파생 행이 레거시 짝(jobId 동일)을 이기고, 짝 없는 레거시는 출처 후행 태깅으로 남는다", () => {
    const ledger: LedgerRowLike[] = [
      ledgerRow(JOB_C, { finishedAt: "2026-07-22T00:00:00.000Z" }), // change(루트 슬롯)
      ledgerRow(JOB_A, { rootSlot: false, query: "구 intake 기록", finishedAt: "2026-07-18T00:00:00.000Z" }), // 파생 짝 있음 → 탈락
      ledgerRow(JOB_B, { rootSlot: false, query: "[장애] 구 기록", finishedAt: "2026-07-17T00:00:00.000Z" }), // 짝 없음 → 잔존
    ];
    const intake = deriveIntakeRowsFixture(JOB_A, "2026-07-20T00:00:00.000Z");
    const merged = mergeImpactHistory(ledger, intake, [], 50);
    expect(merged.map((r) => r.jobId)).toEqual([JOB_C, JOB_A, JOB_B]); // finishedAt 내림차순
    expect(merged[0].source).toBe("change");
    expect(merged[1].source).toBe("intake"); // 파생 행이 이겼다(레거시 구 항목 아님)
    expect(merged[1].query).toBe("신 파생 행");
    expect(merged[2].source).toBe("incident"); // [장애] 접두 후행 태깅
  });

  it("표시 상한을 자른다", () => {
    const ledger = [ledgerRow(JOB_A), ledgerRow(JOB_B, { finishedAt: "2026-06-01T00:00:00.000Z" })];
    expect(mergeImpactHistory(ledger, [], [], 1)).toHaveLength(1);
  });

  function deriveIntakeRowsFixture(jobId: string, finishedAt: string) {
    writeIntakeSession("sx", { jobId, query: "신 파생 행", finishedAt }, true);
    return deriveIntakeRows(rtmBase, [{ sid: "sx", request: "신 파생 행", discarded: false }]);
  }
});

describe("mapPromotedSids", () => {
  const writeSession = (sid: string, origin: unknown): void => {
    fs.mkdirSync(path.join(rtmBase, sid), { recursive: true });
    fs.writeFileSync(path.join(rtmBase, sid, "session.json"), JSON.stringify({ sid, origin }));
  };

  it("origin.jobId → sid 역인덱스 — 폐기 세션 제외, 최신(앞선 항목) 우선", () => {
    writeSession("s-new", { jobId: JOB_A, query: "q" });
    writeSession("s-old", { jobId: JOB_A, query: "q" });
    writeSession("s-discarded", { jobId: JOB_B, query: "q" });
    writeSession("s-plain", null); // 유래 없는 일반 세션
    const map = mapPromotedSids(rtmBase, [
      { sid: "s-new", request: "q", discarded: false },
      { sid: "s-old", request: "q", discarded: false },
      { sid: "s-discarded", request: "q", discarded: true },
      { sid: "s-plain", request: "q", discarded: false },
      { sid: "s-missing", request: "q", discarded: false }, // 파일 부재 — 관용 스킵
    ]);
    expect(map).toEqual({ [JOB_A]: "s-new" }); // 폐기(JOB_B) 제외 · 최신 s-new 가 이김
  });
});

describe("resolveImpactSnapshot", () => {
  const opts = () => ({
    historyDir,
    rtmBase,
    intakeSessions: [{ sid: "s1", request: "q", discarded: false }],
    incidentsDir,
    incidentEntries: [{ runId: "run-1", jobId: JOB_B }] as Array<Record<string, unknown>>,
  });

  it("원장 스냅샷(change·레거시)이 1순위다", () => {
    fs.mkdirSync(path.join(historyDir, JOB_A), { recursive: true });
    fs.writeFileSync(path.join(historyDir, JOB_A, "impact.json"), "{}");
    expect(resolveImpactSnapshot(opts(), JOB_A, "impact.json")).toBe(path.join(historyDir, JOB_A, "impact.json"));
  });

  it("세션 스냅샷은 포인터 jobId 가 일치할 때만 해석된다", () => {
    writeIntakeSession("s1", { jobId: JOB_A }, true);
    expect(resolveImpactSnapshot(opts(), JOB_A, "impact.json")).toBe(path.join(rtmBase, "s1", "impact", "impact.json"));
    expect(resolveImpactSnapshot(opts(), JOB_C, "impact.json")).toBeNull(); // 다른 jobId 로는 못 연다
  });

  it("장애 건 디렉터리는 원장에 박힌 jobId↔runId 로만 해석된다", () => {
    writeIncidentSnap("run-1");
    expect(resolveImpactSnapshot(opts(), JOB_B, "impact.json")).toBe(path.join(incidentsDir, "run-1", "impact.json"));
  });

  it("어디에도 없으면 null(404) — 조용한 빈 결과로 위장하지 않는다", () => {
    expect(resolveImpactSnapshot(opts(), JOB_C, "impact.json")).toBeNull();
  });
});
