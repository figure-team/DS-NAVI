import { describe, it, expect } from "vitest";
import { rewrapWideRows, ROW_WRAP_MIN } from "../rankWrap";
import type { WrapNode } from "../rankWrap";

/** 한 랭크에 n개를 나란히 깐 노드들(ELK layered 출력 모사). */
function row(n: number, y: number, prefix: string, w = 280, h = 120): WrapNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    x: i * (w + 80),
    y,
    width: w,
    height: h,
  }));
}

describe("rewrapWideRows", () => {
  it("leaves narrow ranks untouched", () => {
    const nodes = [...row(ROW_WRAP_MIN - 1, 0, "a"), ...row(3, 400, "b")];
    const before = nodes.map((n) => ({ ...n }));
    const r = rewrapWideRows(nodes);
    expect(r.rewrapped.size).toBe(0);
    expect(r.shiftById.size).toBe(0);
    expect(nodes).toEqual(before);
  });

  it("wraps a wide rank into multiple grid rows (aspect fix)", () => {
    const nodes = row(16, 0, "t");
    const widthBefore = 16 * 360 - 80;
    const r = rewrapWideRows(nodes);
    expect(r.rewrapped.size).toBe(16);
    const maxX = Math.max(...nodes.map((n) => (n.x ?? 0) + (n.width ?? 0)));
    const maxY = Math.max(...nodes.map((n) => (n.y ?? 0) + (n.height ?? 0)));
    expect(maxX).toBeLessThan(widthBefore / 2); // 폭이 대폭 줄고
    expect(maxY).toBeGreaterThan(120); // 여러 행이 됨
    // 셀 겹침 없음
    const seen = new Set(nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(16);
  });

  it("preserves ELK x-order row-major when wrapping", () => {
    const nodes = row(6, 0, "n", 100, 50);
    rewrapWideRows(nodes, { minCount: 5, aspectRatio: 1 });
    // n0..n5가 행 우선으로: 같은 행 안에서 x 오름차순 유지
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const n0 = byId.get("n0")!;
    const n1 = byId.get("n1")!;
    expect(n0.y).toBe(n1.y);
    expect(n0.x!).toBeLessThan(n1.x!);
  });

  it("shifts lower ranks down by the added height and reports shiftById", () => {
    const wide = row(16, 0, "t");
    const below = row(3, 400, "p");
    const belowYBefore = below.map((n) => n.y ?? 0);
    const nodes = [...wide, ...below];
    const r = rewrapWideRows(nodes);
    expect(r.rewrapped.size).toBeGreaterThanOrEqual(16);
    for (const n of below) {
      const shift = r.shiftById.get(n.id) ?? 0;
      expect(shift).toBeGreaterThan(0);
      expect(n.y).toBe(belowYBefore[below.indexOf(n)] + shift);
    }
    // 감긴 랭크와 아래 랭크가 겹치지 않는다
    const wrappedBottom = Math.max(...wide.map((n) => (n.y ?? 0) + (n.height ?? 0)));
    const belowTop = Math.min(...below.map((n) => n.y ?? 0));
    expect(belowTop).toBeGreaterThanOrEqual(wrappedBottom);
  });

  it("x-compacts lower ranks wider than the wrapped grid (routing invalidated)", () => {
    const wide = row(16, 0, "t");
    // 아래 랭크: 원래 넓은 배치 기준으로 3000px 간격으로 흩어진 4개
    const below: WrapNode[] = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      x: i * 1000,
      y: 400,
      width: 220,
      height: 72,
    }));
    const nodes = [...wide, ...below];
    const r = rewrapWideRows(nodes);
    const wrapMaxX = Math.max(
      ...wide.map((n) => (n.x ?? 0) + (n.width ?? 0)),
    );
    const belowMaxX = Math.max(...below.map((n) => (n.x ?? 0) + (n.width ?? 0)));
    expect(belowMaxX).toBeLessThanOrEqual(wrapMaxX + 1);
    // x가 움직였으므로 라우팅 무효 대상에 포함, 순서는 보존
    for (const n of below) expect(r.rewrapped.has(n.id)).toBe(true);
    expect(below[0].x!).toBeLessThan(below[1].x!);
  });

  it("does not x-compact when no wrap happened", () => {
    const nodes: WrapNode[] = [
      ...row(3, 0, "a"),
      { id: "far", x: 5000, y: 400, width: 220, height: 72 },
      { id: "far2", x: 0, y: 400, width: 220, height: 72 },
    ];
    const r = rewrapWideRows(nodes);
    expect(r.rewrapped.size).toBe(0);
    expect(nodes.find((n) => n.id === "far")!.x).toBe(5000);
  });

  it("handles empty input", () => {
    const r = rewrapWideRows([]);
    expect(r.rewrapped.size).toBe(0);
    expect(r.shiftById.size).toBe(0);
  });
});
