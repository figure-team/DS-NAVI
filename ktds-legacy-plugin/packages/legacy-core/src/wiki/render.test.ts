import { expect, test } from "vitest";
import { renderNote, renderWikiSkeleton } from "./render.js";
import type { WikiNote } from "./types.js";

function note(extra: Partial<WikiNote> = {}): WikiNote {
  return {
    relPath: "feature/계정.md",
    layer: "feature",
    nodeUid: "domain:account",
    title: "계정",
    summary: "계정 도메인",
    frontmatter: { type: "domain", title: "계정" },
    claims: [
      { claim: "업무 도메인: 계정", confidence: "CONFIRMED_AI", evidence: [{ path: "A.java", line: 5 }], requires_human_review: false },
    ],
    links: [{ targetRelPath: "api/login", label: "로그인 API" }],
    ...extra,
  };
}

test("renderNote: frontmatter→H1→상태문→claims 펜스→관계", () => {
  const md = renderNote(note());
  expect(md.startsWith("---\ntype: domain\ntitle: 계정\n---")).toBe(true);
  expect(md).toContain("# 계정");
  expect(md).toContain("> ktds 위키 노트");
  expect(md).toContain("<!-- claims -->");
  expect(md).toContain("- [확정(AI)] 업무 도메인: 계정 — 근거: `A.java:5`");
  expect(md).toContain("<!-- /claims -->");
  expect(md).toContain("## 관계");
  expect(md).toContain("- [[api/login|로그인 API]]");
});

test("renderNote: 산문은 skeleton에서 제외, 주입 시 포함", () => {
  const skeleton = renderNote(note());
  expect(skeleton).not.toContain("산문 본문");
  const withProse = renderNote(note(), "산문 본문입니다.");
  expect(withProse).toContain("산문 본문입니다.");
  // 산문은 H1 다음, claims 펜스 앞
  expect(withProse.indexOf("산문 본문")).toBeLessThan(withProse.indexOf("<!-- claims -->"));
});

test("renderNote: 결정론(prose 없이 2회 동일)", () => {
  expect(renderNote(note())).toBe(renderNote(note()));
});

test("renderNote: claim 없으면 항목 없음, 링크 없으면 관계 절 생략", () => {
  const md = renderNote(note({ claims: [], links: [] }));
  expect(md).toContain("_(항목 없음)_");
  expect(md).not.toContain("## 관계");
  expect(md).not.toContain("<!-- claims -->");
});

test("renderWikiSkeleton: relPath→skeleton Map", () => {
  const m = renderWikiSkeleton([note(), note({ relPath: "api/login.md", layer: "api", nodeUid: "e1", title: "로그인 API", links: [] })]);
  expect([...m.keys()].sort()).toEqual(["api/login.md", "feature/계정.md"]);
  expect(m.get("feature/계정.md")).toBe(renderNote(note()));
});
