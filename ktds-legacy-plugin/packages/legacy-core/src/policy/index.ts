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
