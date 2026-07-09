import { claimUnits, inferredRatio } from '../doc-generator/claims.js';
/** 문서 INFERRED 비율 차단 임계값(§0) — 초과 시 승인 차단. */
export const INFERRED_BLOCK_THRESHOLD = 0.6;
/**
 * §0 evidence enforcement 판정.
 *  - Rule A: confidence CONFIRMED && evidence.length===0 -> 'confirmed-no-evidence' 위반.
 *  - Rule B: inferredRatio > 0.6 -> inferredBlocked(승인 차단).
 *  - ok = 위반 0 && !inferredBlocked.
 * claim-unit(claims + table.rows) 단위로 스캔한다 — SI 표 행도 1급 claim 이므로
 * 근거 0 CONFIRMED 행은 동일하게 위반이다(AC-9 grounding 불변).
 * violations 는 (section, claim) 사전순으로 안정 정렬한다.
 */
export function enforceEvidence(doc) {
    const violations = [];
    for (const unit of claimUnits(doc)) {
        if (unit.confidence === 'CONFIRMED' && unit.evidence.length === 0) {
            violations.push({
                section: unit.section,
                claim: unit.label,
                reason: 'confirmed-no-evidence',
            });
        }
    }
    violations.sort((a, b) => a.section < b.section
        ? -1
        : a.section > b.section
            ? 1
            : a.claim < b.claim
                ? -1
                : a.claim > b.claim
                    ? 1
                    : 0);
    const ratio = inferredRatio(doc);
    const inferredBlocked = ratio > INFERRED_BLOCK_THRESHOLD;
    return {
        ok: violations.length === 0 && !inferredBlocked,
        violations,
        inferredRatio: ratio,
        inferredBlocked,
    };
}
//# sourceMappingURL=enforce.js.map