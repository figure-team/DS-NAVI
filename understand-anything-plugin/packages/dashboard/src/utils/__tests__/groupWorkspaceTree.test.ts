import { describe, it, expect } from "vitest";
import {
  activeLeafKey,
  buildTreeFlowItems,
  filterTreeDomains,
  matchesTreeQuery,
  type TreeDomainNode,
} from "../groupWorkspaceTree";
import type { BizProcess } from "../businessFlow";

const labels = {
  defaultTitle: (n: number) => `프로세스 ${n}`,
  fallbackTitle: "순차 근사 (전체 기능)",
};

const emptyFlow = { nodes: [], edges: [], fallback: false };

describe("buildTreeFlowItems", () => {
  it("실제 프로세스가 있으면 제목 그대로(무제목은 defaultTitle 순번)", () => {
    const processes: BizProcess[] = [
      { index: 0, title: "가입 처리", flow: emptyFlow },
      { index: 1, title: null, flow: emptyFlow },
    ];
    const items = buildTreeFlowItems("domain:member", processes, true, labels);
    expect(items).toEqual([
      { key: "domain:member::0", domainId: "domain:member", bfIndex: 0, title: "가입 처리" },
      { key: "domain:member::1", domainId: "domain:member", bfIndex: 1, title: "프로세스 2" },
    ]);
  });

  it("프로세스 전무 + 기능 있음 -> 순차 근사 리프 1건(bfIndex=null)", () => {
    const items = buildTreeFlowItems("domain:x", [], true, labels);
    expect(items).toEqual([
      { key: "domain:x::fallback", domainId: "domain:x", bfIndex: null, title: "순차 근사 (전체 기능)" },
    ]);
  });

  it("프로세스도 기능도 전무 -> 빈 배열", () => {
    expect(buildTreeFlowItems("domain:empty", [], false, labels)).toEqual([]);
  });
});

describe("activeLeafKey", () => {
  it("실제 프로세스 보유 도메인은 클램프된 인덱스로 키를 만든다", () => {
    expect(activeLeafKey("domain:cart", true, 2)).toBe("domain:cart::2");
  });

  it("실제 프로세스가 없는 도메인은 fallback 키로 통일", () => {
    expect(activeLeafKey("domain:cart", false, 0)).toBe("domain:cart::fallback");
  });
});

describe("matchesTreeQuery", () => {
  const items = [
    { key: "domain:cart::0", domainId: "domain:cart", bfIndex: 0, title: "결제 처리" },
    { key: "domain:cart::1", domainId: "domain:cart", bfIndex: 1, title: "장바구니 담기" },
  ];

  it("빈 질의는 항상 매치", () => {
    expect(matchesTreeQuery("장바구니", items, "")).toBe(true);
    expect(matchesTreeQuery("장바구니", items, "   ")).toBe(true);
  });

  it("도메인명 부분일치", () => {
    expect(matchesTreeQuery("장바구니", items, "바구")).toBe(true);
  });

  it("하위 흐름 제목 부분일치(도메인명은 불일치)", () => {
    expect(matchesTreeQuery("결제", items, "담기")).toBe(true);
  });

  it("대소문자 무시(영문 제목)", () => {
    const enItems = [{ key: "k", domainId: "d", bfIndex: 0, title: "Checkout Flow" }];
    expect(matchesTreeQuery("Cart", enItems, "checkout")).toBe(true);
  });

  it("아무 데도 없으면 불일치", () => {
    expect(matchesTreeQuery("장바구니", items, "존재하지않음")).toBe(false);
  });
});

describe("filterTreeDomains", () => {
  const domains: TreeDomainNode[] = [
    {
      id: "domain:cart",
      name: "장바구니",
      icon: "🛒",
      flowCount: 2,
      items: [{ key: "domain:cart::0", domainId: "domain:cart", bfIndex: 0, title: "결제 처리" }],
    },
    {
      id: "domain:account",
      name: "회원",
      icon: "👤",
      flowCount: 1,
      items: [{ key: "domain:account::0", domainId: "domain:account", bfIndex: 0, title: "가입" }],
    },
  ];

  it("질의 없으면 전부 유지(순서 보존)", () => {
    expect(filterTreeDomains(domains, "")).toEqual(domains);
  });

  it("도메인명 또는 하위 흐름 제목 매칭 도메인만 남긴다", () => {
    expect(filterTreeDomains(domains, "가입").map((d) => d.id)).toEqual(["domain:account"]);
    expect(filterTreeDomains(domains, "결제").map((d) => d.id)).toEqual(["domain:cart"]);
  });

  it("매칭 없으면 빈 배열", () => {
    expect(filterTreeDomains(domains, "존재하지않음")).toEqual([]);
  });
});
