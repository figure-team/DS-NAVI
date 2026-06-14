/**
 * 결정론 산출용 사전식 문자열 비교자. 정렬(노드/엣지 id, relPath 등)을 안정화한다.
 * 9+ 모듈이 각자 복사하던 동일 함수의 단일 출처(리팩토링 2026-06).
 */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
