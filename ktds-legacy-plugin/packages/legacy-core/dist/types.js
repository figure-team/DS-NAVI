/**
 * ktds legacy-core 공통 타입 — 단일 소스(single source of truth).
 *
 * grounding 신뢰도 등급(CONFIDENCE_VALUES)과 정규 노드(CanonicalNode)의 유일 정의처.
 * 모든 ktds 오버레이/산출물은 이 모듈에서만 신뢰도 등급을 가져온다(중복 정의 금지).
 */
/** 신뢰도 등급 — 근거 강도 순(강함 → 약함). 모든 ktds 산출물 claim 태깅의 단일 소스. */
export const CONFIDENCE_VALUES = [
    'CONFIRMED', // 코드 증거(file:line)로 직접 확인
    'CONFIRMED_AI', // AI 합성이나 근거 앵커 보유
    'INFERRED', // 구조/관례 기반 추론 ([추정])
    'UNVERIFIED', // 근거 미확보 ([확인필요])
];
/** 임의 값이 유효한 신뢰도 등급인지 좁히는 타입 가드. */
export function isConfidence(value) {
    return typeof value === 'string' && CONFIDENCE_VALUES.includes(value);
}
/**
 * 인용 검증 상태 — 기계 검증기(citation verifier)의 단일 소스(neutral).
 *
 * 블루프린트는 이 union 을 `domain-map/verify.ts` 에 두었으나(거기 `DomainFill[]` 와
 * 강결합), 본 fork 는 도메인-맵/영향도 양쪽 검증기가 import 할 수 있도록 중립
 * `types.ts` 로 승격한다(계획서 Executor Note). 검증기 구현은 각 모듈이 보유하되
 * **상태 공간(union)만** 여기서 공유한다 — "같은 상태로 말한다"는 계약.
 *
 *   ok                : 경로 실존 + 라인 범위 내 + 텍스트 일치.
 *   path-escape       : 경로가 프로젝트 루트 밖(탈출/환각/심볼릭링크 우회).
 *   no-file           : 파일 없음.
 *   line-out-of-range : 라인 번호가 파일 라인 수 초과.
 *   text-mismatch     : 그 라인 텍스트가 스니펫을 포함하지 않음.
 *   trivial-snippet   : 스니펫이 너무 사소해 어디에나 일치(근거 효력 없음 — 게이밍 차단).
 */
export const CITATION_STATUS = [
    'ok',
    'path-escape',
    'no-file',
    'line-out-of-range',
    'text-mismatch',
    'trivial-snippet',
];
//# sourceMappingURL=types.js.map