/**
 * withdrawRequest(절차 B) — 요청(REQ) 1건을 철회/폐기한다. 순수 함수.
 *
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §8(변경관리). 철회는 **요청 단위**:
 * REQ-001 폐기 → 그 요청에서 분해된 하위 요구사항(source.section === REQ-001)을 **동반 폐기**.
 *
 * 불변 규칙(§4):
 *   1) 파괴적 삭제 금지 — 요구사항 행은 지우지 않고 status=WITHDRAWN 으로 표시(이력 보존).
 *   2) 폐기 메타 — changeReq(crNo/reason/approver/effort)에 CR 근거를 남긴다(⑨).
 *   3) 멱등 — 이미 WITHDRAWN 인 요구사항은 그대로 두고 alreadyWithdrawn 으로 보고.
 *
 * 입력 배열 순서를 보존한다(결정론, Date.now 미사용). 실제 기능 상태 원복은 applyRequirements 가
 * WITHDRAWN 을 현행 head 에서 제외해 재계산한다(rtm.json 재bake 시).
 */
import { RtmRequirementSchema } from './types.js';
const REQ_RE = /^REQ-\d+/;
/**
 * 요구사항이 속한 요청(REQ)ID — RtmView.requestIdOf 와 **동일 규약**:
 *   1) source.section 이 REQ- 면 그것(2계층 인테이크 스타일: SFR-010 ← REQ-001).
 *   2) 아니면 자기 id 가 REQ- 면 그것(레거시 단일 요청: 요구사항 id 자체가 REQ-001).
 *   3) 그 외 null(미분류).
 * 두 스타일을 모두 철회 대상으로 잡아야 실제 원장(jpetstore: id=REQ-NNN)에서도 동작한다.
 */
export function requestIdOf(r) {
    const sec = r.source?.section;
    if (sec && REQ_RE.test(sec))
        return sec;
    if (REQ_RE.test(r.id))
        return r.id;
    return null;
}
/** REQ 에 속한 요구사항 = requestIdOf(r) === reqId(section 우선, 없으면 자기 id). */
function belongsToRequest(r, reqId) {
    return requestIdOf(r) === reqId;
}
/**
 * 요청(REQ) 철회. requirements 안에서 source.section===reqId 인 항목을 WITHDRAWN 으로 표시하고
 * changeReq 를 채운다. 나머지는 그대로. 입력은 스키마 default 로 정규화(후방호환).
 */
export function withdrawRequest(requirements, reqId, opts) {
    const changeReq = {
        crNo: opts.crNo,
        reason: opts.reason ?? null,
        approver: opts.approver ?? null,
        effort: opts.effort ?? null,
    };
    const withdrawn = [];
    const alreadyWithdrawn = [];
    let matched = false;
    const next = requirements.map((raw) => {
        const parsed = RtmRequirementSchema.safeParse(raw);
        const r = parsed.success ? parsed.data : raw;
        if (!belongsToRequest(r, reqId))
            return r;
        matched = true;
        if (r.status === 'WITHDRAWN') {
            alreadyWithdrawn.push(r.id);
            return r;
        }
        withdrawn.push(r.id);
        return { ...r, status: 'WITHDRAWN', changeReq };
    });
    return { requirements: next, withdrawn, alreadyWithdrawn, notFound: !matched };
}
//# sourceMappingURL=withdraw-request.js.map