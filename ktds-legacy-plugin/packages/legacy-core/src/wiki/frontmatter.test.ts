import { describe, expect, test } from "vitest";
import { renderFrontmatter } from "./frontmatter.js";

describe("renderFrontmatter", () => {
  test("---로 시작하고 끝남", () => {
    const out = renderFrontmatter({ type: "domain", title: "계정" });
    expect(out.startsWith("---\n")).toBe(true);
    expect(out.endsWith("\n---")).toBe(true);
  });

  test("문자열 값 — 안전한 경우 평문", () => {
    const out = renderFrontmatter({ title: "HelloWorld" });
    expect(out).toContain("title: HelloWorld");
  });

  test("문자열 값 — 콜론 포함 → 큰따옴표 인용", () => {
    const out = renderFrontmatter({ title: "order:list" });
    expect(out).toContain('title: "order:list"');
  });

  test("빈 문자열 → 큰따옴표 인용", () => {
    const out = renderFrontmatter({ key: "" });
    expect(out).toContain('key: ""');
  });

  test("앞뒤 공백 → 인용", () => {
    const out = renderFrontmatter({ key: " spaces " });
    expect(out).toContain('key: " spaces "');
  });

  test("숫자 값 — 평문 출력", () => {
    const out = renderFrontmatter({ count: 42 });
    expect(out).toContain("count: 42");
  });

  test("배열 값 — 블록 시퀀스 형식", () => {
    const out = renderFrontmatter({ tags: ["java", "spring"] });
    expect(out).toContain("tags:");
    expect(out).toContain("  - java");
    expect(out).toContain("  - spring");
  });

  test("배열 내 콜론 포함 항목 → 인용", () => {
    const out = renderFrontmatter({ tags: ["a:b"] });
    expect(out).toContain('  - "a:b"');
  });

  test("키 삽입 순서 보존", () => {
    const out = renderFrontmatter({ type: "domain", title: "계정", version: 1 });
    const lines = out.split("\n").filter((l) => !l.startsWith("---"));
    expect(lines[0]).toContain("type:");
    expect(lines[1]).toContain("title:");
    expect(lines[2]).toContain("version:");
  });

  test("개행 문자 포함 값 → \\n 이스케이프", () => {
    const out = renderFrontmatter({ note: "line1\nline2" });
    expect(out).toContain('"line1\\nline2"');
    expect(out).not.toContain("\n  - "); // 배열이 아님
  });

  test("탭 문자 포함 → \\t 이스케이프", () => {
    const out = renderFrontmatter({ note: "a\tb" });
    expect(out).toContain('"a\\tb"');
  });

  test("# 포함 → 인용 (YAML 주석 충돌 방지)", () => {
    const out = renderFrontmatter({ note: "#tag" });
    expect(out).toContain('"#tag"');
  });

  test("빈 객체 → --- 블록만", () => {
    const out = renderFrontmatter({});
    expect(out).toBe("---\n---");
  });

  test("결정론: 동일 입력 → 동일 출력", () => {
    const fm = { type: "domain", title: "계정", tags: ["java", "spring"] };
    expect(renderFrontmatter(fm)).toBe(renderFrontmatter(fm));
  });

  test("실제 wiki frontmatter 예시", () => {
    const out = renderFrontmatter({
      type: "domain",
      title: "계정 관리",
      tags: ["account", "user"],
      version: 1,
    });
    expect(out).toMatchInlineSnapshot(`
      "---
      type: domain
      title: 계정 관리
      tags:
        - account
        - user
      version: 1
      ---"
    `);
  });
});
