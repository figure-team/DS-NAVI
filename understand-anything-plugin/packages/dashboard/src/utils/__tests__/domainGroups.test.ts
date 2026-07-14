import { describe, it, expect } from "vitest";
import type { KnowledgeGraph, GraphNode } from "@understand-anything/core/types";
import {
  buildGroupCards,
  buildGroupMembers,
  findOwningGroup,
  parseDomainGroups,
  resolveDomainRoute,
  resolveGroups,
} from "../domainGroups";
import { buildDomainCards, type DomainCard } from "../domainData";

function domainNode(id: string, name: string): GraphNode {
  return {
    id,
    type: "domain",
    name,
    summary: "",
    tags: [],
    complexity: "simple",
  } as unknown as GraphNode;
}

function graphWithDomains(keys: string[]): KnowledgeGraph {
  return {
    version: "1.0.0",
    project: { name: "x", languages: [], frameworks: [], description: "", analyzedAt: "", gitCommitHash: "" },
    nodes: keys.map((k) => domainNode(`domain:${k}`, k)),
    edges: [],
    layers: [],
    tour: [],
  };
}

describe("parseDomainGroups", () => {
  it("returns [] for missing/malformed ktdsMap", () => {
    expect(parseDomainGroups(undefined)).toEqual([]);
    expect(parseDomainGroups(null)).toEqual([]);
    expect(parseDomainGroups({})).toEqual([]);
    expect(parseDomainGroups({ groups: "not-an-array" })).toEqual([]);
  });

  it("parses valid groups, dropping malformed entries defensively", () => {
    const raw = {
      groups: [
        { key: "g:common", name: "공통", memberKeys: ["com", "comm"] },
        { key: "no-prefix", name: "bad", memberKeys: ["x"] }, // missing g: prefix
        { key: "g:empty", name: "empty", memberKeys: [] }, // empty group — invariant 5
        { key: "g:missing-name", memberKeys: ["y"] }, // no name
      ],
    };
    expect(parseDomainGroups(raw)).toEqual([
      { key: "g:common", name: "공통", memberKeys: ["com", "comm"] },
    ]);
  });
});

describe("resolveGroups", () => {
  it("returns [] when there are no groups (D2 flat fallback)", () => {
    const graph = graphWithDomains(["cart", "order"]);
    expect(resolveGroups(graph, [], "미분류")).toEqual([]);
  });

  it("resolves member keys against real domain nodes and buckets the rest as unclassified", () => {
    const graph = graphWithDomains(["cart", "order", "web-inf"]);
    const groups = [{ key: "g:commerce", name: "커머스", memberKeys: ["cart", "order", "ghost"] }];
    const resolved = resolveGroups(graph, groups, "미분류");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({
      key: "g:commerce",
      name: "커머스",
      memberDomainIds: ["domain:cart", "domain:order"], // "ghost" dropped — doesn't exist
      isUnclassified: false,
    });
    expect(resolved[1]).toEqual({
      key: "g:__unclassified",
      name: "미분류",
      memberDomainIds: ["domain:web-inf"],
      isUnclassified: true,
    });
  });

  it("omits the unclassified bucket when every domain is claimed", () => {
    const graph = graphWithDomains(["cart"]);
    const groups = [{ key: "g:commerce", name: "커머스", memberKeys: ["cart"] }];
    expect(resolveGroups(graph, groups, "미분류").map((g) => g.key)).toEqual(["g:commerce"]);
  });
});

describe("resolveDomainRoute", () => {
  const graph = graphWithDomains(["cart", "order", "web-inf"]);
  const groups = resolveGroups(
    graph,
    [{ key: "g:commerce", name: "커머스", memberKeys: ["cart", "order"] }],
    "미분류",
  );

  it("no params → landing", () => {
    expect(resolveDomainRoute({}, groups)).toEqual({ kind: "landing" });
  });

  it("groups empty (D2 폴백) → always flat, even for a bare domain id", () => {
    expect(resolveDomainRoute({ domainId: "domain:cart" }, [])).toEqual({
      kind: "flat",
      domainId: "domain:cart",
    });
  });

  it("1-segment group key → redirect to first member", () => {
    expect(resolveDomainRoute({ domainId: "g:commerce" }, groups)).toEqual({
      kind: "redirect",
      to: "/domains/g:commerce/domain:cart",
    });
  });

  it("1-segment legacy domain deep link → redirect to owning group workspace", () => {
    expect(resolveDomainRoute({ domainId: "domain:order" }, groups)).toEqual({
      kind: "redirect",
      to: "/domains/g:commerce/domain:order",
    });
  });

  it("1-segment legacy deep link for an unclassified domain → redirect to the 미분류 workspace", () => {
    expect(resolveDomainRoute({ domainId: "domain:web-inf" }, groups)).toEqual({
      kind: "redirect",
      to: "/domains/g:__unclassified/domain:web-inf",
    });
  });

  it("2-segment valid group+domain → group", () => {
    const result = resolveDomainRoute({ groupKey: "g:commerce", domainId: "domain:cart" }, groups);
    expect(result.kind).toBe("group");
    if (result.kind === "group") {
      expect(result.group.key).toBe("g:commerce");
      expect(result.domainId).toBe("domain:cart");
    }
  });

  it("2-segment mismatched domain (not a member of that group) → landing (safe fallback)", () => {
    expect(
      resolveDomainRoute({ groupKey: "g:commerce", domainId: "domain:web-inf" }, groups),
    ).toEqual({ kind: "landing" });
  });

  it("2-segment unknown group key → landing", () => {
    expect(
      resolveDomainRoute({ groupKey: "g:ghost", domainId: "domain:cart" }, groups),
    ).toEqual({ kind: "landing" });
  });

  it("group key with no members resolvable → landing instead of a broken redirect", () => {
    expect(resolveDomainRoute({ domainId: "g:ghost" }, groups)).toEqual({ kind: "landing" });
  });
});

describe("findOwningGroup / buildGroupMembers", () => {
  const graph = graphWithDomains(["cart", "order"]);
  const groups = resolveGroups(
    graph,
    [{ key: "g:commerce", name: "커머스", memberKeys: ["cart", "order"] }],
    "미분류",
  );

  it("findOwningGroup finds the group containing a domain id", () => {
    expect(findOwningGroup(groups, "domain:cart")?.key).toBe("g:commerce");
    expect(findOwningGroup(groups, "domain:ghost")).toBeUndefined();
  });

  it("buildGroupMembers preserves member order and drops unresolved cards", () => {
    const { cards } = buildDomainCards(graph);
    const members = buildGroupMembers(groups[0], cards);
    expect(members.map((m) => m.id)).toEqual(["domain:cart", "domain:order"]);
  });
});

describe("buildGroupCards", () => {
  it("aggregates flow/work/grounded counts across member domains", () => {
    const graph = graphWithDomains(["cart", "order"]);
    const groups = resolveGroups(
      graph,
      [{ key: "g:commerce", name: "커머스", memberKeys: ["cart", "order"] }],
      "미분류",
    );
    const cards: DomainCard[] = [
      {
        id: "domain:cart",
        name: "Cart",
        desc: "",
        color: "#fff",
        icon: "📦",
        flowCount: 3,
        nodeCount: 10,
        entities: [],
        claims: [],
        filled: true,
        groundedPct: 100,
        groundedCount: 4,
        reviewCount: 0,
      },
      {
        id: "domain:order",
        name: "Order",
        desc: "",
        color: "#fff",
        icon: "📦",
        flowCount: 2,
        nodeCount: 5,
        entities: [],
        claims: [],
        filled: true,
        groundedPct: 50,
        groundedCount: 1,
        reviewCount: 1,
      },
    ];
    const workCountByDomain = new Map([
      ["domain:cart", 2],
      ["domain:order", 1],
    ]);
    const [card] = buildGroupCards(groups, cards, workCountByDomain);
    expect(card.subDomainCount).toBe(2);
    expect(card.flowCount).toBe(5);
    expect(card.workCount).toBe(3);
    expect(card.groundedCount).toBe(5);
    expect(card.reviewCount).toBe(1);
    expect(card.groundedPct).toBe(83); // 5/6 rounded
    expect(card.filled).toBe(true);
    expect(card.memberChips.map((c) => c.id)).toEqual(["domain:cart", "domain:order"]);
    expect(card.moreCount).toBe(0);
  });

  it("groundedPct is null when no member has any claims", () => {
    const graph = graphWithDomains(["web-inf"]);
    const groups = resolveGroups(
      graph,
      [{ key: "g:tech", name: "기술", memberKeys: ["web-inf"] }],
      "미분류",
    );
    const cards: DomainCard[] = [
      {
        id: "domain:web-inf",
        name: "Web Inf",
        desc: "",
        color: "#fff",
        icon: "⚙️",
        flowCount: 0,
        nodeCount: 1,
        entities: [],
        claims: [],
        filled: false,
        groundedPct: null,
        groundedCount: 0,
        reviewCount: 0,
      },
    ];
    const [card] = buildGroupCards(groups, cards, new Map());
    expect(card.groundedPct).toBeNull();
    expect(card.filled).toBe(false);
  });
});
