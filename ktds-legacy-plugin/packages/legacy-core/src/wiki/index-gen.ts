/**
 * index.md 생성기 (ADR-004 T4) — 폴더 미러링 진입 문서.
 *
 * **옵시디언/`/understand-knowledge`(Karpathy 파서) 편의용** — 우리 대시보드 경로는
 * ID10 직접 emit이라 index.md에 비의존. 파서 감지(index.md 존재 + .md ≥3) 충족 +
 * `##` 섹션=토픽 / 그 아래 `[[링크]]`=categorized_under 엣지. 결정론(relPath 사전순).
 */

import type { WikiLayer, WikiNote } from "./types.js";
import { toWikiTarget } from "./slug.js";
import { HUB_DEFS } from "./hubs.js";

/** 계층 → 섹션 제목(출력 순서). overview는 허브 고정 섹션이라 별도 처리. */
const LAYER_SECTIONS: ReadonlyArray<{ layer: WikiLayer; heading: string }> = [
  { layer: "feature", heading: "기능" },
  { layer: "api", heading: "API" },
  { layer: "table", heading: "DB" },
  { layer: "step", heading: "단계" },
];

function bullet(target: string, title: string): string {
  // 별칭 형식 [[target|title]] — 파서는 [[target]]로 categorized_under 도출, 사람은 제목 확인.
  return target === title ? `- [[${target}]]` : `- [[${target}|${title}]]`;
}

/**
 * notes → index.md 본문. 개요(허브 5종) + 기능/API/DB(+단계) 섹션, 각 항목 위키링크.
 * 빈 계층 섹션은 생략(파서 토픽 노이즈 방지). 같은 입력 → 같은 출력.
 */
export function buildIndex(notes: WikiNote[]): string {
  const lines: string[] = ["# 코드 지식 베이스", ""];

  lines.push("## 개요", "");
  for (const h of HUB_DEFS) lines.push(bullet(h.target, h.title));
  lines.push("");

  for (const { layer, heading } of LAYER_SECTIONS) {
    const inLayer = notes
      .filter((n) => n.layer === layer)
      .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
    if (inLayer.length === 0) continue;
    lines.push(`## ${heading}`, "");
    for (const n of inLayer) lines.push(bullet(toWikiTarget(n.relPath), n.title));
    lines.push("");
  }

  return lines.join("\n").replace(/\n+$/, "\n");
}
