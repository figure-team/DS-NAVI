import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { DocState } from "../types.js";

/**
 * DocStateMachine (plan §3.3 / §7.1):
 *   DRAFT ──► UNDER_REVIEW ──► APPROVED
 *     ▲            │
 *     └─ RETURNED ◄┘   (반려 후 수정 → DRAFT)
 */
const TRANSITIONS: Record<DocState, readonly DocState[]> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "RETURNED"],
  APPROVED: [],
  RETURNED: ["DRAFT"],
};

export function allowedNext(from: DocState): DocState[] {
  return [...TRANSITIONS[from]];
}

export function canTransition(from: DocState, to: DocState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Pure transition; throws on an illegal transition (A8). */
export function transition(from: DocState, to: DocState): DocState {
  if (!canTransition(from, to)) {
    throw new Error(`[doc-state] illegal transition ${from} -> ${to}`);
  }
  return to;
}

// ── Persistence (.spec/doc-status.json) ─────────────────────────────────────

const STATUS_FILE = "doc-status.json";

export type DocStatusMap = Record<string, DocState>;

export async function loadDocStatus(specDir: string): Promise<DocStatusMap> {
  let raw: string;
  try {
    raw = await readFile(join(specDir, STATUS_FILE), "utf-8");
  } catch (err) {
    if (isENOENT(err)) return {};
    throw err;
  }
  // Guard a crash-truncated / hand-corrupted status file (spec §2.2 anticipates crash-gaps).
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[doc-state] ${STATUS_FILE} is corrupt (invalid JSON)`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`[doc-state] ${STATUS_FILE} is malformed (expected an object map)`);
  }
  return parsed as DocStatusMap;
}

/** New docs default to DRAFT. */
export async function getDocState(specDir: string, doc: string): Promise<DocState> {
  const map = await loadDocStatus(specDir);
  return map[doc] ?? "DRAFT";
}

/**
 * Move a doc to `to`, enforcing the legal transition from its current state.
 * Persists the full map. Returns the new state.
 */
export async function setDocState(specDir: string, doc: string, to: DocState): Promise<DocState> {
  const map = await loadDocStatus(specDir);
  const from = map[doc] ?? "DRAFT";
  transition(from, to); // throws if illegal
  map[doc] = to;
  const path = join(specDir, STATUS_FILE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(map, null, 2), "utf-8");
  return to;
}

function isENOENT(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
