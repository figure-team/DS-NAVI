import { describe, expect, it } from "vitest";

import {
  buildSequentialFallback,
  businessFlowRejectedReason,
  parseBusinessFlow,
} from "../businessFlow";
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

  const LABELS = { start: "시작", end: "종료", more: "…외 {count}건" };

  it("start → 기능(그래프 순서, flowRef 유지) → end, 분기 없음", () => {
    const biz = buildSequentialFallback([flow("flow:a", "기능A"), flow("flow:b", "기능B")], LABELS);
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

  it("상한 초과 시 '…외 N건' 집계 노드로 접는다(침묵 절단 금지, 리뷰 C3)", () => {
    const many = Array.from({ length: 7 }, (_, i) => flow(`flow:f${i}`, `기능${i}`));
    const biz = buildSequentialFallback(many, LABELS, 3);
    // start + 3 activity + more + end
    expect(biz.nodes.map((n) => n.id)).toEqual([
      "__start", "seq:flow:f0", "seq:flow:f1", "seq:flow:f2", "__more", "__end",
    ]);
    expect(biz.nodes[4].label).toBe("…외 4건");
    expect(biz.nodes[4].flowRef).toBeUndefined();
    expect(biz.edges).toHaveLength(5);
  });
});

describe("businessFlowRejectedReason — 기각 사유 표면화(리뷰 C2)", () => {
  it("domainMeta.businessFlowRejected 를 읽고, 없으면 null", () => {
    expect(businessFlowRejectedReason(undefined)).toBeNull();
    expect(businessFlowRejectedReason(node())).toBeNull();
    expect(
      businessFlowRejectedReason(node({ businessFlowRejected: "invalid-business-flow: orphan-node: x" })),
    ).toContain("orphan-node: x");
  });
});
