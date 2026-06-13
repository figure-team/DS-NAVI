import { expect, test } from "vitest";
import { slugify, toWikiTarget, layerDir, assignRelPaths, type SlugEntry } from "./slug.js";
import { renderFrontmatter } from "./frontmatter.js";
import type { WikiNote, WikiVault } from "./types.js";

// ── slugify: 결정론·한글·금칙문자 ───────────────────────────────────────────
test("slugify: 소문자·공백→하이픈·금칙 제거, 한글 보존", () => {
  expect(slugify("계정 관리 Account")).toBe("계정-관리-account");
  expect(slugify("OrderService#placeOrder")).toBe("orderserviceplaceorder");
  expect(slugify("회원/주문 (통합)")).toBe("회원주문-통합");
  expect(slugify("  GET /cart/{id}  ")).toBe("get-cartid");
});

test("slugify: 빈/전부 금칙 → untitled, 양끝 구분자 제거", () => {
  expect(slugify("!!!")).toBe("untitled");
  expect(slugify("")).toBe("untitled");
  expect(slugify("-.-x-.-")).toBe("x");
});

test("slugify: `.`(점) 제거 — .md/숨김파일 위키링크 깨짐 차단", () => {
  // name이 foo.md여도 relPath foo.md.md / 토글 foo.md 불일치가 생기지 않도록 점 제거
  expect(slugify("foo.md")).toBe("foomd");
  expect(slugify("v1.2.md")).toBe("v12md");
  expect(slugify(".hidden")).toBe("hidden");
});

test("`.md` 이름: relPath ↔ toWikiTarget 대칭(불일치 없음)", () => {
  const m = assignRelPaths([{ nodeUid: "x", layer: "feature", name: "foo.md" }]);
  const rel = m.get("x")!;
  expect(rel).toBe("feature/foomd.md");
  // toWikiTarget(rel) 는 디스크 경로에서 끝 .md만 떼므로 항상 rel과 1:1
  expect(rel).toBe(`${toWikiTarget(rel)}.md`);
});

test("slugify: 결정론(동일 입력 동일 출력)", () => {
  const inputs = ["계정 관리", "Order Flow", "tbl_account"];
  expect(inputs.map(slugify)).toEqual(inputs.map(slugify));
});

// ── toWikiTarget: 위키링크는 .md 없이 ───────────────────────────────────────
test("toWikiTarget: .md 제거(전체 relPath 유지)", () => {
  expect(toWikiTarget("api/account.md")).toBe("api/account");
  expect(toWikiTarget("feature/step/login.md")).toBe("feature/step/login");
  expect(toWikiTarget("table/tbl_account.md")).toBe("table/tbl_account");
});

test("layerDir: 계층별 폴더(overview는 루트)", () => {
  expect(layerDir("overview")).toBe("");
  expect(layerDir("feature")).toBe("feature");
  expect(layerDir("api")).toBe("api");
  expect(layerDir("table")).toBe("table");
  expect(layerDir("step")).toBe("feature/step");
});

// ── assignRelPaths: 충돌·결정론·계층 ────────────────────────────────────────
test("assignRelPaths: 계층별 폴더·.md 포함", () => {
  const entries: SlugEntry[] = [
    { nodeUid: "d1", layer: "feature", name: "계정" },
    { nodeUid: "e1", layer: "api", name: "장바구니" },
    { nodeUid: "t1", layer: "table", name: "ACCOUNT" },
    { nodeUid: "s1", layer: "step", name: "로그인" },
  ];
  const m = assignRelPaths(entries);
  expect(m.get("d1")).toBe("feature/계정.md");
  expect(m.get("e1")).toBe("api/장바구니.md");
  expect(m.get("t1")).toBe("table/account.md");
  expect(m.get("s1")).toBe("feature/step/로그인.md");
});

test("assignRelPaths: 같은 layer·같은 slug 충돌 → uid 꼬리표", () => {
  const entries: SlugEntry[] = [
    { nodeUid: "A#x", layer: "feature", name: "주문" },
    { nodeUid: "B#y", layer: "feature", name: "주문" },
  ];
  const m = assignRelPaths(entries);
  const paths = [...m.values()].sort();
  // 첫(uid 사전순 A#x)은 base, 둘째(B#y)는 uid 꼬리표
  expect(m.get("A#x")).toBe("feature/주문.md");
  expect(m.get("B#y")).toBe("feature/주문-by.md");
  expect(new Set(paths).size).toBe(2); // 유일
});

test("assignRelPaths: 다른 layer 같은 slug → 충돌 아님(폴더 상이)", () => {
  const entries: SlugEntry[] = [
    { nodeUid: "e1", layer: "api", name: "account" },
    { nodeUid: "t1", layer: "table", name: "account" },
  ];
  const m = assignRelPaths(entries);
  expect(m.get("e1")).toBe("api/account.md");
  expect(m.get("t1")).toBe("table/account.md");
});

test("assignRelPaths: 입력 순서 무관(결정론, uid 사전순 배정)", () => {
  const a: SlugEntry[] = [
    { nodeUid: "B#y", layer: "feature", name: "주문" },
    { nodeUid: "A#x", layer: "feature", name: "주문" },
  ];
  const b = [...a].reverse();
  expect([...assignRelPaths(a).entries()].sort()).toEqual(
    [...assignRelPaths(b).entries()].sort(),
  );
  // 배정 결과도 입력 순서 무관하게 동일
  expect(assignRelPaths(a).get("A#x")).toBe(assignRelPaths(b).get("A#x"));
});

// ── frontmatter: colon-safe ─────────────────────────────────────────────────
test("renderFrontmatter: 콜론 포함 값 인용, 평문은 그대로", () => {
  const out = renderFrontmatter({
    type: "feature",
    title: "계정: 관리", // 콜론 → 인용
    evidence: 3,
    tags: ["domain", "a:b"], // 배열 항목도 colon-safe
  });
  expect(out).toBe(
    ["---", "type: feature", 'title: "계정: 관리"', "evidence: 3", "tags:", "  - domain", '  - "a:b"', "---"].join("\n"),
  );
});

test("renderFrontmatter: 키 삽입 순서 보존(결정론)", () => {
  const a = renderFrontmatter({ z: "1", a: "2", m: "3" });
  expect(a.split("\n").slice(1, 4)).toEqual(["z: 1", "a: 2", "m: 3"]);
});

test("renderFrontmatter: YAML 지시문자/양끝공백 인용", () => {
  expect(renderFrontmatter({ k: "#hash" })).toContain('k: "#hash"');
  expect(renderFrontmatter({ k: " pad " })).toContain('k: " pad "');
  expect(renderFrontmatter({ k: "" })).toContain('k: ""');
});

test("renderFrontmatter: 개행/탭 → escape(블록 깨짐 차단)", () => {
  const out = renderFrontmatter({ a: "line1\nline2", b: "x\ttab", c: "ok" });
  // raw 개행이 들어가면 다음 키가 깨진다 → \n escape 후 인용
  expect(out).toBe(["---", 'a: "line1\\nline2"', 'b: "x\\ttab"', "c: ok", "---"].join("\n"));
  // 블록은 정확히 4줄(--- + 3키 + ---)이며 raw 개행 없음
  expect(out.split("\n").length).toBe(5);
});

test("renderFrontmatter: 콜론+따옴표 동시 → 둘 다 escape", () => {
  expect(renderFrontmatter({ k: 'a: "b"' })).toContain('k: "a: \\"b\\""');
});

// ── 스키마 라운드트립 ────────────────────────────────────────────────────────
test("WikiNote/WikiVault JSON 라운드트립", () => {
  const note: WikiNote = {
    relPath: "feature/계정.md",
    layer: "feature",
    nodeUid: "domain:account",
    title: "계정 관리",
    summary: "계정 도메인",
    claims: [{ claim: "x", confidence: "INFERRED", evidence: [], requires_human_review: true }],
    links: [{ targetRelPath: "api/account", label: "계정 API" }],
    frontmatter: { type: "feature", title: "계정 관리" },
  };
  const vault: WikiVault = {
    notes: [note],
    index: "# index",
    hubInjections: [{ hub: "03_feature-spec.md", links: note.links }],
    graph: {
      version: "1.0.0",
      kind: "knowledge",
      project: { name: "p", languages: [], frameworks: [], description: "", analyzedAt: "", gitCommitHash: "" },
      nodes: [],
      edges: [],
      layers: [],
      tour: [],
    },
  };
  expect(JSON.parse(JSON.stringify(vault))).toEqual(vault);
});
