import { describe, it, expect } from "vitest";
import { flowBadge } from "../domainData";
import type { GraphNode } from "@understand-anything/core/types";

function flowNode(entryPoint: string, entryType = "http"): GraphNode {
  return {
    id: "flow:x",
    type: "flow",
    name: "Catalog flow",
    summary: "",
    tags: [],
    complexity: "simple",
    domainMeta: { entryPoint, entryType },
  } as unknown as GraphNode;
}

describe("flowBadge — method derivation", () => {
  it("ANY entry (verb-less Stripes action) → ANY badge, path stripped of the token", () => {
    // The engine emits `ANY <url>` for entries with no fixed HTTP verb.
    expect(flowBadge(flowNode("ANY /actions/Catalog.action"))).toEqual({
      method: "ANY",
      path: "/actions/Catalog.action",
    });
  });

  it("a real HTTP verb passes through with its path", () => {
    expect(flowBadge(flowNode("POST /orders"))).toEqual({ method: "POST", path: "/orders" });
  });

  it("PATCH folds into the PUT badge", () => {
    expect(flowBadge(flowNode("PATCH /orders/1"))).toEqual({ method: "PUT", path: "/orders/1" });
  });

  it("verb-less http entry resolves to ANY — never a fabricated GET", () => {
    expect(flowBadge(flowNode("/actions/Foo.action")).method).toBe("ANY");
  });

  it("non-http entry types keep their own badges", () => {
    expect(flowBadge(flowNode("nightly-job", "cron")).method).toBe("BATCH");
    expect(flowBadge(flowNode("OrderPlaced", "event")).method).toBe("EVENT");
  });
});
