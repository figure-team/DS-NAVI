import type { PolicySignalSet, ReconcileResult } from './types.js';
export { POLICY_SIGNALS_FILENAME, POLICY_RECONCILE_FILENAME, PolicyCategorySchema, PolicySignalSchema, PolicySignalSetSchema, PolicyStatusSchema, PolicyItemSchema, ReconcileEntrySchema, ReconcileResultSchema, } from './types.js';
export type { PolicyCategory, PolicySignal, PolicySignalSet, PolicyStatus, PolicyItem, ReconcileEntry, ReconcileResult, } from './types.js';
export { buildPolicySignals, scanPolicySignals } from './signal-scanner.js';
export type { PolicySignalInput } from './signal-scanner.js';
export { parseExistingPolicy } from './ingest.js';
export { reconcilePolicy, scanPolicyReconcile } from './reconcile.js';
/** policy-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writePolicySignals(projectRoot: string, set: PolicySignalSet): void;
/** policy-reconcile.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writePolicyReconcile(projectRoot: string, result: ReconcileResult): void;
//# sourceMappingURL=index.d.ts.map