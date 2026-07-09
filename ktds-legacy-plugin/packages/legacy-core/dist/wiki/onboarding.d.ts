import type { GeneratedDoc } from '../doc-generator/types.js';
import type { DomainPriority } from '../domain-map/types.js';
/** 투어 1 단계 — 표시 라벨 + 들어갈 vault 문서 docId(위키링크 대상, 선택). */
export interface OnboardingStop {
    label: string;
    docId?: string;
}
/** 온보딩 가이드 입력 — vault 문서 docId 목록 + 선택적 도메인 우선순위/노드 순서. */
export interface OnboardingInput {
    /** vault 에 존재하는 문서 docId 목록(허브 링크 대상). */
    docIds: string[];
    /** 도메인 온보딩 우선순위(E-b/AC-32). 있으면 투어 순서의 1순위 소스. */
    priorities?: DomainPriority[];
    /** 우선순위 미제공 시 폴백 — 노드 표시 순서(예: 도메인 key). */
    nodeOrder?: string[];
}
/**
 * 가이드 투어 순서 도출 — priorities 가 있으면 rank ASC(동률 key ASC),
 * 없으면 nodeOrder, 둘 다 없으면 docIds 정렬. 각 stop 의 label 은 출처 식별자.
 */
export declare function tourOrder(input: OnboardingInput): OnboardingStop[];
/**
 * 온보딩 가이드 GeneratedDoc 생성(AC-27). docId='00_onboarding'.
 *  - "여기부터(start here)" 섹션 — vault 인덱스/허브로 들어가는 위키링크 + 투어 순서.
 *  - "문서 둘러보기" 섹션 — vault 문서 위키링크 목록(정렬).
 *  - U-A `/understand-onboard` 투어를 개념적으로 참조(엔진 비호출).
 * 코드 근거가 없으므로 claim 은 INFERRED(검토 권장) — 합성 사실 금지.
 */
export declare function buildOnboardingGuide(input: OnboardingInput): GeneratedDoc;
//# sourceMappingURL=onboarding.d.ts.map