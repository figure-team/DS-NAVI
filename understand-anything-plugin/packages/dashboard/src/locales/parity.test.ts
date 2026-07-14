import { describe, it, expect } from "vitest";
import { locales, type LocaleKey } from "./index";

/**
 * 로케일 패리티 — structure/groupWorkspace 키 누락은 런타임에 `t.structure.xxx`가
 * undefined가 돼 텍스트가 깨지거나(최악의 경우 그 값을 바로 렌더하는 곳에서 크래시)
 * 조용히 빈 문자열로 넘어간다. 적대적 리뷰에서 "6개 로케일 키 누락 크래시" 오탐이
 * 나왔던 것 자체가 이 불변식을 자동으로 지키는 테스트가 없었다는 신호 — 이 테스트가
 * 그 논쟁을 영구 종결한다(ko를 기준 삼아 나머지 5개 로케일의 키 집합을 비교).
 */
const REFERENCE: LocaleKey = "ko";
const BLOCKS = ["structure", "groupWorkspace"] as const;

describe("locale parity — structure/groupWorkspace key sets", () => {
  const referenceLocale = locales[REFERENCE];

  for (const key of Object.keys(locales) as LocaleKey[]) {
    if (key === REFERENCE) continue;

    for (const block of BLOCKS) {
      it(`${key}.${block} has the same keys as ${REFERENCE}.${block}`, () => {
        const expectedKeys = Object.keys(referenceLocale[block]).sort();
        const actualKeys = Object.keys(locales[key][block]).sort();
        expect(actualKeys).toEqual(expectedKeys);
      });
    }
  }
});
