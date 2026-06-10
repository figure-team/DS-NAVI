import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ApprovalRecord, Claim, DocState } from "../types.js";
import { CONFIDENCE_TAG, CLAIMS_FENCE_OPEN, CLAIMS_FENCE_CLOSE } from "../types.js";
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

// ── .md ↔ claim 매핑 (plan A17b — 인터랙티브 확정) ──────────────────────────
// doc-generator renderClaim()의 역방향: 발행된 마크다운에서 claims 펜스 안의
// `- [추정] ` 라인을 찾아 확정한다. 접두사/펜스는 types.ts 상수에서 조립해
// 렌더러와 동기화를 유지한다. 펜스 밖(LLM prose)의 유사 불릿은 claim이 아니다.
const INFERRED_PREFIX = `- ${CONFIDENCE_TAG.INFERRED} `;
const CONFIRMED_PREFIX = `- ${CONFIDENCE_TAG.CONFIRMED_HUMAN} `;

export interface InferredItem {
  /** 1-based ordinal among the doc's current [추정] items (display order; shifts as items are confirmed). */
  index: number;
  /** 1-based line number in the published markdown — stable key for confirmInferredLine. */
  line: number;
  /** Claim text after the tag (any evidence cite suffix preserved verbatim). */
  text: string;
}

/** 펜스 안의 [추정] claim 라인들의 0-based 인덱스 집합 (list/confirm 공용 스캔). */
function scanInferredLines(mdLines: string[]): Set<number> {
  const hits = new Set<number>();
  let inClaims = false;
  mdLines.forEach((l, i) => {
    if (l === CLAIMS_FENCE_OPEN) inClaims = true;
    else if (l === CLAIMS_FENCE_CLOSE) inClaims = false;
    else if (inClaims && l.startsWith(INFERRED_PREFIX)) hits.add(i);
  });
  return hits;
}

/** List the [추정] claim lines of a published doc (`docsDir/doc`). */
export async function listInferredItems(docsDir: string, doc: string): Promise<InferredItem[]> {
  const mdLines = (await readFile(join(docsDir, doc), "utf-8")).split("\n");
  const items: InferredItem[] = [];
  for (const i of [...scanInferredLines(mdLines)].sort((a, b) => a - b)) {
    items.push({ index: items.length + 1, line: i + 1, text: mdLines[i].slice(INFERRED_PREFIX.length) });
  }
  return items;
}

/**
 * Confirm one [추정] line of a published doc as [확정(담당자)] (plan A17b).
 * Guards: non-empty `by` handle (O3 — the only accountability record), doc must
 * be UNDER_REVIEW (review → confirm → approve), and `line` must currently hold
 * an [추정] claim inside the claims fence. Ordering mirrors approveDoc
 * (crash-gap safety): validate → audit (DOC_ITEM_CONFIRMED) → rewrite the .md
 * LAST, so a mid-write failure leaves the tag unconfirmed (retryable; at worst
 * a duplicate audit event) rather than a confirmed tag with no audit trail.
 * 동시 검토자가 같은 라인을 다른 [추정] claim으로 바꿔치기하는 경쟁은 범위 밖
 * (UNDER_REVIEW 단일 검토자 가정) — 재검증이 non-claim 오태깅만은 막아준다.
 */
export async function confirmInferredLine(
  specDir: string,
  docsDir: string,
  doc: string,
  line: number,
  by: string
): Promise<Claim> {
  const handle = by.trim();
  if (!handle) {
    throw new Error("[approval] confirmer handle (by) must be non-empty");
  }
  const state = await getDocState(specDir, doc);
  if (state !== "UNDER_REVIEW") {
    throw new Error(`[approval] cannot confirm in state ${state} (start review first: DRAFT -> UNDER_REVIEW)`);
  }
  const path = join(docsDir, doc);
  const lines = (await readFile(path, "utf-8")).split("\n");
  if (!scanInferredLines(lines).has(line - 1)) {
    throw new Error(`[approval] ${doc}:${line} is not an ${CONFIDENCE_TAG.INFERRED} claim line`);
  }
  const text = lines[line - 1].slice(INFERRED_PREFIX.length);
  const claim: Claim = { claim: text, confidence: "INFERRED", evidence: [], requires_human_review: true };
  const confirmed = await confirmAndLog(specDir, doc, claim, handle);
  lines[line - 1] = CONFIRMED_PREFIX + text;
  await writeFile(path, lines.join("\n"), "utf-8");
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
