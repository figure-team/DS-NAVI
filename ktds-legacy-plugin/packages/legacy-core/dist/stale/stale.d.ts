import type { AuditEvent } from '../audit/index.js';
import type { Evidence, GeneratedDoc } from '../doc-generator/types.js';
import type { Actor, DocState } from '../doc-state/index.js';
/** 근거 앵커 -> fingerprint(content hash / commit 등). 출처는 호출자가 주입(추상화). */
export type FingerprintMap = Record<string, string>;
/** 한 STALE claim — claim 텍스트 + fingerprint 가 바뀐 앵커 목록(정렬). */
export interface StaleClaim {
    claim: string;
    changedAnchors: string[];
}
/** 한 STALE 섹션 — 섹션 헤딩 + 그 안의 STALE claim 목록(정렬). */
export interface StaleSection {
    section: string;
    staleClaims: StaleClaim[];
}
/** STALE 리포트 — STALE 섹션 목록 + stale/fresh claim 카운트(결정론, 정렬). */
export interface StaleReport {
    staleSections: StaleSection[];
    staleCount: number;
    freshCount: number;
}
/** Evidence -> 앵커 키(file:line 또는 file). fingerprint 맵의 키와 동일 규약. */
export declare function evidenceAnchor(e: Evidence): string;
/**
 * STALE claim 감지 — 근거 앵커 fingerprint 가 prev->curr 로 바뀐 claim-unit 만 STALE.
 * claim-unit 은 section.claims 와 section.table.rows 를 모두 포함하므로(AC-9), SI 표
 * 행도 그 근거 앵커가 바뀌면 STALE 로 잡힌다(행 라벨이 staleClaims 의 claim 이 된다).
 * 근거가 없는 unit 은 fingerprint 비교 대상이 없으므로 fresh 로 센다.
 * staleSections 는 section 정렬, 각 section 의 staleClaims 는 라벨 텍스트 정렬.
 */
export declare function detectStaleClaims(doc: GeneratedDoc, prevFingerprints: FingerprintMap, currFingerprints: FingerprintMap): StaleReport;
/** 증분 재승인 결과 — 새 DocState + (변경이 있었다면) 이번에 추가한 audit 이벤트. */
export interface IncrementalReapprovalResult {
    state: DocState;
    event: AuditEvent | null;
}
/**
 * 증분 재승인(AC-26) — STALE claim 만 재검토.
 *  - staleReport.staleCount === 0: 상태 불변(APPROVED 유지, audit 추가 없음, event=null).
 *  - staleCount > 0: status -> UNDER_REVIEW(부분 재검토), STALE 섹션을 나열한 RETURNED
 *    audit 이벤트 기록(전체 재승인 아님 — 변경된 claim 만 재검토 대상).
 * 순수 함수: 입력 state 불변, `at`은 호출자 공급.
 */
export declare function incrementalReapproval(state: DocState, staleReport: StaleReport, actor: Actor): IncrementalReapprovalResult;
//# sourceMappingURL=stale.d.ts.map