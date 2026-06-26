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
export const POLICY_RECONCILE_FILENAME = 'policy-reconcile.json'

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

// ── ingest·대조(P4) — "기존 문서가 있을 때" 경로 ──────────────────────────────

/**
 * 대조 상태(policyStatus).
 *  - 준수: 문서 정책 ↔ 코드/DB 신호 모두 존재(주제 매칭).
 *  - 위반: 문서가 코드/DB 와 모순(값 비교). 신호에 인자값이 없어 결정론 비교 불가 →
 *          LLM 보강(SKILL)이 앵커 소스를 읽어 판정한다(결정론 reconcile 은 부여하지 않음).
 *  - 미정의: 코드/DB 엔 있으나 문서에 없음(코드에만 — 문서 누락).
 *  - 문서에만: 문서엔 있으나 코드/DB 신호 없음(미구현 후보).
 */
export const PolicyStatusSchema = z.enum(['준수', '위반', '미정의', '문서에만'])
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>

/** 기존 정책서에서 파싱한 정책 항목 1건(정규화). */
export const PolicyItemSchema = z.object({
  category: PolicyCategorySchema,
  subject: z.string(),
  statement: z.string(),
  /** 입력 문서 내 라인(1-기반, 미상이면 null). */
  sourceLine: z.number().int().nullable(),
})
export type PolicyItem = z.infer<typeof PolicyItemSchema>

/** 대조 결과 1건 — 문서 항목과 코드/DB 신호의 매칭 판정. */
export const ReconcileEntrySchema = z.object({
  category: PolicyCategorySchema,
  subject: z.string(),
  status: PolicyStatusSchema,
  /** 문서 측 진술(문서에 없으면 null = 미정의). */
  docStatement: z.string().nullable(),
  /** 코드/DB 신호 detail(신호 없으면 null = 문서에만). */
  signalDetail: z.string().nullable(),
  /** 매칭 신호 앵커(없으면 null). */
  anchor: EvidenceSchema.nullable(),
  note: z.string(),
})
export type ReconcileEntry = z.infer<typeof ReconcileEntrySchema>

/** 대조 결과 — .spec/map/policy-reconcile.json 의 단일 소스. */
export const ReconcileResultSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  entries: z.array(ReconcileEntrySchema),
  summary: z.object({
    준수: z.number().int().nonnegative(),
    위반: z.number().int().nonnegative(),
    미정의: z.number().int().nonnegative(),
    문서에만: z.number().int().nonnegative(),
  }),
  unresolved: z.array(z.object({ ref: z.string(), reason: z.string() })),
})
export type ReconcileResult = z.infer<typeof ReconcileResultSchema>
