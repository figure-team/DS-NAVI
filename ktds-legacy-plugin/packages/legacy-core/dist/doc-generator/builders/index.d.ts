/**
 * as-built 빌더 5종 + 공유 입력/헬퍼의 단일 진입점(template §1).
 *
 * 각 빌더는 `build<X>(input: DocInput): GeneratedDoc` 서명을 따른다.
 */
export { buildTechStack } from './tech-stack.js';
export { buildArchitecture, detectCycles } from './architecture.js';
export { buildFeatureSpec } from './feature-spec.js';
export { buildApiSpec } from './api-spec.js';
export { buildDbSpec } from './db-spec.js';
export { buildProgramList } from './program-list.js';
export { buildCrudMatrix } from './crud-matrix.js';
export { buildBatchList } from './batch-list.js';
export { buildImpactAnalysis } from './impact-analysis.js';
export type { DocInput } from './shared.js';
export { sortNodes, sortEdges, sortedRoutes, nodesOfType, nodesWithTag, edgesOfType, nodeEvidence, nodeClaim, inferred, unverified, displayName, summarySuffix, metaList, } from './shared.js';
//# sourceMappingURL=index.d.ts.map