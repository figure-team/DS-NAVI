import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ApprovalRecord, Claim, DocState } from "../types.js";
import { setDocState, getDocState, loadDocStatus, transition } from "../doc-state/index.js";
import { logEvent } from "../audit/index.js";

/**
 * ApprovalWorkflow (plan §3.3 / §7.2): review → confirm [추정] → approve.
 * Composes doc-state (transitions) + audit (events). 승인자 식별은 핸들/이니셜만(O3).
 */

const APPROVALS_FILE = "approvals.json";

export interface DraftEntry {
  doc: string;
  state: DocState;
}

/** List docs in DRAFT (plan: `review --list`). */
export async function listDrafts(specDir: string): Promise<DraftEntry[]> {
  const map = await loadDocStatus(specDir);
  return Object.entries(map)
    .filter(([, state]) => state === "DRAFT")
    .map(([doc, state]) => ({ doc, state }));
}

/** Begin review of a doc: DRAFT → UNDER_REVIEW. */
export async function startReview(specDir: string, doc: string): Promise<void> {
  await setDocState(specDir, doc, "UNDER_REVIEW");
}

/**
 * Confirm an [추정]/INFERRED claim as human-confirmed ([확정(담당자)]).
 * Pure data mutation; the confirmer handle is recorded via audit by the caller
 * or via `confirmAndLog`. (`by` is a handle/initials, not a real name — O3.)
 */
export function confirmClaim(claim: Claim): Claim {
  return { ...claim, confidence: "CONFIRMED_HUMAN", requires_human_review: false };
}

/** Confirm a claim and emit DOC_ITEM_CONFIRMED (A17b). */
export async function confirmAndLog(
  specDir: string,
  doc: string,
  claim: Claim,
  by: string
): Promise<Claim> {
  const confirmed = confirmClaim(claim);
  await logEvent(specDir, "DOC_ITEM_CONFIRMED", { doc, by, detail: { claim: claim.claim } });
  return confirmed;
}

export async function loadApprovals(specDir: string): Promise<ApprovalRecord[]> {
  let raw: string;
  try {
    raw = await readFile(join(specDir, APPROVALS_FILE), "utf-8");
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[approval] ${APPROVALS_FILE} is corrupt (invalid JSON)`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`[approval] ${APPROVALS_FILE} is malformed (expected an array)`);
  }
  return parsed as ApprovalRecord[];
}

/**
 * Approve a doc: UNDER_REVIEW → APPROVED. `by` = handle/initials (O3).
 * Ordering (crash-gap safety): validate the transition early (illegal approve
 * records nothing), persist approvals.json + audit, then flip state LAST — so a
 * mid-write failure leaves the doc UNDER_REVIEW (retryable) rather than an
 * APPROVED doc with no approval record.
 */
export async function approveDoc(specDir: string, doc: string, by: string): Promise<ApprovalRecord> {
  const from = await getDocState(specDir, doc);
  transition(from, "APPROVED"); // pure validation; throws if not UNDER_REVIEW, persists nothing

  const record: ApprovalRecord = { doc, by, at: new Date().toISOString() };
  const approvals = await loadApprovals(specDir);
  approvals.push(record);
  const path = join(specDir, APPROVALS_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(approvals, null, 2), "utf-8");
  await logEvent(specDir, "DOC_APPROVED", { doc, by });

  await setDocState(specDir, doc, "APPROVED"); // flip state last
  return record;
}

/** Return a doc for revision: UNDER_REVIEW → RETURNED. */
export async function returnDoc(specDir: string, doc: string): Promise<void> {
  await setDocState(specDir, doc, "RETURNED");
}

function isENOENT(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
