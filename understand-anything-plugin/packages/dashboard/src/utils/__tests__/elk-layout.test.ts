import { describe, it, expect } from "vitest";
import {
  applyElkLayout,
  elkEdgePointMap,
  elkEdgePointMapByEndpoint,
  repairElkInput,
  type ElkInput,
} from "../elk-layout";

describe("repairElkInput", () => {
  it("ensures node dimensions when missing", () => {
    const input: ElkInput = {
      id: "root",
      children: [{ id: "a" }, { id: "b", width: 100, height: 50 }] as ElkInput["children"],
      edges: [],
    };
    const { input: out, issues } = repairElkInput(input);
    expect(out.children![0].width).toBeGreaterThan(0);
    expect(out.children![0].height).toBeGreaterThan(0);
    expect(out.children![1]).toEqual({ id: "b", width: 100, height: 50 });
    expect(issues.some((i) => i.level === "auto-corrected" && /dimensions/.test(i.message))).toBe(true);
  });

  it("dedupes duplicate child ids and reports auto-corrected", () => {
    const input: ElkInput = {
      id: "root",
      children: [
        { id: "a", width: 1, height: 1 },
        { id: "a", width: 1, height: 1 },
      ],
      edges: [],
    };
    const { input: out, issues } = repairElkInput(input);
    expect(out.children).toHaveLength(1);
    expect(issues.some((i) => i.level === "auto-corrected" && /duplicate/.test(i.message))).toBe(true);
  });

  it("drops orphan edges referencing nonexistent nodes", () => {
    const input: ElkInput = {
      id: "root",
      children: [{ id: "a", width: 1, height: 1 }],
      edges: [
        { id: "e1", sources: ["a"], targets: ["ghost"] },
      ],
    };
    const { input: out, issues } = repairElkInput(input);
    expect(out.edges).toHaveLength(0);
    expect(issues.some((i) => i.level === "dropped" && /edge/.test(i.message))).toBe(true);
  });

  it("drops children referencing nonexistent parents", () => {
    const input: ElkInput = {
      id: "root",
      children: [
        {
          id: "p",
          width: 100,
          height: 100,
          children: [{ id: "c1", width: 1, height: 1 }],
        },
        { id: "orphan", width: 1, height: 1, parentId: "ghost" } as ElkInput["children"][0] & { parentId: string },
      ],
      edges: [],
    };
    const { input: out, issues } = repairElkInput(input);
    expect(out.children!.find((c) => c.id === "orphan")).toBeUndefined();
    expect(issues.some((i) => i.level === "dropped" && /parent/.test(i.message))).toBe(true);
  });

  it("strict mode throws on any issue", () => {
    const input: ElkInput = {
      id: "root",
      children: [{ id: "a" }] as ElkInput["children"],
      edges: [],
    };
    expect(() => repairElkInput(input, { strict: true })).toThrow(/dimensions/);
  });
});

describe("applyElkLayout", () => {
  it("lays out a small graph and returns positions", async () => {
    const result = await applyElkLayout({
      id: "root",
      children: [
        { id: "a", width: 100, height: 50 },
        { id: "b", width: 100, height: 50 },
      ],
      edges: [{ id: "e1", sources: ["a"], targets: ["b"] }],
      layoutOptions: { algorithm: "layered", "elk.direction": "DOWN" },
    });
    expect(result.issues).toEqual([]);
    expect(result.positioned.children).toHaveLength(2);
    for (const c of result.positioned.children) {
      expect(typeof c.x).toBe("number");
      expect(typeof c.y).toBe("number");
    }
  });

  it("exposes per-edge orthogonal routing points via elkEdgePointMap", async () => {
    const { positioned } = await applyElkLayout({
      id: "root",
      children: [
        { id: "a", width: 100, height: 50 },
        { id: "b", width: 100, height: 50 },
      ],
      edges: [{ id: "e1", sources: ["a"], targets: ["b"] }],
      layoutOptions: {
        algorithm: "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
      },
    });
    const map = elkEdgePointMap(positioned);
    const pts = map.get("e1");
    expect(pts).toBeDefined();
    // start + end at minimum; every point is a finite {x,y}
    expect(pts!.length).toBeGreaterThanOrEqual(2);
    for (const p of pts!) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("routes hierarchical (INCLUDE_CHILDREN) edges keyed by endpoint", async () => {
    const { positioned } = await applyElkLayout({
      id: "root",
      layoutOptions: {
        algorithm: "layered",
        "elk.direction": "DOWN",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.edgeRouting": "ORTHOGONAL",
      },
      // Two parent containers (no explicit size → ELK fits to children) each
      // with one child file; one cross-container edge between the children.
      children: [
        { id: "c1", children: [{ id: "f1", width: 100, height: 40 }] },
        { id: "c2", children: [{ id: "f2", width: 100, height: 40 }] },
      ] as ElkInput["children"],
      edges: [{ id: "e1", sources: ["f1"], targets: ["f2"] }],
    });
    const map = elkEdgePointMapByEndpoint(positioned);
    const pts = map.get("f1|f2");
    expect(pts).toBeDefined();
    expect(pts!.length).toBeGreaterThanOrEqual(2);
    // Parent containers must NOT be forced to default dims — they grow to fit.
    const c1 = positioned.children!.find((c) => c.id === "c1");
    expect((c1!.width ?? 0)).toBeGreaterThan(100);
  });

  it("elkEdgePointMap omits edges without routing sections", () => {
    // A plain (un-laid-out) graph has no edge sections.
    const map = elkEdgePointMap({
      id: "root",
      children: [{ id: "a", width: 1, height: 1 }],
      edges: [{ id: "e1", sources: ["a"], targets: ["a"] }],
    });
    expect(map.size).toBe(0);
  });

  it("returns fatal issue when ELK rejects (without throwing in non-strict)", async () => {
    // Force ELK rejection by giving an invalid algorithm
    const result = await applyElkLayout(
      {
        id: "root",
        children: [{ id: "a", width: 1, height: 1 }],
        edges: [],
        layoutOptions: { algorithm: "this-algorithm-does-not-exist" },
      },
      { strict: false },
    );
    expect(result.issues.some((i) => i.level === "fatal")).toBe(true);
  });
});
