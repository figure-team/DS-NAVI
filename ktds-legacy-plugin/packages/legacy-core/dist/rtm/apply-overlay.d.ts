/**
 * applyOverlay — 사람 편집/확정/검증 오버레이(rtm-overrides.json)를 모델에 적용(critic ⓐ).
 *
 * 검증 스파인의 **입력 경로**: 인테이크는 시험결과/검수를 채우지 않으므로(실측·고객 몫), 사람이
 * 대시보드에서 기록한 값을 여기서 모델에 반영해야 coverage(verified/signedOff)가 실데이터를 반영한다.
 * 적용 후 coverage/diagnostics 를 재계산한다(merged 모델 기준).
 *
 * on-disk 형식(R3 후방호환): 최상위 fnId 키 = 기능 오버레이, `_` 접두 키 = 예약 섹션.
 *   { "<fnId>": {editedCells,approver,at,audit},
 *     "_requirements": { "<reqId>": {lifecycle?,signoff?,tests:{"<acId>::<caseId>":{result,defectId}},approver,at,audit} },
 *     "_scenarios": { "<tsId>": {editedCells:{title?/given?/when?/then?},approver,at,audit} },          // W5
 *     "_fields": { "custom:<slug>": {label,createdBy,at} } }                                            // R7
 *
 * 순수 함수. grounding: 사람 입력은 confidence 가 아니라 별도 축(approver/audit). 기능 셀은 값만 덮고
 * confidence 는 건드리지 않는다(편집셀 표시는 오버레이 존재로 판단 — 대시보드 책임). 예외: 시나리오는
 * 확정 = 사람 검토 완료 의미가 명확해 CONFIRMED 로 승격한다(W5 설계 §4).
 * 재스캔으로 사라진 시나리오를 가리키는 오버레이는 diagnostics warn 으로 표면화(조용한 손실 금지).
 */
import type { RtmModel } from './types.js';
/**
 * 오버레이를 모델에 적용해 merged 모델 + 재계산된 coverage/diagnostics 를 반환.
 * rawOverlay 가 비었으면(없음) 입력 모델을 그대로(coverage 만 보장) 돌려준다.
 */
export declare function applyOverlay(model: RtmModel, rawOverlay?: Record<string, unknown>): RtmModel;
//# sourceMappingURL=apply-overlay.d.ts.map