import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEvent, AuditEventType } from "../types.js";

/**
 * AuditLogger (plan §3.3 / §7.3): append-only `.spec/audit/YYYY-MM-DD.jsonl`.
 * MVP event set only; security events (SECURITY_CLASSIFY, ...) are Phase 2.
 */
const AUDIT_DIR = "audit";

/** Bucket date = UTC date of the event ts (new Date().toISOString() is always Z). */
function dateOf(isoTs: string): string {
  return isoTs.slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Build an AuditEvent stamped with the current time. */
export function makeEvent(
  type: AuditEventType,
  fields: Omit<Partial<AuditEvent>, "ts" | "type"> = {}
): AuditEvent {
  return { ts: new Date().toISOString(), type, ...fields };
}

/** Append one event to today's (event.ts's) audit log. */
export async function appendAudit(specDir: string, event: AuditEvent): Promise<void> {
  const dir = join(specDir, AUDIT_DIR);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${dateOf(event.ts)}.jsonl`);
  await appendFile(file, JSON.stringify(event) + "\n", "utf-8");
}

/** Convenience: stamp + append in one call. */
export async function logEvent(
  specDir: string,
  type: AuditEventType,
  fields?: Omit<Partial<AuditEvent>, "ts" | "type">
): Promise<AuditEvent> {
  const event = makeEvent(type, fields);
  await appendAudit(specDir, event);
  return event;
}

export interface ReadAuditOptions {
  /** Filter to a single YYYY-MM-DD date. */
  date?: string;
}

/** Read audit events (all dates, or one date). Malformed lines are skipped. */
export async function readAudit(specDir: string, options: ReadAuditOptions = {}): Promise<AuditEvent[]> {
  const dir = join(specDir, AUDIT_DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch (err) {
    if (isENOENT(err)) return [];
    throw err;
  }
  if (options.date) files = files.filter((f) => f === `${options.date}.jsonl`);
  files.sort();

  const events: AuditEvent[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as AuditEvent);
      } catch {
        // skip malformed line
      }
    }
  }
  // Chronological by ts (stable for equal ts → preserves append order).
  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return events;
}

function isENOENT(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
