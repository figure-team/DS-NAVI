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
  RtmAuditEventSchema,
  RtmFunctionOverrideSchema,
  RtmTestOverrideSchema,
  RtmRequirementOverrideSchema,
  TestScenarioKindSchema,
  RtmTestScenarioSchema,
  RtmScenarioOverrideSchema,
  RtmCustomFieldSchema,
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
  RtmAuditEvent,
  RtmFunctionOverride,
  RtmTestOverride,
  RtmRequirementOverride,
  TestScenarioKind,
  RtmTestScenario,
  RtmScenarioOverride,
  RtmCustomField,
  RtmModel,
} from './types.js'
export { buildRtm } from './build-rtm.js'
export { buildTestScenarios, attachTestScenarios } from './test-scenarios.js'
export { applyRequirements } from './apply-requirements.js'
export { applyOverlay } from './apply-overlay.js'
export { computeCoverage } from './coverage.js'
export { computeDiagnostics, natCmp } from './validate.js'
export {
  REQUIREMENT_TEMPLATES,
  CHANGE_TEMPLATES,
  requirementTemplateEntry,
  changeTemplateEntry,
  requirementTemplateFile,
  changeTemplateFile,
  resolveRequirementTemplatePath,
  loadRequirementTemplate,
  loadChangeTemplate,
} from './requirement-templates.js'
export type {
  RequirementDocKind,
  ChangeDocKind,
  RequirementTemplateEntry,
  ChangeTemplateEntry,
  RequirementTemplateDirs,
  ResolvedRequirementTemplate,
  LoadedRequirementTemplate,
} from './requirement-templates.js'
export {
  RequirementCategorySchema,
  IntakeReqStatusSchema,
  IntakeRequestSchema,
  IntakeSpecSchema,
  IntakeRequirementSchema,
  IdentifiedIntakeSchema,
  parseIdentifiedIntake,
  diagnoseIntake,
  checkIntakeGrounding,
  extractTableRefs,
  // P2 근거 스키마 — 인용 + 화면·정책 축
  IntakeEvidenceSchema,
  IntakeScreenRefSchema,
  IntakePolicyRefSchema,
  IntakeAcceptanceCriterionSchema,
  IntakeChangesetSchema,
} from './intake-types.js'
export type {
  RequirementCategory,
  IntakeReqStatus,
  IntakeRequest,
  IntakeSpec,
  IntakeRequirement,
  IdentifiedIntake,
  IntakeInventory,
  IntakeGroundingViolation,
  // P2 근거 스키마
  IntakeEvidence,
  IntakeScreenRef,
  IntakePolicyRef,
  IntakeAcceptanceCriterion,
  IntakeChangeset,
} from './intake-types.js'
export {
  intakeReqToRtmRequirement,
  intakeFnStub,
  fnDomainKey,
} from './project-intake.js'
export { withdrawRequest, requestIdOf } from './withdraw-request.js'
export type { WithdrawOptions, WithdrawResult } from './withdraw-request.js'
export { computeChangeImpact } from './change-impact.js'
export type { ChangeImpactReport, ChangeImpactFunction, ChangeImpactClass } from './change-impact.js'
// 근거 번들 — 유계 요약. RTM_IMPACT_GATE_DESIGN.md §6.2.
//  v1(P3): 3축(도메인·데이터·추적표). **v2(P4): + 화면·정책 축 + pre-cite + 축별 예산 배분.**
export {
  buildIntakeInputBundle,
  serializeIntakeBundle,
  checkMinimalSet,
  tokenizeRequest,
  SAMPLE_FILES_MAX,
  DEFAULT_BUNDLE_CHAR_CAP,
  AXIS_CAPS,
  FALLBACK_TOP_N,
  // P4
  AXIS_BUDGET,
  POLICY_SECTION_PRIORITY,
  allocateAxisBudget,
  parsePolicyMarkdown,
} from './intake-bundle.js'
export type {
  IntakeBundleSources,
  BuildIntakeInputOptions,
  IntakeInputBundle,
  IntakeAxis,
  IntakeBundleDomain,
  IntakeBundleTable,
  IntakeBundleCrudRow,
  IntakeBundleFunction,
  EvidenceStat,
  DomainGraphNode,
  // P4
  AxisBudgetKey,
  AxisBudgetReport,
  IntakePolicyDoc,
  IntakePreCite,
  IntakeBundleClaim,
  IntakeBundleScreen,
  IntakeBundleAnnotation,
  IntakeBundlePolicyDoc,
  IntakeBundlePolicySection,
  IntakeBundlePolicyRow,
} from './intake-bundle.js'
