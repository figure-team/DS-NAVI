/**
 * 정책 신호 추출(정책서 P1) 공개 표면 — 코드+DB 신호 → PolicySignal[].
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { specMapDir, stableJson } from '../domain-map/persist.js'
import { POLICY_SIGNALS_FILENAME, POLICY_RECONCILE_FILENAME } from './types.js'
import type { PolicySignalSet, ReconcileResult } from './types.js'

export {
  POLICY_SIGNALS_FILENAME,
  POLICY_RECONCILE_FILENAME,
  PolicyCategorySchema,
  PolicySignalSchema,
  PolicySignalSetSchema,
  PolicyStatusSchema,
  PolicyItemSchema,
  ReconcileEntrySchema,
  ReconcileResultSchema,
} from './types.js'
export type {
  PolicyCategory,
  PolicySignal,
  PolicySignalSet,
  PolicyStatus,
  PolicyItem,
  ReconcileEntry,
  ReconcileResult,
} from './types.js'
export { buildPolicySignals, scanPolicySignals } from './signal-scanner.js'
export type { PolicySignalInput } from './signal-scanner.js'
export { parseExistingPolicy } from './ingest.js'
export { reconcilePolicy, scanPolicyReconcile } from './reconcile.js'

/** policy-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export function writePolicySignals(projectRoot: string, set: PolicySignalSet): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, POLICY_SIGNALS_FILENAME), stableJson(set), 'utf8')
}

/** policy-reconcile.json 기록(`.spec/map/` mkdir -p 선행). */
export function writePolicyReconcile(projectRoot: string, result: ReconcileResult): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, POLICY_RECONCILE_FILENAME), stableJson(result), 'utf8')
}

// ── 채움 팬아웃(정책서 LLM 보강 대규모 채움) ────────────────────────────────
export {
  POLICY_FILL_PREP_DIR,
  POLICY_FILL_FRAG_DIR,
  POLICY_FILL_PREP_INDEX_FILENAME,
  DEFAULT_MAX_FILL_ROWS,
  POLICY_FILL_TAGS,
  FILL_SECTION_START,
  FILL_SECTION_END,
  PolicyFillModeSchema,
  PolicyFillRowSchema,
  PolicyFillChunkSchema,
  PolicyFillChunkIndexSchema,
  PolicyFillFragmentRowSchema,
  PolicyFillFragmentSchema,
  policyFillPrepDir,
  policyFillFragDir,
  readPolicyFillChunkIndex,
  prepPolicyFill,
  auditPolicyFillFragments,
  mergePolicyFillFragments,
} from './fill-fanout.js'
export type {
  PolicyFillMode,
  PolicyFillTag,
  PolicyFillRow,
  PolicyFillChunk,
  PolicyFillChunkIndex,
  PolicyFillFragmentRow,
  PolicyFillFragment,
  PrepPolicyFillOptions,
  PolicyFragmentAudit,
  MergePolicyFillResult,
} from './fill-fanout.js'
