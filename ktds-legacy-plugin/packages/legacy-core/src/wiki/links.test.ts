import { expect, test } from "vitest";
import { projectNotes } from "./project.js";
import { deriveLinks } from "./links.js";
import type { CanonicalGraph } from "../types.js";
import { node, edge } from "../test-helpers.js";

// domain → flow → step, endpoint(같은 파일=flow) → table(reads_from)
const graph: CanonicalGraph = {
  sourceVersion: "1.0.0", fingerprint: "fp",
  project: { name: "p", languages: [], frameworks: [], description: "", gitCommitHash: "", configFiles: [] },
  layers: [],
  nodes: [
    node("domain:acct", "domain", { name: "계정" }),
    node("flow:login", "flow", { name: "로그인", evidence: { path: "Login.java" } }),
    node("step:check", "step", { name: "검증", evidence: { path: "Login.java" } }),
    node("GET /login", "endpoint", { name: "GET /login", evidence: { path: "Login.java" } }),
    node("GET /orphan", "endpoint", { name: "GET /orphan", evidence: { path: "Nowhere.java" } }),
    node("tbl:ACCOUNT", "table", { name: "ACCOUNT" }),
  ],
  edges: [
    edge("domain:acct", "flow:login", "contains_flow"),
    edge("flow:login", "step:check", "flow_step"),
    edge("GET /login", "tbl:ACCOUNT", "reads_from"),
  ],
};

function linkTargets(notes: ReturnType<typeof projectNotes>, uid: string): string[] {
  return notes.find((n) => n.nodeUid === uid)!.links.map((l) => l.targetRelPath).sort();
}

test("domain→flow (contains_flow)", () => {
  const { notes } = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  expect(linkTargets(notes, "domain:acct")).toEqual(["feature/로그인"]);
});

test("flow→step (flow_step)", () => {
  const { notes } = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  expect(linkTargets(notes, "flow:login")).toContain("feature/step/검증");
});

test("endpoint→table (reads_from)", () => {
  const { notes } = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  expect(linkTargets(notes, "GET /login")).toContain("table/account");
});

test("기능↔API filePath 조인: endpoint→flow/step (같은 파일)", () => {
  const { notes } = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  // GET /login·flow:login·step:check 모두 Login.java → endpoint가 flow/step로 링크
  expect(linkTargets(notes, "GET /login")).toEqual(
    ["feature/step/검증", "feature/로그인", "table/account"].sort(),
  );
});

test("filePath 조인 미스 → unresolvedEndpoints", () => {
  const { unresolvedEndpoints } = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  expect(unresolvedEndpoints).toEqual(["GET /orphan"]);
});

test("step 미포함 시 flow→step 링크 드롭(노트 없음)", () => {
  const { notes } = deriveLinks(graph, projectNotes(graph)); // step 제외
  expect(linkTargets(notes, "flow:login")).not.toContain("feature/step/검증");
  // endpoint→step도 드롭, endpoint→flow는 유지
  expect(linkTargets(notes, "GET /login")).toEqual(["feature/로그인", "table/account"].sort());
});

test("dangling 엣지 드롭(노트 없는 노드)", () => {
  const g: CanonicalGraph = {
    ...graph,
    edges: [...graph.edges, edge("domain:acct", "fn:ghost", "contains_flow")],
    nodes: [...graph.nodes, node("fn:ghost", "function")], // function은 노트 안 됨
  };
  const { notes } = deriveLinks(g, projectNotes(g, { includeSteps: true }));
  expect(linkTargets(notes, "domain:acct")).toEqual(["feature/로그인"]); // ghost 없음
});

test("결정론: 2회 실행 동일, 링크 정렬", () => {
  const a = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  const b = deriveLinks(graph, projectNotes(graph, { includeSteps: true }));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
