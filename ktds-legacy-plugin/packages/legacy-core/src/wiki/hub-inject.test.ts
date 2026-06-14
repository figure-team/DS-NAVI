import { describe, expect, test } from "vitest";
import {
  injectHubLinks,
  WIKI_LINKS_FENCE_OPEN,
  WIKI_LINKS_FENCE_CLOSE,
} from "./hub-inject.js";
import type { WikiLink } from "./types.js";

const links: WikiLink[] = [
  { targetRelPath: "feature/account", label: "계정" },
  { targetRelPath: "feature/order", label: "주문" },
];

describe("injectHubLinks — 최초 주입 (마커 없음)", () => {
  test("본문 끝에 펜스 블록 추가", () => {
    const raw = "# 허브\n\n내용입니다.";
    const out = injectHubLinks(raw, links);
    expect(out).toContain(WIKI_LINKS_FENCE_OPEN);
    expect(out).toContain(WIKI_LINKS_FENCE_CLOSE);
    expect(out).toContain("## 세분화 항목");
  });

  test("링크 항목 포함", () => {
    const out = injectHubLinks("# 허브", links);
    expect(out).toContain("- [[feature/account|계정]]");
    expect(out).toContain("- [[feature/order|주문]]");
  });

  test("링크 targetRelPath 사전순 정렬", () => {
    const unordered: WikiLink[] = [
      { targetRelPath: "feature/order", label: "주문" },
      { targetRelPath: "feature/account", label: "계정" },
    ];
    const out = injectHubLinks("# 허브", unordered);
    const accountIdx = out.indexOf("feature/account");
    const orderIdx = out.indexOf("feature/order");
    expect(accountIdx).toBeLessThan(orderIdx);
  });

  test("빈 링크 배열 → _(세분화 항목 없음)_ 출력", () => {
    const out = injectHubLinks("# 허브", []);
    expect(out).toContain("_(세분화 항목 없음)_");
    expect(out).toContain(WIKI_LINKS_FENCE_OPEN);
  });

  test("기존 본문 trailing newline 정리 후 추가", () => {
    const out = injectHubLinks("# 허브\n\n", links);
    // 이중 개행이 적절히 처리됨
    expect(out).not.toMatch(/\n{3,}/);
  });
});

describe("injectHubLinks — 재주입 (마커 있음, 멱등)", () => {
  test("기존 펜스 내용 교체", () => {
    const initial = injectHubLinks("# 허브\n\n내용.", links);
    const newLinks: WikiLink[] = [{ targetRelPath: "feature/payment", label: "결제" }];
    const updated = injectHubLinks(initial, newLinks);
    expect(updated).toContain("feature/payment");
    expect(updated).not.toContain("feature/account");
    // 펜스가 중복되지 않음
    expect(updated.indexOf(WIKI_LINKS_FENCE_OPEN)).toBe(updated.lastIndexOf(WIKI_LINKS_FENCE_OPEN));
  });

  test("동일 (hub, links) → 완전히 동일한 출력 (멱등)", () => {
    const first = injectHubLinks("# 허브\n\n내용.", links);
    const second = injectHubLinks(first, links);
    expect(second).toBe(first);
  });

  test("2회 적용해도 byte 동일", () => {
    const once = injectHubLinks("# 허브", links);
    const twice = injectHubLinks(once, links);
    expect(twice).toBe(once);
  });

  test("빈 링크로 교체 → _(세분화 항목 없음)_ 로 교체", () => {
    const withLinks = injectHubLinks("# 허브", links);
    const cleared = injectHubLinks(withLinks, []);
    expect(cleared).toContain("_(세분화 항목 없음)_");
    expect(cleared).not.toContain("feature/account");
  });
});

describe("injectHubLinks — 결정론", () => {
  test("동일 입력 → 동일 출력", () => {
    const a = injectHubLinks("# 허브\n\n내용.", links);
    const b = injectHubLinks("# 허브\n\n내용.", links);
    expect(a).toBe(b);
  });
});
