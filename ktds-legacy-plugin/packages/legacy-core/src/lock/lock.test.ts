import { mkdtemp, rm, writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  acquireLock, releaseLock, isLocked, isProcessAlive,
  withStaging, publishStaging,
} from "./index.js";

const DEAD_PID = 2147483646; // implausibly high → ESRCH → not alive

describe("analysis lock", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-lock-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("acquires when no lock exists, records pid", async () => {
    const r = await acquireLock(dir);
    expect(r).toEqual({ acquired: true, staleRemoved: false });
    expect(await isLocked(dir)).toBe(true);
    const info = JSON.parse(await readFile(join(dir, ".analysis.lock"), "utf-8"));
    expect(info.pid).toBe(process.pid);
  });

  it("refuses when a LIVE pid holds the lock", async () => {
    await writeFile(join(dir, ".analysis.lock"),
      JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }), "utf-8");
    await expect(acquireLock(dir)).rejects.toThrow(/already running/);
  });

  it("clears a STALE (dead pid) lock and reports staleRemoved", async () => {
    await writeFile(join(dir, ".analysis.lock"),
      JSON.stringify({ pid: DEAD_PID, ts: "2020-01-01T00:00:00Z" }), "utf-8");
    const r = await acquireLock(dir);
    expect(r.staleRemoved).toBe(true);
    const info = JSON.parse(await readFile(join(dir, ".analysis.lock"), "utf-8"));
    expect(info.pid).toBe(process.pid); // now ours
  });

  it("releaseLock removes the lock (idempotent)", async () => {
    await acquireLock(dir);
    await releaseLock(dir);
    expect(await isLocked(dir)).toBe(false);
    await releaseLock(dir); // no throw on missing
  });

  it("isProcessAlive: own pid alive, implausible/invalid pid dead", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(DEAD_PID)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(NaN)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
  });
});

describe("staging → atomic publish", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-stage-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("discards the staging tree if fn throws (existing outputs untouched)", async () => {
    await expect(
      withStaging(dir, "run-1", async (staging) => {
        await writeFile(join(staging, "partial.md"), "x", "utf-8");
        throw new Error("LLM failed");
      })
    ).rejects.toThrow("LLM failed");
    // run dir fully removed
    await expect(readdir(join(dir, "runs", "run-1"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishStaging moves staged files into the target dir", async () => {
    const target = join(dir, "docs");
    const { stagingDir } = await withStaging(dir, "run-2", async (staging) => {
      await writeFile(join(staging, "01_tech-stack.md"), "# tech", "utf-8");
      await writeFile(join(staging, "02_architecture.md"), "# arch", "utf-8");
    });
    const published = await publishStaging(stagingDir, target);
    expect(published.sort()).toEqual(["01_tech-stack.md", "02_architecture.md"]);
    expect(await readFile(join(target, "01_tech-stack.md"), "utf-8")).toBe("# tech");
    // staging now empty
    expect(await readdir(stagingDir)).toEqual([]);
  });
});
