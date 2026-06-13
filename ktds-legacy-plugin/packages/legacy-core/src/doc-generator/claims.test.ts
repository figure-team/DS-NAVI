import { expect, test } from "vitest";
import { claimForNode, inferredClaim, renderClaim, nodesOfKind, edgesOfType } from "./claims.js";
import type { CanonicalGraph, CanonicalNode } from "../types.js";

// ADR-004 ID11/T1: claims.ts는 doc-generator/index.ts에서 move-only 추출됨.
// 이 테스트는 cite 접미사 포맷(approval/index.ts가 역파싱)과 confidence 판정을
// 명시적으로 고정한다 — 포맷이 바뀌면 승인 파싱이 깨지므로 회귀 가드.

const node = (uid: string, kind: string, ev?: { path: string; line?: number }): CanonicalNode => ({
  uid, kind: kind as CanonicalNode["kind"], name: uid, summary: "", tags: [], evidence: ev,
});

test("renderClaim: cite 접미사 포맷 고정 (path:line)", () => {
  const c = claimForNode(node("A", "endpoint", { path: "src/A.java", line: 12 }), "엔드포인트: A");
  expect(renderClaim(c)).toBe("- [확정(AI)] 엔드포인트: A — 근거: `src/A.java:12`");
});

test("renderClaim: line 없으면 path만", () => {
  const c = claimForNode(node("B", "table", { path: "schema.sql" }), "테이블: B");
  expect(renderClaim(c)).toBe("- [확정(AI)] 테이블: B — 근거: `schema.sql`");
});

test("renderClaim: 근거 없으면 cite 생략, INFERRED 태그", () => {
  expect(renderClaim(inferredClaim("추정 항목"))).toBe("- [추정] 추정 항목");
});

test("claimForNode: 근거 path 있으면 CONFIRMED_AI, 없으면 INFERRED", () => {
  expect(claimForNode(node("A", "flow", { path: "x" }), "t").confidence).toBe("CONFIRMED_AI");
  expect(claimForNode(node("A", "flow"), "t").confidence).toBe("INFERRED");
  expect(claimForNode(node("A", "flow"), "t").requires_human_review).toBe(true);
});

test("nodesOfKind/edgesOfType: 종류 필터 + 정렬", () => {
  const g: CanonicalGraph = {
    sourceVersion: "1", fingerprint: "f",
    project: { name: "p", languages: [], frameworks: [], description: "", gitCommitHash: "", configFiles: [] },
    layers: [],
    nodes: [node("B", "endpoint"), node("A", "endpoint"), node("C", "table")],
    edges: [
      { sourceUid: "B", targetUid: "X", type: "routes", direction: "forward", weight: 1 },
      { sourceUid: "A", targetUid: "Y", type: "routes", direction: "forward", weight: 1 },
    ],
  };
  expect(nodesOfKind(g, "endpoint").map((n) => n.uid)).toEqual(["A", "B"]); // byUid 정렬
  expect(nodesOfKind(g, "table").map((n) => n.uid)).toEqual(["C"]);
  expect(edgesOfType(g, "routes").map((e) => e.sourceUid)).toEqual(["A", "B"]); // cmpEdge 정렬
});
