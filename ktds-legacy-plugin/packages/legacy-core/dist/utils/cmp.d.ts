/**
 * 결정론 비교자(comparator) — 정렬 단일 소스.
 *
 * 영향도(impact) 모듈처럼 여러 파일이 동일한 사전식/수치 정렬을 쓰는 곳에서
 * 매 파일 지역 `cmp` 를 재정의하지 않도록 중립 유틸로 제공한다. 문자열은
 * 사전식, 숫자는 수치 비교(둘 다 안정적 tie=0).
 */
export declare function cmp(a: string | number, b: string | number): number;
//# sourceMappingURL=cmp.d.ts.map