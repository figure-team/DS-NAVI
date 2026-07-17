/**
 * doc-generator (P4.1) — 결정론 근거 문서 생성기의 패키지 진입점.
 *
 * doc-templates.md 가 권위(AUTHORITY)다. confidence 는 ../types.js 의
 * CONFIDENCE_VALUES 단일 소스에서만 가져온다. 모든 산출은 정렬되어 byte-identical
 * 재실행을 보장하며, 렌더 출력에 timestamp(Date.now)는 없다(§2.2).
 */
export {
  MethodologySchema,
  DocStatusSchema,
  EvidenceSchema,
  ClaimSchema,
  TableRowSchema,
  TableSchema,
  SectionSchema,
  GeneratedDocSchema,
  DocMetaSchema,
} from './types.js'
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
} from './types.js'
export { claim, claimUnits, confidenceTag, evidenceRate, inferredRatio } from './claims.js'
export type { ClaimUnit } from './claims.js'
export {
  parseDocTemplate,
  applyDocTemplate,
  DocTemplateSchema,
  DocTemplateSectionSchema,
} from './doc-template.js'
export type { DocTemplate, DocTemplateSection } from './doc-template.js'
export { DOC_SET, buildDocSet } from './doc-set.js'
export type { DocSetEntry } from './doc-set.js'
export { exportCrudMatrix, CRUD_MATRIX_FILENAME } from './crud-export.js'
export type { CrudExportResult, CrudMatrixExport } from './crud-export.js'
export {
  renderMarkdown,
  renderSkeleton,
  CLAIMS_FENCE_OPEN,
  CLAIMS_FENCE_CLOSE,
  EMPTY_SECTION,
} from './render.js'
export {
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
  sortNodes,
  sortEdges,
  nodesOfType,
  nodesWithTag,
  edgesOfType,
  nodeEvidence,
  nodeClaim,
  inferred,
  unverified,
  displayName,
  summarySuffix,
} from './builders/index.js'
export type { DocInput } from './builders/index.js'
export {
  asBuiltMethodology,
  siStandardMethodology,
  getMethodology,
  listMethodologies,
  DEFAULT_METHODOLOGY,
} from './methodology/index.js'
export type { MethodologyModule } from './methodology/index.js'
