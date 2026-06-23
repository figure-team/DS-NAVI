/**
 * RTM(요구사항 추적표) 데이터 모델 — R1 단일 소스(구조화 산출물 rtm.json).
 *
 * 설계: docs/ktds/RTM_TAB_DESIGN.md. doc-generator 와 동형으로 zod 스키마 + z.infer.
 * confidence 는 ../types.js 의 CONFIDENCE_VALUES 단일 소스에서만 가져온다(중복 정의 금지).
 * evidence 앵커는 doc-generator 의 EvidenceSchema 를 재사용한다(file:line 동일 계약).
 *
 * R1 범위: AS-IS(코드 근거)만. 요구사항(requirements)/이력(requirementHistory)/TO-BE 상태는
 * R4/R5 에서 채운다 — 스키마는 처음부터 이를 수용하되 R1 산출은 requirements=[] 이다.
 */
import { z } from 'zod'
import { CONFIDENCE_VALUES } from '../types.js'
import { EvidenceSchema } from '../doc-generator/types.js'

/** confidence 등급 — CONFIDENCE_VALUES 단일 소스와 일치(중복 정의 금지). */
export const RtmConfidenceSchema = z.enum(CONFIDENCE_VALUES)

/**
 * 추적 셀(trace cell) — 한 기능의 한 추적 축(진입점/구현/데이터/테스트)의 값 + 근거.
 * value 는 표시 텍스트(없으면 ''), confidence/evidence 는 grounding 계약(CONFIRMED 는 근거≥1).
 */
export const RtmTraceCellSchema = z.object({
  value: z.string(),
  confidence: RtmConfidenceSchema,
  evidence: z.array(EvidenceSchema),
})
export type RtmTraceCell = z.infer<typeof RtmTraceCellSchema>

/** 기능 출처 — AS-IS(기존 코드 추출) / TO-BE(요청 분해, R5). R1 은 전부 AS_IS. */
export const RtmOriginSchema = z.enum(['AS_IS', 'TO_BE'])
export type RtmOrigin = z.infer<typeof RtmOriginSchema>

/**
 * 기능 상태 — 현행 요구사항 head 기준 재계산값(설계 §1 불변규칙). R1(요구사항 없음)은
 * 구현 근거 보유 시 IMPLEMENTED, 아니면 PLANNED. 나머지(CHANGED/ORPHANED/PARTIAL)는 R4+.
 */
export const RtmFunctionStateSchema = z.enum([
  'IMPLEMENTED',
  'PARTIAL',
  'PLANNED',
  'CHANGED',
  'ORPHANED',
])
export type RtmFunctionState = z.infer<typeof RtmFunctionStateSchema>

/**
 * 기능 행(RTM 뷰① 한 행) — flow 노드 1개 = 기능 1개. 추적 4축 셀 + 도메인 귀속 + 상태.
 * requirementHistory 는 이 기능을 건드린 요구사항 id 순서(R4+); R1 은 [].
 */
export const RtmFunctionRowSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  name: z.string(),
  domainId: z.string(),
  domainName: z.string(),
  entryPoint: RtmTraceCellSchema,
  implementation: RtmTraceCellSchema,
  data: RtmTraceCellSchema,
  test: RtmTraceCellSchema,
  origin: RtmOriginSchema,
  state: RtmFunctionStateSchema,
  requirementHistory: z.array(z.string()),
})
export type RtmFunctionRow = z.infer<typeof RtmFunctionRowSchema>

/** 도메인 그룹 헤더(뷰① 그룹) — id/표시명 + 소속 기능 수. */
export const RtmDomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  functionCount: z.number().int(),
})
export type RtmDomain = z.infer<typeof RtmDomainSchema>

/**
 * 변경 묶음(changeset) — 한 요구사항이 기능 집합에 가한 분류(설계 §1·뷰②). R4+ 에서 채운다.
 * fnId 배열만 담고 상태는 기능 행에서 현행 head 기준 재계산한다(중복 진실 방지).
 */
export const RtmChangesetSchema = z.object({
  added: z.array(z.string()),
  modified: z.array(z.string()),
  removed: z.array(z.string()),
  revived: z.array(z.string()),
})
export type RtmChangeset = z.infer<typeof RtmChangesetSchema>

/**
 * 요구사항(RTM 뷰② 한 행) — 고객 요청 1건 + supersede 체인 + changeset(R4+).
 * R1 산출은 비어 있다(자동 도출 기능엔 아직 요구사항이 귀속되지 않음 — 인테이크=R5).
 */
export const RtmRequirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(['ACTIVE', 'SUPERSEDED']),
  supersedes: z.string().nullable(),
  supersededBy: z.string().nullable(),
  source: z.object({ kind: z.string(), raw: z.string() }).nullable(),
  changeset: RtmChangesetSchema,
})
export type RtmRequirement = z.infer<typeof RtmRequirementSchema>

/**
 * rtm.json — RTM 구조화 산출물(생성물, 불변). 사람 편집/확정은 rtm-overrides.json 오버레이(R3).
 * 모든 배열은 빌더에서 정렬되어 byte-identical 재실행을 보장한다(Date.now 미사용).
 */
export const RtmModelSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  domains: z.array(RtmDomainSchema),
  functions: z.array(RtmFunctionRowSchema),
  requirements: z.array(RtmRequirementSchema),
})
export type RtmModel = z.infer<typeof RtmModelSchema>
