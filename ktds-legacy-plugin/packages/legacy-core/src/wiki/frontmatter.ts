/**
 * frontmatter 직렬화 (ADR-004 T0) — colon-safe YAML.
 *
 * 파서(`extract_frontmatter`)가 1차로 `:` split하므로 값에 `:`가 들어가면 인용 부호로
 * 감싼다(옵시디언 호환). 키 순서는 입력 객체의 삽입 순서를 그대로 보존(결정론 —
 * 호출부가 결정론 순서로 빌드).
 */

import type { FrontmatterValue } from "./types.js";

/** YAML 평문으로 안전하지 않으면 큰따옴표로 인용(이스케이프 포함). */
function quoteIfNeeded(v: string): string {
  // colon·YAML 지시문자·양끝 공백·빈 문자열·제어문자(개행/탭) → 인용. 그 외 평문.
  const unsafe =
    v === "" ||
    /^\s|\s$/.test(v) ||
    /[:#\[\]{}&*!|>'"%@`,]/.test(v) ||
    /[\n\r\t]/.test(v) ||
    /^[-?]/.test(v);
  if (!unsafe) return v;
  // 큰따옴표 스칼라는 리터럴 개행을 못 담으므로 `\n`/`\r`/`\t`로 escape
  // (raw 개행이 들어가면 다음 키가 깨져 byte-diff/파서 계약 위반).
  return `"${v
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

/**
 * `Record<string, FrontmatterValue>` → `---\n…\n---` 블록.
 * 배열은 블록 시퀀스(`key:\n  - item`), 숫자는 평문, 문자열은 colon-safe.
 */
export function renderFrontmatter(fm: Record<string, FrontmatterValue>): string {
  const lines: string[] = ["---"];
  // 키는 삽입 순서대로 출력(결정론). 단 JS는 정수형 문자열 키("1","2"…)를
  // 숫자 정렬로 끌어올리므로 frontmatter 키는 반드시 비-정수 이름이어야 한다
  // (현재 type/title/tags/evidence 등 — 위반 시 결정론 깨짐).
  for (const key of Object.keys(fm)) {
    const val = fm[key];
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) lines.push(`  - ${quoteIfNeeded(item)}`);
    } else if (typeof val === "number") {
      lines.push(`${key}: ${val}`);
    } else {
      lines.push(`${key}: ${quoteIfNeeded(val)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
