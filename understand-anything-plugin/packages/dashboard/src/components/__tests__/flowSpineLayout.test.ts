import { describe, it, expect } from "vitest";
import {
  computeSpineLayout,
  SPINE_COLUMNS,
  COL_W,
  HEADER_H,
  NODE_H,
  NODE_W,
} from "../flowSpineLayout";
import type { SpineStep } from "../flowSpineLayout";
import type { FlowLayer } from "../../utils/flowLayer";

const NODE_PAD_X = 24;
const NODE_PAD_Y = 20;
const SIBLING_GAP = 16;
const FIRST_Y = HEADER_H + NODE_PAD_Y;

function step(id: string, layer: FlowLayer): SpineStep {
  return { id, layer };
}

describe("computeSpineLayout — column assignment (x by derived layer)", () => {
  const colOf: Array<[FlowLayer, number]> = [
    ["api", 0],
    ["service", 1],
    ["dao", 2],
    ["db", 3],
    ["unknown", 4],
  ];
  for (const [layer, idx] of colOf) {
    it(`${layer} → column ${idx} (x = ${idx} * COL_W + pad)`, () => {
      const { placements } = computeSpineLayout([step("s", layer)]);
      const p = placements.get("s")!;
      expect(p.col).toBe(idx);
      expect(p.layer).toBe(layer);
      expect(p.x).toBe(idx * COL_W + NODE_PAD_X);
    });
  }

  it("SPINE_COLUMNS order is api,service,dao,db,unknown (Other last)", () => {
    expect(SPINE_COLUMNS).toEqual(["api", "service", "dao", "db", "unknown"]);
  });
});

describe("computeSpineLayout — within-column y accumulation", () => {
  it("first node in a column sits below the sticky header", () => {
    const { placements } = computeSpineLayout([step("a", "api")]);
    expect(placements.get("a")!.y).toBe(FIRST_Y);
  });

  it("siblings in the same column stack by NODE_H + SIBLING_GAP", () => {
    const { placements } = computeSpineLayout([
      step("a", "service"),
      step("b", "service"),
      step("c", "service"),
    ]);
    expect(placements.get("a")!.y).toBe(FIRST_Y);
    expect(placements.get("b")!.y).toBe(FIRST_Y + (NODE_H + SIBLING_GAP));
    expect(placements.get("c")!.y).toBe(FIRST_Y + 2 * (NODE_H + SIBLING_GAP));
    // All share the same x (same column).
    expect(placements.get("a")!.x).toBe(placements.get("b")!.x);
  });

  it("different columns accumulate y independently", () => {
    const { placements } = computeSpineLayout([
      step("api1", "api"),
      step("svc1", "service"),
      step("api2", "api"),
    ]);
    // api column: api1 at FIRST_Y, api2 stacked below.
    expect(placements.get("api1")!.y).toBe(FIRST_Y);
    expect(placements.get("api2")!.y).toBe(FIRST_Y + (NODE_H + SIBLING_GAP));
    // service column: first (and only) at FIRST_Y, independent of api stack.
    expect(placements.get("svc1")!.y).toBe(FIRST_Y);
  });
});

describe("computeSpineLayout — step count preserved + dimensions", () => {
  it("placements count == input step count (no dropped/added nodes)", () => {
    const steps = Array.from({ length: 37 }, (_, i) =>
      step(`s${i}`, SPINE_COLUMNS[i % SPINE_COLUMNS.length]),
    );
    const { placements, columnCounts } = computeSpineLayout(steps);
    expect(placements.size).toBe(37);
    expect(columnCounts.reduce((a, b) => a + b, 0)).toBe(37);
  });

  it("every placement carries fixed node dimensions", () => {
    const { placements } = computeSpineLayout([step("a", "dao")]);
    const p = placements.get("a")!;
    expect(p.w).toBe(NODE_W);
    expect(p.h).toBe(NODE_H);
  });

  it("empty input → zero placements, header-seeded height, full column width", () => {
    const { placements, columnCounts, width, height } = computeSpineLayout([]);
    expect(placements.size).toBe(0);
    expect(columnCounts).toEqual([0, 0, 0, 0, 0]);
    expect(width).toBe(COL_W * SPINE_COLUMNS.length + 40);
    expect(height).toBe(FIRST_Y + 60);
  });
});

describe("computeSpineLayout — all-unknown flow (Other lane)", () => {
  it("stacks every step in column 4 without crash", () => {
    const steps = [step("u1", "unknown"), step("u2", "unknown"), step("u3", "unknown")];
    const { placements, columnCounts } = computeSpineLayout(steps);
    for (const id of ["u1", "u2", "u3"]) {
      expect(placements.get(id)!.col).toBe(4);
      expect(placements.get(id)!.x).toBe(4 * COL_W + NODE_PAD_X);
    }
    expect(columnCounts[4]).toBe(3);
  });
});

describe("computeSpineLayout — scale (110-step flow)", () => {
  it("places all 110 steps with bounded, monotonic per-column y", () => {
    // Mimic flow:order-detail-big distribution across the 4 real lanes.
    const lanes: FlowLayer[] = ["api", "service", "dao", "db"];
    const steps = Array.from({ length: 110 }, (_, i) => step(`big${i}`, lanes[i % 4]));
    const { placements, columnCounts } = computeSpineLayout(steps);
    expect(placements.size).toBe(110);
    expect(columnCounts.slice(0, 4).reduce((a, b) => a + b, 0)).toBe(110);
    // Within each lane, y strictly increases in input order.
    const seen: Record<number, number> = {};
    for (const s of steps) {
      const p = placements.get(s.id)!;
      if (seen[p.col] !== undefined) expect(p.y).toBeGreaterThan(seen[p.col]);
      seen[p.col] = p.y;
    }
  });
});
