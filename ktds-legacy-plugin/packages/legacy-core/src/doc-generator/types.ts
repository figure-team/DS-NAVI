/**
 * doc-generator 데이터 모델 (P4.1) — 결정론 산출물 문서의 단일 소스.
 *
 * doc-templates.md(§0 공통 계약)가 권위(AUTHORITY)다. confidence 는
 * `../types.js` 의 CONFIDENCE_VALUES 단일 소스에서만 가져온다(중복 정의 금지).
 *
 * zod 스키마 + z.infer 타입으로 정의해 손편집/버전 스큐를 조용히 통과시키지 않는다.
 */
import { z } from 'zod'
import { CONFIDENCE_VALUES } from '../types.js'

/** 방법론 모듈 — as-built(현행 추출) / si-standard(SI 제출 서식). */
export const MethodologySchema = z.enum(['as-built', 'si-standard'])
export type Methodology = z.infer<typeof MethodologySchema>

/** 문서 상태(doc-state) — 사람 확정은 confidence 가 아니라 이 status 로 기록(§0). */
export const DocStatusSchema = z.enum(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'RETURNED'])
export type DocStatus = z.infer<typeof DocStatusSchema>

/** confidence 등급 — CONFIDENCE_VALUES 단일 소스와 일치(중복 정의 금지). */
export const ConfidenceSchema = z.enum(CONFIDENCE_VALUES)

/** 근거 앵커 — file:line(+선택 snippet). line 미상이면 null(동적/불명). */
export const EvidenceSchema = z.object({
  file: z.string(),
  line: z.number().int().nullable(),
  snippet: z.string().optional(),
})
export type Evidence = z.infer<typeof EvidenceSchema>

/**
 * 단일 주장(claim) — 텍스트 + 신뢰도 + 근거 + 사람 검토 필요 플래그.
 * CONFIRMED 는 근거 0이면 안 된다(§0 evidence enforcement) — claim() 헬퍼가 강제.
 */
export const ClaimSchema = z.object({
  text: z.string(),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceSchema),
  requiresHumanReview: z.boolean(),
})
export type Claim = z.infer<typeof ClaimSchema>

/**
 * 표 행(table row) — SI표준 정형 문서(§2)용. 각 행 = 1 claim(§3.2)이므로
 * cells(셀 값) + confidence(신뢰도) + evidence(근거)를 동반한다. 신뢰도/근거는
 * 전용 열로 렌더되며(template §2), CONFIRMED 강제는 claim() 과 동일하게 적용한다.
 */
export const TableRowSchema = z.object({
  cells: z.array(z.string()),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceSchema),
})
export type TableRow = z.infer<typeof TableRowSchema>

/**
 * 표 모델(table) — SI표준 정형 문서(§2)의 표 중심 양식. columns 는 신뢰도/근거를
 * 제외한 도메인 열만(렌더러가 신뢰도/근거 열을 자동 부가). rows 의 cells.length 는
 * columns.length 와 일치해야 한다(결정론 렌더 보장).
 */
export const TableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(TableRowSchema),
})
export type Table = z.infer<typeof TableSchema>

/**
 * 문서 섹션 — 헤딩 + 선택적 산문(prose, 골든 비대상) + claim 목록.
 * table 은 선택(SI표준 정형 문서 §2 표 중심 섹션). as-built 섹션은 claims 만 쓴다.
 */
export const SectionSchema = z.object({
  heading: z.string(),
  /**
   * 바인딩 키(선택) — 런타임 문서 템플릿(doc-template)이 섹션을 식별해 헤딩/컬럼/순서를
   * 덮어쓰는 안정 키(렌더에는 안 나옴). 빌더가 부여하며, 템플릿 미적용 시 무시된다.
   */
  key: z.string().optional(),
  prose: z.string().optional(),
  claims: z.array(ClaimSchema),
  table: TableSchema.optional(),
})
export type Section = z.infer<typeof SectionSchema>

/** 생성 문서 모델 — docId/title/methodology + 섹션 목록(§0 데이터 모델). */
export const GeneratedDocSchema = z.object({
  docId: z.string(),
  title: z.string(),
  methodology: MethodologySchema,
  sections: z.array(SectionSchema),
})
export type GeneratedDoc = z.infer<typeof GeneratedDocSchema>

/**
 * 프런트매터(DocMeta) — §0 YAML 헤더의 단일 소스.
 * sourceCommit/evidenceRate 는 호출자가 주입(결정론: Date.now() 미사용).
 */
export const DocMetaSchema = z.object({
  docId: z.string(),
  title: z.string(),
  methodology: MethodologySchema,
  status: DocStatusSchema,
  sourceCommit: z.string().nullable(),
  evidenceRate: z.number(),
})
export type DocMeta = z.infer<typeof DocMetaSchema>
