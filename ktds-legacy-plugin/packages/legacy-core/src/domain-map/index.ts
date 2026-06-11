// /understand-map domain-map module (ADR-001). Stage-14/15 surface:
// S1 full census + S2 route/entry-point extraction + S3 call-chain edges +
// S4 reachability slices, persisted to .spec/map/.
export * from "./types.js";
export {
  buildCensus,
  isTestPath,
  langForPath,
  createCensusIgnoreFilter,
  UA_DEFAULT_IGNORE_PATTERNS,
} from "./census.js";
export {
  normalizePath,
  routeNaturalKey,
  assignRouteIds,
  sortRoutes,
  sortBatchEntries,
  batchEntryId,
} from "./route-key.js";
export {
  specMapDir,
  stableJson,
  writeMapArtifact,
  writeCensus,
  writeRoutes,
  writeEdges,
  writeSlices,
  writeCandidates,
  writeSkeleton,
} from "./persist.js";
export {
  extractRoutes,
  extractEdges,
  parseJavaFacts,
  scanDomainMap,
  gitCommitHash,
  kgFingerprint,
} from "./extract.js";
export {
  buildCandidates,
  classifyByDirectory,
  prefixToken,
  tokenizeBasename,
} from "./classify.js";
export { buildSkeleton, DEFAULT_STEP_CAP, STEP_DEPTH_CAP } from "./skeleton.js";
export {
  buildAutoPlan,
  renameDomain,
  mergeDomains,
  moveRoot,
  excludeDomain,
  detectPlanDrift,
  planTable,
  readConfirmedPlan,
  writeConfirmedPlan,
} from "./confirm.js";
export {
  buildClassIndex,
  buildMapperNamespaceIndex,
  collectEdges,
  resolveTypeRef,
} from "./edges.js";
export { buildSlices, DEFAULT_DEPTH_CAP } from "./slices.js";
export { nameBasedBinding } from "./routes/stripes.js";
export { classifyNextJsFile } from "./routes/nextjs.js";
