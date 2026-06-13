import { expect, test } from "vitest";
import { buildIndex } from "./index-gen.js";
import { injectHubLinks } from "./hub-inject.js";
import type { WikiLink, WikiNote } from "./types.js";

function note(relPath: string, layer: WikiNote["layer"], title: string): WikiNote {
  return { relPath, layer, nodeUid: relPath, title, summary: "", claims: [], links: [], frontmatter: {} };
}

const notes: WikiNote[] = [
  note("feature/계정.md", "feature", "계정"),
  note("feature/주문.md", "feature", "주문"),
  note("api/get-cart.md", "api", "GET /cart"),
  note("table/account.md", "table", "ACCOUNT"),
];

// ── T4 buildIndex ────────────────────────────────────────────────────────────
test("buildIndex: 개요(허브5) + 기능/API/DB 섹션, 위키링크", () => {
  const md = buildIndex(notes);
  expect(md).toContain("## 개요");
  expect(md).toContain("[[01_tech-stack|기술 스택]]");
  expect(md).toContain("[[05_db-spec|DB 명세]]");
  expect(md).toContain("## 기능");
  expect(md).toContain("[[feature/계정|계정]]");
  expect(md).toContain("## API");
  expect(md).toContain("[[api/get-cart|GET /cart]]");
  expect(md).toContain("## DB");
  expect(md).toContain("[[table/account|ACCOUNT]]");
});

test("buildIndex: 빈 계층 섹션 생략(step 없으면 단계 절 없음)", () => {
  expect(buildIndex(notes)).not.toContain("## 단계");
});

test("buildIndex: step 포함 시 단계 섹션", () => {
  const withStep = [...notes, note("feature/step/검증.md", "step", "검증")];
  expect(buildIndex(withStep)).toContain("## 단계");
  expect(buildIndex(withStep)).toContain("[[feature/step/검증|검증]]");
});

test("buildIndex: 결정론(relPath 사전순, 2회 동일)", () => {
  expect(buildIndex(notes)).toBe(buildIndex([...notes].reverse()));
});

// ── T5 injectHubLinks ────────────────────────────────────────────────────────
const links: WikiLink[] = [
  { targetRelPath: "api/get-cart", label: "GET /cart" },
  { targetRelPath: "api/account", label: "계정 API" },
];

test("injectHubLinks: 마커 없으면 끝에 추가", () => {
  const hub = "# API 명세\n\n> 상태\n\n## 엔드포인트\n\n내용\n";
  const out = injectHubLinks(hub, links);
  expect(out).toContain("<!-- wiki-links -->");
  expect(out).toContain("## 세분화 항목");
  expect(out).toContain("<!-- /wiki-links -->");
  expect(out.startsWith("# API 명세")).toBe(true);
  // 링크 사전순
  expect(out.indexOf("api/account")).toBeLessThan(out.indexOf("api/get-cart"));
});

test("injectHubLinks: 2회 적용 byte 동일(멱등 교체)", () => {
  const hub = "# API 명세\n\n본문\n";
  const once = injectHubLinks(hub, links);
  const twice = injectHubLinks(once, links);
  expect(twice).toBe(once);
});

test("injectHubLinks: 다른 링크로 재주입 시 펜스 내부만 교체", () => {
  const hub = "# API\n\n본문\n";
  const first = injectHubLinks(hub, links);
  const second = injectHubLinks(first, [{ targetRelPath: "api/new", label: "신규" }]);
  expect(second).toContain("[[api/new|신규]]");
  expect(second).not.toContain("api/get-cart");
  expect(second.startsWith("# API\n\n본문")).toBe(true);
});

test("injectHubLinks: claims 펜스 불변(별도 마커)", () => {
  const hub = "# API\n\n<!-- claims -->\n- [확정(AI)] x\n<!-- /claims -->\n";
  const out = injectHubLinks(hub, links);
  expect(out).toContain("<!-- claims -->\n- [확정(AI)] x\n<!-- /claims -->");
});

test("injectHubLinks: 빈 링크 → 펜스 + 안내문", () => {
  const out = injectHubLinks("# Tech\n", []);
  expect(out).toContain("_(세분화 항목 없음)_");
  expect(injectHubLinks(out, [])).toBe(out); // 멱등
});
