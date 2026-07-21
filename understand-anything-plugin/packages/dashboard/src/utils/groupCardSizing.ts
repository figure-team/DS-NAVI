/**
 * 업무 지도(/domains) 그룹 카드 그리드 전용 — 같은 그리드 행 카드들의 칩 영역
 * 높이를 맞춘다. 기준 = 그 행에서 서브도메인 칩을 전부 나열했을 때 가장 적은
 * 줄 수가 필요한 카드(상한 3줄). 다른 카드는 그 줄 수에 맞춰 칩을 잘라내고
 * 잘린 개수를 "+N" 칩으로 흡수한다(+N 칩 자체도 마지막 보이는 줄 폭 안에 들어
 * 가야 한다).
 *
 * DOM 측정(useGroupCardRowSizing)과 분리된 순수 계산부 — 칩 폭/컨테이너 폭/줄
 * 수만으로 결정되므로 유닛테스트 가능(픽셀 시뮬레이션에 DOM 불필요).
 */

/** 칩 하나의 측정값(offsetTop/Left/Width, px) — flex-wrap 렌더 결과에서 읽는다. */
export interface ChipMetric {
  top: number;
  left: number;
  width: number;
}

/** offsetTop 값들에서 서로 다른 줄의 개수를 센다(칩 없음 = 0줄). */
export function countNaturalLines(chips: ChipMetric[]): number {
  return new Set(chips.map((c) => c.top)).size;
}

/**
 * 행 목표 줄 수 = 행 내 카드들의 자연 줄 수 중 최소값, 단 maxLines 로 클램프.
 * 행이 비어 있으면(방어적) maxLines 를 그대로 반환한다.
 */
export function computeRowTargetLines(naturalLinesInRow: number[], maxLines: number): number {
  if (naturalLinesInRow.length === 0) return maxLines;
  return Math.min(maxLines, ...naturalLinesInRow);
}

export interface VisibleChipResult {
  /** 보여줄 칩 개수(원본 배열 앞에서부터 순서 보존). */
  visible: number;
  /** 잘려서 "+N" 으로 흡수되는 칩 개수 — 실제 숨긴 개수와 정확히 일치. */
  hidden: number;
  /** true 면 마지막 보이는 칩의 폭을 "+N" 자리만큼 줄여(말줄임) 렌더해야 한다 —
   * 줄의 첫 칩조차 "+N" 과 나란히 못 들어가는 경우, 줄을 통째로 접으면 표시 줄
   * 수가 행 목표보다 부족해지므로(행 높이 결손) 접는 대신 칩을 자른다. */
  truncateLast: boolean;
}

/**
 * 칩 목록을 targetLines 줄 안에 맞춘다. 자연 줄 수가 이미 targetLines 이하면
 * 전부 노출(hidden=0). 초과하면 targetLines 번째 줄의 시작 top(cutTop) 이전
 * 칩까지만 남기고, "+N" 칩이 그 줄 폭 안에 들어갈 자리가 없으면 칩을 하나씩
 * 더 접어(hidden 증가) 자리를 만든다. 접다가 줄의 첫 칩에 도달하면 더 접지
 * 않고 truncateLast 로 표시한다 — 렌더러가 그 칩을 말줄임해 "+N" 자리를 만들
 * 므로 표시 줄 수가 항상 targetLines 와 일치한다(행 높이·목록 크기 동일 보장).
 */
export function computeVisibleChips(
  chips: ChipMetric[],
  targetLines: number,
  containerWidth: number,
  gap: number,
  plusWidth: number,
): VisibleChipResult {
  const total = chips.length;
  if (total === 0) return { visible: 0, hidden: 0, truncateLast: false };

  const tops: number[] = [];
  for (const c of chips) if (!tops.includes(c.top)) tops.push(c.top);
  tops.sort((a, b) => a - b);

  if (tops.length <= targetLines) return { visible: total, hidden: 0, truncateLast: false };

  const cutTop = tops[targetLines];
  let k = chips.filter((c) => c.top < cutTop).length;
  // 백오프는 마지막 보이는 줄 안에서만 — 줄 경계를 넘어 계속 접으면 줄을 가득
  // 채우는 긴 칩이 연속될 때 visible 이 1까지 연쇄 붕괴한다.
  const lastLineTop = tops[targetLines - 1];
  let truncateLast = false;
  while (k > 0) {
    const last = chips[k - 1];
    if (last.top !== lastLineTop) break;
    if (last.left + last.width + gap + plusWidth <= containerWidth) break;
    const firstOnLine = k - 2 < 0 || chips[k - 2].top !== lastLineTop;
    if (firstOnLine) {
      // 줄의 첫 칩까지 왔다 — 접으면 줄이 사라져 행 높이 결손. 칩을 잘라 자리 확보.
      truncateLast = true;
      break;
    }
    k--;
  }
  k = Math.max(k, 1);
  return { visible: k, hidden: total - k, truncateLast };
}
