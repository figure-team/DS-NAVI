import { describe, expect, it } from "vitest";

import { EXPORT_MAX_SIDE, EXPORT_PAD, EXPORT_PIXEL_RATIO, planErdExport } from "./erd-export";

describe("planErdExport", () => {
  it("일반 그래프 — 여백 포함 크기, 기본 pixelRatio 2", () => {
    const plan = planErdExport({ x: 100, y: 50, width: 2000, height: 1200 });
    expect(plan.width).toBe(2000 + EXPORT_PAD * 2);
    expect(plan.height).toBe(1200 + EXPORT_PAD * 2);
    expect(plan.pixelRatio).toBe(EXPORT_PIXEL_RATIO);
  });

  it("음수 원점 그래프 — translate 가 원점+여백으로 보정", () => {
    const plan = planErdExport({ x: -300, y: -80, width: 1000, height: 500 });
    expect(plan.x).toBe(300 + EXPORT_PAD);
    expect(plan.y).toBe(80 + EXPORT_PAD);
  });

  it("대형 그래프 — 캔버스 한 변 한계 안으로 pixelRatio 만 축소(레이아웃 불변)", () => {
    const width = 12000;
    const plan = planErdExport({ x: 0, y: 0, width, height: 4000 });
    expect(plan.width).toBe(width + EXPORT_PAD * 2);
    expect(plan.pixelRatio).toBeLessThan(EXPORT_PIXEL_RATIO);
    expect(plan.width * plan.pixelRatio).toBeLessThanOrEqual(EXPORT_MAX_SIDE);
  });

  it("한계 직전 그래프 — 2배 유지", () => {
    const plan = planErdExport({ x: 0, y: 0, width: 7000, height: 3000 });
    expect(plan.pixelRatio).toBe(EXPORT_PIXEL_RATIO);
  });

  it("소수 좌표 — 크기는 올림 정수", () => {
    const plan = planErdExport({ x: 0.4, y: 0.6, width: 999.2, height: 499.5 });
    expect(Number.isInteger(plan.width)).toBe(true);
    expect(Number.isInteger(plan.height)).toBe(true);
  });
});
