import type { RtmRequirement } from './types.js';
export interface WithdrawOptions {
    /** 변경요청 번호(CR-xxx). 폐기 근거의 키. */
    crNo: string;
    reason?: string | null;
    approver?: string | null;
    effort?: string | null;
}
export interface WithdrawResult {
    /** 갱신된 요구사항 배열(순서 보존). */
    requirements: RtmRequirement[];
    /** 이번에 WITHDRAWN 으로 바뀐 요구사항 id(자연 입력 순서). */
    withdrawn: string[];
    /** 이미 WITHDRAWN 이라 변경 없던 요구사항 id. */
    alreadyWithdrawn: string[];
    /** 이 REQ 에 속한 요구사항이 하나도 없으면 true(오타·없는 요청). */
    notFound: boolean;
}
/**
 * 요구사항이 속한 요청(REQ)ID — RtmView.requestIdOf 와 **동일 규약**:
 *   1) source.section 이 REQ- 면 그것(2계층 인테이크 스타일: SFR-010 ← REQ-001).
 *   2) 아니면 자기 id 가 REQ- 면 그것(레거시 단일 요청: 요구사항 id 자체가 REQ-001).
 *   3) 그 외 null(미분류).
 * 두 스타일을 모두 철회 대상으로 잡아야 실제 원장(jpetstore: id=REQ-NNN)에서도 동작한다.
 */
export declare function requestIdOf(r: RtmRequirement): string | null;
/**
 * 요청(REQ) 철회. requirements 안에서 source.section===reqId 인 항목을 WITHDRAWN 으로 표시하고
 * changeReq 를 채운다. 나머지는 그대로. 입력은 스키마 default 로 정규화(후방호환).
 */
export declare function withdrawRequest(requirements: RtmRequirement[], reqId: string, opts: WithdrawOptions): WithdrawResult;
//# sourceMappingURL=withdraw-request.d.ts.map