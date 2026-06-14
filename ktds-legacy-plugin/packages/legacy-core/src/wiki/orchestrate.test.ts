import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWiki } from "./orchestrate.js";
import { readAudit } from "../audit/index.js";
import type { CanonicalGraph, CanonicalNode, CanonicalEdge } from "../types.js";

function node(uid: string, kind: string, extra: Partial<CanonicalNode> = {}): CanonicalNode {
  return { uid, kind: kind as CanonicalNode["kind"], name: uid, summary: "s", tags: [], ...extra };
}
function edge(s: string, t: string, type: string): CanonicalEdge {
  return { sourceUid: s, targetUid: t, type, direction: "forward", weight: 1 };
}

const graph: CanonicalGraph = {
  sourceVersion: "1.0.0", fingerprint: "fp",
  project: { name: "demo", languages: ["Java"], frameworks: ["Spring"], description: "d", gitCommitHash: "c1", configFiles: [] },
  layers: [],
  nodes: [
    node("domain:acct", "domain", { name: "계정" }),
    node("flow:login", "flow", { name: "로그인", evidence: { path: "Login.java" } }),
    node("GET /login", "endpoint", { name: "GET /login", evidence: { path: "Login.java" } }),
    node("tbl:ACCOUNT", "table", { name: "ACCOUNT" }),
    node("step:check", "step", { name: "검증", evidence: { path: "Login.java" } }),
  ],
  edges: [
    edge("domain:acct", "flow:login", "contains_flow"),
    edge("flow:login", "step:check", "flow_step"),
    edge("GET /login", "tbl:ACCOUNT", "reads_from"),
  ],
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wiki-orch-"));
  // 5종 허브 사전 발행 (5종 파이프라인 산출 모사)
  const docs = join(root, "docs");
  await mkdir(docs, { recursive: true });
  for (const f of ["01_tech-stack", "02_architecture", "03_feature-spec", "04_api-spec", "05_db-spec"]) {
    await writeFile(join(docs, `${f}.md`), `# ${f}\n\n> 상태: DRAFT\n\n## 섹션\n\n내용\n`, "utf-8");
  }
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function read(rel: string): Promise<string> {
  return readFile(join(root, "docs", rel), "utf-8");
}
// 위키 그래프는 프로젝트 루트 .understand-anything/ (코드그래프 옆)
async function readRoot(rel: string): Promise<string> {
  return readFile(join(root, ".understand-anything", rel), "utf-8");
}

test("기본: 노트/index/graph 발행 + 허브 주입 + 감사", async () => {
  const res = await generateWiki(root, graph, { runId: "r1", analyzedAt: "", generatedAt: "" });
  expect(res.noteCount).toBe(4); // step 제외
  // 노트 파일
  await expect(read("feature/계정.md")).resolves.toContain("# 계정");
  await expect(read("api/get-login.md")).resolves.toContain("# GET /login");
  await expect(read("table/account.md")).resolves.toContain("# ACCOUNT");
  // index.md
  await expect(read("index.md")).resolves.toContain("## 개요");
  // wiki-graph.json — 프로젝트 루트(코드그래프 옆), filePath docs/ 접두
  const kg = JSON.parse(await readRoot("wiki-graph.json"));
  expect(kg.kind).toBe("knowledge");
  expect(kg.nodes.some((n: { id: string }) => n.id === "domain:acct")).toBe(true);
  const flowNode = kg.nodes.find((n: { id: string }) => n.id === "flow:login");
  expect(flowNode.filePath).toBe("docs/feature/로그인.md"); // docs/ 접두 확인
  // 허브 주입
  await expect(read("04_api-spec.md")).resolves.toContain("<!-- wiki-links -->");
  await expect(read("04_api-spec.md")).resolves.toContain("[[api/get-login|GET /login]]");
  // 감사
  const audit = await readAudit(join(root, ".spec"));
  expect(audit.some((e) => e.type === "WIKI_GENERATED")).toBe(true);
});

test("기본은 step 제외 — feature/step 폴더 없음", async () => {
  await generateWiki(root, graph, { runId: "r1" });
  const featureEntries = await readdir(join(root, "docs", "feature"));
  expect(featureEntries).not.toContain("step");
});

test("--steps: step 노트 포함", async () => {
  const res = await generateWiki(root, graph, { runId: "r1", includeSteps: true });
  expect(res.noteCount).toBe(5);
  await expect(read("feature/step/검증.md")).resolves.toContain("# 검증");
});

test("멱등: 2회 실행 시 graph·허브·노트 byte 동일", async () => {
  await generateWiki(root, graph, { runId: "r1", analyzedAt: "", generatedAt: "" });
  const g1 = await readRoot("wiki-graph.json");
  const h1 = await read("04_api-spec.md");
  const n1 = await read("feature/계정.md");
  await generateWiki(root, graph, { runId: "r2", analyzedAt: "", generatedAt: "" });
  expect(await readRoot("wiki-graph.json")).toBe(g1);
  expect(await read("04_api-spec.md")).toBe(h1); // 펜스 교체 멱등
  expect(await read("feature/계정.md")).toBe(n1);
});

test("노트는 doc-state 밖 — .spec/doc-state에 노트 미등록", async () => {
  await generateWiki(root, graph, { runId: "r1" });
  // doc-state 디렉터리가 없거나, 있어도 노트 relPath를 포함하지 않음
  let dsEntries: string[] = [];
  try { dsEntries = await readdir(join(root, ".spec", "doc-state")); } catch { /* none */ }
  expect(dsEntries.join(",")).not.toContain("feature");
});

test("재실행 시 stale 노트 제거(이름 변경된 노드)", async () => {
  await generateWiki(root, graph, { runId: "r1", includeSteps: true });
  await expect(read("feature/step/검증.md")).resolves.toBeTruthy();
  // step 제외로 재실행 → step 폴더 사라짐
  await generateWiki(root, graph, { runId: "r2" });
  const featureEntries = await readdir(join(root, "docs", "feature"));
  expect(featureEntries).not.toContain("step");
});

test("reingestProse: host가 .md에 채운 산문이 재실행에 보존 + graph 전파", async () => {
  // 1) skeleton 발행
  await generateWiki(root, graph, { runId: "r1", analyzedAt: "", generatedAt: "" });
  // 2) host가 노트 .md 산문 영역(상태문~claims 펜스 사이)을 직접 편집
  const notePath = join(root, "docs", "feature", "로그인.md");
  const skeleton = await readFile(notePath, "utf-8");
  const prose = "로그인 흐름은 인증 토큰을 발급한다.";
  const edited = skeleton.replace("<!-- claims -->", `${prose}\n\n<!-- claims -->`);
  await writeFile(notePath, edited, "utf-8");
  // 3) reingest 켜고 재실행 → .md 산문 보존 + claims/관계 재생성
  await generateWiki(root, graph, { runId: "r2", reingestProse: true, analyzedAt: "", generatedAt: "" });
  const after = await read("feature/로그인.md");
  expect(after).toContain(prose);
  expect(after.indexOf(prose)).toBeLessThan(after.indexOf("<!-- claims -->"));
  // 4) 대시보드 정본(wiki-graph.json)의 knowledgeMeta.content 까지 산문 전파
  const kg = JSON.parse(await readRoot("wiki-graph.json"));
  const flowNode = kg.nodes.find((n: { id: string }) => n.id === "flow:login");
  expect(flowNode.knowledgeMeta.content).toContain(prose);
});

test("reingestProse: 산문 없는 노트는 skeleton과 byte 동일(무해)", async () => {
  await generateWiki(root, graph, { runId: "r1", analyzedAt: "", generatedAt: "" });
  const before = await read("feature/계정.md");
  await generateWiki(root, graph, { runId: "r2", reingestProse: true, analyzedAt: "", generatedAt: "" });
  expect(await read("feature/계정.md")).toBe(before);
});

test("reingestProse: prose 명시가 reingest보다 우선", async () => {
  await generateWiki(root, graph, { runId: "r1", analyzedAt: "", generatedAt: "" });
  // 디스크 .md에 산문 심기
  const notePath = join(root, "docs", "feature", "로그인.md");
  const sk = await readFile(notePath, "utf-8");
  await writeFile(notePath, sk.replace("<!-- claims -->", "디스크 산문\n\n<!-- claims -->"), "utf-8");
  // prose 콜백 명시 → 디스크 재흡수 대신 콜백 사용
  await generateWiki(root, graph, {
    runId: "r2", reingestProse: true, analyzedAt: "", generatedAt: "",
    prose: async () => "콜백 산문",
  });
  const after = await read("feature/로그인.md");
  expect(after).toContain("콜백 산문");
  expect(after).not.toContain("디스크 산문");
});

test("크래시-안전 스왑: .old 백업 잔재 없음 + 락 해제", async () => {
  await generateWiki(root, graph, { runId: "r1", includeSteps: true });
  await generateWiki(root, graph, { runId: "r2" }); // 재실행(백업 경유 스왑)
  for (const d of ["feature", "api", "table"]) {
    await expect(readdir(join(root, "docs", `${d}.old`))).rejects.toThrow(); // .old 디렉터리 없음
  }
  // 락 파일 해제됨
  await expect(readFile(join(root, ".spec", ".analysis.lock"))).rejects.toThrow();
});
