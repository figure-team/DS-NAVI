/**
 * 위키 슬러그 규약 (ADR-004 T0) — nodeUid/name → 결정론 relPath.
 *
 * 규칙: 소문자·공백→`-`·금칙문자 제거·**한글 보존**, 충돌 시 uid 꼬리표.
 * relPath는 디스크 경로(`.md` 포함). 위키링크는 `toWikiTarget`로 `.md`를 뗀다
 * (옵시디언/파서 양쪽 해소 보장 — basename 충돌·확장자 미스 방지).
 */

import type { WikiLayer } from "./types.js";

/** 계층 → 하위 폴더. overview(허브)는 docs 루트 0N.md라 슬러그 대상 아님. */
const LAYER_DIR: Record<WikiLayer, string> = {
  overview: "",
  feature: "feature",
  api: "api",
  table: "table",
  step: "feature/step",
};

export function layerDir(layer: WikiLayer): string {
  return LAYER_DIR[layer];
}

/**
 * 결정론 슬러그: trim → 소문자 → 공백류→`-` → 금칙문자 제거(한글·영숫자·`-_`만 보존)
 * → 중복 `-` 접기 → 양끝 `-` 제거. 빈 결과는 `untitled`.
 *
 * `.`는 보존하지 않는다 — `name`이 `foo.md`면 relPath가 `foo.md.md`가 되고 toWikiTarget이
 * 끝 `.md`만 떼어 `foo.md`(디스크 경로 불일치)가 되는 위키링크 깨짐을 차단(W4 unresolved 0).
 * 숨김파일(`.foo`) 위험도 함께 제거.
 *
 * 보존 유니코드: 한글 음절(가-힣)·자모(ㄱ-ㅎ/ㅏ-ㅣ/초중종성). 그 외 비ASCII(일본어/한자
 * 등)는 제거 — 충돌 시 uid 꼬리표가 유일성을 보장하므로 안전.
 */
export function slugify(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    // 보존: 영숫자·`-_`·한글 음절(AC00-D7A3)·자모(1100-11FF)·호환자모(3130-318F)
    .replace(/[^a-z0-9\-_가-힣ᄀ-ᇿ㄰-㆏]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "untitled";
}

/** relPath(`.md` 포함)에서 위키링크용 타겟(`.md` 없이)으로. */
export function toWikiTarget(relPath: string): string {
  return relPath.replace(/\.md$/, "");
}

/** 충돌 미고려 base relPath(`.md` 포함). */
function baseRelPath(layer: WikiLayer, slug: string): string {
  const dir = LAYER_DIR[layer];
  return dir ? `${dir}/${slug}.md` : `${slug}.md`;
}

/** relPath 배정 입력. */
export interface SlugEntry {
  nodeUid: string;
  layer: WikiLayer;
  /** 슬러그 원천(노드 name). */
  name: string;
}

/**
 * 결정론·충돌 안전 relPath 배정 → Map<nodeUid, relPath(`.md` 포함)>.
 *
 * 배정 순서는 uid 사전순(입력 순서 무관 → byte-diff=0). 같은 (layer, slug) 충돌 시
 * uid 꼬리표(`<slug>-<uid슬러그>`)로 분기, 그래도 충돌하면 순번. 폴더가 다르면(layer
 * 상이) base가 달라 충돌 아님.
 */
export function assignRelPaths(entries: SlugEntry[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  const sorted = [...entries].sort((a, b) =>
    a.nodeUid < b.nodeUid ? -1 : a.nodeUid > b.nodeUid ? 1 : 0,
  );
  for (const e of sorted) {
    const slug = slugify(e.name);
    let rel = baseRelPath(e.layer, slug);
    if (used.has(rel)) {
      const tagged = `${slug}-${slugify(e.nodeUid)}`;
      rel = baseRelPath(e.layer, tagged);
      let k = 2;
      while (used.has(rel)) {
        rel = baseRelPath(e.layer, `${tagged}-${k}`);
        k++;
      }
    }
    used.add(rel);
    out.set(e.nodeUid, rel);
  }
  return out;
}
