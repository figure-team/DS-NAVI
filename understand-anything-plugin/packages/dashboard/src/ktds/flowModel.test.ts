import { describe, it, expect } from "vitest";
import {
  buildFlowSpine,
  buildRails,
  buildNodeDetail,
  buildDomainCards,
  buildCrossDomainEdges,
  buildFlowList,
  presentLayers,
  deriveConfidence,
  layerLabel,
  type DomainGraph,
  type SpineStep,
} from "./flowModel";

/** A 4-layer flow (api/service/dao/db) with weighted, out-of-order steps. */
function fourLayerGraph(): DomainGraph {
  return {
    nodes: [
      { id: "domain:order", type: "domain", name: "Order", summary: "Order domain." },
      { id: "flow:order.create", type: "flow", name: "Create Order", summary: "" },
      {
        id: "step:c",
        type: "step",
        name: "OrderDao.insert()",
        filePath: "src/dao/OrderDao.java",
        lineRange: [10, 40],
        layer: "dao",
      },
      {
        id: "step:a",
        type: "step",
        name: "OrderController.create()",
        filePath: "src/web/OrderController.java",
        lineRange: [5, 30],
        layer: "api",
        annotation: "@PostMapping",
      },
      {
        id: "step:d",
        type: "step",
        name: "orders table",
        filePath: "src/db/orders.sql",
        lineRange: [1, 1],
        layer: "db",
      },
      {
        id: "step:b",
        type: "step",
        name: "OrderService.create()",
        filePath: "src/service/OrderService.java",
        lineRange: [12, 60],
        layer: "service",
      },
    ],
    edges: [
      { source: "domain:order", target: "flow:order.create", type: "contains_flow", weight: 1 },
      { source: "flow:order.create", target: "step:a", type: "flow_step", weight: 0.1 },
      { source: "flow:order.create", target: "step:b", type: "flow_step", weight: 0.4 },
      { source: "flow:order.create", target: "step:c", type: "flow_step", weight: 0.7 },
      { source: "flow:order.create", target: "step:d", type: "flow_step", weight: 1.0 },
      { source: "step:a", target: "step:b", type: "calls", weight: 1 },
    ],
  };
}

/** A 2-layer flow (api/dao only) — proves rail count tracks the data. */
function twoLayerGraph(): DomainGraph {
  return {
    nodes: [
      { id: "domain:user", type: "domain", name: "User", summary: "" },
      { id: "flow:user.get", type: "flow", name: "Get User", summary: "" },
      { id: "step:u1", type: "step", name: "UserController.get()", filePath: "U.java", lineRange: [1, 9], layer: "api" },
      { id: "step:u2", type: "step", name: "UserDao.find()", filePath: "D.java", lineRange: [1, 9], layer: "dao" },
    ],
    edges: [
      { source: "domain:user", target: "flow:user.get", type: "contains_flow", weight: 1 },
      { source: "flow:user.get", target: "step:u1", type: "flow_step", weight: 0.5 },
      { source: "flow:user.get", target: "step:u2", type: "flow_step", weight: 1 },
    ],
  };
}

describe("dynamic layer derivation (AC-5)", () => {
  it("a 4-layer graph yields 4 rails", () => {
    const spine = buildFlowSpine(fourLayerGraph(), "flow:order.create");
    expect(spine).not.toBeNull();
    expect(spine!.rails).toHaveLength(4);
    expect(spine!.rails.map((r) => r.layer)).toEqual(["api", "service", "dao", "db"]);
  });

  it("a 2-layer graph yields 2 rails (not a fixed 4)", () => {
    const spine = buildFlowSpine(twoLayerGraph(), "flow:user.get");
    expect(spine).not.toBeNull();
    expect(spine!.rails).toHaveLength(2);
    expect(spine!.rails.map((r) => r.layer)).toEqual(["api", "dao"]);
  });

  it("presentLayers reflects the distinct layers in the data", () => {
    expect(presentLayers(fourLayerGraph()).sort()).toEqual(["api", "dao", "db", "service"]);
    expect(presentLayers(twoLayerGraph()).sort()).toEqual(["api", "dao"]);
  });

  it("an unknown/new layer key still gets its own rail", () => {
    const steps: SpineStep[] = [
      { id: "s1", name: "a", symbol: "a", line: null, layer: "api", weight: 0 },
      { id: "s2", name: "b", symbol: "b", line: null, layer: "messaging", weight: 1 },
    ];
    const rails = buildRails(steps);
    expect(rails).toHaveLength(2);
    expect(rails.map((r) => r.layer)).toEqual(["api", "messaging"]);
    expect(rails[1].label).toBe("MESSAGING");
  });
});

describe("step ordering by flow_step weight", () => {
  it("orders steps ascending by edge weight regardless of node order", () => {
    const spine = buildFlowSpine(fourLayerGraph(), "flow:order.create")!;
    const ids = spine.rails.flatMap((r) => r.steps.map((s) => s.id));
    // a(0.1) api, b(0.4) service, c(0.7) dao, d(1.0) db — rails preserve that order.
    expect(ids).toEqual(["step:a", "step:b", "step:c", "step:d"]);
  });
});

describe("honest truncation (AC-34)", () => {
  it("surfaces a truncation count when a render cap is applied — no silent cap", () => {
    const spine = buildFlowSpine(fourLayerGraph(), "flow:order.create", 2)!;
    expect(spine.totalSteps).toBe(4);
    expect(spine.truncatedSteps).toBe(2);
    const shown = spine.rails.flatMap((r) => r.steps);
    expect(shown).toHaveLength(2);
  });

  it("reports zero truncation when under the cap", () => {
    const spine = buildFlowSpine(fourLayerGraph(), "flow:order.create", 10)!;
    expect(spine.truncatedSteps).toBe(0);
    expect(spine.totalSteps).toBe(4);
  });
});

describe("NodeDetail field mapping (AC-37)", () => {
  it("maps required fields and derives CONFIRMED from file:line", () => {
    const d = buildNodeDetail(fourLayerGraph(), "step:a")!;
    expect(d.layer).toBe("api");
    expect(d.layerLabel).toBe("API");
    expect(d.name).toBe("OrderController.create()");
    expect(d.filePath).toBe("src/web/OrderController.java");
    expect(d.line).toBe(5);
    expect(d.confidence).toBe("CONFIRMED");
  });

  it("attaches annotation and calls only when present (no empty sections)", () => {
    const d = buildNodeDetail(fourLayerGraph(), "step:a")!;
    expect(d.annotation).toBe("@PostMapping");
    expect(d.calls).toEqual([{ sym: "OrderService.create()", targetId: "step:b" }]);

    const noExtras = buildNodeDetail(fourLayerGraph(), "step:d")!;
    expect(noExtras.annotation).toBeUndefined();
    expect(noExtras.calls).toBeUndefined();
  });

  it("omits summary section when summary is empty", () => {
    const d = buildNodeDetail(fourLayerGraph(), "flow:order.create")!;
    expect(d.summary).toBeUndefined();
  });
});

describe("confidence derivation from grounding", () => {
  it("file + line -> CONFIRMED", () => {
    expect(deriveConfidence({ id: "x", type: "step", name: "x", filePath: "a.java", lineRange: [1, 2] })).toBe("CONFIRMED");
  });
  it("file without line -> INFERRED", () => {
    expect(deriveConfidence({ id: "x", type: "step", name: "x", filePath: "a.java" })).toBe("INFERRED");
  });
  it("no anchor -> UNVERIFIED", () => {
    expect(deriveConfidence({ id: "x", type: "step", name: "x" })).toBe("UNVERIFIED");
  });
  it("explicit engine confidence is honored", () => {
    expect(deriveConfidence({ id: "x", type: "step", name: "x", confidence: "CONFIRMED_AI" })).toBe("CONFIRMED_AI");
  });
});

describe("domain cards + cross-domain edges (P3.5)", () => {
  it("counts flows and nodes per domain", () => {
    const cards = buildDomainCards(fourLayerGraph());
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("Order");
    expect(cards[0].flowCount).toBe(1);
    // 1 flow + 4 steps under it.
    expect(cards[0].nodeCount).toBe(5);
  });

  it("surfaces onboarding priority when present", () => {
    const g = fourLayerGraph();
    g.nodes[0].domainMeta = { onboardingPriority: 2 };
    expect(buildDomainCards(g)[0].onboardingPriority).toBe(2);
  });

  it("extracts only cross_domain edges as grounded dependency edges", () => {
    const g = fourLayerGraph();
    g.edges.push({ source: "domain:order", target: "domain:user", type: "cross_domain", weight: 0.8, description: "uses" });
    const edges = buildCrossDomainEdges(g);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "domain:order", target: "domain:user", weight: 0.8, description: "uses" });
  });
});

describe("flow list grouped by domain", () => {
  it("links each flow to its owning domain with a step count", () => {
    const list = buildFlowList(fourLayerGraph());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      flowId: "flow:order.create",
      flowName: "Create Order",
      domainId: "domain:order",
      domainName: "Order",
      stepCount: 4,
    });
  });
});

describe("layerLabel", () => {
  it("uses known labels and upper-cases unknown ones", () => {
    expect(layerLabel("api")).toBe("API");
    expect(layerLabel("custom")).toBe("CUSTOM");
  });
});
