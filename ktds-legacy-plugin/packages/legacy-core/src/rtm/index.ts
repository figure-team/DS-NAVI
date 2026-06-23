/**
 * rtm — 요구사항 추적표(RTM) 패키지 진입점. docs/ktds/RTM_TAB_DESIGN.md.
 *
 * 데이터 모델(zod) + buildRtm(AS-IS) + applyRequirements(요구사항 적용) + computeCoverage(롤업).
 */
export {
  RtmConfidenceSchema,
  RtmTraceCellSchema,
  TestResultSchema,
  TestRefSchema,
  AcKindSchema,
  AcceptanceCriterionSchema,
  RtmOriginSchema,
  RtmFunctionStateSchema,
  DeliverableRefSchema,
  RtmFunctionRuleSchema,
  RtmFunctionRowSchema,
  RtmDomainSchema,
  RtmChangesetSchema,
  RequirementTypeSchema,
  NfrCategorySchema,
  RequirementLifecycleSchema,
  PrioritySchema,
  RequirementSourceSchema,
  ChangeReqSchema,
  SignoffSchema,
  RtmRequirementSchema,
  RtmCoverageSchema,
  RtmDiagnosticSchema,
  RtmModelSchema,
} from './types.js'
export type {
  RtmTraceCell,
  TestResult,
  TestRef,
  AcKind,
  AcceptanceCriterion,
  RtmOrigin,
  RtmFunctionState,
  DeliverableRef,
  RtmFunctionRule,
  RtmFunctionRow,
  RtmDomain,
  RtmChangeset,
  RequirementType,
  NfrCategory,
  RequirementLifecycle,
  Priority,
  RequirementSource,
  ChangeReq,
  Signoff,
  RtmRequirement,
  RtmCoverage,
  RtmDiagnostic,
  RtmModel,
} from './types.js'
export { buildRtm } from './build-rtm.js'
export { applyRequirements } from './apply-requirements.js'
export { computeCoverage } from './coverage.js'
export { computeDiagnostics, natCmp } from './validate.js'
