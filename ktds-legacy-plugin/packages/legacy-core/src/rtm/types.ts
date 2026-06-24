/**
 * RTM(요구사항 추적표) 데이터 모델 — 단일 소스(구조화 산출물 rtm.json).
 *
 * 설계: docs/ktds/RTM_TAB_DESIGN.md. doc-generator 와 동형으로 zod 스키마 + z.infer.
 * confidence 는 ../types.js 의 CONFIDENCE_VALUES 단일 소스에서만 가져온다(중복 정의 금지).
 *
 * v2 확장(9개 빈틈 반영): ①인수조건(AC) 계층 ②비기능요구(NFR) ③검증 스파인(시험결과·결함·고객검수)
 * ④요구사항 lifecycle ⑤요구사항 메타 ⑥커버리지 롤업 ⑦요구사항 의존성 ⑧산출물 연계 ⑨변경관리.
 * 후방호환: 신규 필드는 default/optional 로 둬 기존 산출물·인테이크가 점진 채택한다.
 *
 * 범위: AS-IS(코드 근거)는 buildRtm, 요구사항/AC/상태 재계산은 applyRequirements, 커버리지는
 * computeCoverage. 모든 배열은 결정론 정렬(byte-identical 재실행, Date.now 미사용).
 */
import { z } from 'zod'
import { CONFIDENCE_VALUES } from '../types.js'
import { EvidenceSchema } from '../doc-generator/types.js'

/** confidence 등급 — CONFIDENCE_VALUES 단일 소스와 일치. */
export const RtmConfidenceSchema = z.enum(CONFIDENCE_VALUES)

/** 추적 셀 — 한 추적 축(진입점/구현/데이터/테스트)의 값 + 근거. */
export const RtmTraceCellSchema = z.object({
  value: z.string(),
  confidence: RtmConfidenceSchema,
  evidence: z.array(EvidenceSchema),
})
export type RtmTraceCell = z.infer<typeof RtmTraceCellSchema>

// ── ③ 검증 스파인 ───────────────────────────────────────────────────────────
/** 시험 결과 — 통과/실패/해당없음/미실행. */
export const TestResultSchema = z.enum(['PASS', 'FAIL', 'NA', 'UNTESTED'])
export type TestResult = z.infer<typeof TestResultSchema>

/** 테스트 참조 — 케이스 + 결과 + 결함 연계(실패 시). 한 AC/기능의 검증 단위. */
export const TestRefSchema = z.object({
  caseId: z.string(),
  result: TestResultSchema.default('UNTESTED'),
  defectId: z.string().nullable().default(null),
  note: z.string().optional(),
})
export type TestRef = z.infer<typeof TestRefSchema>

// ── ① 인수조건(업무규칙) 계층 ────────────────────────────────────────────────
/** 인수조건 유형 — 분기/선행조건/후행액션/예외/일반규칙. */
export const AcKindSchema = z.enum(['branch', 'precondition', 'postcondition', 'exception', 'rule'])
export type AcKind = z.infer<typeof AcKindSchema>

/**
 * 인수조건(Acceptance Criterion) — 검증 가능한 조건 1개. 요구사항과 기능 사이 N:M 다리.
 * fnIds 로 구현 기능을 매핑(changeset 도출의 근거). tests 로 검증(③).
 */
export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: AcKindSchema.default('rule'),
  fnIds: z.array(z.string()).default([]),
  confidence: RtmConfidenceSchema.default('INFERRED'),
  tests: z.array(TestRefSchema).default([]),
})
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>

// ── 기능 행 ──────────────────────────────────────────────────────────────────
export const RtmOriginSchema = z.enum(['AS_IS', 'TO_BE'])
export type RtmOrigin = z.infer<typeof RtmOriginSchema>

export const RtmFunctionStateSchema = z.enum([
  'IMPLEMENTED',
  'PARTIAL',
  'PLANNED',
  'CHANGED',
  'ORPHANED',
])
export type RtmFunctionState = z.infer<typeof RtmFunctionStateSchema>

/** 산출물 연계(⑧) — 이 기능/요구가 반영된 SI 문서 항목(docId + 앵커). */
export const DeliverableRefSchema = z.object({
  docId: z.string(),
  anchor: z.string().optional(),
})
export type DeliverableRef = z.infer<typeof DeliverableRefSchema>

/** 기능에 걸린 업무규칙 역참조(①) — 현행 요구사항들의 AC 를 이 기능 관점으로 집계. */
export const RtmFunctionRuleSchema = z.object({
  reqId: z.string(),
  acId: z.string(),
  text: z.string(),
  kind: AcKindSchema,
  confidence: RtmConfidenceSchema,
})
export type RtmFunctionRule = z.infer<typeof RtmFunctionRuleSchema>

/**
 * 기능 행(RTM 뷰① 한 행) — flow 노드 1개 = 기능 1개. 추적 4축 + 도메인 귀속 + 상태.
 * v2: nfrTags(②) · rules(①, 현행 head 집계) · deliverableRefs(⑧).
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
  nfrTags: z.array(z.string()).default([]),
  rules: z.array(RtmFunctionRuleSchema).default([]),
  deliverableRefs: z.array(DeliverableRefSchema).default([]),
})
export type RtmFunctionRow = z.infer<typeof RtmFunctionRowSchema>

/** 도메인 그룹 헤더. */
export const RtmDomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  functionCount: z.number().int(),
})
export type RtmDomain = z.infer<typeof RtmDomainSchema>

/** 변경 묶음(changeset) — 한 요구사항이 기능 집합에 가한 분류(−/~/+/=). */
export const RtmChangesetSchema = z.object({
  added: z.array(z.string()),
  modified: z.array(z.string()),
  removed: z.array(z.string()),
  revived: z.array(z.string()),
})
export type RtmChangeset = z.infer<typeof RtmChangesetSchema>

// ── ②④⑤⑦⑨ 요구사항 메타/유형/상태/의존/변경관리 ──────────────────────────────
/** 요구사항 유형(②) — 기능 / 비기능. */
export const RequirementTypeSchema = z.enum(['functional', 'nonfunctional'])
export type RequirementType = z.infer<typeof RequirementTypeSchema>

/** 비기능 분류(②) — 성능/보안/가용성/확장성/사용성/유지보수성/규정준수/기타. */
export const NfrCategorySchema = z.enum([
  'performance',
  'security',
  'availability',
  'scalability',
  'usability',
  'maintainability',
  'compliance',
  'other',
])
export type NfrCategory = z.infer<typeof NfrCategorySchema>

/** 요구사항 진행상태(④, lifecycle) — 접수→분석→설계→개발→시험→완료 / 보류 / 반려. */
export const RequirementLifecycleSchema = z.enum([
  'RECEIVED',
  'ANALYZING',
  'DESIGNING',
  'DEVELOPING',
  'TESTING',
  'DONE',
  'HOLD',
  'REJECTED',
])
export type RequirementLifecycle = z.infer<typeof RequirementLifecycleSchema>

/** 우선순위(⑤). */
export const PrioritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export type Priority = z.infer<typeof PrioritySchema>

/** 요구사항 출처/메타(⑤) — 원문 + 요청자·출처문서·요청일·대상 릴리스. */
export const RequirementSourceSchema = z
  .object({
    kind: z.string(),
    raw: z.string(),
    requester: z.string().optional(),
    doc: z.string().optional(),
    section: z.string().optional(),
    requestedAt: z.string().optional(),
    targetRelease: z.string().optional(),
  })
  .nullable()
export type RequirementSource = z.infer<typeof RequirementSourceSchema>

/** 변경관리 메타(⑨) — CR 번호·사유·승인자·영향공수(영향도 엔진 산정 연계). */
export const ChangeReqSchema = z
  .object({
    crNo: z.string().nullable().default(null),
    reason: z.string().nullable().default(null),
    approver: z.string().nullable().default(null),
    effort: z.string().nullable().default(null),
  })
  .nullable()
export type ChangeReq = z.infer<typeof ChangeReqSchema>

/** 고객 검수(③ 2축) — 내부확정과 별개로 고객이 요구 충족을 승인하는 축. */
export const SignoffSchema = z
  .object({
    approved: z.boolean(),
    by: z.string().nullable().default(null),
    at: z.string().nullable().default(null),
  })
  .nullable()
export type Signoff = z.infer<typeof SignoffSchema>

/**
 * 요구사항(RTM 뷰② 한 행) — 고객 요청 1건. v2: 유형(②)·메타(⑤)·lifecycle(④)·의존(⑦)·
 * 변경관리(⑨)·고객검수(③)·인수조건(①). changeset 은 AC fnIds 와 일치(applyRequirements 가 검증/도출).
 */
export const RtmRequirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: RequirementTypeSchema.default('functional'),
  nfrCategory: NfrCategorySchema.nullable().default(null),
  /** 비기능 횡단 귀속(②) — 도메인/기능 id 태그. 비면 시스템 전체. */
  nfrScope: z.array(z.string()).default([]),
  priority: PrioritySchema.default('MEDIUM'),
  lifecycle: RequirementLifecycleSchema.default('RECEIVED'),
  status: z.enum(['ACTIVE', 'SUPERSEDED']),
  supersedes: z.string().nullable(),
  supersededBy: z.string().nullable(),
  dependsOn: z.array(z.string()).default([]),
  source: RequirementSourceSchema,
  changeReq: ChangeReqSchema.default(null),
  signoff: SignoffSchema.default(null),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
  changeset: RtmChangesetSchema,
})
export type RtmRequirement = z.infer<typeof RtmRequirementSchema>

// ── ⑥ 커버리지 / 갭 롤업 ─────────────────────────────────────────────────────
/**
 * 커버리지 리포트(⑥) — 요구사항/기능 단위 구현·검증 집계 + 양방향 갭. computeCoverage 가 산출.
 * RTM 의 핵심 가치(빈칸=위험)를 요약 수치로 드러낸다.
 */
export const RtmCoverageSchema = z.object({
  requirements: z.object({
    total: z.number().int(),
    implemented: z.number().int(),
    verified: z.number().int(),
    signedOff: z.number().int(),
    byLifecycle: z.record(z.string(), z.number().int()),
  }),
  functions: z.object({
    total: z.number().int(),
    implemented: z.number().int(),
    planned: z.number().int(),
    orphaned: z.number().int(),
    confirmed: z.number().int(),
  }),
  tests: z.object({
    total: z.number().int(),
    pass: z.number().int(),
    fail: z.number().int(),
    untested: z.number().int(),
  }),
  gaps: z.object({
    unimplemented: z.array(z.string()),
    orphanCode: z.array(z.string()),
    unverified: z.array(z.string()),
  }),
  /** 요구사항 단위 진척 롤업(§9 뷰② 구현 x/y · 검증 x/y) — reqId → 대상/구현/AC/통과 수. */
  byRequirement: z.record(
    z.string(),
    z.object({
      targetsTotal: z.number().int(),
      targetsBuilt: z.number().int(),
      acsTotal: z.number().int(),
      acsPassed: z.number().int(),
    }),
  ),
})
export type RtmCoverage = z.infer<typeof RtmCoverageSchema>

/**
 * 무결성 진단(critic C1/C2/M4/M5) — LLM 인테이크 산출은 잘못될 수 있으므로 참조 무결성을
 * 강제 대신 **가시화**한다(조용한 손실 금지). error=치명(댕글링/순환/드롭), warn=주의(불일치).
 */
export const RtmDiagnosticSchema = z.object({
  level: z.enum(['error', 'warn']),
  code: z.string(),
  message: z.string(),
  ref: z.string().optional(),
})
export type RtmDiagnostic = z.infer<typeof RtmDiagnosticSchema>

// ── 오버레이(사람 편집/확정/검증 입력) — rtm-overrides.json ──────────────────────
/** 감사 이벤트 — append-only(누가 언제 무엇을). */
export const RtmAuditEventSchema = z.object({ event: z.string(), by: z.string(), at: z.string() })
export type RtmAuditEvent = z.infer<typeof RtmAuditEventSchema>

/** 기능 행 오버레이(R3) — 셀 교정 + 확정자. on-disk 에서는 fnId 키로 최상위. */
export const RtmFunctionOverrideSchema = z.object({
  editedCells: z.record(z.string(), z.string()).default({}),
  approver: z.string(),
  at: z.string(),
  audit: z.array(RtmAuditEventSchema).default([]),
})
export type RtmFunctionOverride = z.infer<typeof RtmFunctionOverrideSchema>

/** 시험결과 오버레이 — AC 테스트의 PASS/FAIL/NA + 결함(사람 실측 입력, critic ⓐ). */
export const RtmTestOverrideSchema = z.object({
  result: TestResultSchema,
  defectId: z.string().nullable().default(null),
})
export type RtmTestOverride = z.infer<typeof RtmTestOverrideSchema>

/**
 * 요구사항 오버레이 — lifecycle 전이·고객검수(signoff)·시험결과 기록(검증 스파인 입력 경로).
 * tests 키 = "<acId>::<caseId>". on-disk 에서는 `_requirements` 아래 reqId 키.
 */
export const RtmRequirementOverrideSchema = z.object({
  lifecycle: RequirementLifecycleSchema.optional(),
  signoff: SignoffSchema.optional(),
  tests: z.record(z.string(), RtmTestOverrideSchema).default({}),
  approver: z.string(),
  at: z.string(),
  audit: z.array(RtmAuditEventSchema).default([]),
})
export type RtmRequirementOverride = z.infer<typeof RtmRequirementOverrideSchema>

/**
 * rtm.json — RTM 구조화 산출물(생성물, 불변). 사람 편집/확정은 rtm-overrides.json 오버레이.
 * coverage 는 computeCoverage 결과(파생). 모든 배열은 정렬되어 byte-identical 재실행을 보장한다.
 */
export const RtmModelSchema = z.object({
  schemaVersion: z.literal(2),
  gitCommit: z.string().nullable(),
  domains: z.array(RtmDomainSchema),
  functions: z.array(RtmFunctionRowSchema),
  requirements: z.array(RtmRequirementSchema),
  coverage: RtmCoverageSchema.optional(),
  diagnostics: z.array(RtmDiagnosticSchema).optional(),
})
export type RtmModel = z.infer<typeof RtmModelSchema>
