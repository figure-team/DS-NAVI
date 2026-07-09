/**
 * RTM 무결성 진단 + 자연순 id 비교 — critic 리뷰 반영(C1/C2/M3/M4/M5).
 *
 * LLM 인테이크(claude -p)는 잘못된 rtm-requirements.json 을 쓸 수 있다. zod 는 shape 만 검증하고
 * 교차참조(changeset/AC fnId·dependsOn·supersede)는 검증하지 않는다 → 여기서 **가시화**한다
 * (강제 대신 진단, 조용한 손실 금지). error=치명, warn=주의.
 */
import type { RtmDiagnostic, RtmModel } from './types.js';
/**
 * 자연순 비교(M3) — "REQ-2" < "REQ-10"(숫자 구간은 수치로). 문자열 cmp 의 사전순 역전 버그 해소.
 * 현행 head(§1 불변규칙) 선택이 요구사항 순서에 의존하므로 정확한 순서가 필수다.
 */
export declare function natCmp(a: string, b: string): number;
/**
 * 조립된 모델 + 드롭된 요구사항 id 로 진단을 만든다. 결정론: 진단은 (level, code, ref) 정렬.
 * - error: 드롭(파싱 실패)·댕글링 changeset/AC fnId·중복 id·순환(supersede/dependsOn).
 * - warn:  AC.fnIds ⊄ changeset·동일 fnId 다중 버킷·댕글링 nfrScope/dependsOn/supersede·supersede 비대칭.
 */
export declare function computeDiagnostics(model: RtmModel, droppedReqIds?: string[]): RtmDiagnostic[];
//# sourceMappingURL=validate.d.ts.map