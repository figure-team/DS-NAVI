import type { PolicySignalSet, ReconcileResult } from './types.js';
export { POLICY_SIGNALS_FILENAME, POLICY_RECONCILE_FILENAME, PolicyCategorySchema, PolicySignalSchema, PolicySignalSetSchema, PolicyStatusSchema, PolicyItemSchema, ReconcileEntrySchema, ReconcileResultSchema, } from './types.js';
export type { PolicyCategory, PolicySignal, PolicySignalSet, PolicyStatus, PolicyItem, ReconcileEntry, ReconcileResult, } from './types.js';
export { buildPolicySignals, scanPolicySignals } from './signal-scanner.js';
export type { PolicySignalInput } from './signal-scanner.js';
export { parseExistingPolicy } from './ingest.js';
export { reconcilePolicy, scanPolicyReconcile } from './reconcile.js';
/**
 * policy-signals.json 로드 — PA3: map scan 이 산출한 신호를 소비자(정책서 문서 생성)가
 * 재사용한다(readDbSchema 와 동형 — 없거나 스키마 불일치면 null → 호출자가 자체 생성 폴백).
 */
export declare function readPolicySignals(projectRoot: string): PolicySignalSet | null;
/** policy-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writePolicySignals(projectRoot: string, set: PolicySignalSet): void;
/** policy-reconcile.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writePolicyReconcile(projectRoot: string, result: ReconcileResult): void;
export { POLICY_FILL_PREP_DIR, POLICY_FILL_FRAG_DIR, POLICY_FILL_PREP_INDEX_FILENAME, DEFAULT_MAX_FILL_ROWS, POLICY_FILL_TAGS, FILL_SECTION_START, FILL_SECTION_END, PolicyFillModeSchema, PolicyFillRowSchema, PolicyFillChunkSchema, PolicyFillChunkIndexSchema, PolicyFillFragmentRowSchema, PolicyFillFragmentSchema, policyFillPrepDir, policyFillFragDir, readPolicyFillChunkIndex, prepPolicyFill, auditPolicyFillFragments, mergePolicyFillFragments, } from './fill-fanout.js';
export type { PolicyFillMode, PolicyFillTag, PolicyFillRow, PolicyFillChunk, PolicyFillChunkIndex, PolicyFillFragmentRow, PolicyFillFragment, PrepPolicyFillOptions, PolicyFragmentAudit, MergePolicyFillResult, } from './fill-fanout.js';
//# sourceMappingURL=index.d.ts.map