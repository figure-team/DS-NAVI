import { mkdir, readFile, writeFile, rm, rename, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * 동시 실행·복구 안전장치 (plan §3.5 / §8):
 * - `.spec/.analysis.lock`(PID·시각). 살아있는 PID면 거부, 죽은 PID면 stale 제거.
 * - 산출물은 `.spec/runs/{runId}/staging/`에 먼저 쓰고, 성공 시 atomic publish; 실패 시 staging 폐기.
 * - MVP: 단일 워크스테이션/단일 파일시스템 전용.
 */
const LOCK_FILE = ".analysis.lock";

export interface LockInfo {
  pid: number;
  ts: string;
}

export interface AcquireResult {
  acquired: true;
  /** true if a dead-process lock was cleared (→ caller should audit STALE_LOCK_REMOVED). */
  staleRemoved: boolean;
}

/**
 * True if `pid` is a live process. ESRCH → dead; EPERM → alive-but-not-ours;
 * any other error is rethrown so we never *steal* a lock on an unexpected
 * condition. A non-integer/garbage pid (corrupt lock file) is treated as dead
 * so the garbage lock can be cleared.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw err;
  }
}

export async function acquireLock(specDir: string): Promise<AcquireResult> {
  await mkdir(specDir, { recursive: true });
  const lockPath = join(specDir, LOCK_FILE);

  let existing: LockInfo | null = null;
  try {
    existing = JSON.parse(await readFile(lockPath, "utf-8")) as LockInfo;
  } catch (err) {
    if (!isENOENT(err)) throw err; // ENOENT → no lock yet
  }

  let staleRemoved = false;
  if (existing) {
    if (isProcessAlive(existing.pid)) {
      throw new Error(
        `[lock] analysis already running (live pid ${existing.pid}, since ${existing.ts})`
      );
    }
    staleRemoved = true; // dead pid → safe to overwrite
  }

  const info: LockInfo = { pid: process.pid, ts: new Date().toISOString() };
  await writeFile(lockPath, JSON.stringify(info), "utf-8");
  return { acquired: true, staleRemoved };
}

export async function releaseLock(specDir: string): Promise<void> {
  await rm(join(specDir, LOCK_FILE), { force: true });
}

export async function isLocked(specDir: string): Promise<boolean> {
  try {
    await readFile(join(specDir, LOCK_FILE), "utf-8");
    return true;
  } catch (err) {
    if (isENOENT(err)) return false;
    throw err;
  }
}

// ── staging → atomic publish ────────────────────────────────────────────────

/**
 * Run `fn` against a fresh staging dir; on success the staging dir is returned
 * for the caller to publish. On any error the staging tree is discarded so
 * existing outputs stay untouched (RUN_ABORTED semantics).
 */
export async function withStaging<T>(
  specDir: string,
  runId: string,
  fn: (stagingDir: string) => Promise<T>
): Promise<{ result: T; stagingDir: string }> {
  const runDir = join(specDir, "runs", runId);
  const stagingDir = join(runDir, "staging");
  await mkdir(stagingDir, { recursive: true });
  try {
    const result = await fn(stagingDir);
    return { result, stagingDir };
  } catch (err) {
    await rm(runDir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Publish staged files into `targetDir` by per-file rename (best-effort atomic
 * on a single filesystem — MVP constraint). Overwrites existing files.
 */
export async function publishStaging(stagingDir: string, targetDir: string): Promise<string[]> {
  await mkdir(targetDir, { recursive: true });
  const files = await readdir(stagingDir);
  const published: string[] = [];
  for (const f of files) {
    await rename(join(stagingDir, f), join(targetDir, f));
    published.push(f);
  }
  return published;
}

function isENOENT(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}
