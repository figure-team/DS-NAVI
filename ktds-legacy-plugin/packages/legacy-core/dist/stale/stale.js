/**
 * STALE incremental re-approval (P4.5 / AC-26) — 근거 fingerprint 변경 감지 + 증분 재승인.
 *
 * fingerprint 는 근거 앵커(file:line 또는 file) -> fingerprint 문자열(예: content hash /
 * commit)의 맵이다. 이 모듈은 fingerprint 의 출처를 추상화한다(엔진은 hash 를 계산하지
 * 않고 호출자가 주입한 prev/curr 맵을 비교만 한다 — 결정론, IO 없음).
 *
 * 한 claim 은 그 근거 앵커 중 하나라도 prev->curr fingerprint 가 변하면 STALE 이다.
 * 증분 재승인: stale=0 이면 상태 불변(APPROVED 유지). stale>0 이면 doc 을 UNDER_REVIEW 로
 * (부분 재검토) 표시하고 STALE 섹션을 나열하는 audit 이벤트를 기록한다 — 전체 재승인이
 * 아니라 변경된 claim 만 재검토한다(AC-26).
 *
 * 결정론: 모든 배열 정렬, `at`은 호출자 공급(Date.now 미사용).
 */
import { appendAudit } from '../audit/index.js';
import { claimUnits } from '../doc-generator/claims.js';
/** Evidence -> 앵커 키(file:line 또는 file). fingerprint 맵의 키와 동일 규약. */
export function evidenceAnchor(e) {
    return e.line === null ? e.file : `${e.file}:${e.line}`;
}
/** 문자열 ASC 정렬(결정론). */
function sortStrings(values) {
    return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/**
 * 한 claim-unit 의 변경된 앵커 목록(prev->curr fingerprint 가 다른 앵커, 정렬).
 * 앵커가 prev/curr 중 한쪽에만 있어도(추가/삭제) 변경으로 본다(undefined != 값).
 */
function changedAnchorsOf(evidence, prev, curr) {
    const changed = [];
    for (const ev of evidence) {
        const anchor = evidenceAnchor(ev);
        if (prev[anchor] !== curr[anchor])
            changed.push(anchor);
    }
    return sortStrings([...new Set(changed)]);
}
/**
 * STALE claim 감지 — 근거 앵커 fingerprint 가 prev->curr 로 바뀐 claim-unit 만 STALE.
 * claim-unit 은 section.claims 와 section.table.rows 를 모두 포함하므로(AC-9), SI 표
 * 행도 그 근거 앵커가 바뀌면 STALE 로 잡힌다(행 라벨이 staleClaims 의 claim 이 된다).
 * 근거가 없는 unit 은 fingerprint 비교 대상이 없으므로 fresh 로 센다.
 * staleSections 는 section 정렬, 각 section 의 staleClaims 는 라벨 텍스트 정렬.
 */
export function detectStaleClaims(doc, prevFingerprints, currFingerprints) {
    const bySection = new Map();
    let staleCount = 0;
    let freshCount = 0;
    for (const unit of claimUnits(doc)) {
        const changed = changedAnchorsOf(unit.evidence, prevFingerprints, currFingerprints);
        if (changed.length > 0) {
            staleCount++;
            const list = bySection.get(unit.section) ?? [];
            list.push({ claim: unit.label, changedAnchors: changed });
            bySection.set(unit.section, list);
        }
        else {
            freshCount++;
        }
    }
    const sections = [];
    for (const [section, staleClaims] of bySection) {
        staleClaims.sort((a, b) => (a.claim < b.claim ? -1 : a.claim > b.claim ? 1 : 0));
        sections.push({ section, staleClaims });
    }
    sections.sort((a, b) => (a.section < b.section ? -1 : a.section > b.section ? 1 : 0));
    return { staleSections: sections, staleCount, freshCount };
}
/**
 * 증분 재승인(AC-26) — STALE claim 만 재검토.
 *  - staleReport.staleCount === 0: 상태 불변(APPROVED 유지, audit 추가 없음, event=null).
 *  - staleCount > 0: status -> UNDER_REVIEW(부분 재검토), STALE 섹션을 나열한 RETURNED
 *    audit 이벤트 기록(전체 재승인 아님 — 변경된 claim 만 재검토 대상).
 * 순수 함수: 입력 state 불변, `at`은 호출자 공급.
 */
export function incrementalReapproval(state, staleReport, actor) {
    if (staleReport.staleCount === 0) {
        return { state, event: null };
    }
    const sectionNames = staleReport.staleSections.map((s) => s.section);
    const event = {
        event: 'RETURNED',
        by: actor.by,
        at: actor.at,
        detail: `incremental re-approval: ${staleReport.staleCount} stale claim(s) in ` +
            `[${sectionNames.join(', ')}] need re-review (NOT a full re-approve)`,
    };
    return {
        state: {
            ...state,
            status: 'UNDER_REVIEW',
            approver: null,
            audit: appendAudit(state.audit, event),
        },
        event,
    };
}
//# sourceMappingURL=stale.js.map