import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  artifactMtimeMs,
  readLedger,
  reconcilePendingJobs,
  removePendingMarker,
  writePendingMarker,
} from "./job-ledger";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-ledger-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const id = (n: number): string => n.toString(16).padStart(16, "0");

describe("readLedger / appendLedgerEntry", () => {
  it("부재/파손은 빈 배열(정직한 empty)", () => {
    expect(readLedger(dir)).toEqual([]);
    fs.writeFileSync(path.join(dir, "ledger.json"), "not json", "utf8");
    expect(readLedger(dir)).toEqual([]);
  });

  it("최신이 앞 + 동일 jobId dedup", () => {
    appendLedgerEntry(dir, { jobId: id(1), v: "a" }, 10);
    appendLedgerEntry(dir, { jobId: id(2), v: "b" }, 10);
    appendLedgerEntry(dir, { jobId: id(1), v: "a2" }, 10); // 재기록 — 옛 entry 제거
    expect(readLedger<{ jobId: string; v: string }>(dir).map((e) => e.v)).toEqual(["a2", "b"]);
  });

  it("상한 초과분은 잘리고 반환된다(스냅샷 정리용)", () => {
    // 매 append 가 상한으로 잘라 기록하므로 id(1) 은 세 번째 append 에서 이미 탈락.
    for (let n = 1; n <= 3; n++) appendLedgerEntry(dir, { jobId: id(n) }, 2);
    const dropped = appendLedgerEntry(dir, { jobId: id(4) }, 2);
    expect(dropped.map((e) => e.jobId)).toEqual([id(2)]);
    expect(readLedger(dir).map((e) => e.jobId)).toEqual([id(4), id(3)]);
  });
});

describe("pending 마커", () => {
  it("write 후 remove — 부재 remove 도 무해", () => {
    writePendingMarker(dir, { jobId: id(7), query: "q" });
    const file = path.join(dir, `pending-${id(7)}.json`);
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toMatchObject({ jobId: id(7), query: "q" });
    removePendingMarker(dir, id(7));
    expect(fs.existsSync(file)).toBe(false);
    removePendingMarker(dir, id(7)); // 멱등
  });
});

describe("artifactMtimeMs", () => {
  it("부재는 NaN, 존재는 mtime", () => {
    expect(Number.isNaN(artifactMtimeMs(path.join(dir, "nope.json")))).toBe(true);
    const f = path.join(dir, "a.json");
    fs.writeFileSync(f, "{}", "utf8");
    expect(artifactMtimeMs(f)).toBeGreaterThan(0);
  });
});

describe("reconcilePendingJobs", () => {
  const collect = (over: Partial<Parameters<typeof reconcilePendingJobs>[1]> = {}) => {
    const recorded: Array<{ pending: Record<string, unknown>; fresh: boolean }> = [];
    reconcilePendingJobs(dir, {
      isTracking: () => false,
      isRecorded: () => false,
      artifactMtimeMs: () => Number.NaN,
      record: (pending, fresh) => recorded.push({ pending, fresh }),
      ...over,
    });
    return recorded;
  };

  it("디렉터리 부재는 no-op", () => {
    fs.rmSync(dir, { recursive: true, force: true });
    expect(collect()).toEqual([]);
  });

  it("jobId 없는 마커는 제거만", () => {
    fs.writeFileSync(path.join(dir, `pending-${id(1)}.json`), "{}", "utf8");
    expect(collect()).toEqual([]);
    expect(fs.existsSync(path.join(dir, `pending-${id(1)}.json`))).toBe(false);
  });

  it("추적 중인 job 은 건너뛴다(마커 유지)", () => {
    writePendingMarker(dir, { jobId: id(2), startedAt: new Date().toISOString() });
    expect(collect({ isTracking: (j) => j === id(2) })).toEqual([]);
    expect(fs.existsSync(path.join(dir, `pending-${id(2)}.json`))).toBe(true);
  });

  it("이미 원장에 있으면 마커만 정리", () => {
    writePendingMarker(dir, { jobId: id(3) });
    expect(collect({ isRecorded: (j) => j === id(3) })).toEqual([]);
    expect(fs.existsSync(path.join(dir, `pending-${id(3)}.json`))).toBe(false);
  });

  it("산출물이 startedAt 이후 갱신 → fresh=true 로 record", () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    writePendingMarker(dir, { jobId: id(4), startedAt });
    const rec = collect({ artifactMtimeMs: () => Date.now() });
    expect(rec).toHaveLength(1);
    expect(rec[0].fresh).toBe(true);
  });

  it("산출물 없음 + 30분 유예 내 → 건너뛴다(고아 claude 가능성)", () => {
    writePendingMarker(dir, { jobId: id(5), startedAt: new Date(Date.now() - 60_000).toISOString() });
    expect(collect()).toEqual([]);
  });

  it("산출물 없음 + 유예 경과 → fresh=false 로 record", () => {
    const startedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    writePendingMarker(dir, { jobId: id(6), startedAt });
    const rec = collect();
    expect(rec).toHaveLength(1);
    expect(rec[0].fresh).toBe(false);
    expect(rec[0].pending.jobId).toBe(id(6));
  });

  it("파손된 pending 은 건너뛴다(다음 조회 때 재시도)", () => {
    fs.writeFileSync(path.join(dir, `pending-${id(8)}.json`), "not json", "utf8");
    expect(collect()).toEqual([]);
    expect(fs.existsSync(path.join(dir, `pending-${id(8)}.json`))).toBe(true);
  });
});
