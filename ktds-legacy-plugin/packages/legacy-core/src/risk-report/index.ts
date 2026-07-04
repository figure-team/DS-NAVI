/**
 * W4 위험 모듈 리포트 — 프로그램별 위험 점수(risk-report.json). 설계: RISK_REPORT_DESIGN.md.
 *
 * 지표 6종(계산 근거 = 설계 §3, 문서 산출물 §산정기준에 사용자 노출):
 *  - 복잡도: 신규(complexity.ts, java AST). 비 java 는 미측정(null) — 표면화.
 *  - LOC: program-inventory 승계(wc -l 관례, 재계산 없음).
 *  - 변경빈도: churn.ts(git log --numstat, gitCommit 앵커 결정론). 랭킹 지표는
 *    커밋 수(빈도) — 변경 라인은 참고치로 병기.
 *  - 팬인: impact/reach.ts computeFanIn(강신호 엣지, distinct-source).
 *  - 팬아웃: 동일 강신호 엣지의 distinct-target(대칭 구현, 자기참조 제외).
 *  - 미도달: slices.ownership status==='unreached' (W2 배치 진입점 반영 후 값).
 *
 * 정규화·합산(§3.3): 측정 집합 내 백분위 랭크(동점 평균 랭크) → 가중 합산.
 * 미측정 지표는 그 프로그램에서 **가중치 재정규화**(null 을 0 취급하면 jsp 가
 * 조직적으로 과소평가되는 왜곡 방지). 동점 정렬 (score desc, filePath asc) 결정론.
 * 스코프: program-inventory 프로그램 중 type='test' 제외(제외 수 stats.excluded 표면화).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { CensusReport, EdgesReport, SlicesReport, EdgeKind } from '../domain-map/types.js'
import type { ProgramInventory } from '../program-inventory/index.js'
import { ProgramTypeSchema } from '../program-inventory/index.js'
import { computeFanIn } from '../impact/reach.js'
import { STRONG_EDGE_KINDS } from '../impact/types.js'
import { cmp } from '../utils/cmp.js'
import { measureJavaComplexity } from './complexity.js'
import type { ChurnMap } from './churn.js'

export { countJavaComplexity, measureJavaComplexity } from './complexity.js'
export { collectGitChurn, type ChurnEntry, type ChurnMap } from './churn.js'

/** `.spec/map/` 위험 리포트 파일명. */
export const RISK_REPORT_FILENAME = 'risk-report.json'

/**
 * 지표 가중치(§3.3) — 리포트 meta 에 그대로 기록(재현 근거).
 * 복잡도·변경빈도가 주(각 0.25): 레거시 위험의 1차 신호. 구조 결합(팬인/팬아웃)과
 * 규모(LOC)는 보조, 미도달은 이진 가산.
 */
export const RISK_WEIGHTS = {
  complexity: 0.25,
  churn: 0.25,
  loc: 0.15,
  fanIn: 0.15,
  fanOut: 0.1,
  unreached: 0.1,
} as const
export type RiskMetricKey = keyof typeof RISK_WEIGHTS

/** md 문서(Top N 절단) 기본값 — json items 는 항상 전수. */
export const RISK_DEFAULT_TOP_N = 20

export const RiskGradeSchema = z.enum(['상', '중', '하'])
export type RiskGrade = z.infer<typeof RiskGradeSchema>

export const RiskItemSchema = z.object({
  /** program-inventory 의 안정 id 승계(PGM-*). */
  programId: z.string(),
  name: z.string(),
  filePath: z.string(),
  type: ProgramTypeSchema,
  layer: z.string(),
  domain: z.string().nullable(),
  /** 원시 지표 — null = 미측정([미확인], notes 에 사유). */
  metrics: z.object({
    loc: z.number().int().nonnegative(),
    complexity: z.number().int().nonnegative().nullable(),
    fanIn: z.number().int().nonnegative(),
    fanOut: z.number().int().nonnegative(),
    churnCommits: z.number().int().nonnegative().nullable(),
    churnLines: z.number().int().nonnegative().nullable(),
    unreached: z.boolean(),
  }),
  /** 백분위(0~1, 소수 4자리) — unreached 는 이진(0|1), null = 미측정. */
  normalized: z.object({
    loc: z.number(),
    complexity: z.number().nullable(),
    fanIn: z.number(),
    fanOut: z.number(),
    churn: z.number().nullable(),
    unreached: z.number(),
  }),
  /** 가중 합산(측정 지표만, 가중치 재정규화) 0~1. */
  score: z.number(),
  grade: RiskGradeSchema,
  /** 주요 요인 — 정규화값 상위 2개 지표 키(0 제외), (값 desc, 키 asc). */
  factors: z.array(z.string()),
  /** [미확인] 마킹 등 — 정렬. */
  notes: z.array(z.string()),
})
export type RiskItem = z.infer<typeof RiskItemSchema>

export const RiskReportSchema = z.object({
  schemaVersion: z.literal(1),
  /** 결정론 앵커 — census.gitCommit(churn 이력의 고정점). */
  gitCommit: z.string().nullable(),
  meta: z.object({
    weights: z.object({
      complexity: z.number(),
      churn: z.number(),
      loc: z.number(),
      fanIn: z.number(),
      fanOut: z.number(),
      unreached: z.number(),
    }),
    /** 팬인/팬아웃에 계상한 엣지 종류(강신호, impact 관례와 동일). */
    edgeKinds: z.array(z.string()),
    /** false = git 불가 — 전 항목 churn 미측정. */
    churnAvailable: z.boolean(),
    topN: z.number().int().positive(),
  }),
  stats: z.object({
    /** 랭킹 대상 프로그램 수(test 제외 후). */
    programs: z.number().int().nonnegative(),
    /** 침묵 누락 방지 — 랭킹에서 제외한 부류 카운트. */
    excluded: z.object({ test: z.number().int().nonnegative() }),
    /** 지표별 측정 커버리지(미측정 = programs - measured). */
    measured: z.object({
      complexity: z.number().int().nonnegative(),
      churn: z.number().int().nonnegative(),
    }),
    unreached: z.number().int().nonnegative(),
  }),
  /** 전 프로그램(랭킹 대상 전수) — Top N 절단은 문서 렌더에서만. */
  items: z.array(RiskItemSchema),
})
export type RiskReport = z.infer<typeof RiskReportSchema>

export interface RiskReportInputs {
  census: CensusReport
  edges: EdgesReport
  slices: SlicesReport
  programInventory: ProgramInventory
  /** collectGitChurn 산출(주입식) — null = git 불가. 픽스처 테스트는 고정 주입. */
  churn: ChurnMap | null
}

const round4 = (x: number): number => Math.round(x * 10000) / 10000

/**
 * 백분위 랭크(동점 평균): (미만 수 + (동수-1)/2) / (n-1). n<=1 → 0.
 * null(미측정)은 랭크 집합에서 제외하고 null 을 돌려준다.
 */
function percentileRanks(values: ReadonlyArray<number | null>): Array<number | null> {
  const measured = values.filter((v): v is number => v !== null).sort((a, b) => a - b)
  const n = measured.length
  return values.map((v) => {
    if (v === null) return null
    if (n <= 1) return 0
    let below = 0
    let equal = 0
    for (const m of measured) {
      if (m < v) below++
      else if (m === v) equal++
      else break
    }
    return round4((below + (equal - 1) / 2) / (n - 1))
  })
}

/** 팬아웃 — computeFanIn 의 대칭(source 별 distinct-target, 자기참조 제외). */
function computeFanOut(
  edges: EdgesReport['edges'],
  allowedKinds: ReadonlySet<EdgeKind>,
): Map<string, number> {
  const targets = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!allowedKinds.has(e.kind)) continue
    if (e.source === e.target) continue
    let set = targets.get(e.source)
    if (!set) {
      set = new Set()
      targets.set(e.source, set)
    }
    set.add(e.target)
  }
  const out = new Map<string, number>()
  for (const [f, set] of targets) out.set(f, set.size)
  return out
}

/** score → 등급(§3.3 고정 임계 — 프로젝트 간 비교 가능). */
function gradeOf(score: number): RiskGrade {
  return score >= 0.66 ? '상' : score >= 0.33 ? '중' : '하'
}

/** 프로젝트 전체 위험 리포트(파일 기록 없음 — 호출자가 writeMapArtifact). */
export async function buildRiskReport(
  projectRoot: string,
  inputs: RiskReportInputs,
): Promise<RiskReport> {
  const { census, edges, slices, programInventory, churn } = inputs
  const allowedKinds = new Set<EdgeKind>(STRONG_EDGE_KINDS)

  const ranked = programInventory.programs.filter((p) => p.type !== 'test')
  const excludedTest = programInventory.programs.length - ranked.length

  const unreachedSet = new Set(
    slices.ownership.filter((o) => o.status === 'unreached').map((o) => o.relPath),
  )
  const fanInMap = computeFanIn(edges.edges, allowedKinds)
  const fanOutMap = computeFanOut(edges.edges, allowedKinds)

  // 원시 지표 수집(프로그램 순서 = ranked 순서 유지 — 정규화 배열 인덱스 대응).
  const rows = await Promise.all(
    ranked.map(async (p) => {
      const notes: string[] = []
      let complexity: number | null = null
      if (p.filePath.endsWith('.java')) {
        try {
          complexity = await measureJavaComplexity(readFileSync(join(projectRoot, p.filePath), 'utf8'))
        } catch {
          notes.push('[미확인] 복잡도 미측정(판독/파싱 실패)')
        }
      } else {
        const ext = p.filePath.includes('.') ? p.filePath.slice(p.filePath.lastIndexOf('.') + 1) : '?'
        notes.push(`[미확인] 복잡도 미측정(${ext} — java 전용 근사)`)
      }
      let churnCommits: number | null = null
      let churnLines: number | null = null
      if (churn === null) {
        notes.push('[미확인] 변경빈도 미측정(git 이력 없음)')
      } else {
        // 이력에 없는 파일(미커밋 신규)은 0 — 사실 그대로.
        const c = churn.get(p.filePath)
        churnCommits = c?.commits ?? 0
        churnLines = c?.linesChanged ?? 0
      }
      return {
        p,
        notes,
        loc: p.loc,
        complexity,
        fanIn: fanInMap.get(p.filePath) ?? 0,
        fanOut: fanOutMap.get(p.filePath) ?? 0,
        churnCommits,
        churnLines,
        unreached: unreachedSet.has(p.filePath),
      }
    }),
  )

  const normLoc = percentileRanks(rows.map((r) => r.loc))
  const normComplexity = percentileRanks(rows.map((r) => r.complexity))
  const normFanIn = percentileRanks(rows.map((r) => r.fanIn))
  const normFanOut = percentileRanks(rows.map((r) => r.fanOut))
  const normChurn = percentileRanks(rows.map((r) => r.churnCommits))

  const items: RiskItem[] = rows.map((r, i) => {
    const normalized = {
      loc: normLoc[i] ?? 0,
      complexity: normComplexity[i],
      fanIn: normFanIn[i] ?? 0,
      fanOut: normFanOut[i] ?? 0,
      churn: normChurn[i],
      unreached: r.unreached ? 1 : 0,
    }
    // 측정된 지표만 가중 합산(가중치 재정규화).
    const measuredEntries: Array<[RiskMetricKey, number]> = [
      ['loc', normalized.loc],
      ['fanIn', normalized.fanIn],
      ['fanOut', normalized.fanOut],
      ['unreached', normalized.unreached],
    ]
    if (normalized.complexity !== null) measuredEntries.push(['complexity', normalized.complexity])
    if (normalized.churn !== null) measuredEntries.push(['churn', normalized.churn])
    const weightSum = measuredEntries.reduce((s, [k]) => s + RISK_WEIGHTS[k], 0)
    const score = round4(
      measuredEntries.reduce((s, [k, v]) => s + RISK_WEIGHTS[k] * v, 0) / weightSum,
    )
    const factors = measuredEntries
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
      .slice(0, 2)
      .map(([k]) => k)
    return {
      programId: r.p.id,
      name: r.p.name,
      filePath: r.p.filePath,
      type: r.p.type,
      layer: r.p.layer,
      domain: r.p.domain,
      metrics: {
        loc: r.loc,
        complexity: r.complexity,
        fanIn: r.fanIn,
        fanOut: r.fanOut,
        churnCommits: r.churnCommits,
        churnLines: r.churnLines,
        unreached: r.unreached,
      },
      normalized,
      score,
      grade: gradeOf(score),
      factors,
      notes: [...r.notes].sort(cmp),
    }
  })
  items.sort((a, b) => b.score - a.score || cmp(a.filePath, b.filePath))

  return RiskReportSchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    meta: {
      weights: { ...RISK_WEIGHTS },
      edgeKinds: [...STRONG_EDGE_KINDS].sort(cmp),
      churnAvailable: churn !== null,
      topN: RISK_DEFAULT_TOP_N,
    },
    stats: {
      programs: items.length,
      excluded: { test: excludedTest },
      measured: {
        complexity: items.filter((it) => it.metrics.complexity !== null).length,
        churn: items.filter((it) => it.metrics.churnCommits !== null).length,
      },
      unreached: items.filter((it) => it.metrics.unreached).length,
    },
    items,
  })
}
