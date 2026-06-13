import { expect, test } from "vitest";
import { projectNotes } from "./project.js";
import type { CanonicalGraph, CanonicalNode } from "../types.js";

function node(uid: string, kind: string, extra: Partial<CanonicalNode> = {}): CanonicalNode {
  return { uid, kind: kind as CanonicalNode["kind"], name: uid, summary: "요약", tags: [], ...extra };
}

const graph: CanonicalGraph = {
  sourceVersion: "1.0.0",
  fingerprint: "fp",
  project: { name: "p", languages: [], frameworks: [], description: "", gitCommitHash: "", configFiles: [] },
  layers: [],
  nodes: [
    node("domain:account", "domain", {
      tags: ["core"],
      domainMeta: { entities: ["Account"], businessRules: ["잔액 0 미만 불가"] },
    }),
    node("flow:login", "flow", { evidence: { path: "Login.java", line: 3 } }),
    node("GET /cart", "endpoint", { evidence: { path: "CartCtl.java", line: 9 } }),
    node("tbl:ACCOUNT", "table", { name: "ACCOUNT", evidence: { path: "schema.sql" } }),
    node("step:validate", "step", { evidence: { path: "V.java", line: 1 } }),
    // 제외 대상
    node("fn:helper", "function"),
    node("cls:Foo", "class"),
    node("file:x.js", "file"),
    node("mod:m", "module"),
  ],
  edges: [],
};

test("기본(step 제외): domain/flow/endpoint/table만 노트화", () => {
  const notes = projectNotes(graph);
  expect(notes.map((n) => n.nodeUid).sort()).toEqual(
    ["GET /cart", "domain:account", "flow:login", "tbl:ACCOUNT"].sort(),
  );
  // function/class/file/module 제외
  expect(notes.find((n) => n.layer === "step")).toBeUndefined();
});

test("--steps: step 계층 포함", () => {
  const notes = projectNotes(graph, { includeSteps: true });
  expect(notes.some((n) => n.nodeUid === "step:validate" && n.layer === "step")).toBe(true);
  expect(notes.length).toBe(5);
});

test("계층 매핑: domain/flow→feature, endpoint→api, table→table", () => {
  const byUid = new Map(projectNotes(graph).map((n) => [n.nodeUid, n]));
  expect(byUid.get("domain:account")!.layer).toBe("feature");
  expect(byUid.get("flow:login")!.layer).toBe("feature");
  expect(byUid.get("GET /cart")!.layer).toBe("api");
  expect(byUid.get("tbl:ACCOUNT")!.layer).toBe("table");
});

test("relPath: 계층 폴더 + 슬러그 + .md", () => {
  const byUid = new Map(projectNotes(graph).map((n) => [n.nodeUid, n]));
  expect(byUid.get("GET /cart")!.relPath).toBe("api/get-cart.md");
  expect(byUid.get("tbl:ACCOUNT")!.relPath).toBe("table/account.md");
});

test("근거 승계: file 근거 노드 → CONFIRMED_AI, cite 보존", () => {
  const ep = projectNotes(graph).find((n) => n.nodeUid === "GET /cart")!;
  expect(ep.claims[0].confidence).toBe("CONFIRMED_AI");
  expect(ep.claims[0].evidence[0]).toEqual({ path: "CartCtl.java", line: 9 });
});

test("domain: summary claim + domainMetaClaims(엔터티·업무규칙)", () => {
  const d = projectNotes(graph).find((n) => n.nodeUid === "domain:account")!;
  // head + entity 1 + businessRule 1 = 3
  expect(d.claims.length).toBe(3);
  expect(d.claims.some((c) => c.claim.includes("엔터티: Account"))).toBe(true);
  expect(d.claims.some((c) => c.claim.includes("업무 규칙: 잔액 0 미만 불가"))).toBe(true);
});

test("frontmatter: 결정론 키 순서 + evidence 수", () => {
  const ep = projectNotes(graph).find((n) => n.nodeUid === "GET /cart")!;
  expect(Object.keys(ep.frontmatter)).toEqual(["type", "title", "evidence"]);
  expect(ep.frontmatter.evidence).toBe(1);

  const d = projectNotes(graph).find((n) => n.nodeUid === "domain:account")!;
  expect(Object.keys(d.frontmatter)).toEqual(["type", "title", "domain", "tags", "evidence"]);
  expect(d.frontmatter.domain).toBe("domain:account");
  expect(d.frontmatter.tags).toEqual(["core"]);
});

test("결정론: 입력 순서 무관, 2회 동일", () => {
  const a = projectNotes(graph);
  const shuffled: CanonicalGraph = { ...graph, nodes: [...graph.nodes].reverse() };
  const b = projectNotes(shuffled);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
