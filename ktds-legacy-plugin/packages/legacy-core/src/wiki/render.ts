/**
 * 위키 노트 skeleton 렌더 (ADR-004 T8) — 결정론 markdown.
 *
 * 노트 1건 = frontmatter + H1 + (산문) + claims 펜스 + "## 관계"(위키링크). claim 렌더는
 * claims.ts `renderClaim`(5종과 동일 cite 포맷·태그), 펜스는 5종과 동일 마커(`<!-- claims -->`).
 * 산문(prose)은 host(ProseProvider)가 주입 — **골든 스냅샷 제외**(skeleton만 byte-diff=0).
 *
 * 노트는 doc-state 밖이라(검토/승인 대상 아님) 상태문은 5종과 다른 위키 전용 문구.
 */

import { CLAIMS_FENCE_OPEN, CLAIMS_FENCE_CLOSE } from "../types.js";
import { renderClaim } from "../doc-generator/claims.js";
import { renderFrontmatter } from "./frontmatter.js";
import type { WikiNote } from "./types.js";

/** 노트 헤더 상태문 — 위키 노트는 doc-state 밖(검토/승인 게이트 미적용). */
export const WIKI_NOTE_STATUS_LINE = "ktds 위키 노트 · 근거 기반 자동 생성 (정식 검토/승인 대상은 5종 문서)";

/**
 * 노트 → markdown. prose가 있으면 H1 다음 본문에 포함(골든 제외). 같은 노트(prose 없이)
 * → 같은 출력(byte-diff=0).
 */
export function renderNote(note: WikiNote, prose?: string): string {
  const lines: string[] = [
    renderFrontmatter(note.frontmatter),
    "",
    `# ${note.title}`,
    "",
    `> ${WIKI_NOTE_STATUS_LINE}`,
    "",
  ];

  if (prose && prose.trim()) lines.push(prose.trim(), "");

  // 근거 claim 펜스 (5종과 동일 마커·렌더)
  if (note.claims.length === 0) {
    lines.push("_(항목 없음)_", "");
  } else {
    lines.push(CLAIMS_FENCE_OPEN);
    for (const c of note.claims) lines.push(renderClaim(c));
    lines.push(CLAIMS_FENCE_CLOSE, "");
  }

  // 전방 위키링크 (백링크는 옵시디언/대시보드 자동)
  if (note.links.length > 0) {
    lines.push("## 관계", "");
    for (const l of note.links) lines.push(`- [[${l.targetRelPath}|${l.label}]]`);
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}

/** 노트 집합 → relPath→skeleton(prose 없음) Map. 골든 기준선용(T8). */
export function renderWikiSkeleton(notes: WikiNote[]): Map<string, string> {
  return new Map(notes.map((n) => [n.relPath, renderNote(n)]));
}
