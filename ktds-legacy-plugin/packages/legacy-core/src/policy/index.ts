/**
 * 정책 신호 추출(정책서 P1) 공개 표면 — 코드+DB 신호 → PolicySignal[].
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { specMapDir, stableJson } from '../domain-map/persist.js'
import { POLICY_SIGNALS_FILENAME } from './types.js'
import type { PolicySignalSet } from './types.js'

export {
  POLICY_SIGNALS_FILENAME,
  PolicyCategorySchema,
  PolicySignalSchema,
  PolicySignalSetSchema,
} from './types.js'
export type { PolicyCategory, PolicySignal, PolicySignalSet } from './types.js'
export { buildPolicySignals, scanPolicySignals } from './signal-scanner.js'
export type { PolicySignalInput } from './signal-scanner.js'

/** policy-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export function writePolicySignals(projectRoot: string, set: PolicySignalSet): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, POLICY_SIGNALS_FILENAME), stableJson(set), 'utf8')
}
