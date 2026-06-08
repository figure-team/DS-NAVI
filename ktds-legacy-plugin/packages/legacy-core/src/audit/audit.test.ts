import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeEvent, appendAudit, logEvent, readAudit } from "./index.js";

describe("audit logger", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-audit-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("makeEvent stamps ts (ISO) and keeps fields", () => {
    const e = makeEvent("DOC_APPROVED", { doc: "x.md", by: "kim" });
    expect(e.type).toBe("DOC_APPROVED");
    expect(e.doc).toBe("x.md");
    expect(e.by).toBe("kim");
    expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("appendAudit writes a JSONL line into audit/<date>.jsonl", async () => {
    const e = makeEvent("DOC_GENERATED", { doc: "01.md" });
    await appendAudit(dir, e);
    const file = join(dir, "audit", `${e.ts.slice(0, 10)}.jsonl`);
    const raw = await readFile(file, "utf-8");
    expect(raw.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(raw.trim())).toMatchObject({ type: "DOC_GENERATED", doc: "01.md" });
  });

  it("logEvent appends and round-trips via readAudit", async () => {
    await logEvent(dir, "LLM_REQUEST", { runId: "r1" });
    await logEvent(dir, "DOC_APPROVED", { doc: "a.md", by: "kim" });
    const events = await readAudit(dir);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual(["LLM_REQUEST", "DOC_APPROVED"]);
  });

  it("readAudit filters by date and skips malformed lines", async () => {
    const auditDir = join(dir, "audit");
    await mkdir(auditDir, { recursive: true });
    await writeFile(join(auditDir, "2026-01-01.jsonl"),
      `${JSON.stringify({ ts: "2026-01-01T00:00:00Z", type: "DOC_GENERATED" })}\nNOT JSON\n`, "utf-8");
    await writeFile(join(auditDir, "2026-02-02.jsonl"),
      `${JSON.stringify({ ts: "2026-02-02T00:00:00Z", type: "DOC_APPROVED" })}\n`, "utf-8");

    const all = await readAudit(dir);
    expect(all).toHaveLength(2); // malformed line skipped
    const jan = await readAudit(dir, { date: "2026-01-01" });
    expect(jan).toHaveLength(1);
    expect(jan[0]!.type).toBe("DOC_GENERATED");
  });

  it("readAudit on a missing audit dir returns []", async () => {
    expect(await readAudit(dir)).toEqual([]);
  });

  it("returns events in chronological ts order across days", async () => {
    const auditDir = join(dir, "audit");
    await mkdir(auditDir, { recursive: true });
    await writeFile(join(auditDir, "2026-02-02.jsonl"),
      `${JSON.stringify({ ts: "2026-02-02T10:00:00Z", type: "DOC_APPROVED" })}\n`, "utf-8");
    await writeFile(join(auditDir, "2026-01-01.jsonl"),
      `${JSON.stringify({ ts: "2026-01-01T09:00:00Z", type: "DOC_GENERATED" })}\n`, "utf-8");
    const events = await readAudit(dir);
    expect(events.map((e) => e.ts)).toEqual(["2026-01-01T09:00:00Z", "2026-02-02T10:00:00Z"]);
  });
});
