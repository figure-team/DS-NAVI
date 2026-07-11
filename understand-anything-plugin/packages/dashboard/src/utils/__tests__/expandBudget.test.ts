import { describe, it, expect } from "vitest";
import {
  rankVisibleChildren,
  computeChildGrid,
  EXPAND_VISIBLE_BUDGET,
  EXPAND_BUDGET_SLACK,
} from "../expandBudget";

const ids = (n: number, prefix = "f") =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, "0")}`);

describe("rankVisibleChildren", () => {
  it("shows everything when within budget + slack (no '+1개 더' chip)", () => {
    const children = ids(EXPAND_VISIBLE_BUDGET + EXPAND_BUDGET_SLACK);
    const r = rankVisibleChildren(children, []);
    expect(r.visible).toEqual(children);
    expect(r.hidden).toEqual([]);
  });

  it("cuts to budget and hides the rest when over budget + slack", () => {
    const children = ids(EXPAND_VISIBLE_BUDGET + EXPAND_BUDGET_SLACK + 1);
    const r = rankVisibleChildren(children, []);
    expect(r.visible).toHaveLength(EXPAND_VISIBLE_BUDGET);
    expect(r.hidden).toHaveLength(EXPAND_BUDGET_SLACK + 1);
    // Every child ends up exactly once in visible ∪ hidden.
    expect([...r.visible, ...r.hidden].sort()).toEqual([...children].sort());
  });

  it("ranks hubs (highest degree) into the visible set", () => {
    const children = ids(15);
    // f14 gets 5 edges, f13 gets 4 … f10 gets 1; f00..f09 get none.
    const edges: { source: string; target: string }[] = [];
    for (let i = 10; i < 15; i++) {
      for (let k = 0; k < i - 9; k++) {
        edges.push({ source: `f${i}`, target: `x${k}` });
      }
    }
    const r = rankVisibleChildren(children, edges, 5, 0);
    expect(r.visible).toEqual(["f14", "f13", "f12", "f11", "f10"]);
  });

  it("counts degree on both endpoints and breaks ties by id (deterministic)", () => {
    const children = ["b", "a", "c", "d"];
    const edges = [
      { source: "z", target: "c" }, // c: 1
      { source: "c", target: "z" }, // c: 2
      { source: "a", target: "b" }, // a: 1, b: 1
    ];
    const r = rankVisibleChildren(children, edges, 2, 0);
    // c(2) first, then a/b tie(1) → id order picks "a".
    expect(r.visible).toEqual(["c", "a"]);
    expect(r.hidden).toEqual(["b", "d"]);
  });
});

describe("computeChildGrid", () => {
  const opts = {
    cellWidth: 220,
    cellHeight: 96,
    gap: 20,
    paddingX: 16,
    paddingTop: 48,
    paddingBottom: 16,
  };

  it("wraps cells into multiple rows instead of one long rank", () => {
    const grid = computeChildGrid(ids(11), opts);
    const xs = new Set([...grid.positions.values()].map((p) => p.x));
    const ys = new Set([...grid.positions.values()].map((p) => p.y));
    expect(ys.size).toBeGreaterThan(1); // 한 줄 병리 방지 — 반드시 여러 행
    expect(xs.size).toBeLessThan(11); // 그리고 11열 한 줄이 아님
  });

  it("computes a footprint that bounds every cell", () => {
    const cells = ids(7);
    const grid = computeChildGrid(cells, opts);
    for (const id of cells) {
      const p = grid.positions.get(id)!;
      expect(p.x + opts.cellWidth).toBeLessThanOrEqual(grid.width - opts.paddingX + 0.001);
      expect(p.y + opts.cellHeight).toBeLessThanOrEqual(
        grid.height - opts.paddingBottom + 0.001,
      );
    }
  });

  it("places cells in order, left-to-right then top-to-bottom, without overlap", () => {
    const cells = ids(6);
    const grid = computeChildGrid(cells, opts);
    const seen = new Set<string>();
    for (const id of cells) {
      const p = grid.positions.get(id)!;
      const key = `${p.x},${p.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // First cell anchors at the padding origin.
    expect(grid.positions.get(cells[0])).toEqual({ x: 16, y: 48 });
  });

  it("handles a single cell and an empty list", () => {
    const one = computeChildGrid(["only"], opts);
    expect(one.positions.get("only")).toEqual({ x: 16, y: 48 });
    expect(one.width).toBe(16 * 2 + 220);
    const none = computeChildGrid([], opts);
    expect(none.positions.size).toBe(0);
  });
});
