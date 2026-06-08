import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  canTransition, transition, allowedNext,
  getDocState, setDocState, loadDocStatus,
} from "./index.js";

describe("transition rules (pure)", () => {
  it("allows the legal forward path", () => {
    expect(canTransition("DRAFT", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "RETURNED")).toBe(true);
    expect(canTransition("RETURNED", "DRAFT")).toBe(true);
  });

  it("rejects illegal transitions (A8)", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("APPROVED", "DRAFT")).toBe(false);
    expect(canTransition("DRAFT", "RETURNED")).toBe(false);
    expect(() => transition("DRAFT", "APPROVED")).toThrow(/illegal transition/);
  });

  it("APPROVED is terminal", () => {
    expect(allowedNext("APPROVED")).toEqual([]);
  });
});

describe("persistence", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-state-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("defaults unknown docs to DRAFT", async () => {
    expect(await getDocState(dir, "01_tech-stack.md")).toBe("DRAFT");
  });

  it("persists a legal transition and rejects an illegal one", async () => {
    await setDocState(dir, "doc.md", "UNDER_REVIEW");
    expect(await getDocState(dir, "doc.md")).toBe("UNDER_REVIEW");
    await setDocState(dir, "doc.md", "APPROVED");
    expect(await getDocState(dir, "doc.md")).toBe("APPROVED");
    // APPROVED is terminal → any further move illegal
    await expect(setDocState(dir, "doc.md", "DRAFT")).rejects.toThrow(/illegal transition/);
  });

  it("supports the RETURNED → DRAFT revision loop", async () => {
    await setDocState(dir, "d.md", "UNDER_REVIEW");
    await setDocState(dir, "d.md", "RETURNED");
    await setDocState(dir, "d.md", "DRAFT");
    expect(await getDocState(dir, "d.md")).toBe("DRAFT");
  });

  it("writes a readable doc-status.json map", async () => {
    await setDocState(dir, "a.md", "UNDER_REVIEW");
    const map = JSON.parse(await readFile(join(dir, "doc-status.json"), "utf-8"));
    expect(map).toEqual({ "a.md": "UNDER_REVIEW" });
    expect(await loadDocStatus(dir)).toEqual({ "a.md": "UNDER_REVIEW" });
  });

  it("throws a contextual error on corrupt doc-status.json (invalid JSON)", async () => {
    await writeFile(join(dir, "doc-status.json"), "{ not json", "utf-8");
    await expect(loadDocStatus(dir)).rejects.toThrow(/corrupt/);
  });

  it("throws when doc-status.json is the wrong shape (array)", async () => {
    await writeFile(join(dir, "doc-status.json"), "[]", "utf-8");
    await expect(loadDocStatus(dir)).rejects.toThrow(/malformed/);
  });
});
