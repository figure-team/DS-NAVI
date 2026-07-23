import { describe, expect, it } from "vitest";
import { computeImpactFileDelta, type ImpactSnapshot } from "../rtm/types";

const snap = (up: string[], down: string[]): ImpactSnapshot => ({
  upstream: { files: up.map((relPath) => ({ relPath })) },
  downstream: { files: down.map((relPath) => ({ relPath })) },
});

describe("computeImpactFileDelta (EXPLORE_PROMOTION 델타 뷰)", () => {
  it("상·하류 합집합 기준으로 추가/제외를 가르고 정렬한다", () => {
    const origin = snap(["a.java", "b.java"], ["m.xml"]);
    const current = snap(["b.java", "z.java"], ["m.xml", "n.xml"]);
    expect(computeImpactFileDelta(origin, current)).toEqual({
      added: ["n.xml", "z.java"],
      removed: ["a.java"],
    });
  });

  it("동일 집합이면 빈 델타 — 상/하류 사이의 이동은 차이가 아니다(합집합 비교)", () => {
    const origin = snap(["a.java"], ["b.xml"]);
    const current = snap(["b.xml"], ["a.java"]);
    expect(computeImpactFileDelta(origin, current)).toEqual({ added: [], removed: [] });
  });

  it("스냅샷 부재/빈 필드는 빈 집합으로 관용 처리한다", () => {
    expect(computeImpactFileDelta(null, snap(["a.java"], []))).toEqual({ added: ["a.java"], removed: [] });
    expect(computeImpactFileDelta(snap(["a.java"], []), undefined)).toEqual({ added: [], removed: ["a.java"] });
    expect(computeImpactFileDelta({}, {})).toEqual({ added: [], removed: [] });
  });
});
