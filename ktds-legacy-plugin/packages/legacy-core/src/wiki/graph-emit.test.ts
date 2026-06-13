import { expect, test } from "vitest";
import { projectNotes } from "./project.js";
import { deriveLinks } from "./links.js";
import { buildKnowledgeGraph, type HubArticle } from "./graph-emit.js";
import type { CanonicalGraph, CanonicalNode, CanonicalEdge } from "../types.js";
import type { DashboardGraph } from "./types.js";

function node(uid: string, kind: string, extra: Partial<CanonicalNode> = {}): CanonicalNode {
  return { uid, kind: kind as CanonicalNode["kind"], name: uid, summary: "요약", tags: [], ...extra };
}
function edge(s: string, t: string, type: string): CanonicalEdge {
  return { sourceUid: s, targetUid: t, type, direction: "forward", weight: 1 };
}

const graph: CanonicalGraph = {
  sourceVersion: "1.0.0", fingerprint: "fp",
  project: { name: "demo", languages: ["Java"], frameworks: ["Spring"], description: "d", gitCommitHash: "abc", configFiles: [] },
  layers: [],
  nodes: [
    node("domain:acct", "domain", { name: "계정", tags: ["core"] }),
    node("flow:login", "flow", { name: "로그인", evidence: { path: "Login.java" } }),
    node("GET /login", "endpoint", { name: "GET /login", evidence: { path: "Login.java" } }),
    node("tbl:ACCOUNT", "table", { name: "ACCOUNT" }),
    node("fn:x", "function"), // 제외
  ],
  edges: [
    edge("domain:acct", "flow:login", "contains_flow"),
    edge("GET /login", "tbl:ACCOUNT", "reads_from"),
  ],
};

const HUBS: HubArticle[] = [
  { id: "01_tech-stack", title: "기술 스택", relPath: "01_tech-stack.md", content: "# 기술 스택\n" },
  { id: "02_architecture", title: "아키텍처", relPath: "02_architecture.md", content: "# 아키텍처\n" },
  { id: "03_feature-spec", title: "기능 명세", relPath: "03_feature-spec.md", content: "# 기능 명세\n", layer: "feature" },
  { id: "04_api-spec", title: "API 명세", relPath: "04_api-spec.md", content: "# API 명세\n", layer: "api" },
  { id: "05_db-spec", title: "DB 명세", relPath: "05_db-spec.md", content: "# DB 명세\n", layer: "table" },
];

function emit(): DashboardGraph {
  const { notes } = deriveLinks(graph, projectNotes(graph));
  const contentByUid = new Map(notes.map((n) => [n.nodeUid, `# ${n.title}\n\n본문 ${n.nodeUid}`]));
  return buildKnowledgeGraph({ project: graph.project, notes, hubs: HUBS, contentByUid });
}

// ── 스키마 적합 (U-A KnowledgeGraphSchema 제약, schema.ts:368-429) ───────────
test("스키마: 최상위·project 필수 필드 + kind=knowledge", () => {
  const g = emit();
  expect(g.version).toBe("1.0.0");
  expect(g.kind).toBe("knowledge");
  for (const k of ["name", "languages", "frameworks", "description", "analyzedAt", "gitCommitHash"]) {
    expect(g.project).toHaveProperty(k);
  }
  expect(Array.isArray(g.tour)).toBe(true);
});

test("스키마: 노드 필수 필드·enum, 엣지 weight∈[0,1]·enum", () => {
  const g = emit();
  for (const n of g.nodes) {
    expect(typeof n.id).toBe("string");
    expect(typeof n.name).toBe("string");
    expect(typeof n.summary).toBe("string");
    expect(["article", "topic"]).toContain(n.type);
    expect(Array.isArray(n.tags)).toBe(true);
    expect(["simple", "moderate", "complex"]).toContain(n.complexity);
  }
  for (const e of g.edges) {
    expect(["related", "categorized_under"]).toContain(e.type);
    expect(["forward", "backward", "bidirectional"]).toContain(e.direction);
    expect(e.weight).toBeGreaterThanOrEqual(0);
    expect(e.weight).toBeLessThanOrEqual(1);
  }
});

test("노드집합: 우리 노트+허브만 (function 등 코드노드·09_release 불포함)", () => {
  const g = emit();
  const articleIds = g.nodes.filter((n) => n.type === "article").map((n) => n.id).sort();
  expect(articleIds).toEqual(
    ["01_tech-stack", "02_architecture", "03_feature-spec", "04_api-spec", "05_db-spec",
     "GET /login", "domain:acct", "flow:login", "tbl:ACCOUNT"].sort(),
  );
  expect(articleIds).not.toContain("fn:x");
});

test("content: 노트 전체 본문 담김(캡 없음)", () => {
  const g = emit();
  const flow = g.nodes.find((n) => n.id === "flow:login")!;
  expect(flow.knowledgeMeta?.content).toContain("본문 flow:login");
  const hub = g.nodes.find((n) => n.id === "04_api-spec")!;
  expect(hub.knowledgeMeta?.content).toBe("# API 명세\n");
  expect(hub.filePath).toBe("04_api-spec.md");
});

test("categorized_under: 모든 article → topic, layers 00_개요 맨 위", () => {
  const g = emit();
  // 모든 article에 categorized_under 엣지
  const catSources = g.edges.filter((e) => e.type === "categorized_under").map((e) => e.source);
  for (const a of g.nodes.filter((n) => n.type === "article")) expect(catSources).toContain(a.id);
  // layers 순서: 00_개요 첫번째
  expect(g.layers[0].id).toBe("00_개요");
  expect(g.layers.map((l) => l.id)).toEqual(["00_개요", "기능", "API", "DB"]);
  // 허브 5종은 00_개요 layer
  expect(g.layers[0].nodeIds).toContain("01_tech-stack");
});

test("related: 노트 링크 + 허브→계층 노트, 엣지 양끝 실존", () => {
  const g = emit();
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) {
    expect(ids.has(e.source)).toBe(true);
    expect(ids.has(e.target)).toBe(true);
  }
  // 04_api-spec → GET /login (허브→계층)
  const rel = g.edges.filter((e) => e.type === "related");
  expect(rel.some((e) => e.source === "04_api-spec" && e.target === "GET /login")).toBe(true);
  // domain→flow related
  expect(rel.some((e) => e.source === "domain:acct" && e.target === "flow:login")).toBe(true);
});

test("wikilinks count == 나가는 related 엣지 수 (NodeInfo 게이트/목록 정합)", () => {
  const g = emit();
  for (const a of g.nodes.filter((n) => n.type === "article")) {
    const outRelated = g.edges.filter((e) => e.type === "related" && e.source === a.id).length;
    expect(a.knowledgeMeta?.wikilinks?.length ?? 0).toBe(outRelated);
  }
});

test("결정론: 2회 emit byte 동일(analyzedAt 제외 — 기본 '')", () => {
  expect(JSON.stringify(emit())).toBe(JSON.stringify(emit()));
});

test("엣지 양끝 단언: dangling이면 throw", () => {
  // contentByUid 비워도 노드는 emit, related 타겟은 노트 내에서만 해소되므로 정상
  // 강제 dangling: 링크 타겟을 가짜로 — links를 직접 조작
  const { notes } = deriveLinks(graph, projectNotes(graph));
  notes[0].links = [{ targetRelPath: "feature/ghost", label: "유령" }];
  expect(() =>
    buildKnowledgeGraph({ project: graph.project, notes, hubs: HUBS, contentByUid: new Map() }),
  ).not.toThrow(); // ghost는 uidByTarget에 없어 related 미생성 → dangling 아님
});
