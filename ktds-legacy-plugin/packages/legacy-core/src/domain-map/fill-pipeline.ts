/**
 * FILL PIPELINE(S8→S9→S10 오케스트레이션) — 채움 적용·검증·강등·emit.
 *
 * 호스트(Claude)가 fill/<key>.json 을 쓴 뒤 호출한다:
 *   skeleton 읽기 → fill 검증·적용(구조 read-only) → 기계 검증(인용 대조)
 *   → NEEDS_REVIEW 강등 → domain-graph.json emit + verify-report.json.
 * 실패 도메인(pending/invalid)이 있어도 멈추지 않는다 — 채워진 도메인만 반영하고
 * 나머지는 보고한다(부분 진행·도메인 단위 재시도 멱등). 미채움 노드는 emit 단계의
 * 결정론 라벨 폴백으로 빈 이름 대신 구조명을 갖는다(하이브리드).
 */
import { join } from 'node:path'
import {
  gitCommitDate,
  gitCommitHash,
  readSkeleton,
  uaDir,
  DOMAIN_GRAPH_FILENAME,
} from './persist.js'
import { applyFills, readFills, unfilledNodes, type RejectedItem } from './fill.js'
import { verifyFills, writeVerifyReport, type VerifyReport } from './verify.js'
import {
  demoteUnverified,
  embedVerification,
  emitFilledDomainGraph,
  type EmitOptions,
} from './emit.js'

export interface FillPipelineResult {
  /** fill 파일이 아직 없는 도메인 key. */
  pending: string[]
  /** fill 파일이 있으나 스키마/파싱/domainId 실패 — 재생성 대상. */
  invalid: Array<{ key: string; error: string }>
  /** 구조 read-only 위반으로 항목 기각된 참조. */
  rejected: RejectedItem[]
  /** 여전히 빈칸(채움 전)인 노드 id (pending/기각의 결과). */
  unfilled: string[]
  /** skeleton 생성 commit ≠ 현재 HEAD — 라인이 밀려 인용이 어긋날 수 있다. */
  staleSkeleton: boolean
  report: VerifyReport
  verifyReportPath: string
  domainGraphPath: string
}

export async function runFillPipeline(
  projectRoot: string,
  options: EmitOptions = {},
): Promise<FillPipelineResult> {
  const skeleton = readSkeleton(projectRoot)
  if (!skeleton) {
    throw new Error('skeleton.json 없음 — 먼저 scan + 도메인 경계 확정(confirm)을 실행하세요')
  }
  const { fills, pending, invalid } = await readFills(projectRoot, skeleton)
  const { nodes, rejected } = applyFills(skeleton, fills)
  // P4/B안: 그래프 정합 실패로 기각된 업무 흐름도 프로세스는 검증·집계에서도
  // 제외(그래프에 안 실림). 구조적 kind 필터 — 집합 원소는 applyFills 가 만든
  // 프로세스 ref(`<domainId>#businessFlows[<i>]`)로, verify 가 인덱스 단위로
  // 건너뛴다(부분 수용).
  const rejectedBusinessFlows = new Set(
    rejected.filter((r) => r.kind === 'businessFlow').map((r) => r.ref),
  )
  const report = await verifyFills(projectRoot, fills, skeleton.gitCommit, rejectedBusinessFlows)
  const verifyReportPath = writeVerifyReport(projectRoot, report)
  const demoted = demoteUnverified(nodes, report)
  // 검증 결과(citation status + verdict + 도메인 근거율)를 노드 domainMeta.ktdsClaims 에
  // 임베드 — 대시보드가 domain-graph.json 한 파일로 근거·검증을 읽는다(단일 소스).
  const verified = embedVerification(demoted, report)
  // 강등 후의 빈칸(SKELETON_BLANK) 잔여 노드 — emit 폴백 적용 전 기준으로 보고한다.
  const unfilled = unfilledNodes(verified)
  // analyzedAt 결정론: 호출자가 안 주면 skeleton 커밋의 커미터 시각을 쓴다 —
  // 벽시계(now)를 박으면 같은 입력의 재실행이 byte-diff 를 낸다(P5 발견 결함).
  const analyzedAt =
    options.analyzedAt ??
    (skeleton.gitCommit ? (gitCommitDate(projectRoot, skeleton.gitCommit) ?? undefined) : undefined)
  emitFilledDomainGraph(projectRoot, skeleton, verified, { ...options, analyzedAt })
  const domainGraphPath = join(uaDir(projectRoot), DOMAIN_GRAPH_FILENAME)
  // 검증은 현재 워킹트리 파일과 대조하므로, skeleton 이 옛 commit 산물이면 라인 이동으로
  // 정당한 인용이 강등될 수 있다 — 차단 대신 표면화한다.
  const currentCommit = gitCommitHash(projectRoot)
  const staleSkeleton =
    skeleton.gitCommit !== null && currentCommit !== null && skeleton.gitCommit !== currentCommit
  return {
    pending,
    invalid,
    rejected,
    unfilled,
    staleSkeleton,
    report,
    verifyReportPath,
    domainGraphPath,
  }
}
