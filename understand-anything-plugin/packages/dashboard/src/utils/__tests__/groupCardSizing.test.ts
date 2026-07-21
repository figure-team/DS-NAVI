import { describe, it, expect } from "vitest";
import {
  computeRowTargetLines,
  computeVisibleChips,
  countNaturalLines,
  type ChipMetric,
} from "../groupCardSizing";

describe("countNaturalLines", () => {
  it("counts distinct offsetTop values as line count", () => {
    const chips: ChipMetric[] = [
      { top: 0, left: 0, width: 60 },
      { top: 0, left: 66, width: 60 },
      { top: 24, left: 0, width: 60 },
    ];
    expect(countNaturalLines(chips)).toBe(2);
  });

  it("returns 0 for an empty chip list", () => {
    expect(countNaturalLines([])).toBe(0);
  });
});

describe("computeRowTargetLines", () => {
  it("returns maxLines when the row is empty (defensive)", () => {
    expect(computeRowTargetLines([], 3)).toBe(3);
  });

  it("takes the minimum natural line count in the row", () => {
    expect(computeRowTargetLines([5, 2, 4], 3)).toBe(2);
  });

  it("clamps to maxLines when every card in the row needs more lines", () => {
    expect(computeRowTargetLines([5, 4, 6], 3)).toBe(3);
  });
});

describe("computeVisibleChips", () => {
  // 3 chips on line 0 (top=0), 2 chips on line 1 (top=24) — natural = 2 lines.
  const twoLineChips: ChipMetric[] = [
    { top: 0, left: 0, width: 60 },
    { top: 0, left: 66, width: 60 },
    { top: 0, left: 132, width: 60 },
    { top: 24, left: 0, width: 60 },
    { top: 24, left: 66, width: 60 },
  ];

  it("shows everything when natural lines already fit within target (no +N)", () => {
    const result = computeVisibleChips(twoLineChips, 2, 300, 6, 44);
    expect(result).toEqual({ visible: 5, hidden: 0, truncateLast: false });
  });

  it("truncates to the target line and the hidden count matches exactly", () => {
    // target=1 line, container wide enough for the +N pill after line 0's 3 chips.
    const result = computeVisibleChips(twoLineChips, 1, 300, 6, 44);
    expect(result.visible).toBe(3);
    expect(result.hidden).toBe(2);
  });

  it("backs off one more chip when the +N pill would not fit on the visible line", () => {
    // Same target=1, but a narrower container: the 3rd chip + +N pill overflow.
    const result = computeVisibleChips(twoLineChips, 1, 200, 6, 44);
    expect(result.visible).toBe(2);
    expect(result.hidden).toBe(3);
  });

  it("never truncates to 0 visible chips even in a pathologically narrow container", () => {
    const result = computeVisibleChips(twoLineChips, 1, 50, 6, 44);
    expect(result.visible).toBe(1);
    expect(result.hidden).toBe(4);
  });

  it("returns {visible:0, hidden:0} for an empty chip list", () => {
    expect(computeVisibleChips([], 3, 300, 6, 44)).toEqual({
      visible: 0,
      hidden: 0,
      truncateLast: false,
    });
  });

  it("keeps a full-width chip on the last line and truncates it instead of folding the line", () => {
    // line0 has trailing room, lines 1..3 are full-width chips. target=3.
    // 마지막 줄(line2)의 유일한 칩은 접지 않고 truncateLast 로 말줄임한다 —
    // 접으면(구 구현) "+N" 이 윗줄 끝에 흡수될 수 있어 표시 줄 수가 목표보다
    // 부족해진다(행 높이 결손). 줄 경계 너머 연쇄 백오프 금지는 그대로 유지.
    const chips: ChipMetric[] = [
      { top: 0, left: 0, width: 60 },
      { top: 0, left: 66, width: 150 },
      { top: 24, left: 0, width: 280 },
      { top: 48, left: 0, width: 280 },
      { top: 72, left: 0, width: 280 },
    ];
    const result = computeVisibleChips(chips, 3, 300, 6, 44);
    expect(result).toEqual({ visible: 4, hidden: 1, truncateLast: true });
  });

  it("regression: +N absorbed into the previous line must not shrink the displayed line count", () => {
    // m-project 저작물·등록 실측 결함 — target=2, line1 이 통폭 칩 하나뿐인 구성.
    // 구 구현: line1 을 통째로 접고 "+N" 이 line0 끝에 들어가 표시가 1줄로 줄었다
    // (같은 행 카드와 칩 영역 높이 불일치). 신 구현: 칩을 남기고 말줄임한다.
    const chips: ChipMetric[] = [
      { top: 0, left: 0, width: 60 },
      { top: 0, left: 66, width: 60 },
      { top: 24, left: 0, width: 280 },
      { top: 48, left: 0, width: 60 },
    ];
    const result = computeVisibleChips(chips, 2, 300, 6, 44);
    expect(result).toEqual({ visible: 3, hidden: 1, truncateLast: true });
  });
});
