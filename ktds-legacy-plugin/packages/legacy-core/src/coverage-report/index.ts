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
      }
    : undefined

  return CoverageReportSchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit,
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
  })
}

/** 커버리지 리포트를 한국어 텍스트로 렌더(결정론, 사용자 보고용). */
export function renderCoverageReport(r: CoverageReport): string {
  const lines: string[] = [
    '# 분석 커버리지 리포트',
    '',
    `- 스캔 파일: ${r.files.total}개 (비-Java 패스스루 ${r.files.nonJavaPassthrough}개 — UA 네이티브가 덮음)`,
    `  - 언어별: ${r.files.byLang.map((l) => `${l.lang} ${l.count}`).join(', ')}`,
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
        ]
      : []),
    '',
    '> 정직성: 미도달·미해소·cap 절단·비-Java 패스스루·Tier C 는 "분석이 덮지 못한/추정한 영역"으로 그대로 노출됩니다.',
  ]
  return lines.join('\n') + '\n'
}
