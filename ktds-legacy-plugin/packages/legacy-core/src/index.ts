export * from './types.js'
export * from './domain-map/types.js'
export {
  CONFIG_FILENAME,
  ConfigSchema,
  defaultConfig,
  configPath,
  loadConfig,
  writeConfig,
} from './config/index.js'
export type { Config } from './config/index.js'
export { initProject, SPEC_DIR, SPEC_MASTER } from './init/index.js'
export type { InitResult } from './init/index.js'
export {
  parseSource,
  startLine,
  firstDescendantOfType,
  childrenOfType,
} from './domain-map/tree-sitter.js'
export type { LangId } from './domain-map/tree-sitter.js'
export { buildCensus, SOURCE_LANG_BY_EXT } from './domain-map/census.js'
export {
  specMapDir,
  gitCommitHash,
  stableJson,
  writeCensus,
  writeRoutes,
  writeEdges,
  writeSlices,
  writeCandidates,
  writeConfirmedPlan,
  readConfirmedPlan,
  CONFIRMED_PLAN_FILENAME,
  writeSkeleton,
  readSkeleton,
  writeMethodCalls,
  writeDomainMapSummary,
  DOMAIN_MAP_SUMMARY_FILENAME,
  writeDomainGraph,
  uaDir,
  DOMAIN_GRAPH_FILENAME,
} from './domain-map/persist.js'
export {
  normalizePath,
  routeNaturalKey,
  assignRouteIds,
  sortRoutes,
  sortBatchEntries,
} from './domain-map/route-key.js'
export { extractRoutes, scanRoutes, scanDomainMap, buildMap } from './domain-map/extract.js'
export { buildSkeleton, DEFAULT_STEP_CAP } from './domain-map/skeleton.js'
export {
  DEFAULT_NODE_DETAIL_TEMPLATE,
  NodeDetailTemplateSchema,
  NodeDetailSectionSchema,
  sectionsForLayer,
  parseNodeDetailTemplate,
  parseLayerSections,
  LAYER_FILE_ALIAS,
} from './domain-map/node-template.js'
export type { NodeDetailTemplate, NodeDetailSection } from './domain-map/node-template.js'
export {
  buildMethodCallGraph,
  buildGraphFromFacts,
  reachableFlowFiles,
} from './domain-map/method-calls.js'
export type {
  MethodFact,
  CallSite,
  ReceiverDesc,
  JavaLocalVar,
} from './domain-map/java-facts.js'
export {
  emitDomainGraph,
  emitFilledDomainGraph,
  demoteUnverified,
  applyDeterministicLabels,
  NEEDS_REVIEW_MARKER,
} from './domain-map/emit.js'
export {
  buildBundles,
  safeKeyFilename,
  bundleDir,
  BUNDLE_DIR,
  DEFAULT_SLICE_LINES,
  DEFAULT_BUNDLE_CHAR_CAP,
  SourceSliceSchema,
  BundleFileSchema,
  DomainBundleSchema,
} from './domain-map/bundle.js'
export type { SourceSlice, BundleFile, DomainBundle, BuildBundlesOptions } from './domain-map/bundle.js'
export {
  readFills,
  applyFills,
  unfilledNodes,
  fillDir,
  fillPathFor,
  FILL_DIR,
  CitationSchema,
  ClaimSchema as FillClaimSchema,
  DomainFillSchema,
} from './domain-map/fill.js'
export type { Citation, Claim as FillClaim, DomainFill, RejectedItem } from './domain-map/fill.js'
export {
  verifyFills,
  writeVerifyReport,
  VERIFY_REPORT_FILENAME,
  CITATION_STATUS,
  VerifiedCitationSchema,
  VerifiedItemSchema,
  DomainVerifyResultSchema,
  VerifyReportSchema,
} from './domain-map/verify.js'
export type {
  CitationStatus,
  VerifiedCitation,
  VerifiedItem,
  DomainVerifyResult,
  VerifyReport,
} from './domain-map/verify.js'
export { runFillPipeline } from './domain-map/fill-pipeline.js'
export type { FillPipelineResult } from './domain-map/fill-pipeline.js'
export {
  buildCrossDomainGraph,
  scoreDomains,
  buildDomainMapSummary,
  buildNameSuggestionContext,
  W_COMPLEXITY,
  W_COUPLING,
  W_SIZE,
  DEFAULT_SAMPLE_ANCHOR_CAP,
  DEFAULT_SAMPLE_FILE_CAP,
} from './domain-map/domain-map.js'
export { extractJavaFacts } from './domain-map/java-facts.js'
export type {
  JavaFileFacts,
  ClassFact,
  FieldFact,
  ClassKind,
} from './domain-map/java-facts.js'
export { extractEdges } from './domain-map/edges.js'
export { buildSlices, DEFAULT_DEPTH_CAP } from './domain-map/slices.js'
export {
  buildCandidates,
  classifyByDirectory,
  tokenizeBasename,
  prefixToken,
} from './domain-map/classify.js'
export type { DirectoryClassification } from './domain-map/classify.js'
export {
  buildAutoPlan,
  renameDomain,
  mergeDomains,
  moveRoot,
  excludeDomain,
  detectPlanDrift,
  planTable,
} from './domain-map/confirm.js'
export type { PlanRow } from './domain-map/confirm.js'
export { deriveStepLayer, buildLayerSignals, assignLayers } from './domain-map/step-layer.js'
export type { LayerSignals } from './domain-map/step-layer.js'
export {
  loadProjectGraph,
  mergeOverlay,
  readDomainGraphOverlay,
  normalizeKgPath,
} from './orchestrator/index.js'
export type {
  OverlayNode,
  OverlayEdge,
  OverlayGraph,
  MergedGraph,
} from './orchestrator/index.js'
export {
  claim,
  confidenceTag,
  evidenceRate,
  inferredRatio,
  renderMarkdown,
  renderSkeleton,
  CLAIMS_FENCE_OPEN,
  CLAIMS_FENCE_CLOSE,
  EMPTY_SECTION,
  buildTechStack,
  buildArchitecture,
  buildFeatureSpec,
  buildApiSpec,
  buildDbSpec,
  buildProgramList,
  buildCrudMatrix,
  buildBatchList,
  buildImpactAnalysis,
  detectCycles,
  parseDocTemplate,
  applyDocTemplate,
  DocTemplateSchema,
  DocTemplateSectionSchema,
  DOC_SET,
  buildDocSet,
  MethodologySchema,
  DocStatusSchema,
  EvidenceSchema,
  ClaimSchema,
  TableRowSchema,
  TableSchema,
  SectionSchema,
  GeneratedDocSchema,
  DocMetaSchema,
  asBuiltMethodology,
  siStandardMethodology,
  getMethodology,
  listMethodologies,
  DEFAULT_METHODOLOGY,
} from './doc-generator/index.js'
export type {
  Methodology,
  DocStatus,
  Evidence,
  Claim,
  TableRow,
  Table,
  Section,
  GeneratedDoc,
  DocMeta,
  DocInput,
  MethodologyModule,
  DocTemplate,
  DocTemplateSection,
  DocSetEntry,
} from './doc-generator/index.js'
export { enforceEvidence, INFERRED_BLOCK_THRESHOLD } from './evidence/index.js'
export type { EvidenceVerdict, EvidenceViolation } from './evidence/index.js'
export {
  AuditEventTypeSchema,
  AuditEventSchema,
  appendAudit,
  renderAuditLog as renderAuditEvents,
} from './audit/index.js'
export type { AuditEventType, AuditEvent } from './audit/index.js'
export {
  DocStateSchema,
  initialDocState,
  submitForReview,
  approve,
  returnForRevision,
  renderAuditLog,
} from './doc-state/index.js'
export type { DocState, Actor, TransitionResult } from './doc-state/index.js'
export {
  specDocsDir,
  docStatePath,
  writeDocState,
  readDocState,
} from './doc-state/persist.js'
export { buildWikiVault, writeWikiVault, specWikiDir } from './wiki/index.js'
export { buildOnboardingGuide, tourOrder } from './wiki/index.js'
export type {
  WikiFile,
  WikiVault,
  MetaResolver,
  OnboardingInput,
  OnboardingStop,
} from './wiki/index.js'
export { exportHtml, exportVaultHtml, escapeHtml } from './export/index.js'
export { detectStaleClaims, incrementalReapproval, evidenceAnchor } from './stale/index.js'
export type {
  FingerprintMap,
  StaleClaim,
  StaleSection,
  StaleReport,
  IncrementalReapprovalResult,
} from './stale/index.js'
export {
  ProfileWChangeStorySchema,
  ProfileWTaskSchema,
  SourceCitationSchema,
} from './profile-w/index.js'
export type { ProfileWChangeStory, ProfileWTask, SourceCitation } from './profile-w/index.js'
export * from './impact/index.js'
export * from './jpa/index.js'
export * from './mybatis/index.js'
export * from './db-schema/index.js'
export * from './rtm/index.js'
export {
  CoverageReportSchema,
  buildCoverageReport,
  renderCoverageReport,
} from './coverage-report/index.js'
export type { CoverageReport, CoverageInputs } from './coverage-report/index.js'
export {
  computeFileFingerprints,
  diffFingerprints,
  isUnchanged,
  anchorFingerprints,
} from './incremental/index.js'
export type { FileChangeSet } from './incremental/index.js'
