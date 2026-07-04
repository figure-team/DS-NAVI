/**
 * batch-jobs.json 빌더(W2 P2-c) — routes.batchEntries 를 배치 인벤토리로 승격한다.
 *
 * - id: 내용 파생 `BAT-<sha256 8hex>`(trigger|handler|schedule|filePath) — 재스캔 안정(W1 교훈).
 * - reachableFiles: handlerFile(없으면 filePath)에서 파일 엣지 BFS 도달 수(루트 포함) —
 *   "이 배치가 건드리는 코드 범위"의 결정론 요약.
 * - unresolvedHandler: XML 계열(quartz/task-xml/spring-batch)인데 잡 클래스 파일 해석 실패
 *   — 정의서에 [미확인]으로 표면화. shell/crontab 은 프로젝트 내 핸들러 개념이 없어 제외.
 * - suspectSignals: *Job/*Batch/*Tasklet 명명 java 파일인데 어떤 엔트리에도 안 물림 —
 *   "배치 0건/N건"이 놓친 잡의 존재 가능성 지표(테스트 경로 제외, W1 교훈).
 *
 * 결정론: jobs (trigger, handler, file, line) 정렬, stats/suspects 정렬. 0건도 기록.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { BatchEntry, CensusReport, EdgesReport } from '../domain-map/types.js'

/** `.spec/map/` 배치 인벤토리 파일명. */
export const BATCH_JOBS_FILENAME = 'batch-jobs.json'

export const BatchJobSchema = z.object({
  id: z.string(),
  /** handler 기반 표기 초안(사람 확정 전) — 없으면 entryId 꼬리. */
  name: z.string(),
  trigger: z.string(),
  schedule: z.string().nullable(),
  handler: z.string().nullable(),
  handlerFile: z.string().nullable(),
  unresolvedHandler: z.boolean(),
  evidence: z.object({ file: z.string(), line: z.number().int() }),
  reachableFiles: z.number().int().nonnegative(),
  notes: z.array(z.string()),
})
export type BatchJob = z.infer<typeof BatchJobSchema>

export const BatchJobsReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  jobs: z.array(BatchJobSchema),
  stats: z.object({
    total: z.number().int().nonnegative(),
    byTrigger: z.array(z.object({ trigger: z.string(), count: z.number().int().nonnegative() })),
    unresolvedHandlers: z.number().int().nonnegative(),
  }),
  suspectSignals: z.object({
    count: z.number().int().nonnegative(),
    samples: z.array(z.object({ file: z.string(), kind: z.string() })),
  }),
})
export type BatchJobsReport = z.infer<typeof BatchJobsReportSchema>

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** XML 계열(핸들러 해석이 기대되는) 트리거. */
const XML_TRIGGERS = new Set(['quartz', 'task-xml', 'spring-batch'])

const SUSPECT_SAMPLE_CAP = 10

/** 파일 엣지 BFS 도달 수(루트 포함). */
function reachableCount(root: string, adj: Map<string, string[]>): number {
  const reached = new Set<string>([root])
  let frontier = [root]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const t of adj.get(cur) ?? []) {
        if (reached.has(t)) continue
        reached.add(t)
        next.push(t)
      }
    }
    frontier = next
  }
  return reached.size
}

/** batchEntries + edges + census → BatchJobsReport(파일 기록 없음). */
export function buildBatchJobs(
  batchEntries: BatchEntry[],
  edges: Pick<EdgesReport, 'edges'>,
  census: CensusReport,
): BatchJobsReport {
  const adj = new Map<string, string[]>()
  for (const e of edges.edges) {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  }

  const jobs: BatchJob[] = batchEntries.map((b) => {
    const handlerFile = b.handlerFile ?? null
    const seed = `${b.trigger}|${b.handler ?? ''}|${b.schedule ?? ''}|${b.filePath}`
    const root = handlerFile ?? b.filePath
    const entryTail = b.entryId.slice(b.entryId.indexOf('#') + 1)
    return {
      id: `BAT-${createHash('sha256').update(seed).digest('hex').slice(0, 8)}`,
      // spring-batch 는 잡 id(entryId 꼬리)가 업무명 — handler(실행체 빈)보다 우선.
      name: b.trigger === 'spring-batch' ? entryTail : (b.handler ?? entryTail),
      trigger: b.trigger,
      schedule: b.schedule,
      handler: b.handler,
      handlerFile,
      unresolvedHandler: XML_TRIGGERS.has(b.trigger) && handlerFile === null,
      evidence: { file: b.filePath, line: b.line },
      reachableFiles: reachableCount(root, adj),
      notes: [...b.notes].sort(cmp),
    }
  })
  jobs.sort(
    (a, b) =>
      cmp(a.trigger, b.trigger) ||
      cmp(a.handler ?? '￿', b.handler ?? '￿') ||
      cmp(a.evidence.file, b.evidence.file) ||
      a.evidence.line - b.evidence.line,
  )

  const trigCounts = new Map<string, number>()
  for (const j of jobs) trigCounts.set(j.trigger, (trigCounts.get(j.trigger) ?? 0) + 1)
  const byTrigger = [...trigCounts.entries()]
    .map(([trigger, count]) => ({ trigger, count }))
    .sort((a, b) => cmp(a.trigger, b.trigger))

  // 의심 신호 — 잡 명명 관례 파일인데 어떤 엔트리(파일/핸들러)에도 안 물림.
  const covered = new Set<string>()
  for (const j of jobs) {
    covered.add(j.evidence.file)
    if (j.handlerFile) covered.add(j.handlerFile)
  }
  const isTestPath = (p: string) => p.split('/').some((seg) => seg === 'test' || seg === 'tests')
  const suspects = census.files
    .filter(
      (f) =>
        f.lang === 'java' &&
        /(Job|Batch|Tasklet)\.java$/.test(f.relPath) &&
        !covered.has(f.relPath) &&
        !isTestPath(f.relPath),
    )
    .map((f) => ({ file: f.relPath, kind: 'job-named-class' }))
    .sort((a, b) => cmp(a.file, b.file))

  return BatchJobsReportSchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    jobs,
    stats: {
      total: jobs.length,
      byTrigger,
      unresolvedHandlers: jobs.filter((j) => j.unresolvedHandler).length,
    },
    suspectSignals: { count: suspects.length, samples: suspects.slice(0, SUSPECT_SAMPLE_CAP) },
  })
}
