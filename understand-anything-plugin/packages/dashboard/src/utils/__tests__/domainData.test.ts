import { describe, it, expect } from "vitest";
import { flowBadge, parseFlowStepClaim } from "../domainData";
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

function nodeWithClaims(type: "flow" | "step", claims: unknown[]): GraphNode {
  return {
    id: `${type}:x`,
    type,
    name: "x",
    summary: "",
    tags: [],
    complexity: "simple",
    domainMeta: { ktdsClaims: claims },
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

describe("parseFlowStepClaim — flow/step node grounding (screens 2/3)", () => {
  it("reads the flow node's verification item (kind=flow) with citations", () => {
    const node = nodeWithClaims("flow", [
      {
        kind: "flow",
        ref: "flow:x",
        text: "Catalog flow",
        verdict: "GROUNDED",
        citations: [{ filePath: "src/A.java", line: 12, snippet: "...", status: "ok" }],
      },
    ]);
    expect(parseFlowStepClaim(node)).toEqual({
      verdict: "GROUNDED",
      citations: [{ filePath: "src/A.java", line: 12, status: "ok" }],
    });
  });

  it("preserves NEEDS_REVIEW (demoted, not deleted) for step nodes", () => {
    const node = nodeWithClaims("step", [
      { kind: "step", ref: "step:y", text: "y", verdict: "NEEDS_REVIEW", citations: [] },
    ]);
    expect(parseFlowStepClaim(node)).toEqual({ verdict: "NEEDS_REVIEW", citations: [] });
  });

  it("drops malformed citations (missing filePath/line)", () => {
    const node = nodeWithClaims("flow", [
      {
        kind: "flow",
        ref: "flow:x",
        text: "x",
        verdict: "GROUNDED",
        citations: [{ filePath: "src/A.java", line: 3 }, { filePath: "src/B.java" }, { line: 7 }],
      },
    ]);
    expect(parseFlowStepClaim(node)?.citations).toEqual([
      { filePath: "src/A.java", line: 3, status: undefined },
    ]);
  });

  it("returns null for an unfilled node (no ktdsClaims)", () => {
    expect(parseFlowStepClaim(flowNode("POST /orders"))).toBeNull();
  });

  it("returns null when the claim kind is a domain-level kind (card-only)", () => {
    const node = nodeWithClaims("flow", [
      { kind: "summary", ref: "d#summary", text: "d", verdict: "GROUNDED", citations: [] },
    ]);
    expect(parseFlowStepClaim(node)).toBeNull();
  });
});
