/**
 * doc-state 승인 상태기계 (P4.2) — §0 "사람 확정은 doc-state(APPROVED + approver +
 * 감사 로그)"의 단일 소스.
 *
 * 상태: DRAFT|UNDER_REVIEW|APPROVED|RETURNED. 전이는 모두 **순수 함수**로,
 * 입력 state 를 절대 변형하지 않고 새 DocState 를 반환한다(append-only audit 포함).
 * 결정론: `at`(ISO 타임스탬프)은 호출자 공급 — engine 내부에서 Date.now() 미사용.
 *
 * 승인 게이트(§0): approve 는 enforceEvidence(doc).ok 일 때만 APPROVED 로 가고,
 * 아니면 RETURNED(근거 게이트가 승인을 차단; verdict 를 detail 에 남긴다).
 */
import { z } from 'zod';
import type { GeneratedDoc } from '../doc-generator/types.js';
import type { AuditEvent } from '../audit/index.js';
/** 문서 상태 — doc-generator DocStatus 와 동일 4값(§0). */
export declare const DocStatusSchema: z.ZodEnum<{
    DRAFT: "DRAFT";
    UNDER_REVIEW: "UNDER_REVIEW";
    APPROVED: "APPROVED";
    RETURNED: "RETURNED";
}>;
export type DocStatus = z.infer<typeof DocStatusSchema>;
/**
 * doc-state 영속 단위 — docId/status/approver + append-only 감사 로그.
 * approver 는 APPROVED 일 때만 set, 그 외 null(사람 확정 책임 기록, §0).
 */
export declare const DocStateSchema: z.ZodObject<{
    docId: z.ZodString;
    status: z.ZodEnum<{
        DRAFT: "DRAFT";
        UNDER_REVIEW: "UNDER_REVIEW";
        APPROVED: "APPROVED";
        RETURNED: "RETURNED";
    }>;
    approver: z.ZodNullable<z.ZodString>;
    audit: z.ZodArray<z.ZodObject<{
        event: z.ZodEnum<{
            APPROVED: "APPROVED";
            RETURNED: "RETURNED";
            SUBMITTED: "SUBMITTED";
        }>;
        by: z.ZodString;
        at: z.ZodString;
        detail: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DocState = z.infer<typeof DocStateSchema>;
/** 전이 호출자 식별/시각 — `at`은 호출자 공급 ISO 문자열(결정론). */
export interface Actor {
    by: string;
    at: string;
}
/** 초기 DocState 생성 — DRAFT, approver 없음, 감사 로그 비어 있음. */
export declare function initialDocState(docId: string): DocState;
/** 전이 결과 — 새 state + 이번 전이가 추가한 단건 audit 이벤트. */
export interface TransitionResult {
    state: DocState;
    event: AuditEvent;
}
/**
 * 제출(submit) — DRAFT|RETURNED -> UNDER_REVIEW. 그 외 상태는 throw.
 * 재검토 경로(RETURNED -> 제출)도 동일 함수로 처리.
 */
export declare function submitForReview(state: DocState, actor: Actor): TransitionResult;
/**
 * 승인(approve) — UNDER_REVIEW 에서만 호출 가능(그 외 throw).
 * enforceEvidence(doc).ok 면 APPROVED(approver=by), 아니면 RETURNED(승인 차단).
 * 차단 시 verdict 사유를 audit detail 에 남긴다(근거 0 / inferred>0.6).
 */
export declare function approve(state: DocState, doc: GeneratedDoc, actor: Actor): TransitionResult;
/** 반려(return) — UNDER_REVIEW -> RETURNED(reason 을 audit detail 로). 그 외 throw. */
export declare function returnForRevision(state: DocState, actor: Actor & {
    reason: string;
}): TransitionResult;
/** 감사 로그를 결정론 텍스트로 렌더(audit/index 의 렌더를 state 단위로 위임). */
export declare function renderAuditLog(state: DocState): string;
//# sourceMappingURL=index.d.ts.map