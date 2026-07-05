/**
 * 통합 커버리지 리포트(보완 D-c, AC-30) — "분석이 코드의 몇 %를 정직하게 덮었나".
 *
 * 흩어진 신호(스캔 파일 수·계층 해소율·grounded vs [확인필요]·미도달/dropped·비-Java
 * 패스스루)를 단일 결정론 리포트로 모은다. 정직성: 침묵 누락 0 — cap-dropped step·
 * unresolved edge·미도달 파일·비-Java 패스스루를 모두 노출한다.
 *
 * 결정론: 모든 배열·맵 정렬, 타임스탬프 없음. 동일 산출물 → byte-identical.
 */
import { z } from 'zod'
import type {
  CensusReport,
  EdgesReport,
  RoutesReport,
  SkeletonReport,
  SlicesReport,
} from '../domain-map/types.js'
import { buildLayerSignals, deriveStepLayer } from '../domain-map/step-layer.js'
import type { JpaModel } from '../jpa/types.js'
import type { InterfaceReport } from '../interface-scan/types.js'
import type { BatchJobsReport } from '../batch-scan/report.js'
import type { ProgramInventory } from '../program-inventory/index.js'
import { computeLangSupport } from './matrix.js'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 비율(%) — 분모 0이면 0 (0/0 NaN 방지). 소수 1자리 결정론 반올림. */
function pct(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 10
}

export const CoverageReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  /** 스캔 파일 수 + 언어별 분포(언어 정렬). */
  files: z.object({
    total: z.number().int().nonnegative(),
    byLang: z.array(z.object({ lang: z.string(), count: z.number().int().nonnegative() })),
    /** 비-Java 패스스루(ktds 엔진은 java 기반 — 이들은 UA 네이티브가 덮음). */
    nonJavaPassthrough: z.number().int().nonnegative(),
  }),
  /** 계층 해소율 — api/service/dao/db = 해소, unknown = 미해소. */
  layers: z.object({
    resolved: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    rate: z.number(),
    byLayer: z.array(z.object({ layer: z.string(), count: z.number().int().nonnegative() })),
  }),
  /** 도달성 — 진입점에서 도달(sole/shared) vs 미도달(unreached). */
  reachability: z.object({
    reached: z.number().int().nonnegative(),
    unreached: z.number().int().nonnegative(),
    rate: z.number(),
  }),
  /** 엣지 해소 — resolved vs unresolved(누락 금지). */
  edges: z.object({
    resolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    rate: z.number(),
  }),
  /** 침묵 누락 방지: cap 절단으로 skeleton 에서 빠진 step 수. */
  droppedSteps: z.number().int().nonnegative(),
  /** JPA(보완 B) 커버리지 — entity/repository/Tier C(native [확인필요]) 수. */
  jpa: z.object({
    entities: z.number().int().nonnegative(),
    repositories: z.number().int().nonnegative(),
    tierCQueries: z.number().int().nonnegative(),
  }),
  /**
   * W1 대외 인터페이스 — 총계/미해석(endpoint [미확인])/프로토콜별.
   * optional: W1 이전 coverage.json 과의 하위호환(구 파일 zod parse 실패 방지).
   */
  interfaces: z
    .object({
      total: z.number().int().nonnegative(),
      unresolvedEndpoints: z.number().int().nonnegative(),
      byProtocol: z.array(
        z.object({ protocol: z.string(), count: z.number().int().nonnegative() }),
      ),
      /** 탐지 밖 의심 신호(http 리터럴/jdbc/wsdl) — 0건 오독(연계 없음) 차단용. */
      suspectSignals: z.number().int().nonnegative(),
    })
    .optional(),
  /** W2 배치 인벤토리 — 총계/트리거별/핸들러 미해석/의심신호. optional: 하위호환. */
  batch: z
    .object({
      total: z.number().int().nonnegative(),
      byTrigger: z.array(
        z.object({ trigger: z.string(), count: z.number().int().nonnegative() }),
      ),
      unresolvedHandlers: z.number().int().nonnegative(),
      suspectSignals: z.number().int().nonnegative(),
    })
    .optional(),
  /** W3 프로그램 목록 + 잠정 FP([추정]) — PM 정량화 첫 숫자. optional: 하위호환. */
  programs: z
    .object({
      total: z.number().int().nonnegative(),
      byType: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
      unadjustedFp: z.number().nonnegative(),
    })
    .optional(),
  /**
   * W9 언어 지원 현황 — 매트릭스(coverage-report/matrix.ts) × census.
   * 핵심 구조분석(routes·edges·complexity 전부 none) 미지원 소스 파일을 계상해
   * files.byLang 숫자에 묻히는 침묵 누락을 없앤다. optional: 하위호환.
   */
  langSupport: z
    .object({
      unsupportedFiles: z.number().int().nonnegative(),
      partialFiles: z.number().int().nonnegative(),
      byLang: z.array(
        z.object({
          lang: z.string(),
          files: z.number().int().nonnegative(),
          best: z.enum(['full', 'partial', 'none']),
          core: z.enum(['full', 'partial', 'none']),
          capabilities: z.array(
            z.object({ key: z.string(), tier: z.enum(['full', 'partial', 'none']) }),
          ),
        }),
      ),
    })
    .optional(),
})
export type CoverageReport = z.infer<typeof CoverageReportSchema>

export interface CoverageInputs {
  census: CensusReport
  routes: RoutesReport
  edges: EdgesReport
  slices: SlicesReport
  skeleton?: SkeletonReport | null
  jpaModel?: JpaModel | null
  interfaces?: InterfaceReport | null
  batchJobs?: BatchJobsReport | null
  programInventory?: ProgramInventory | null
}

/** 스캔 산출물에서 통합 커버리지 리포트를 결정론으로 조립(AC-30). */
export function buildCoverageReport(inputs: CoverageInputs): CoverageReport {
  const { census, routes, edges, slices } = inputs

  // 언어별 파일 분포
  const langCounts = new Map<string, number>()
  for (const f of census.files) langCounts.set(f.lang, (langCounts.get(f.lang) ?? 0) + 1)
  const byLang = [...langCounts.entries()]
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => cmp(a.lang, b.lang))
  const nonJavaPassthrough = census.files.filter((f) => f.lang !== 'java').length

  // 계층 해소(동적, AC-2 신호 + JPA 신호 병합)
  const signals = buildLayerSignals(routes, edges, inputs.jpaModel ?? null)
  const layerCounts = new Map<string, number>()
  for (const f of census.files) {
    const layer = deriveStepLayer(f.relPath, null, signals)
    layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1)
  }
  const unknown = layerCounts.get('unknown') ?? 0
  const resolved = census.files.length - unknown
  const byLayer = [...layerCounts.entries()]
    .map(([layer, count]) => ({ layer, count }))
    .sort((a, b) => cmp(a.layer, b.layer))

  // 도달성(ownership)
  let reached = 0
  let unreached = 0
  for (const o of slices.ownership) {
    if (o.status === 'unreached') unreached++
    else reached++
  }

  const droppedSteps = (inputs.skeleton?.truncatedSteps ?? []).reduce((n, t) => n + t.dropped.length, 0)
  const jpa = {
    entities: inputs.jpaModel?.entities.length ?? 0,
    repositories: inputs.jpaModel?.repositories.length ?? 0,
    tierCQueries:
      inputs.jpaModel?.repositories.reduce(
        (n, r) => n + r.queries.filter((q) => q.native).length,
        0,
      ) ?? 0,
  }

  const interfaces = inputs.interfaces
    ? {
        total: inputs.interfaces.stats.total,
        unresolvedEndpoints: inputs.interfaces.stats.unresolvedEndpoints,
        byProtocol: inputs.interfaces.stats.byProtocol.map((p) => ({
          protocol: p.protocol as string,
          count: p.count,
        })),
        suspectSignals: inputs.interfaces.suspectSignals.count,
      }
    : undefined

  const batch = inputs.batchJobs
    ? {
        total: inputs.batchJobs.stats.total,
        byTrigger: inputs.batchJobs.stats.byTrigger,
        unresolvedHandlers: inputs.batchJobs.stats.unresolvedHandlers,
        suspectSignals: inputs.batchJobs.suspectSignals.count,
      }
    : undefined

  const programs = inputs.programInventory
    ? {
        total: inputs.programInventory.stats.total,
        byType: inputs.programInventory.stats.byType.map((t) => ({
          type: t.type as string,
          count: t.count,
        })),
        unadjustedFp: inputs.programInventory.fp.summary.unadjustedFp,
      }
    : undefined

  return CoverageReportSchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    langSupport: computeLangSupport(census),
    files: { total: census.fileCount, byLang, nonJavaPassthrough },
    layers: { resolved, unknown, rate: pct(resolved, census.files.length), byLayer },
    reachability: { reached, unreached, rate: pct(reached, reached + unreached) },
    edges: {
      resolved: edges.edges.length,
      unresolved: edges.unresolved.length,
      rate: pct(edges.edges.length, edges.edges.length + edges.unresolved.length),
    },
    droppedSteps,
    jpa,
    ...(interfaces ? { interfaces } : {}),
    ...(batch ? { batch } : {}),
    ...(programs ? { programs } : {}),
  })
}

/** 커버리지 리포트를 한국어 텍스트로 렌더(결정론, 사용자 보고용). */
export function renderCoverageReport(r: CoverageReport): string {
  const lines: string[] = [
    '# 분석 커버리지 리포트',
    '',
    `- 스캔 파일: ${r.files.total}개 (비-Java 패스스루 ${r.files.nonJavaPassthrough}개 — UA 네이티브가 덮음)`,
    `  - 언어별: ${r.files.byLang.map((l) => `${l.lang} ${l.count}`).join(', ')}`,
    ...(r.langSupport && r.langSupport.unsupportedFiles > 0
      ? [
          `  ⚠️ 스캐너 미지원 소스 ${r.langSupport.unsupportedFiles}파일 [미확인] — ` +
            r.langSupport.byLang
              .filter((l) => l.best === 'none')
              .map((l) => `${l.lang} ${l.files}`)
              .join(' · ') +
            ' (어떤 스캐너도 덮지 않음 — docs/ktds/COVERAGE_MATRIX.md 지원 수준 참조)',
        ]
      : []),
    ...(r.langSupport && r.langSupport.partialFiles > 0
      ? [
          `  ◐ 부분 지원 소스 ${r.langSupport.partialFiles}파일 — ` +
            r.langSupport.byLang
              .filter((l) => l.best === 'partial')
              .map((l) => `${l.lang} ${l.files}`)
              .join(' · ') +
            ' (좁은 관용구만 스캔 — "지원"으로 오독 금지, 범위는 COVERAGE_MATRIX.md 비고)',
        ]
      : []),
    `- 계층 해소율: ${r.layers.rate}% (해소 ${r.layers.resolved} / 미해소 ${r.layers.unknown})`,
    `  - 계층별: ${r.layers.byLayer.map((l) => `${l.layer} ${l.count}`).join(', ')}`,
    `- 도달성: ${r.reachability.rate}% (도달 ${r.reachability.reached} / 미도달 ${r.reachability.unreached})`,
    `- 엣지 해소율: ${r.edges.rate}% (해소 ${r.edges.resolved} / 미해소 ${r.edges.unresolved})`,
    `- cap 절단 step(침묵 누락 방지): ${r.droppedSteps}개`,
    `- JPA: 엔티티 ${r.jpa.entities} · 리포지토리 ${r.jpa.repositories} · Tier C(native [확인필요]) ${r.jpa.tierCQueries}`,
    ...(r.interfaces
      ? [
          `- 대외 인터페이스: ${r.interfaces.total}건 (미해석 endpoint ${r.interfaces.unresolvedEndpoints}건)` +
            (r.interfaces.byProtocol.length > 0
              ? ` — ${r.interfaces.byProtocol.map((p) => `${p.protocol} ${p.count}`).join(', ')}`
              : ''),
          ...(r.interfaces.total === 0 && r.interfaces.suspectSignals > 0
            ? [
                `  ⚠️ 탐지 0건이지만 의심 신호 ${r.interfaces.suspectSignals}건(http 리터럴/jdbc/wsdl) — ` +
                  `"연계 없음"이 아니라 사내 공통연계모듈일 수 있음. understanding.config.json ` +
                  `interfaceScan.clients 로 공통모듈 시그니처를 등록하세요(.spec/map/interfaces.json suspectSignals.samples 참조).`,
              ]
            : []),
        ]
      : []),
    ...(r.programs
      ? [
          `- 프로그램: ${r.programs.total}본 — ${r.programs.byType.map((t) => `${t.type} ${t.count}`).join(', ')}`,
          `- 잠정 FP(간이법 미조정, [추정]): ${r.programs.unadjustedFp}`,
        ]
      : []),
    ...(r.batch
      ? [
          `- 배치 잡: ${r.batch.total}건` +
            (r.batch.byTrigger.length > 0
              ? ` — ${r.batch.byTrigger.map((t) => `${t.trigger} ${t.count}`).join(', ')}`
              : '') +
            (r.batch.unresolvedHandlers > 0
              ? ` (핸들러 미해석 ${r.batch.unresolvedHandlers}건 [미확인])`
              : ''),
          ...(r.batch.suspectSignals > 0
            ? [
                `  ⚠️ 잡 명명 관례(*Job/*Batch/*Tasklet)인데 트리거에 안 물린 클래스 ${r.batch.suspectSignals}건 — ` +
                  `누락 배치일 수 있음(.spec/map/batch-jobs.json suspectSignals.samples 참조).`,
              ]
            : []),
        ]
      : []),
    '',
    '> 정직성: 미도달·미해소·cap 절단·비-Java 패스스루·Tier C 는 "분석이 덮지 못한/추정한 영역"으로 그대로 노출됩니다.',
  ]
  return lines.join('\n') + '\n'
}
