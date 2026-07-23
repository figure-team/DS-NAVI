/**
 * ktds legacy-core — 화면설계서(screen-capture) 모듈 배럴.
 * 순수 로직(스키마/분류/조인/발견/조립)만 노출 — 브라우저 구동은 scripts 러너 소관.
 */
export { SCREENS_FILENAME, SCREEN_OVERRIDES_FILENAME, SCREENS_DIRNAME, ANNOTATION_KEY_RE, BBoxSchema, AnnotationKindSchema, EventTypeSchema, MechanicalSchema, HandlerEvidenceSchema, HandlerSchema, AnnotationSchema, ScreenCaptureInfoSchema, ScreenSchema, MISSING_TRIAGE_CLASSES, MissingTriageClassSchema, MissingTriageCandidateSchema, MissingTriageSchema, MissingScreenSchema, ScreensFileSchema, ScreenAnnotationOverrideSchema, ScreenOverrideEntrySchema, ScreenOverridesSchema, } from './types.js';
export type { BBox, AnnotationKind, EventType, Mechanical, HandlerEvidence, Handler, Annotation, ScreenCaptureInfo, Screen, MissingTriageClass, MissingTriageCandidate, MissingTriage, MissingScreen, ScreensFile, ScreenOverrideEntry, ScreenOverrides, RawElement, } from './types.js';
export { CIRCLED_DIGITS, CIRCLED_LETTERS, CIRCLED_UPPER, badgeGlyph, classifyKind, pickLabel, classifyElements, } from './classify.js';
export { assignScreenDomains, assignScreenDomainsOnDisk, loadDomainAssignContext, deriveFolderGroups, SCREEN_DOMAIN_MAP_FILENAME, ScreenDomainMapSchema, } from './domain-assign.js';
export type { ScreenDomainMap } from './domain-assign.js';
export { loadViewResolverConfigs, resolveViewName, extractReturnViewNames, resolveScreenViews, resolveScreenViewsOnDisk, } from './view-resolve.js';
export type { ViewResolverConfig, ViewResolveSummary } from './view-resolve.js';
export type { DomainAssignContext, DomainAssignSummary } from './domain-assign.js';
export { normalizeActionPath, candidatePaths, joinRoutes } from './routes-join.js';
export type { RouteJoinContext, NormalizedAction } from './routes-join.js';
export { triageMissing, selectCensusSeeds } from './triage.js';
export type { CensusRoute, TriageOptions, CensusSeedOptions } from './triage.js';
export { detectStartCommand, scaffoldScreensConfig, scaffoldScreensConfigOnDisk, } from './scaffold.js';
export type { BuildSignals, ScaffoldInput, ScaffoldSummary } from './scaffold.js';
export { normalizeUrl, relativePath, screenKey, slugify, screenIdFor, capturePathFor, shouldVisit, detectFragments, listJspFilesFromGraph, domainForJsp, reconcileJsps, } from './discover.js';
export { computeContentSignature, mechanicalProjection, computeMechanicalHash, buildScreensFile, serializeScreens, validateScreensFile, } from './assemble.js';
export type { BuildScreensInput, ScreensValidationIssue, ScreensValidationStats, ScreensValidationResult, } from './assemble.js';
export { loadPlaywright } from './playwright-loader.js';
export { SCREEN_FILL_PREP_DIR, SCREEN_FILL_FRAG_DIR, SCREEN_FILL_PREP_INDEX_FILENAME, DEFAULT_CHUNK_SCREENS, ScreenFillChunkSchema, ScreenFillChunkIndexSchema, ScreenFillFragmentSchema, screenFillPrepDir, screenFillFragDir, readScreenFillChunkIndex, prepScreenFill, auditScreenFillFragments, mergeScreenFillFragments, } from './fill-fanout.js';
export type { ScreenFillChunk, ScreenFillChunkIndex, ScreenFillFragment, PrepScreenFillOptions, ScreenFragmentAudit, MergeScreenFillResult, } from './fill-fanout.js';
//# sourceMappingURL=index.d.ts.map