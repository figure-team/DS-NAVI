/**
 * 정책 신호 데이터 계약(정책서 P1) — zod 스키마 + z.infer 타입.
 *
 * 정책 신호(PolicySignal)는 코드/DB 에서 결정론으로 추출한 "정책의 앵커"다. 규범 진술·
 * 역할 표현식 같은 값/의미는 후속(P3)에서 LLM 이 앵커 소스를 읽어 보강하고 [추정] 표기한다.
 * 따라서 신호의 confidence 는 "앵커 존재"의 신뢰도(어노테이션/DDL 명시 = CONFIRMED)이며,
 * 해석의 신뢰도가 아니다.
 *
 * 결정론: 신호는 생산자에서 (category, file, line, kind, subject) 로 정렬. Evidence/Confidence
 * 는 기존 단일 소스(doc-generator EvidenceSchema, types CONFIDENCE_VALUES)를 재사용.
 */
import { z } from 'zod'
import { CONFIDENCE_VALUES } from '../types.js'
import { EvidenceSchema } from '../doc-generator/types.js'

/** `.spec/map/` 정규 산출물 파일명. */
export const POLICY_SIGNALS_FILENAME = 'policy-signals.json'

/** 정책 카테고리(사용자 정의 9종). PoC: glossary/data/validation/authz. */
export const PolicyCategorySchema = z.enum([
  'glossary', // 용어/도메인 사전
  'status', // 상태값 정책
  'authz', // 권한 매트릭스
  'account', // 회원/계정 정책
  'validation', // 업무 규칙(Validation)
  'billing', // 과금/정산/환불
  'data', // 데이터 정책
  'integration', // 연동/외부 정책
  'security', // 보안 정책
])
export type PolicyCategory = z.infer<typeof PolicyCategorySchema>

/** 정책 신호 1건 — 카테고리 + 신호종류 + 대상 + 근거 앵커. */
export const PolicySignalSchema = z.object({
  category: PolicyCategorySchema,
  /** 신호 종류(예: table, column-comment, enum, constraint, fk, check, bean-validation, class-authz, method-authz). */
  kind: z.string(),
  /** 신호 대상 식별자(예: `member`, `member.email`, `MemberService#deleteMember`). */
  subject: z.string(),
  /** 사람이 읽는 신호 설명(어노테이션명/제약식/주석 등 결정론 원문). */
  detail: z.string(),
  anchor: EvidenceSchema,
  confidence: z.enum(CONFIDENCE_VALUES),
})
export type PolicySignal = z.infer<typeof PolicySignalSchema>

/** 정책 신호 집합 — .spec/map/policy-signals.json 의 단일 소스. */
export const PolicySignalSetSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  signals: z.array(PolicySignalSchema),
  /** 추출 못한 신호(보고, 누락 금지). */
  unresolved: z.array(z.object({ ref: z.string(), reason: z.string() })),
})
export type PolicySignalSet = z.infer<typeof PolicySignalSetSchema>
