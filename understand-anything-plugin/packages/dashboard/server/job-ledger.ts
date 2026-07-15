// ── 대시보드 dev server 공통: 헤드리스 잡 WAL + 원장(ledger) 영속 ────────────────
// claude 헤드리스 잡은 서버 재시작(config 리로드, ctrl-c 등)으로 close 핸들러를 잃을 수
// 있다. 스폰 전 pending 마커(WAL)를 디스크에 남기고, 종료 시 원장(ledger.json)에 append,
// 조회 시 lazy reconcile 로 산출물 mtime 기준 결과를 복원한다 — impact / rtm-change 공용.
//   <dir>/ledger.json          { entries: [...] } 최신이 앞, 상한 초과분 삭제
//   <dir>/pending-<jobId>.json 스폰 전 기록, 원장 기록 시 제거
import fs from "fs";
import path from "path";

/** 산출물이 아직이면 고아 claude 가 돌고 있을 수 있어 실패 판정을 미루는 유예. */
export const RECONCILE_GRACE_MS = 30 * 60 * 1000;
/** 파일시스템 mtime 해상도 여유 — startedAt 직후 갱신된 산출물을 배제하지 않는다. */
const MTIME_SLACK_MS = 1000;

export function readLedger<T extends { jobId: string }>(dir: string): T[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "ledger.json"), "utf-8")) as {
      entries?: T[];
    };
    return Array.isArray(raw.entries) ? raw.entries : [];
  } catch {
    return []; // 부재/파손 = 기록 없음(정직한 empty)
  }
}

/**
 * 원장 append(동일 jobId 재기록은 dedup, 최신이 앞) + 상한 초과분 잘라 기록.
 * 잘려나간 entry 들을 반환한다 — 호출측이 딸린 스냅샷 디렉터리 등을 정리할 수 있게.
 */
export function appendLedgerEntry<T extends { jobId: string }>(
  dir: string,
  entry: T,
  max: number,
): T[] {
  const entries = [entry, ...readLedger<T>(dir).filter((e) => e.jobId !== entry.jobId)];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "ledger.json"),
    JSON.stringify({ entries: entries.slice(0, max) }, null, 2) + "\n",
    "utf8",
  );
  return entries.slice(max);
}

/** WAL: 스폰 전 pending 마커 기록. 실패는 무시(본 기록은 close 핸들러가 시도). */
export function writePendingMarker(
  dir: string,
  data: { jobId: string } & Record<string, unknown>,
): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `pending-${data.jobId}.json`),
      JSON.stringify(data, null, 2) + "\n",
      "utf8",
    );
  } catch {
    // pending 기록 실패는 무시
  }
}

export function removePendingMarker(dir: string, jobId: string): void {
  fs.rmSync(path.join(dir, `pending-${jobId}.json`), { force: true });
}

/** 산출물 mtime(ms). 부재/실패는 NaN — fresh=false 경로. */
export function artifactMtimeMs(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return Number.NaN;
  }
}

export interface ReconcileOptions {
  /** 현재 서버가 인메모리로 추적 중인 job — 건너뛴다(다음 조회 때 재판정). */
  isTracking: (jobId: string) => boolean;
  /** 이미 원장에 기록된 job — 마커만 정리한다(정상 close). */
  isRecorded: (jobId: string) => boolean;
  /** 신선도 판정 기준 산출물의 mtime(ms). 부재는 NaN. */
  artifactMtimeMs: () => number;
  /**
   * 복원 기록 — fresh=true 면 산출물이 startedAt 이후 갱신됨(done 판정 재료).
   * 마커 제거는 record 구현이 책임진다(원장 기록과 원자적으로 묶기 위해).
   */
  record: (pending: Record<string, unknown>, fresh: boolean, artifactMs: number) => void;
}

/**
 * 서버 재시작으로 close 핸들러를 잃은 job 복원 — pending 마커와 산출물 mtime 으로 판정.
 * 산출물이 startedAt 이후 갱신됐으면 fresh 로 record, 아직이면 30분 유예 후 실패로 record.
 * 조회 엔드포인트에서 lazy 하게 호출된다(별도 부팅 훅 불필요).
 */
export function reconcilePendingJobs(dir: string, opts: ReconcileOptions): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^pending-[0-9a-f]{16}\.json$/.test(n));
  } catch {
    return; // 히스토리 디렉터리 자체가 없으면 복원할 것도 없음
  }
  for (const n of names) {
    const file = path.join(dir, n);
    try {
      const pending = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
      const jobId = typeof pending.jobId === "string" ? pending.jobId : "";
      if (!jobId) {
        fs.rmSync(file, { force: true });
        continue;
      }
      if (opts.isTracking(jobId)) continue;
      if (opts.isRecorded(jobId)) {
        fs.rmSync(file, { force: true });
        continue;
      }
      const startedMs =
        typeof pending.startedAt === "string" ? Date.parse(pending.startedAt) : Number.NaN;
      const artifactMs = opts.artifactMtimeMs();
      const fresh =
        !Number.isNaN(startedMs) &&
        !Number.isNaN(artifactMs) &&
        artifactMs >= startedMs - MTIME_SLACK_MS;
      if (!fresh && !Number.isNaN(startedMs) && Date.now() - startedMs < RECONCILE_GRACE_MS) {
        continue; // 아직 돌고 있을 수 있음 — 다음 조회 때 재판정
      }
      opts.record(pending, fresh, artifactMs);
    } catch {
      // 개별 pending 파손은 건너뜀(다음 조회 때 재시도)
    }
  }
}
