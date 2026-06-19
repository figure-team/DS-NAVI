import { describe, it, expect } from "vitest";
import {
  computeSpineLayout,
  orderSpineSequence,
  partitionSpine,
  spineColumnIndex,
  SPINE_COLUMNS,
  COL_W,
  HEADER_H,
  NODE_H,
  NODE_W,
} from "../flowSpineLayout";
import type { SpineStep, SpineCallEdge } from "../flowSpineLayout";
import type { FlowLayer } from "../../utils/flowLayer";

const NODE_PAD_X = 24;
const NODE_PAD_Y = 20;
const SIBLING_GAP = 34;
const FIRST_Y = HEADER_H + NODE_PAD_Y;

function step(id: string, layer: FlowLayer): SpineStep {
  return { id, layer };
}

function edge(source: string, target: string): SpineCallEdge {
  return { source, target };
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

describe("orderSpineSequence — pipeline-column order, stable within column", () => {
  it("reorders a non-monotone sequence into api→service→dao→db→other", () => {
    // Mimics the Catalog flow: an api base class emitted AFTER the service step.
    const seq = [
      step("catalogActionBean", "api"),
      step("category", "unknown"),
      step("catalogService", "service"),
      step("abstractActionBean", "api"),
      step("categoryMapper", "dao"),
    ];
    const ordered = orderSpineSequence(seq).map((s) => s.id);
    expect(ordered).toEqual([
      "catalogActionBean",
      "abstractActionBean", // both api → grouped, no backward jump
      "catalogService",
      "categoryMapper",
      "category", // unknown/other lane last
    ]);
    // Column indices are now non-decreasing → every cross-layer edge flows right.
    const cols = orderSpineSequence(seq).map((s) => spineColumnIndex(s.layer));
    for (let i = 1; i < cols.length; i++) expect(cols[i]).toBeGreaterThanOrEqual(cols[i - 1]);
  });

  it("preserves incoming order within the same column (stable)", () => {
    const seq = [step("a", "dao"), step("b", "api"), step("c", "api"), step("d", "dao")];
    expect(orderSpineSequence(seq).map((s) => s.id)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("partitionSpine — backbone vs folded entity branches", () => {
  // Mirrors the real jpetstore "editAccount" flow: an ActionBean (api) that
  // calls two services + two entities; AccountService → AccountMapper → Account;
  // CatalogService → Category/Item/Product; Item → Product. The four `unknown`
  // domain models (account/category/item/product) are the foldable branches.
  const steps = [
    step("bean", "api"),
    step("account", "unknown"),
    step("svcA", "service"),
    step("svcC", "service"),
    step("category", "unknown"),
    step("item", "unknown"),
    step("product", "unknown"),
    step("mapA", "dao"),
  ];
  const calls = [
    edge("item", "product"),
    edge("mapA", "account"),
    edge("svcA", "account"),
    edge("svcA", "mapA"),
    edge("svcC", "category"),
    edge("svcC", "item"),
    edge("svcC", "product"),
    edge("bean", "account"),
    edge("bean", "product"),
    edge("bean", "svcA"),
    edge("bean", "svcC"),
  ];

  it("splits non-unknown steps into the always-visible backbone", () => {
    const { spine } = partitionSpine(steps, calls);
    expect(spine.map((s) => s.id)).toEqual(["bean", "svcA", "svcC", "mapA"]);
  });

  it("classifies every unknown step with a backbone ancestor as a branch (no orphans here)", () => {
    const { branches, orphans } = partitionSpine(steps, calls);
    expect(branches.map((s) => s.id).sort()).toEqual(["account", "category", "item", "product"]);
    expect(orphans).toEqual([]);
  });

  it("folds a fan-in entity under its EARLIEST-pipeline caller (api before service/dao)", () => {
    // account is called by bean(api), svcA(service), mapA(dao) → api wins.
    const { parentOf } = partitionSpine(steps, calls);
    expect(parentOf.get("account")).toBe("bean");
  });

  it("resolves a branch reached only via another branch through to the backbone", () => {
    // product is called by bean(api), svcC(service), and item(unknown). The
    // transitive climb from item reaches svcC, but bean(api) is earlier → bean.
    const { parentOf } = partitionSpine(steps, calls);
    expect(parentOf.get("product")).toBe("bean");
    // category/item hang only off the catalog service.
    expect(parentOf.get("category")).toBe("svcC");
    expect(parentOf.get("item")).toBe("svcC");
  });

  it("groups branchesByParent in input order", () => {
    const { branchesByParent } = partitionSpine(steps, calls);
    expect(branchesByParent.get("bean")).toEqual(["account", "product"]);
    expect(branchesByParent.get("svcC")).toEqual(["category", "item"]);
    expect(branchesByParent.has("svcA")).toBe(false);
    expect(branchesByParent.has("mapA")).toBe(false);
  });

  it("treats an unknown step with no backbone ancestor as an always-shown orphan", () => {
    const s = [step("a", "api"), step("loner", "unknown"), step("x", "unknown")];
    // loner is only called by x (also unknown), x is called by nobody → no
    // backbone ancestor for either → both orphans.
    const { branches, orphans, parentOf } = partitionSpine(s, [edge("x", "loner")]);
    expect(branches).toEqual([]);
    expect(orphans.map((o) => o.id).sort()).toEqual(["loner", "x"]);
    expect(parentOf.size).toBe(0);
  });

  it("with no call edges every unknown step is an orphan (nothing to fold into)", () => {
    const { spine, branches, orphans } = partitionSpine(steps, []);
    expect(spine.map((s) => s.id)).toEqual(["bean", "svcA", "svcC", "mapA"]);
    expect(branches).toEqual([]);
    expect(orphans.map((o) => o.id).sort()).toEqual(["account", "category", "item", "product"]);
  });

  it("is deterministic across repeated calls", () => {
    const a = partitionSpine(steps, calls);
    const b = partitionSpine(steps, calls);
    expect([...a.parentOf.entries()]).toEqual([...b.parentOf.entries()]);
    expect(a.spine.map((s) => s.id)).toEqual(b.spine.map((s) => s.id));
  });

  it("tolerates cycles in the calls graph without infinite-looping", () => {
    const s = [step("api1", "api"), step("e1", "unknown"), step("e2", "unknown")];
    // e1 ↔ e2 cycle, e1 reachable from api1.
    const { branches, orphans, parentOf } = partitionSpine(s, [
      edge("api1", "e1"),
      edge("e1", "e2"),
      edge("e2", "e1"),
    ]);
    expect(parentOf.get("e1")).toBe("api1");
    expect(parentOf.get("e2")).toBe("api1"); // climbs e2 → e1 → api1
    expect(branches.map((x) => x.id).sort()).toEqual(["e1", "e2"]);
    expect(orphans).toEqual([]);
  });
});
