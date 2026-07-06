import { describe, expect, it } from "vitest";

import { buildSequentialFallback, parseBusinessFlow } from "../businessFlow";
import type { DomainFlow } from "../domainData";
import type { GraphNode } from "@understand-anything/core/types";

const node = (domainMeta?: unknown): GraphNode =>
  ({ id: "domain:order", type: "domain", name: "주문", summary: "", domainMeta }) as GraphNode;

const GOOD = {
  nodes: [
    { id: "s", kind: "start", label: "시작" },
    {
      id: "a1",
      kind: "activity",
      label: "주문 접수",
      flowRef: "flow:POST /orders",
      verdict: "GROUNDED",
      citations: [{ filePath: "a/OrderCtrl.java", line: 7, snippet: "public class", status: "ok" }],
    },
    { id: "d1", kind: "decision", label: "재고 있음?", verdict: "NEEDS_REVIEW", citations: [] },
    { id: "e", kind: "end", label: "종료" },
  ],
  edges: [
    { from: "s", to: "a1" },
    { from: "a1", to: "d1" },
    { from: "d1", to: "e", label: "YES" },
  ],
};

describe("parseBusinessFlow — 방어적 파싱(§4-1)", () => {
  it("정상 형태를 타입 구조로 변환(verdict·citations·flowRef 보존)", () => {
    const biz = parseBusinessFlow(node({ businessFlow: GOOD }))!;
    expect(biz.fallback).toBe(false);
    expect(biz.nodes.map((n) => n.kind)).toEqual(["start", "activity", "decision", "end"]);
    expect(biz.nodes[1].flowRef).toBe("flow:POST /orders");
    expect(biz.nodes[1].verdict).toBe("GROUNDED");
    expect(biz.nodes[1].citations[0].status).toBe("ok");
    expect(biz.edges[2].label).toBe("YES");
  });

  it("부재/형태 이탈은 null 로 degrade(부분 렌더 금지)", () => {
    expect(parseBusinessFlow(undefined)).toBeNull();
    expect(parseBusinessFlow(node())).toBeNull();
    expect(parseBusinessFlow(node({ businessFlow: { nodes: [] } }))).toBeNull();
    // 알 수 없는 kind
    expect(
      parseBusinessFlow(
        node({ businessFlow: { nodes: [{ id: "x", kind: "banana", label: "l" }], edges: [] } }),
      ),
    ).toBeNull();
    // 끝점 미실존 엣지 — 조용히 버리지 않고 전체 폴백
    expect(
      parseBusinessFlow(
        node({
          businessFlow: {
            nodes: [{ id: "s", kind: "start", label: "시작" }],
            edges: [{ from: "s", to: "ghost" }],
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("buildSequentialFallback — 결정론 순차 근사", () => {
  const flow = (id: string, name: string): DomainFlow => ({
    id,
    method: "ANY",
    path: `/${id}`,
    name,
    desc: "",
    stepCount: 0,
    entryType: "http",
    grounding: null,
  });

  it("start → 기능(그래프 순서, flowRef 유지) → end, 분기 없음", () => {
    const biz = buildSequentialFallback([flow("flow:a", "기능A"), flow("flow:b", "기능B")], {
      start: "시작",
      end: "종료",
    });
    expect(biz.fallback).toBe(true);
    expect(biz.nodes.map((n) => n.kind)).toEqual(["start", "activity", "activity", "end"]);
    expect(biz.nodes[1].flowRef).toBe("flow:a");
    expect(biz.nodes[2].label).toBe("기능B");
    // 순차 엣지 n-1 개, 라벨 없음(분기 창작 금지)
    expect(biz.edges).toEqual([
      { from: "__start", to: "seq:flow:a" },
      { from: "seq:flow:a", to: "seq:flow:b" },
      { from: "seq:flow:b", to: "__end" },
    ]);
  });
});
