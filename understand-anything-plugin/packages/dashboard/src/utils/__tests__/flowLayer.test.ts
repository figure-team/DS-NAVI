import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deriveLayer, orderFlowSteps } from "../flowLayer";
import type { StepSource, FlowLayer } from "../flowLayer";
import type { GraphNode, GraphEdge, KnowledgeGraph } from "@understand-anything/core/types";

function step(partial: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: "step",
    name: partial.name ?? partial.id,
    summary: "",
    tags: [],
    complexity: "moderate",
    ...partial,
  } as GraphNode;
}

describe("deriveLayer — className (strongest signal)", () => {
  const cases: Array<[string, FlowLayer]> = [
    ["OrderController", "api"],
    ["MemberRestController", "api"],
    ["OrderResource", "api"],
    ["LoginAction", "api"],
    ["StatusEndpoint", "api"],
    ["OrderService", "service"],
    ["OrderServiceImpl", "service"],
    ["OrderMapper", "dao"],
    ["OrderDao", "dao"],
    ["MemberRepository", "dao"],
  ];
  for (const [className, expected] of cases) {
    it(`${className} → ${expected}`, () => {
      const src: StepSource = { className, relPath: "irrelevant/path.java" };
      expect(deriveLayer(step({ id: className }), src)).toBe(expected);
    });
  }
});

describe("deriveLayer — facade/manager/handler/Job are unknown (honest, not service)", () => {
  for (const className of [
    "PaymentSettlementFacade",
    "OrderManager",
    "EventHandler",
    "SettlementBatchJob",
  ]) {
    it(`${className} → unknown`, () => {
      const src: StepSource = { className, relPath: "src/main/java/x.java" };
      expect(deriveLayer(step({ id: className }), src)).toBe("unknown");
    });
  }
});

describe("deriveLayer — filePath / relPath segments", () => {
  it("web/controller path → api", () => {
    expect(deriveLayer(step({ id: "a", filePath: "src/main/java/x/web/Foo.java" }))).toBe("api");
  });
  it("service path → service", () => {
    expect(deriveLayer(step({ id: "a", filePath: "src/main/java/x/service/Foo.java" }))).toBe("service");
  });
  it("mapper path → dao", () => {
    expect(deriveLayer(step({ id: "a", filePath: "src/main/java/x/mapper/Foo.java" }))).toBe("dao");
  });
  it("repository path → dao", () => {
    expect(deriveLayer(step({ id: "a", filePath: "src/main/java/x/repository/Foo.java" }))).toBe("dao");
  });
  it(".sql file → db", () => {
    expect(deriveLayer(step({ id: "a", filePath: "src/main/resources/sql/order.sql" }))).toBe("db");
  });
  it("*Mapper.xml under sql path → db", () => {
    expect(deriveLayer(step({ id: "a", filePath: "src/main/resources/sql/order/OrderMapper.xml" }))).toBe("db");
  });
});

describe("deriveLayer — name fallback (table-like)", () => {
  it("UPPER_SNAKE table name → db", () => {
    expect(deriveLayer(step({ id: "a", name: "ORDER_HEADER" }))).toBe("db");
  });
  it("TB_ prefixed name → db", () => {
    expect(deriveLayer(step({ id: "a", name: "TB_PAYMENT" }))).toBe("db");
  });
});

describe("deriveLayer — priority: className beats filePath beats name", () => {
  it("className(dao) overrides filePath(service)", () => {
    const node = step({ id: "a", filePath: "src/main/java/x/service/Foo.java", name: "Foo" });
    expect(deriveLayer(node, { className: "FooMapper", relPath: "x/service/Foo.java" })).toBe("dao");
  });
  it("filePath(api) overrides name(db)", () => {
    const node = step({ id: "a", filePath: "src/main/java/x/web/ORDER_HEADER.java", name: "ORDER_HEADER" });
    expect(deriveLayer(node)).toBe("api");
  });
});

describe("deriveLayer — unknown fallback", () => {
  it("no recognizable signal → unknown", () => {
    expect(deriveLayer(step({ id: "a", name: "doStuff" }))).toBe("unknown");
  });
});

describe("deriveLayer — engine layer (ground truth) short-circuit", () => {
  it("trusts node.layer verbatim when present, ignoring filename heuristic", () => {
    // className/filePath would heuristically say "service", but the engine says "dao".
    const node = step({ id: "a", filePath: "src/x/service/OrderService.java", name: "OrderService" });
    (node as { layer?: string }).layer = "dao";
    expect(deriveLayer(node, { className: "OrderService", relPath: "src/x/service/OrderService.java" })).toBe("dao");
  });

  it("returns each valid engine layer verbatim", () => {
    for (const layer of ["api", "service", "dao", "db", "unknown"] as const) {
      const node = step({ id: "a", name: "doStuff" });
      (node as { layer?: string }).layer = layer;
      expect(deriveLayer(node)).toBe(layer);
    }
  });

  it("ignores an invalid engine layer and falls back to the heuristic", () => {
    const node = step({ id: "a", name: "OrderController" });
    (node as { layer?: string }).layer = "bogus";
    expect(deriveLayer(node, { className: "OrderController", relPath: "x.java" })).toBe("api");
  });

  it("falls back to the heuristic when node.layer is absent (old graphs)", () => {
    expect(deriveLayer(step({ id: "a", name: "OrderMapper" }), { className: "OrderMapper", relPath: "x.java" })).toBe("dao");
  });
});

describe("orderFlowSteps — raw weight asc, tie-broken by id, NaN last", () => {
  it("orders by raw weight (no Math.round bucketing)", () => {
    // Two weights that round to the same *10 bucket but must stay ordered.
    const out = orderFlowSteps([
      { id: "b", weight: 0.66 },
      { id: "a", weight: 0.64 },
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("tie-breaks equal weights by stable node id", () => {
    const out = orderFlowSteps([
      { id: "z", weight: 0.5 },
      { id: "a", weight: 0.5 },
      { id: "m", weight: 0.5 },
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "m", "z"]);
  });
  it("NaN / non-finite weights sort last deterministically", () => {
    const out = orderFlowSteps([
      { id: "bad2", weight: Number.NaN },
      { id: "good", weight: 0.3 },
      { id: "bad1", weight: Number.POSITIVE_INFINITY },
    ]);
    expect(out.map((s) => s.id)).toEqual(["good", "bad1", "bad2"]);
  });
  it("does not mutate the input array", () => {
    const input = [{ id: "b", weight: 0.6 }, { id: "a", weight: 0.4 }];
    const copy = [...input];
    orderFlowSteps(input);
    expect(input).toEqual(copy);
  });
});

// ── Fixture-scoped gates (AC-4 + R5) ────────────────────────────────────────

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../public/domain-graph.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as KnowledgeGraph;
const BIG_FLOW = "flow:order-detail-big";

function stepsForFlow(flowId: string): Array<{ node: GraphNode; weight: number }> {
  const nodesById = new Map(fixture.nodes.map((n) => [n.id, n]));
  return fixture.edges
    .filter((e: GraphEdge) => e.type === "flow_step" && e.source === flowId)
    .map((e: GraphEdge) => ({ node: nodesById.get(e.target)!, weight: e.weight }))
    .filter((s) => s.node);
}

describe("AC-4 — unknown rate ≤ 15% on the 100-step fixture flow", () => {
  it("measures unknown rate on the big flow", () => {
    const steps = stepsForFlow(BIG_FLOW);
    expect(steps.length).toBeGreaterThanOrEqual(100);
    const layers = steps.map((s) => {
      const ss = (s.node as unknown as { stepSource?: StepSource }).stepSource;
      return deriveLayer(s.node, ss);
    });
    const unknown = layers.filter((l) => l === "unknown").length;
    const rate = unknown / layers.length;
    // Report for visibility in CI logs.
    console.log(`[AC-4] big-flow unknown rate = ${(rate * 100).toFixed(2)}% (${unknown}/${layers.length})`);
    expect(rate).toBeLessThanOrEqual(0.15);
  });
});

describe("R5 — monotonic-distinct ordering survives JSON round-trip", () => {
  it("ordered weights on the big flow are strictly increasing and distinct", () => {
    // Round-trip through JSON to assert no precision loss.
    const roundTripped = JSON.parse(JSON.stringify(fixture)) as KnowledgeGraph;
    const refs = roundTripped.edges
      .filter((e: GraphEdge) => e.type === "flow_step" && e.source === BIG_FLOW)
      .map((e: GraphEdge) => ({ id: e.target, weight: e.weight }));
    const ordered = orderFlowSteps(refs);
    const weights = ordered.map((s) => s.weight);
    expect(new Set(weights).size).toBe(weights.length); // distinct
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]); // strictly monotonic
    }
  });
});
