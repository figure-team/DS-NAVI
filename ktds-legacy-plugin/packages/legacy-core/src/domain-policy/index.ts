/**
 * 도메인 정책서(PD) 공개 표면 — 분기 스캐너(PD1).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { specMapDir, stableJson } from '../domain-map/persist.js'
import { BRANCH_SIGNALS_FILENAME } from './types.js'
import type { BranchSignalSet } from './types.js'

export {
  BRANCH_SIGNALS_FILENAME,
  BranchKindSchema,
  BranchSignalSchema,
  BranchSignalSetSchema,
} from './types.js'
export type { BranchKind, BranchSignal, BranchSignalSet } from './types.js'
export { extractBranches, scanBranches } from './branch-scanner.js'

/** branch-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeBranchSignals(projectRoot: string, model: BranchSignalSet): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BRANCH_SIGNALS_FILENAME), stableJson(model), 'utf8')
}
