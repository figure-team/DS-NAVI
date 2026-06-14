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

/** 산문 영역의 종료 마커들 — host 산문은 상태문과 claims 블록 사이에만 존재. */
const PROSE_TERMINATORS = [CLAIMS_FENCE_OPEN, "_(항목 없음)_", "## 관계"];

/**
 * renderNote의 역연산 — 발행된 노트 .md에서 host가 채운 산문 본문만 추출한다(ADR-004 후속,
 * .md 재흡수). 산문 = 상태문(`> WIKI_NOTE_STATUS_LINE`) 다음부터 claims 펜스/`_(항목 없음)_`/
 * `## 관계` 중 먼저 나오는 것 직전까지의 본문(trim). 상태문이 없거나(5종 허브·비노트) 산문이
 * 비어 있으면 "" 반환 → renderNote(note, "")는 skeleton과 byte 동일이라 재주입이 무해하다.
 *
 * host가 산문을 claims 위(H1 본문)에 둔다는 SKILL 계약에만 의존 — claims·관계 절은 엔진이
 * 재생성하므로 추출 대상이 아니다.
 *
 * 한계(의도된, 수렴·무손상): 종료 마커는 **줄 전체 정확 일치**(`startsWith` 아님)라 `## 관계
 * 모델` 같은 실제 헤딩은 안전하나, 산문에 **단독 줄** `## 관계`/`<!-- claims -->`/`_(항목 없음)_`
 * (코드펜스 안 포함)가 있으면 그 줄부터 잘린다. 결과는 1회 후 안정(중복·claims 누출 없음).
 * → SKILL이 "노트 산문에 이 마커 줄을 단독으로 두지 말 것"을 host에게 안내한다.
 */
export function extractProse(md: string): string {
  const lines = md.split("\n");
  const statusLine = `> ${WIKI_NOTE_STATUS_LINE}`;
  const start = lines.indexOf(statusLine);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (PROSE_TERMINATORS.includes(lines[i].trim())) { end = i; break; }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}
