/**
 * 컬렉션 헬퍼. 여러 모듈이 인라인 for-루프로 반복하던 그룹핑의 단일 출처(리팩토링 2026-06).
 */

/** items를 keyFn 결과로 그룹핑. 입력 순서를 보존(결정론). */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
