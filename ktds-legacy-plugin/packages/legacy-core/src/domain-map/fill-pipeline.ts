import { gitCommitHash, readSkeleton } from "./persist.js";
import { applyFills, readFills, unfilledNodes, type RejectedItem } from "./fill.js";
import { verifyFills, writeVerifyReport, type VerifyReport } from "./verify.js";
import { demoteUnverified, emitDomainGraph, type EmitOptions } from "./emit.js";

// S8→S9→S10 오케스트레이션 (Stage-17).
// 호스트(Claude)가 fill/<key>.json을 쓴 뒤 호출한다:
//   skeleton 읽기 → fill 검증·적용(구조 read-only) → 기계 검증(인용 대조)
//   → NEEDS_REVIEW 강등 → domain-graph.json emit + verify-report.json.
// 실패 도메인(pending/invalid)이 있어도 멈추지 않는다 — 채워진 도메인만
// 반영하고 나머지는 보고한다(부분 진행·도메인 단위 재시도 멱등).

export interface FillPipelineResult {
  /** fill 파일이 아직 없는 도메인 key. */
  pending: string[];
  /** fill 파일이 있으나 스키마/파싱 실패 — 재생성 대상. */
  invalid: Array<{ key: string; error: string }>;
  /** 구조 read-only 위반으로 항목 기각된 참조. */
  rejected: RejectedItem[];
  /** 여전히 빈칸인 노드 id (pending/기각의 결과). */
  unfilled: string[];
  /** skeleton 생성 commit ≠ 현재 HEAD — 라인이 밀려 인용이 어긋날 수 있다. */
  staleSkeleton: boolean;
  report: VerifyReport;
  verifyReportPath: string;
  domainGraphPath: string;
}

export async function runFillPipeline(
  projectRoot: string,
  options: EmitOptions = {},
): Promise<FillPipelineResult> {
  const skeleton = await readSkeleton(projectRoot);
  if (!skeleton) {
    throw new Error(
      "skeleton.json 없음 — 먼저 scan + 도메인 경계 확정(confirm)을 실행하세요",
    );
  }
  const { fills, pending, invalid } = await readFills(projectRoot, skeleton);
  const { nodes, rejected } = applyFills(skeleton, fills);
  const report = await verifyFills(projectRoot, fills, skeleton.gitCommit);
  const verifyReportPath = await writeVerifyReport(projectRoot, report);
  const demoted = demoteUnverified(nodes, report);
  const domainGraphPath = await emitDomainGraph(projectRoot, skeleton, demoted, options);
  // 검증은 현재 워킹트리 파일과 대조하므로, skeleton이 옛 commit 산물이면
  // 라인 이동으로 정당한 인용이 강등될 수 있다 — 차단 대신 표면화(리뷰 반영).
  const currentCommit = await gitCommitHash(projectRoot);
  const staleSkeleton =
    skeleton.gitCommit !== null &&
    currentCommit !== null &&
    skeleton.gitCommit !== currentCommit;
  return {
    pending,
    invalid,
    rejected,
    unfilled: unfilledNodes(demoted),
    staleSkeleton,
    report,
    verifyReportPath,
    domainGraphPath,
  };
}
