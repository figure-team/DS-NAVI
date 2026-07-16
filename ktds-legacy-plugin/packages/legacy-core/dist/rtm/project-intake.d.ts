/**
 * project-intake — ⑥ RTM 단계: identified.json(2계층) → 현 rtm-requirements.json 스키마 투영(옵션 B).
 *
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §9(옵션 B 단계적 브릿지). 문서(②③④)는 2계층(요청 REQ →
 * 요구사항 SFR…)을 완전히 유지하되, 추적표(rtm.json)는 현 스키마를 유지하며 **요구사항(SFR…)을 1급
 * requirement 로 투영**한다. 요청(REQ)은 source.section 으로 느슨히 연결(2계층 1급화는 후속).
 *
 * 순수 매핑만 담당(번호·도메인 해석·병합은 호출자가 파일 맥락과 함께 수행).
 */
import type { IntakeRequirement, IntakeRequest } from './intake-types.js';
import type { RtmRequirement, RtmFunctionRow } from './types.js';
/**
 * 한 요구사항(SFR…)을 현 스키마 RtmRequirement 로 투영. 신규(TO-BE)라 전부 [추정]·검수/시험 미입력.
 * 요청(REQ)은 source.section 으로 귀속. derivedFrom 은 dependsOn 으로 연결(SIR-002 ← SFR-010).
 */
export declare function intakeReqToRtmRequirement(req: IntakeRequirement, request: IntakeRequest): RtmRequirement;
/**
 * 신규(TO-BE) 기능 스텁 — changeset.added 의 fnId 1개당 1행. 셀은 코드 부재라 전부 미검증/빈 값.
 * domainId/domainName 과 featureId·requirementHistory 는 파일 맥락을 아는 호출자가 결정해 넘긴다.
 */
export declare function intakeFnStub(fnId: string, featureId: string, domainId: string, domainName: string, requirementHistory: string[]): RtmFunctionRow;
/** fnId 의 도메인 키 추출 — 'to-be:account/x' / 'domain:account/x' / 'account/x' → 'account'. */
export declare function fnDomainKey(fnId: string): string;
//# sourceMappingURL=project-intake.d.ts.map