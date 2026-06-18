import { expect, test, describe } from "vitest";
import { scanJavaFile, type JavaFileFacts } from "./java-facts.js";
import { buildClassIndex, collectEdges } from "./edges.js";
import { buildMethodCallGraph } from "./method-calls.js";
import { buildVariationPoints } from "./variation-points.js";
import type { EdgesReport } from "./types.js";

// Variation-point ("변경점") unit tests. Inline sources through the real
// tree-sitter path → facts → edges + method-call graph → variation points.
// The shipping fixture mirrors the headline use case: a flow that dispatches a
// product to different handling, where a new product = a new branch.

async function vpsOf(files: Record<string, string>) {
  const facts = new Map<string, JavaFileFacts>();
  for (const [relPath, source] of Object.entries(files)) {
    facts.set(relPath, await scanJavaFile(source));
  }
  const classIndex = buildClassIndex(facts);
  const { edges, unresolved } = collectEdges(facts, classIndex, new Map());
  const edgesReport: EdgesReport = { schemaVersion: 1, gitCommit: null, edges, unresolved };
  const graph = buildMethodCallGraph(facts, classIndex);
  return buildVariationPoints(facts, classIndex, edgesReport, graph);
}

// ── Polymorphic dispatch (interface with ≥2 impls) ───────────────────────────
const STRATEGY = {
  "svc/ShippingService.java": `package svc;
import strat.ShippingStrategy;
import domain.Product;
public class ShippingService {
  private ShippingStrategy strategy;
  public void dispatch(Product p) {
    strategy.ship(p);
  }
}`,
  "strat/ShippingStrategy.java": `package strat;
import domain.Product;
public interface ShippingStrategy {
  void ship(Product p);
}`,
  "strat/AirShipping.java": `package strat;
import domain.Product;
public class AirShipping implements ShippingStrategy {
  public void ship(Product p) {}
}`,
  "strat/SeaShipping.java": `package strat;
import domain.Product;
public class SeaShipping implements ShippingStrategy {
  public void ship(Product p) {}
}`,
  "domain/Product.java": `package domain;
public class Product { public String getType() { return null; } }`,
};

describe("buildVariationPoints — polymorphic", () => {
  test("a call through an interface with ≥2 impls is a variation point", async () => {
    const vps = await vpsOf(STRATEGY);
    const poly = vps.filter((v) => v.kind === "polymorphic");
    expect(poly).toHaveLength(1);
    const vp = poly[0];
    expect(vp.relPath).toBe("svc/ShippingService.java");
    expect(vp.method).toBe("dispatch");
    expect(vp.discriminant).toBe("ShippingStrategy");
    expect(vp.branches.map((b) => b.label).sort()).toEqual(["AirShipping", "SeaShipping"]);
    expect(vp.branches.map((b) => b.relPath).sort()).toEqual([
      "strat/AirShipping.java",
      "strat/SeaShipping.java",
    ]);
    expect(vp.extension).toContain("ShippingStrategy");
  });

  test("an interface with a single impl is NOT a variation point", async () => {
    const single = {
      ...STRATEGY,
      "strat/SeaShipping.java": `package strat;
public class SeaShipping { public void ship(Object p) {} }`, // no longer implements
    };
    const vps = await vpsOf(single);
    expect(vps.filter((v) => v.kind === "polymorphic")).toHaveLength(0);
  });
});

// ── switch dispatch ──────────────────────────────────────────────────────────
describe("buildVariationPoints — switch", () => {
  test("switch with ≥2 value cases yields a VP with per-case calls", async () => {
    const vps = await vpsOf({
      "svc/Router.java": `package svc;
public class Router {
  public void route(Order o) {
    switch (o.getType()) {
      case "AIR": air.send(o); break;
      case "SEA": sea.send(o); break;
      default: def.send(o);
    }
  }
}`,
    });
    const sw = vps.filter((v) => v.kind === "switch");
    expect(sw).toHaveLength(1);
    expect(sw[0].discriminant).toBe("o.getType()");
    expect(sw[0].branches.map((b) => b.label)).toEqual(['"AIR"', '"SEA"', "default"]);
    expect(sw[0].branches[0].calls).toEqual(["air.send"]);
    expect(sw[0].branches[1].calls).toEqual(["sea.send"]);
  });

  test("switch with a single case is NOT a variation point", async () => {
    const vps = await vpsOf({
      "svc/One.java": `package svc;
public class One { void f(X x){ switch(x.k()){ case "A": a.go(); break; default: d.go(); } } }`,
    });
    expect(vps.filter((v) => v.kind === "switch")).toHaveLength(0);
  });
});

// ── if-chain dispatch (the gated heuristic) ──────────────────────────────────
describe("buildVariationPoints — if-chain gate", () => {
  test("same lhs compared to different constants ≥2× is a VP", async () => {
    const vps = await vpsOf({
      "svc/Disp.java": `package svc;
public class Disp {
  void handle(Product p) {
    String t = p.getType();
    if (t.equals("AIR")) { air.go(p); }
    else if (t.equals("SEA")) { sea.go(p); }
    else { def.go(p); }
  }
}`,
    });
    const chain = vps.filter((v) => v.kind === "if-chain");
    expect(chain).toHaveLength(1);
    expect(chain[0].discriminant).toBe("t");
    expect(chain[0].branches.map((b) => b.label)).toEqual(['"AIR"', '"SEA"', "else"]);
    expect(chain[0].branches[0].calls).toEqual(["air.go"]);
  });

  test("guard clauses (different lhs / comparisons) are NOT variation points", async () => {
    const vps = await vpsOf({
      "svc/Guard.java": `package svc;
public class Guard {
  void f(Cart c) {
    if (c.size() > 100) { big.go(); }
    else if (c.isEmpty()) { empty.go(); }
    else { normal.go(); }
  }
}`,
    });
    expect(vps.filter((v) => v.kind === "if-chain")).toHaveLength(0);
  });
});

// ── determinism (M1) ─────────────────────────────────────────────────────────
describe("buildVariationPoints — determinism", () => {
  test("byte-identical output across input orderings", async () => {
    const a = JSON.stringify(await vpsOf(STRATEGY));
    const reordered = Object.fromEntries(Object.entries(STRATEGY).reverse());
    const b = JSON.stringify(await vpsOf(reordered));
    expect(a).toBe(b);
  });
});
