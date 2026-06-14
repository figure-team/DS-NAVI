import { promises as fs } from "node:fs";
import * as path from "node:path";
import { stableJson } from "../domain-map/persist.js";
import { renderMarkdown } from "../doc-generator/index.js";
import type { GeneratedDoc } from "../types.js";
import { IMPACT_VERIFY_FILENAME, ImpactVerifyReportSchema, type ImpactVerifyReport } from "./verify.js";
import { IMPACT_REPORT_FILENAME, ImpactResultSchema, type ImpactResult } from "./types.js";
import { CHANGE_IMPACT_FILENAME, IMPACT_STATUS_LINE } from "./doc.js";
import {
  REVIEW_CHECKLIST_FILENAME,
  REVIEW_REPORT_FILENAME,
  REVIEW_STATUS_LINE,
  REVIEW_VERIFY_FILENAME,
} from "./review.js";
import { writeFileAtomic } from "../utils/fs.js";

// T11 — SR 영향분석 워크벤치 (중간 점검 P1). PL은 동시 다발 SR(변경 요청)을
// 다루므로 분석 결과를 SR 단위로 `.spec/impact/<SR-ID>/`에 보관한다.
// `.spec/map/impact.json`(최신 1건)·docs/09_release(최신 보고서) 의미론은
// 그대로 두고 — status·대시보드 오버레이의 "마지막 분석"이 깨지지 않게 —
// 보관본은 항상 사본이다. 읽기전용 분석물 위상(ID2)도 동일: 검토·승인
// 상태기계 밖, registerDraft 미호출.

export const SR_IMPACT_DIRNAME = "impact";

/** SR ID는 디렉터리명이 된다 — 경로 분리자/순회/숨김/플래그 오인을 차단 (fail-closed). */
const SR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function assertSrId(srId: string): void {
  if (!SR_ID_RE.test(srId)) {
    throw new Error(
      `잘못된 SR ID: ${JSON.stringify(srId)} — 영숫자로 시작, 영숫자·점·하이픈·밑줄만, 100자 이내 (예: SR-2026-0612-001)`,
    );
  }
}

export function srImpactRoot(projectRoot: string): string {
  return path.join(projectRoot, ".spec", SR_IMPACT_DIRNAME);
}

export function srImpactDir(projectRoot: string, srId: string): string {
  assertSrId(srId);
  return path.join(srImpactRoot(projectRoot), srId);
}

export interface ArchiveImpactRunInput {
  result: ImpactResult;
  verify: ImpactVerifyReport;
  /** buildChangeImpact 산출 — 보관 .md는 발행본과 동일 렌더(IMPACT_STATUS_LINE). */
  doc: GeneratedDoc;
}

/** 분석 1회분을 `.spec/impact/<SR-ID>/`에 보관 (impact.json + verify + .md). 재실행은 덮어쓴다(같은 SR의 최신 분석). */
export async function archiveImpactRun(
  projectRoot: string,
  srId: string,
  input: ArchiveImpactRunInput,
): Promise<string> {
  const dir = srImpactDir(projectRoot, srId);
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(path.join(dir, IMPACT_REPORT_FILENAME), stableJson(input.result));
  await writeFileAtomic(path.join(dir, IMPACT_VERIFY_FILENAME), stableJson(input.verify));
  await writeFileAtomic(
    path.join(dir, CHANGE_IMPACT_FILENAME),
    renderMarkdown(input.doc, IMPACT_STATUS_LINE),
  );
  return dir;
}

/**
 * 리뷰 1회분을 같은 SR 디렉터리에 보관 (review.json + verify + 체크리스트 .md).
 * 예측 보관본(impact.json 등)과 파일명이 달라 한 SR 폴더에 예측·실측이 나란히
 * 남는다 — 대조 이력의 정본. 재실행은 덮어쓴다(그 SR의 최신 리뷰).
 */
export async function archiveReviewRun(
  projectRoot: string,
  srId: string,
  input: ArchiveImpactRunInput,
): Promise<string> {
  const dir = srImpactDir(projectRoot, srId);
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(path.join(dir, REVIEW_REPORT_FILENAME), stableJson(input.result));
  await writeFileAtomic(path.join(dir, REVIEW_VERIFY_FILENAME), stableJson(input.verify));
  await writeFileAtomic(
    path.join(dir, REVIEW_CHECKLIST_FILENAME),
    renderMarkdown(input.doc, REVIEW_STATUS_LINE),
  );
  return dir;
}

export interface ImpactRunSummary {
  srId: string;
  valid: boolean;
  gitCommit: string | null;
  seeds: string[];
  upstreamFiles: number;
  api: number;
  mappers: number;
  needsReview: number;
  /** verify 부재/손상이면 null. */
  groundedPct: number | null;
  /** 이 SR에 실측 리뷰(review.json) 보관본이 있는지 (예측·실측 나란히 보관됨). */
  hasReview: boolean;
  /** 예측 보관본(impact.json)이 존재하지만 파싱 실패 — 리뷰 폴백이 손상을 가리지 않게 표면화 (리뷰 minor). */
  predictionCorrupt: boolean;
}

/**
 * SR 보관 목록 (srId 사전순). 손상 보관본은 valid=false로 표면화(은폐 금지).
 * 단 SR ID 형식이 아닌 디렉터리명은 엔진 산출물이 아니므로 목록에서 제외한다
 * — 수동 항목을 보이게 하려면 SR ID 규칙(영숫자 시작)에 맞춰 만들 것.
 */
export async function listImpactRuns(projectRoot: string): Promise<ImpactRunSummary[]> {
  const root = srImpactRoot(projectRoot);
  let entries: string[];
  try {
    entries = (await fs.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && SR_ID_RE.test(d.name))
      .map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const out: ImpactRunSummary[] = [];
  for (const srId of entries) {
    const dir = path.join(root, srId);
    // 부재(ENOENT)와 "존재하나 손상"을 구분 — 폴백이 손상을 가리면 안 된다.
    const readResult = async (
      filename: string,
    ): Promise<{ result: ImpactResult | null; corrupt: boolean }> => {
      let raw: string;
      try {
        raw = await fs.readFile(path.join(dir, filename), "utf-8");
      } catch {
        return { result: null, corrupt: false };
      }
      try {
        return { result: ImpactResultSchema.parse(JSON.parse(raw)), corrupt: false };
      } catch {
        return { result: null, corrupt: true };
      }
    };
    const pred = await readResult(IMPACT_REPORT_FILENAME);
    const rev = await readResult(REVIEW_REPORT_FILENAME);
    // 요약 기준: 예측 우선, 예측이 없으면(리뷰 단독 SR) 리뷰로 폴백.
    const result = pred.result ?? rev.result;
    if (!result) {
      out.push({
        srId, valid: false, gitCommit: null, seeds: [],
        upstreamFiles: 0, api: 0, mappers: 0, needsReview: 0, groundedPct: null,
        hasReview: false, predictionCorrupt: pred.corrupt,
      });
      continue;
    }
    const prediction = pred.result;
    const review = rev.result;
    let groundedPct: number | null = null;
    try {
      const verify = ImpactVerifyReportSchema.parse(
        JSON.parse(
          await fs.readFile(
            path.join(dir, prediction ? IMPACT_VERIFY_FILENAME : REVIEW_VERIFY_FILENAME),
            "utf-8",
          ),
        ),
      );
      groundedPct = verify.overall.groundedPct;
    } catch {
      /* verify 없거나 손상 — groundedPct만 비운다 */
    }
    out.push({
      srId,
      valid: true,
      gitCommit: result.gitCommit,
      seeds: result.seeds.map((s) => s.relPath),
      upstreamFiles: result.upstream.files.length,
      api: result.upstream.api.length,
      mappers: result.upstream.persistence.mappers.length,
      needsReview: result.needsReview.length,
      groundedPct,
      hasReview: review !== null,
      predictionCorrupt: pred.corrupt,
    });
  }
  return out;
}
