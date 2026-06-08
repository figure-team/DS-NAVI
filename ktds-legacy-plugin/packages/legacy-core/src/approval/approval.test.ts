import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Claim } from "../types.js";
import {
  listDrafts, startReview, confirmClaim, confirmAndLog,
  approveDoc, returnDoc, loadApprovals,
} from "./index.js";
import { setDocState, getDocState } from "../doc-state/index.js";
import { readAudit } from "../audit/index.js";

describe("approval workflow", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "ktds-appr-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("confirmClaim turns an INFERRED claim into CONFIRMED_HUMAN", () => {
    const claim: Claim = { claim: "x", confidence: "INFERRED", evidence: [], requires_human_review: true };
    const out = confirmClaim(claim);
    expect(out.confidence).toBe("CONFIRMED_HUMAN");
    expect(out.requires_human_review).toBe(false);
  });

  it("confirmAndLog emits DOC_ITEM_CONFIRMED (A17b)", async () => {
    const claim: Claim = { claim: "LoginController handles /login", confidence: "INFERRED", evidence: [], requires_human_review: true };
    await confirmAndLog(dir, "04_api-spec.md", claim, "kim");
    const events = await readAudit(dir);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "DOC_ITEM_CONFIRMED", doc: "04_api-spec.md", by: "kim" });
  });

  it("full DRAFT → UNDER_REVIEW → APPROVED flow + approvals.json + audit (A7)", async () => {
    await setDocState(dir, "04_api-spec.md", "UNDER_REVIEW"); // seed (after review)
    const rec = await approveDoc(dir, "04_api-spec.md", "kim");
    expect(rec).toMatchObject({ doc: "04_api-spec.md", by: "kim" });
    expect(rec.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(await getDocState(dir, "04_api-spec.md")).toBe("APPROVED");
    const approvals = JSON.parse(await readFile(join(dir, "approvals.json"), "utf-8"));
    expect(approvals).toHaveLength(1);
    expect(approvals[0].by).toBe("kim");

    const audit = await readAudit(dir);
    expect(audit.some((e) => e.type === "DOC_APPROVED" && e.doc === "04_api-spec.md")).toBe(true);
  });

  it("approving a doc that is not UNDER_REVIEW is rejected (A8)", async () => {
    // doc is DRAFT (default) → DRAFT→APPROVED is illegal
    await expect(approveDoc(dir, "fresh.md", "kim")).rejects.toThrow(/illegal transition/);
    expect(await loadApprovals(dir)).toEqual([]); // nothing recorded
  });

  it("startReview / returnDoc drive the state machine", async () => {
    await startReview(dir, "d.md");
    expect(await getDocState(dir, "d.md")).toBe("UNDER_REVIEW");
    await returnDoc(dir, "d.md");
    expect(await getDocState(dir, "d.md")).toBe("RETURNED");
    expect(await listDrafts(dir)).toEqual([]); // RETURNED is not DRAFT
  });

  it("listDrafts returns only DRAFT docs", async () => {
    await setDocState(dir, "draft.md", "UNDER_REVIEW");
    await setDocState(dir, "draft.md", "RETURNED");
    await setDocState(dir, "draft.md", "DRAFT");
    await setDocState(dir, "review.md", "UNDER_REVIEW");
    const drafts = await listDrafts(dir);
    expect(drafts.map((d) => d.doc)).toEqual(["draft.md"]);
  });

  it("throws (records nothing) on corrupt approvals.json", async () => {
    await setDocState(dir, "d.md", "UNDER_REVIEW");
    await writeFile(join(dir, "approvals.json"), "{ broken", "utf-8");
    await expect(approveDoc(dir, "d.md", "kim")).rejects.toThrow(/corrupt/);
    // state was NOT flipped to APPROVED (validation/record happens before the final setDocState)
    await expect(getDocState(dir, "d.md")).resolves.toBe("UNDER_REVIEW");
  });
});
