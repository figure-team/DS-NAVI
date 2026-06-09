import { describe, it, expect } from "vitest";
import type { GeneratedDoc } from "../types.js";
import { exportHtml } from "./index.js";

const DOCS: GeneratedDoc[] = [
  {
    filename: "01_tech-stack.md", title: "기술 스택",
    sections: [{
      heading: "언어",
      claims: [
        { claim: "Java 17", confidence: "CONFIRMED_AI", evidence: [{ path: "pom.xml", line: 12 }], requires_human_review: false },
        { claim: "추정 라이브러리", confidence: "INFERRED", evidence: [], requires_human_review: true },
      ],
    }],
  },
  {
    filename: "04_api-spec.md", title: "API 명세",
    sections: [{ heading: "엔드포인트", claims: [] }],
  },
];

describe("exportHtml", () => {
  const html = exportHtml(DOCS, { title: "샘플" });

  it("is a single self-contained HTML doc with inline CSS", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
  });

  it("has NO external resources (no CDN / http(s) / src= links) — A9 / 폐쇄망", () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\b(src|href)\s*=\s*["']https?:/i);
  });

  it("renders a sidebar TOC with every doc title", () => {
    expect(html).toContain('<nav class="toc"');
    expect(html).toContain("기술 스택");
    expect(html).toContain("API 명세");
    expect(html).toContain('href="#doc-0-01_tech-stack"');
  });

  it("renders confidence tags and evidence", () => {
    expect(html).toContain("[확정(AI)]");
    expect(html).toContain("[추정]");
    expect(html).toContain("pom.xml:12");
  });

  it("escapes HTML and shows empty sections", () => {
    const evil = exportHtml([{ filename: "x.md", title: "<script>x</script>", sections: [{ heading: "h", claims: [] }] }]);
    expect(evil).not.toContain("<script>x</script>");
    expect(evil).toContain("&lt;script&gt;");
    expect(evil).toContain("(항목 없음)");
  });

  it("is deterministic (A9)", () => {
    expect(exportHtml(DOCS, { title: "샘플" })).toBe(html);
  });

  it("filename-derived attributes cannot inject (slug allowlist)", () => {
    const h = exportHtml([{ filename: 'x" onload="alert(1).md', title: "t", sections: [] }]);
    expect(h).not.toMatch(/onload\s*=/);
  });

  it("distinct docs get distinct anchor ids even when slugs collide", () => {
    const h = exportHtml([
      { filename: "a b.md", title: "A", sections: [] },  // slug → "a-b"
      { filename: "a-b.md", title: "B", sections: [] },  // slug → "a-b" (collision)
    ]);
    const ids = [...h.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // index-prefixed → unique despite slug collision
  });
});
