/**
 * domain-map 데이터 계약(zod 스키마 + z.infer 타입).
 *
 * census(파일 인구조사)와 routes(라우트/배치 추출) 산출물의 단일 소스.
 * 블루프린트 관측 동작과 골든 등가: 스키마 버전·필드명·열거값을 핀.
 * 모든 산출 배열은 생산자에서 명시 키로 정렬되어 결정론을 보장한다.
 */
import { z } from 'zod'

/** census.json — 프로젝트 파일 인구조사. */
export const CensusReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  fileCount: z.number().int(),
  files: z.array(
    z.object({
      relPath: z.string(),
      lang: z.string(),
    }),
  ),
})
export type CensusReport = z.infer<typeof CensusReportSchema>

/** HTTP 메서드 — ANY 는 메서드 미특정(매핑 전체 수용). */
export const RouteMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'ANY',
])
export type RouteMethod = z.infer<typeof RouteMethodSchema>

/** 라우트 종류 — api(데이터) / form(뷰 제출) / page(렌더) / servlet(레거시). */
export const RouteKindSchema = z.enum(['api', 'form', 'page', 'servlet'])
export type RouteKind = z.infer<typeof RouteKindSchema>

/** 라우트 프레임워크. */
export const RouteFrameworkSchema = z.enum(['spring', 'stripes', 'webxml', 'jsp', 'nextjs'])
export type RouteFramework = z.infer<typeof RouteFrameworkSchema>

/** 단일 라우트 엔트리. */
export const RouteEntrySchema = z.object({
  routeId: z.string(),
  method: RouteMethodSchema,
  path: z.string(),
  rawPath: z.string(),
  kind: RouteKindSchema,
  framework: RouteFrameworkSchema,
  filePath: z.string(),
  line: z.number().int(),
  handler: z.string().nullable(),
  notes: z.array(z.string()),
})
export type RouteEntry = z.infer<typeof RouteEntrySchema>

/** 배치/스케줄 진입점 엔트리. */
export const BatchEntrySchema = z.object({
  entryId: z.string(),
  trigger: z.enum(['scheduled', 'quartz', 'task-xml', 'main']),
  schedule: z.string().nullable(),
  filePath: z.string(),
  line: z.number().int(),
  handler: z.string().nullable(),
  notes: z.array(z.string()),
})
export type BatchEntry = z.infer<typeof BatchEntrySchema>

/** routes.json — 라우트/배치 추출 산출물. */
export const RoutesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  contextPath: z.string().nullable(),
  routes: z.array(RouteEntrySchema),
  batchEntries: z.array(BatchEntrySchema),
})
export type RoutesReport = z.infer<typeof RoutesReportSchema>

/**
 * 엣지 종류 — 파일↔파일 의존을 한정한다.
 * import(import 문) / injection(@Autowired·@Resource·@Inject) / field-type(평범한 필드 타입) /
 * ctor-param(생성자 파라미터 타입) / extends / implements / impl(인터페이스→구현) /
 * mybatis(SqlSession 문자열 호출→매퍼) / mapper-xml(매퍼 인터페이스→매퍼 XML).
 */
export const EdgeKindSchema = z.enum([
  'import',
  'injection',
  'field-type',
  'ctor-param',
  'extends',
  'implements',
  'impl',
  'mybatis',
  'mapper-xml',
])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

/** 단일 엣지 — source/target 은 census relPath. */
export const EdgeRecordSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: EdgeKindSchema,
  line: z.number().int().nullable(),
})
export type EdgeRecord = z.infer<typeof EdgeRecordSchema>

/** 미해소 참조 — 절대 조용히 누락하지 않는다(ambiguous=다중후보 / not-found=후보없음). */
export const UnresolvedSchema = z.object({
  source: z.string(),
  ref: z.string(),
  reason: z.enum(['ambiguous', 'not-found']),
})
export type Unresolved = z.infer<typeof UnresolvedSchema>

/** edges.json — 파일 의존 엣지 산출물. */
export const EdgesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  edges: z.array(EdgeRecordSchema),
  unresolved: z.array(UnresolvedSchema),
})
export type EdgesReport = z.infer<typeof EdgesReportSchema>

/** 단일 슬라이스 — 루트에서 도달 가능한 파일 집합. */
export const SliceRecordSchema = z.object({
  root: z.string(),
  entryIds: z.array(z.string()),
  reached: z.array(z.string()),
})
export type SliceRecord = z.infer<typeof SliceRecordSchema>

/** 파일 소유권 — sole(단독)/shared(공유)/unreached(미도달). */
export const OwnershipSchema = z.object({
  relPath: z.string(),
  status: z.enum(['sole', 'shared', 'unreached']),
  owners: z.array(z.string()),
})
export type Ownership = z.infer<typeof OwnershipSchema>

/** slices.json — 슬라이스/소유권 산출물. */
export const SlicesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  depthCap: z.number().int(),
  slices: z.array(SliceRecordSchema),
  ownership: z.array(OwnershipSchema),
})
export type SlicesReport = z.infer<typeof SlicesReportSchema>

/**
 * 계층(layer) — ground-truth 신호로 동적 추론(하드코딩 4계층 아님, AC-2).
 * 신호가 없으면 'unknown'(정직성: 조용히 끼워맞추지 않음).
 */
export const FlowLayerSchema = z.enum(['api', 'service', 'dao', 'db', 'unknown'])
export type FlowLayer = z.infer<typeof FlowLayerSchema>
