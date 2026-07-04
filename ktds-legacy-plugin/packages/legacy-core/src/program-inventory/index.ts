/**
 * program-inventory(W3) — 프로그램 목록 + FP 산정 기초.
 *
 * 프로그램 1건 = census 소스 파일(java·jsp·MyBatis 매퍼 XML). 유형은 라우트(W 기존)·
 * 배치(W2)·계층 신호(AC-2)·매퍼 판독으로 결정론 판별(우선순위: 화면>API>배치>계층>공통).
 * FP 후보는 라우트(EI/EQ [추정])·db-schema 테이블(ILF)·W1 db-link(EIF)에서 추출하고
 * 간이법 평균복잡도 가중치로 미조정(unadjusted) 잠정 FP 를 [추정] 산출한다.
 *
 * 결정론: programs (type, filePath) / transactions (routeId) / dataFunctions (kind, name)
 * 정렬, 내용 파생 안정 id(PGM-<태그>-<sha256 8hex>, filePath 시드). 0건도 기록.
 * 정직성: EO 는 정적 판별 불가 — 합성하지 않고 문서 범례로 사람 재분류를 안내한다.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { buildLayerSignals, deriveStepLayer } from '../domain-map/step-layer.js'
import type { CensusReport, EdgesReport, RoutesReport } from '../domain-map/types.js'
import type { JpaModel } from '../jpa/types.js'
import type { DbSchemaModel } from '../db-schema/types.js'
import type { InterfaceReport } from '../interface-scan/types.js'
import type { BatchJobsReport } from '../batch-scan/report.js'

/** `.spec/map/` 프로그램 인벤토리 파일명. */
export const PROGRAM_INVENTORY_FILENAME = 'program-inventory.json'

export const ProgramTypeSchema = z.enum([
  'screen',
  'api',
  'batch',
  'service',
  'dao',
  'db',
  'mapper-xml',
  'common',
])
export type ProgramType = z.infer<typeof ProgramTypeSchema>

export const ProgramSchema = z.object({
  /** `PGM-<유형태그>-<sha256 8hex>` — filePath 시드(재스캔 안정). */
  id: z.string(),
  /** 파일 basename(확장자 제거) — 업무명은 문서에서 [미확인] 사람 채움. */
  name: z.string(),
  filePath: z.string(),
  type: ProgramTypeSchema,
  layer: z.string(),
  /** 파일 라인 수(결정론 규모 근거). */
  loc: z.number().int().nonnegative(),
  /** 부가 역할·근거(route:R-xxx, batch:BAT-xxx, also:api 등). 정렬됨. */
  notes: z.array(z.string()),
})
export type Program = z.infer<typeof ProgramSchema>

export const FpTransactionSchema = z.object({
  /** EI|EQ — method 기반 잠정 분류([추정]). EO 는 사람 재분류 대상. */
  kind: z.enum(['EI', 'EQ']),
  routeId: z.string(),
  method: z.string(),
  path: z.string(),
  evidence: z.object({ file: z.string(), line: z.number().int() }),
})
export type FpTransaction = z.infer<typeof FpTransactionSchema>

export const FpDataFunctionSchema = z.object({
  /** ILF(자체 테이블) | EIF(DB링크 참조) — [추정]. */
  kind: z.enum(['ILF', 'EIF']),
  name: z.string(),
  evidence: z.object({ file: z.string(), line: z.number().int() }),
})
export type FpDataFunction = z.infer<typeof FpDataFunctionSchema>

export const ProgramInventorySchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  programs: z.array(ProgramSchema),
  fp: z.object({
    transactions: z.array(FpTransactionSchema),
    dataFunctions: z.array(FpDataFunctionSchema),
    /**
     * 간이법(평균복잡도) 미조정 잠정 FP — 전부 [추정].
     * 가중치: ILF 7.5 · EIF 5.4 · EI 4.0 · EO 5.2 · EQ 3.9 (eo 는 정적 판별 불가로 0).
     */
    summary: z.object({
      ei: z.number().int().nonnegative(),
      eo: z.number().int().nonnegative(),
      eq: z.number().int().nonnegative(),
      ilf: z.number().int().nonnegative(),
      eif: z.number().int().nonnegative(),
      unadjustedFp: z.number().nonnegative(),
    }),
  }),
  stats: z.object({
    total: z.number().int().nonnegative(),
    byType: z.array(
      z.object({ type: ProgramTypeSchema, count: z.number().int().nonnegative() }),
    ),
  }),
})
export type ProgramInventory = z.infer<typeof ProgramInventorySchema>

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 유형 → id 태그. */
const TYPE_TAG: Record<ProgramType, string> = {
  screen: 'SCR',
  api: 'API',
  batch: 'BAT',
  service: 'SVC',
  dao: 'DAO',
  db: 'DB',
  'mapper-xml': 'MAP',
  common: 'COM',
}

/** 간이법 평균복잡도 가중치(미조정). */
export const FP_WEIGHTS = { ei: 4.0, eo: 5.2, eq: 3.9, ilf: 7.5, eif: 5.4 } as const

export interface ProgramInventoryInputs {
  census: CensusReport
  routes: RoutesReport
  edges: EdgesReport
  jpaModel?: JpaModel | null
  dbSchema?: DbSchemaModel | null
  interfaces?: InterfaceReport | null
  batchJobs?: BatchJobsReport | null
}

/** 파일 basename(확장자 제거). */
function baseNameOf(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.[^.]+$/, '')
}

/** 프로젝트 전체에서 프로그램 인벤토리 + FP 기초를 만든다(파일 기록 없음). */
export function buildProgramInventory(
  projectRoot: string,
  inputs: ProgramInventoryInputs,
): ProgramInventory {
  const { census, routes, edges } = inputs

  // 역인덱스: 파일 → 화면/API 라우트, 파일 → 배치.
  const screenRoutes = new Map<string, string[]>()
  const apiRoutes = new Map<string, string[]>()
  for (const r of routes.routes) {
    const target = r.kind === 'api' ? apiRoutes : screenRoutes
    const list = target.get(r.filePath) ?? []
    list.push(r.routeId)
    target.set(r.filePath, list)
  }
  const batchFiles = new Map<string, Set<string>>()
  for (const j of inputs.batchJobs?.jobs ?? []) {
    for (const f of new Set([j.handlerFile, j.evidence.file])) {
      if (!f || !f.endsWith('.java')) continue
      const set = batchFiles.get(f) ?? new Set<string>()
      set.add(j.id)
      batchFiles.set(f, set)
    }
  }

  const signals = buildLayerSignals(routes, edges, inputs.jpaModel ?? null)

  const programs: Program[] = []
  for (const f of census.files) {
    // kotlin 도 프로그램 단위로 포함 — 제외하면 침묵 누락(라우트 추출은 java 전용이라
    // kt 컨트롤러는 계층 관례로만 분류됨, 엔진 커버리지 한계는 coverage 가 표면화).
    const isJava = f.lang === 'java' || f.lang === 'kotlin'
    const isJsp = f.lang === 'jsp'
    const isXml = f.lang === 'xml'
    if (!isJava && !isJsp && !isXml) continue

    let text: string | null = null
    try {
      text = readFileSync(join(projectRoot, f.relPath), 'utf8')
    } catch {
      // 판독 불가 파일은 LOC 0·매퍼 판별 불가로 진행(제외하면 침묵 누락).
    }
    // XML 은 MyBatis 매퍼, 또는 라우트를 앵커하는 파일(web.xml 서블릿 매핑)만 프로그램으로
    // 센다 — 후자를 빼면 servlet 라우트가 목록에서 침묵 누락된다(jpetstore 실측으로 확인).
    const isMapperXml = isXml && text !== null && text.includes('<mapper') && text.includes('namespace')
    const hasRoute = screenRoutes.has(f.relPath) || apiRoutes.has(f.relPath)
    if (isXml && !isMapperXml && !hasRoute) continue

    const layer = deriveStepLayer(f.relPath, null, signals)
    // notes: routeId/BAT-id 는 자체 접두어를 갖는 안정 식별자 — 그대로 기록(중복 제거).
    const notes = new Set<string>()
    let type: ProgramType
    if (screenRoutes.has(f.relPath) || isJsp) {
      type = 'screen'
      for (const id of screenRoutes.get(f.relPath) ?? []) notes.add(id)
      if (apiRoutes.has(f.relPath)) notes.add('also:api')
    } else if (apiRoutes.has(f.relPath)) {
      type = 'api'
      for (const id of apiRoutes.get(f.relPath) ?? []) notes.add(id)
    } else if (batchFiles.has(f.relPath)) {
      type = 'batch'
      for (const id of batchFiles.get(f.relPath) ?? new Set<string>()) notes.add(id)
    } else if (isMapperXml) {
      type = 'mapper-xml'
    } else if (layer === 'service' || layer === 'dao' || layer === 'db') {
      type = layer
    } else {
      type = 'common'
    }
    // 화면/API 파일이 배치 핸들러이기도 하면 notes 로 표면화.
    if (type !== 'batch') for (const id of batchFiles.get(f.relPath) ?? new Set<string>()) notes.add(id)

    programs.push({
      id: `PGM-${TYPE_TAG[type]}-${createHash('sha256').update(f.relPath).digest('hex').slice(0, 8)}`,
      name: baseNameOf(f.relPath),
      filePath: f.relPath,
      type,
      layer,
      // LOC = wc -l 관례(개행 종료 파일의 빈 꼬리 세그먼트 미계상).
      loc:
        text === null || text.length === 0
          ? 0
          : text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
      notes: [...notes].sort(cmp),
    })
  }
  programs.sort((a, b) => cmp(a.type, b.type) || cmp(a.filePath, b.filePath))

  // FP 트랜잭션 후보 — 라우트 1건 = 1후보. GET/HEAD → EQ, 그 외 → EI([추정]).
  const transactions: FpTransaction[] = [...routes.routes]
    .sort((a, b) => cmp(a.routeId, b.routeId))
    .map((r) => ({
      kind: r.method === 'GET' || r.method === 'HEAD' ? ('EQ' as const) : ('EI' as const),
      routeId: r.routeId,
      method: r.method,
      path: r.path,
      evidence: { file: r.filePath, line: r.line },
    }))

  // FP 데이터 후보 — 테이블 → ILF, DB링크(링크명 dedupe) → EIF.
  const dataFunctions: FpDataFunction[] = []
  for (const t of inputs.dbSchema?.tables ?? []) {
    dataFunctions.push({
      kind: 'ILF',
      name: t.name,
      evidence: { file: t.relPath, line: t.line },
    })
  }
  const seenLinks = new Set<string>()
  for (const it of inputs.interfaces?.items ?? []) {
    if (it.protocol !== 'db-link') continue
    // ENDPOINT `TABLE@LINK` → 링크명, DDL 항목은 링크명 그대로.
    const raw = it.endpoint.resolved ?? it.endpoint.raw ?? ''
    const link = raw.includes('@') ? raw.slice(raw.indexOf('@') + 1) : raw
    if (!link || seenLinks.has(link)) continue
    seenLinks.add(link)
    dataFunctions.push({
      kind: 'EIF',
      name: link,
      evidence: { file: it.callSites[0].file, line: it.callSites[0].line },
    })
  }
  dataFunctions.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.name, b.name))

  const ei = transactions.filter((t) => t.kind === 'EI').length
  const eq = transactions.filter((t) => t.kind === 'EQ').length
  const ilf = dataFunctions.filter((d) => d.kind === 'ILF').length
  const eif = dataFunctions.filter((d) => d.kind === 'EIF').length
  // 소수 1자리 결정론 반올림(부동소수 누적 오차 방지).
  const unadjustedFp =
    Math.round(
      (ei * FP_WEIGHTS.ei + eq * FP_WEIGHTS.eq + ilf * FP_WEIGHTS.ilf + eif * FP_WEIGHTS.eif) * 10,
    ) / 10

  const typeCounts = new Map<ProgramType, number>()
  for (const p of programs) typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1)
  const byType = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => cmp(a.type, b.type))

  return ProgramInventorySchema.parse({
    schemaVersion: 1,
    gitCommit: census.gitCommit,
    programs,
    fp: {
      transactions,
      dataFunctions,
      summary: { ei, eo: 0, eq, ilf, eif, unadjustedFp },
    },
    stats: { total: programs.length, byType },
  })
}
