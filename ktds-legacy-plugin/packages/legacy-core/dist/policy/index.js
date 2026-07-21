/**
 * 정책 신호 추출(정책서 P1) 공개 표면 — 코드+DB 신호 → PolicySignal[].
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { specMapDir, stableJson } from '../domain-map/persist.js';
import { POLICY_SIGNALS_FILENAME, POLICY_RECONCILE_FILENAME, PolicySignalSetSchema } from './types.js';
export { POLICY_SIGNALS_FILENAME, POLICY_RECONCILE_FILENAME, PolicyCategorySchema, PolicySignalSchema, PolicySignalSetSchema, PolicyStatusSchema, PolicyItemSchema, ReconcileEntrySchema, ReconcileResultSchema, } from './types.js';
export { buildPolicySignals, scanPolicySignals } from './signal-scanner.js';
export { parseExistingPolicy } from './ingest.js';
export { reconcilePolicy, scanPolicyReconcile } from './reconcile.js';
/**
 * policy-signals.json 로드 — PA3: map scan 이 산출한 신호를 소비자(정책서 문서 생성)가
 * 재사용한다(readDbSchema 와 동형 — 없거나 스키마 불일치면 null → 호출자가 자체 생성 폴백).
 */
export function readPolicySignals(projectRoot) {
    const path = join(specMapDir(projectRoot), POLICY_SIGNALS_FILENAME);
    if (!existsSync(path))
        return null;
    try {
        return PolicySignalSetSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    }
    catch {
        return null;
    }
}
/** policy-signals.json 기록(`.spec/map/` mkdir -p 선행). */
export function writePolicySignals(projectRoot, set) {
    const dir = specMapDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, POLICY_SIGNALS_FILENAME), stableJson(set), 'utf8');
}
/** policy-reconcile.json 기록(`.spec/map/` mkdir -p 선행). */
export function writePolicyReconcile(projectRoot, result) {
    const dir = specMapDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, POLICY_RECONCILE_FILENAME), stableJson(result), 'utf8');
}
// ── 채움 팬아웃(정책서 LLM 보강 대규모 채움) ────────────────────────────────
export { POLICY_FILL_PREP_DIR, POLICY_FILL_FRAG_DIR, POLICY_FILL_PREP_INDEX_FILENAME, DEFAULT_MAX_FILL_ROWS, POLICY_FILL_TAGS, FILL_SECTION_START, FILL_SECTION_END, PolicyFillModeSchema, PolicyFillRowSchema, PolicyFillChunkSchema, PolicyFillChunkIndexSchema, PolicyFillFragmentRowSchema, PolicyFillFragmentSchema, policyFillPrepDir, policyFillFragDir, readPolicyFillChunkIndex, prepPolicyFill, auditPolicyFillFragments, mergePolicyFillFragments, } from './fill-fanout.js';
//# sourceMappingURL=index.js.map