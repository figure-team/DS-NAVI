/**
 * 허브 링크섹션 멱등 주입 (ADR-004 T5/ID7) — 5 허브(docs/0N.md)에 "## 세분화 항목".
 *
 * `<!-- wiki-links -->`…`<!-- /wiki-links -->` 펜스로 감싼다 → 재실행 시 **중복 추가가
 * 아니라 교체**(멱등). claims 펜스(`<!-- claims -->`)와 **별도 마커**라 claim 영역 불변.
 * `--no-wiki`는 이 함수를 호출하지 않는다(orchestrator) → 5종 doc-generator 출력 그대로
 * (바이트 동일). 빈 링크여도 펜스를 emit해 후속 교체·정리를 일관되게 한다.
 */

import type { WikiLink } from "./types.js";

export const WIKI_LINKS_FENCE_OPEN = "<!-- wiki-links -->";
export const WIKI_LINKS_FENCE_CLOSE = "<!-- /wiki-links -->";

const FENCE_RE = /<!-- wiki-links -->[\s\S]*?<!-- \/wiki-links -->/;

/** 링크섹션 블록(펜스 포함). 링크는 targetRelPath 사전순(결정론). */
function buildBlock(links: WikiLink[]): string {
  const sorted = [...links].sort((a, b) =>
    a.targetRelPath < b.targetRelPath ? -1 : a.targetRelPath > b.targetRelPath ? 1 : 0,
  );
  const body = sorted.length
    ? sorted.map((l) => `- [[${l.targetRelPath}|${l.label}]]`).join("\n")
    : "_(세분화 항목 없음)_";
  return [WIKI_LINKS_FENCE_OPEN, "## 세분화 항목", "", body, WIKI_LINKS_FENCE_CLOSE].join("\n");
}

/**
 * 허브 markdown에 링크섹션을 멱등 주입. 마커가 있으면 펜스 내부를 교체, 없으면 끝에 추가.
 * 같은 (hub, links) → 같은 출력. 2회 적용해도 byte 동일.
 */
export function injectHubLinks(hubMarkdown: string, links: WikiLink[]): string {
  const block = buildBlock(links);
  if (FENCE_RE.test(hubMarkdown)) {
    return hubMarkdown.replace(FENCE_RE, block);
  }
  const trimmed = hubMarkdown.replace(/\n+$/, "");
  return `${trimmed}\n\n${block}\n`;
}
