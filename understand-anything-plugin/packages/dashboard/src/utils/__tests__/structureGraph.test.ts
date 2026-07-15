import { describe, it, expect } from "vitest";
import {
  aggregateGroupEdges,
  buildFileToDomainId,
  buildFlowFileMap,
  deriveProcessSharedFileEdges,
  filterEdgesAmong,
  groupImpactMark,
  mapImpactToDomains,
  markFor,
  mergeBidirectionalEdges,
  parseCrossDomainGraph,
  resolveStructureRoute,
  type CrossDomainEdge,
} from "../structureGraph";
import type { ResolvedGroup } from "../domainGroups";

const GROUPS: ResolvedGroup[] = [
  { key: "g:shop", name: "Shop", memberDomainIds: ["domain:cart", "domain:catalog"], isUnclassified: false },
  { key: "g:account", name: "Account", memberDomainIds: ["domain:account"], isUnclassified: false },
];

const EDGES: CrossDomainEdge[] = [
  { from: "domain:cart", to: "domain:catalog", weight: 2, evidence: [{ source: "a.java", target: "b.java", kind: "calls", line: 1 }] },
  { from: "domain:cart", to: "domain:account", weight: 3, evidence: [{ source: "a.java", target: "c.java", kind: "imports", line: null }] },
  { from: "domain:account", to: "domain:cart", weight: 1, evidence: [{ source: "c.java", target: "a.java", kind: "calls", line: 5 }] },
];

describe("parseCrossDomainGraph", () => {
  it("prefixes bare domain keys with domain: and preserves evidence", () => {
    const parsed = parseCrossDomainGraph({
      crossDomain: { edges: [{ from: "cart", to: "account", weight: 2, evidence: [{ source: "a.java", target: "b.java", kind: "calls", line: 3 }] }] },
    });
    expect(parsed).toEqual([
      { from: "domain:cart", to: "domain:account", weight: 2, evidence: [{ source: "a.java", target: "b.java", kind: "calls", line: 3 }] },
    ]);
  });

  it("returns null on malformed/absent shape (404 degrade)", () => {
    expect(parseCrossDomainGraph(null)).toBeNull();
    expect(parseCrossDomainGraph({})).toBeNull();
    expect(parseCrossDomainGraph({ crossDomain: {} })).toBeNull();
  });

  it("returns [] for a valid but empty edge list (grounded zero, not absent)", () => {
    expect(parseCrossDomainGraph({ crossDomain: { edges: [] } })).toEqual([]);
  });
});

describe("aggregateGroupEdges", () => {
  it("collapses domain edges to group pairs, summing weight and evidence", () => {
    const agg = aggregateGroupEdges(GROUPS, EDGES);
    // cart->catalog is intra-group (both g:shop) — excluded.
    expect(agg).toHaveLength(2);
    const shopToAccount = agg.find((e) => e.from === "g:shop" && e.to === "g:account");
    expect(shopToAccount?.weight).toBe(3);
    const accountToShop = agg.find((e) => e.from === "g:account" && e.to === "g:shop");
    expect(accountToShop?.weight).toBe(1);
  });

  it("is sorted deterministically by (from, to)", () => {
    const agg = aggregateGroupEdges(GROUPS, EDGES);
    const keys = agg.map((e) => `${e.from}|${e.to}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("filterEdgesAmong", () => {
  it("keeps only edges with both endpoints in the set", () => {
    const ids = new Set(["domain:cart", "domain:catalog"]);
    const filtered = filterEdgesAmong(ids, EDGES);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ from: "domain:cart", to: "domain:catalog", weight: 2 });
  });

  it("returns [] when no edges qualify", () => {
    expect(filterEdgesAmong(new Set(["domain:solo"]), EDGES)).toEqual([]);
  });
});

describe("buildFileToDomainId / mapImpactToDomains", () => {
  const nodes = [
    { type: "flow", filePath: "src/Cart.java", tags: ["cart"] },
    { type: "step", filePath: "src/CartDao.java", tags: ["cart"] },
    { type: "domain", filePath: null, tags: [] },
  ];

  it("maps changed KG node ids (file:/config: prefixed) to owning domain ids", () => {
    const map = buildFileToDomainId(nodes);
    const changed = mapImpactToDomains(map, ["file:src/Cart.java", "config:src/unknown.xml"]);
    expect(changed).toEqual(new Set(["domain:cart"]));
  });

  it("ignores ids with no domain-graph filePath match (honest degrade)", () => {
    const map = buildFileToDomainId(nodes);
    expect(mapImpactToDomains(map, ["file:src/Nowhere.java"]).size).toBe(0);
  });

  it("unions all owning domains for a file shared across multiple domains (no first-wins drop)", () => {
    const sharedNodes = [
      { type: "flow", filePath: "src/Shared.java", tags: ["cart"] },
      { type: "step", filePath: "src/Shared.java", tags: ["account"] },
    ];
    const map = buildFileToDomainId(sharedNodes);
    expect(map.get("src/Shared.java")).toEqual(new Set(["domain:cart", "domain:account"]));
    const changed = mapImpactToDomains(map, ["file:src/Shared.java"]);
    expect(changed).toEqual(new Set(["domain:cart", "domain:account"]));
  });
});

describe("buildFlowFileMap / deriveProcessSharedFileEdges (뎁스3 프로세스 연결)", () => {
  const nodes = [
    { id: "flow:add", type: "flow", filePath: "src/CartAction.java" },
    { id: "flow:view", type: "flow", filePath: "src/CartAction.java" },
    { id: "flow:search", type: "flow", filePath: "src/CatalogAction.java" },
    { id: "step:1", type: "step", filePath: "src/Cart.java" },
    { id: "step:2", type: "step", filePath: null },
  ];
  const edges = [
    { type: "flow_step", source: "flow:add", target: "step:1" },
    { type: "flow_step", source: "flow:add", target: "step:2" },
    { type: "contains_flow", source: "domain:cart", target: "flow:add" },
  ];

  it("maps flow id -> own filePath + step filePaths, deduped, null-safe", () => {
    const map = buildFlowFileMap(nodes, edges);
    expect(map.get("flow:add")).toEqual(["src/CartAction.java", "src/Cart.java"]);
    expect(map.get("flow:view")).toEqual(["src/CartAction.java"]);
    expect(map.has("step:1")).toBe(false);
  });

  it("links two processes sharing files (flowRef + citations union), sorted evidence", () => {
    const map = buildFlowFileMap(nodes, edges);
    const out = deriveProcessSharedFileEdges(
      [
        { id: "bf:0", flowRefs: ["flow:add"], citationFiles: [] },
        { id: "bf:1", flowRefs: ["flow:view"], citationFiles: ["src/Cart.java"] },
        { id: "bf:2", flowRefs: ["flow:search"], citationFiles: [] },
      ],
      map,
    );
    // bf:0(CartAction, Cart) ∩ bf:1(CartAction, Cart) = 2 / bf:2 는 어느 쪽과도 0.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "bf:0 bf:1", from: "bf:0", to: "bf:1", weight: 2 });
    expect(out[0].evidence.map((e) => e.source)).toEqual(["src/Cart.java", "src/CartAction.java"]);
    expect(out[0].evidence[0]).toMatchObject({ kind: "shared", line: null });
    expect(out[0].evidence[0].target).toBe(out[0].evidence[0].source);
  });

  it("unknown flowRef contributes nothing (no throw)", () => {
    const out = deriveProcessSharedFileEdges(
      [
        { id: "bf:0", flowRefs: ["flow:ghost"], citationFiles: [] },
        { id: "bf:1", flowRefs: [], citationFiles: [] },
      ],
      new Map(),
    );
    expect(out).toEqual([]);
  });
});

describe("mergeBidirectionalEdges", () => {
  it("merges A->B and B->A into one line, summing weight, keeping per-direction originals", () => {
    const merged = mergeBidirectionalEdges(aggregateGroupEdges(GROUPS, EDGES));
    // g:shop->g:account(3) + g:account->g:shop(1) → 한 선.
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "g:account g:shop", weight: 4 });
    expect(merged[0].directions.map((d) => `${d.from}>${d.to}`)).toEqual(["g:account>g:shop", "g:shop>g:account"]);
  });

  it("keeps a one-way edge as-is (single direction)", () => {
    const merged = mergeBidirectionalEdges([
      { id: "a b", from: "a", to: "b", weight: 2, evidence: [] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].directions).toHaveLength(1);
    expect(merged[0].weight).toBe(2);
  });
});

describe("markFor / groupImpactMark", () => {
  it("prefers changed over affected", () => {
    const changed = new Set(["domain:cart"]);
    const affected = new Set(["domain:cart", "domain:catalog"]);
    expect(markFor("domain:cart", changed, affected)).toBe("changed");
    expect(markFor("domain:catalog", changed, affected)).toBe("affected");
    expect(markFor("domain:account", changed, affected)).toBeNull();
  });

  it("bubbles a member domain's mark up to the group", () => {
    const group = GROUPS[0]; // g:shop -> cart, catalog
    expect(groupImpactMark(group, new Set(["domain:catalog"]), new Set())).toBe("changed");
    expect(groupImpactMark(group, new Set(), new Set(["domain:cart"]))).toBe("affected");
    expect(groupImpactMark(group, new Set(), new Set())).toBeNull();
  });
});

describe("resolveStructureRoute", () => {
  const domainIds = new Set(["domain:cart", "domain:catalog", "domain:account"]);

  it("old KG deep link (node/level) always redirects to bare /domains?tab=structure", () => {
    const route = resolveStructureRoute(
      { group: null, domain: null, bf: null, node: "file:x", level: "layer-detail" },
      GROUPS,
      domainIds,
    );
    expect(route).toEqual({ kind: "redirect", to: "/domains?tab=structure" });
  });

  it("node/level redirect wins even if domain/group are also present", () => {
    const route = resolveStructureRoute(
      { group: "g:shop", domain: "domain:cart", bf: "0", node: "x", level: null },
      GROUPS,
      domainIds,
    );
    expect(route.kind).toBe("redirect");
  });

  it("bare URL with groups present -> depth1", () => {
    expect(resolveStructureRoute({ group: null, domain: null, bf: null, node: null, level: null }, GROUPS, domainIds))
      .toEqual({ kind: "depth1" });
  });

  it("bare URL with no groups -> depth2 flat (confirmed ③)", () => {
    expect(resolveStructureRoute({ group: null, domain: null, bf: null, node: null, level: null }, [], domainIds))
      .toEqual({ kind: "depth2", group: null });
  });

  it("?group=<key> -> depth2 for that group", () => {
    const route = resolveStructureRoute({ group: "g:shop", domain: null, bf: null, node: null, level: null }, GROUPS, domainIds);
    expect(route).toEqual({ kind: "depth2", group: GROUPS[0] });
  });

  it("?group=<unknown> -> redirect to landing", () => {
    const route = resolveStructureRoute({ group: "g:ghost", domain: null, bf: null, node: null, level: null }, GROUPS, domainIds);
    expect(route).toEqual({ kind: "redirect", to: "/domains?tab=structure" });
  });

  it("?domain=<id> -> depth3", () => {
    const route = resolveStructureRoute({ group: null, domain: "domain:cart", bf: null, node: null, level: null }, GROUPS, domainIds);
    expect(route).toEqual({ kind: "depth3", domainId: "domain:cart" });
  });

  it("?domain=<unknown> -> redirect", () => {
    const route = resolveStructureRoute({ group: null, domain: "domain:ghost", bf: null, node: null, level: null }, GROUPS, domainIds);
    expect(route).toEqual({ kind: "redirect", to: "/domains?tab=structure" });
  });

  it("?domain=<id>&bf=<n> -> depth4", () => {
    const route = resolveStructureRoute({ group: null, domain: "domain:cart", bf: "2", node: null, level: null }, GROUPS, domainIds);
    expect(route).toEqual({ kind: "depth4", domainId: "domain:cart", bf: 2 });
  });

  it("?domain=<id>&bf=<non-numeric> -> falls back to depth3", () => {
    const route = resolveStructureRoute({ group: null, domain: "domain:cart", bf: "nope", node: null, level: null }, GROUPS, domainIds);
    expect(route).toEqual({ kind: "depth3", domainId: "domain:cart" });
  });
});
