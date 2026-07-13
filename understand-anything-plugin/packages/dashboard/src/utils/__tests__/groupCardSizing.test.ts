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
    expect(result).toEqual({ visible: 5, hidden: 0 });
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
    expect(computeVisibleChips([], 3, 300, 6, 44)).toEqual({ visible: 0, hidden: 0 });
  });

  it("backoff stops at the last visible line — full-width chips must not cascade across lines", () => {
    // line0 has trailing room, lines 1..3 are full-width chips. target=3.
    // 마지막 줄(line2) 칩만 접고 멈춰야 한다: +N 은 비워진 line2 를 통째로 차지한다.
    // (구 구현은 줄 경계를 넘어 line1·line0 까지 연쇄 백오프해 visible=2 로 붕괴 —
    //  mmobile 콘텐츠·사이트 카드가 11개 중 1개만 보이던 실측 결함.)
    const chips: ChipMetric[] = [
      { top: 0, left: 0, width: 60 },
      { top: 0, left: 66, width: 150 },
      { top: 24, left: 0, width: 280 },
      { top: 48, left: 0, width: 280 },
      { top: 72, left: 0, width: 280 },
    ];
    const result = computeVisibleChips(chips, 3, 300, 6, 44);
    expect(result).toEqual({ visible: 3, hidden: 2 });
  });
});
