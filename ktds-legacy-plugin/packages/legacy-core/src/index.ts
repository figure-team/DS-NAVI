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
export { emitDomainGraph } from './domain-map/emit.js'
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
