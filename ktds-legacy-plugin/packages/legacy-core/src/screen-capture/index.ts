/**
 * ktds legacy-core — 화면설계서(screen-capture) 모듈 배럴.
 * 순수 로직(스키마/분류/조인/발견/조립)만 노출 — 브라우저 구동은 scripts 러너 소관.
 */
export {
  SCREENS_FILENAME,
  SCREEN_OVERRIDES_FILENAME,
  SCREENS_DIRNAME,
  ANNOTATION_KEY_RE,
  BBoxSchema,
  AnnotationKindSchema,
  EventTypeSchema,
  MechanicalSchema,
  HandlerEvidenceSchema,
  HandlerSchema,
  AnnotationSchema,
  ScreenCaptureInfoSchema,
  ScreenSchema,
  MissingScreenSchema,
  ScreensFileSchema,
  ScreenAnnotationOverrideSchema,
  ScreenOverrideEntrySchema,
  ScreenOverridesSchema,
} from './types.js'
export type {
  BBox,
  AnnotationKind,
  EventType,
  Mechanical,
  HandlerEvidence,
  Handler,
  Annotation,
  ScreenCaptureInfo,
  Screen,
  MissingScreen,
  ScreensFile,
  ScreenOverrideEntry,
  ScreenOverrides,
  RawElement,
} from './types.js'
export {
  CIRCLED_DIGITS,
  CIRCLED_LETTERS,
  badgeGlyph,
  classifyKind,
  pickLabel,
  classifyElements,
} from './classify.js'
export { normalizeActionPath, candidatePaths, joinRoutes } from './routes-join.js'
export type { RouteJoinContext, NormalizedAction } from './routes-join.js'
export {
  normalizeUrl,
  relativePath,
  screenKey,
  slugify,
  screenIdFor,
  capturePathFor,
  shouldVisit,
  detectFragments,
  listJspFilesFromGraph,
  domainForJsp,
  reconcileJsps,
} from './discover.js'
export {
  computeContentSignature,
  mechanicalProjection,
  computeMechanicalHash,
  buildScreensFile,
  serializeScreens,
  validateScreensFile,
} from './assemble.js'
export type {
  BuildScreensInput,
  ScreensValidationIssue,
  ScreensValidationStats,
  ScreensValidationResult,
} from './assemble.js'
export { loadPlaywright } from './playwright-loader.js'
