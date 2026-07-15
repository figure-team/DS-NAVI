/**
 * 영향도(Component 4) + 보완 A(생성예측) 공개 표면.
 *
 * 결정론 엔진(reach/api/persistence/flow/engine) + 인용 검증(verify) +
 * 문서 빌더(doc) + 선례검색(precedents) + 생성예측(supplement-a)을 모은다.
 */
export { IMPACT_REPORT_FILENAME, ImpactOptionsSchema, ImpactResultSchema, ImpactSeedSchema, ImpactCitationSchema, STRONG_EDGE_KINDS, SEED_ORIGINS, DEFAULT_IMPACT_DEPTH_CAP, DEFAULT_FAN_IN_THRESHOLD, } from './types.js';
export { buildAdjacency, reachClosure, computeFanIn } from './reach.js';
export { computeApiImpact } from './api.js';
export { computePersistenceImpact, PERSISTENCE_NOTE } from './persistence.js';
export { computeFlowImpact } from './flow.js';
export { IMPACT_VERIFY_FILENAME, verifyImpactClaims, verifyOneCitation, ImpactVerifyReportSchema, ImpactVerifyItemSchema, } from './verify.js';
export { ImpactInputMissingError, analyzeImpact, buildImpactReport, loadImpactInputs, loadKgTableCatalog, buildMapperInfo, buildClaimItems, fillClaimSnippets, } from './engine.js';
export { PrecedentPreconditionError, classifyRole, tokenize, buildFlowSlices, rankPrecedents, findPrecedents, selectPrecedentByFlowId, loadKgSimilarity, DEFAULT_PRECEDENT_TOP_N, } from './precedents.js';
export { CreationL1Error, buildCreationSuggestion, checkCreationL1, assertCreationL1, } from './supplement-a.js';
export { verifyAnchorExists } from './verify.js';
// 추적표 flow → 시드 결정론 조인(P6). RTM_IMPACT_GATE_DESIGN.md §6.3 — 시드 범위는 entryPoint 만.
export { resolveFlowSeeds, TO_BE_FN_PREFIX } from './rtm-seeds.js';
export { CHANGE_IMPACT_FILENAME, CHANGE_IMPACT_DOC_ID, IMPACT_READONLY_NOTE, buildChangeImpact, aggregateImpactCounts, publishChangeImpact, toProfileWChangeStory, } from './doc.js';
export { IMPACT_OVERLAY_FILENAME, ImpactOverlaySchema, buildKgNodeIndex, buildImpactOverlay, loadKgNodeIndex, writeImpactOverlay, emitImpactOverlay, } from './overlay.js';
//# sourceMappingURL=index.js.map