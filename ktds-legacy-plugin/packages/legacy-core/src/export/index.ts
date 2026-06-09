import type { GeneratedDoc, Claim, Confidence } from "../types.js";
import { CONFIDENCE_TAG } from "../types.js";

/**
 * HTML exporter (plan §3.4 / §9.5): 독립 실행 단일 HTML.
 * CDN 없음(CSS 인라인), 카테고리별 사이드바 TOC. 폐쇄망 배포 가능. 결정론적(A9).
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;"); // single-quote too (any attribute context)
}

function slug(filename: string): string {
  return filename.replace(/\.md$/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

const TAG_CLASS: Record<Confidence, string> = {
  CONFIRMED_AI: "c-ai",
  CONFIRMED_HUMAN: "c-human",
  INFERRED: "c-inferred",
  NEEDS_REVIEW: "c-review",
};

function claimHtml(c: Claim): string {
  const ev = c.evidence[0];
  const cite = ev ? ` <code class="ev">${esc(ev.path)}${ev.line != null ? ":" + ev.line : ""}</code>` : "";
  return `<li><span class="tag ${TAG_CLASS[c.confidence]}">${esc(CONFIDENCE_TAG[c.confidence])}</span> ${esc(c.claim)}${cite}</li>`;
}

function docHtml(doc: GeneratedDoc, id: string): string {
  const sections = doc.sections.map((s) => {
    const prose = s.prose && s.prose.trim() ? `<p class="prose">${esc(s.prose.trim())}</p>` : "";
    const items = s.claims.length
      ? `<ul>${s.claims.map(claimHtml).join("")}</ul>`
      : `<p class="empty">(항목 없음)</p>`;
    return `<h3>${esc(s.heading)}</h3>${prose}${items}`;
  });
  return `<section id="${id}"><h2>${esc(doc.title)}</h2>${sections.join("")}</section>`;
}

const CSS = `
:root{--ai:#1a7f37;--human:#0969da;--inferred:#9a6700;--review:#cf222e}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;color:#1f2328;display:flex}
nav.toc{position:sticky;top:0;height:100vh;min-width:220px;border-right:1px solid #d0d7de;padding:16px;overflow:auto;background:#f6f8fa}
nav.toc h1{font-size:15px;margin:0 0 12px}nav.toc ul{list-style:none;padding:0;margin:0}
nav.toc a{display:block;padding:6px 8px;color:#0969da;text-decoration:none;border-radius:6px}
nav.toc a:hover{background:#eaeef2}
main{padding:24px 40px;max-width:900px}
section{margin-bottom:40px}h2{border-bottom:2px solid #d0d7de;padding-bottom:6px}
ul{padding-left:18px}li{margin:4px 0;line-height:1.6}
.tag{font-size:12px;font-weight:600;padding:1px 6px;border-radius:10px;color:#fff;white-space:nowrap}
.c-ai{background:var(--ai)}.c-human{background:var(--human)}.c-inferred{background:var(--inferred)}.c-review{background:var(--review)}
code.ev{background:#eff1f3;padding:1px 5px;border-radius:5px;font-size:12px;color:#57606a}
p.prose{color:#1f2328}p.empty{color:#8c959f;font-style:italic}
`.trim();

export interface ExportOptions {
  title?: string;
}

/** Render the docs as one self-contained HTML string (no external resources). */
export function exportHtml(docs: GeneratedDoc[], options: ExportOptions = {}): string {
  const title = options.title ?? "Legacy 문서";
  // unique, deterministic, attribute-safe ids (index-prefixed → no slug collision)
  const ids = docs.map((d, i) => `doc-${i}-${slug(d.filename)}`);
  const toc = docs.map((d, i) => `<li><a href="#${ids[i]}">${esc(d.title)}</a></li>`).join("");
  const body = docs.map((d, i) => docHtml(d, ids[i]!)).join("\n");
  return [
    "<!doctype html>",
    '<html lang="ko"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${CSS}</style></head><body>`,
    `<nav class="toc"><h1>${esc(title)}</h1><ul>${toc}</ul></nav>`,
    `<main>${body}</main>`,
    "</body></html>",
  ].join("\n");
}
