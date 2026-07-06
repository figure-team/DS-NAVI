import { describe, expect, it } from "vitest";

import {
  EMPTY_FLOW_FILTER,
  filterFlows,
  flowVerdictKey,
  hasBusinessFlow,
  isFilterActive,
  resolveWorkspaceView,
  type DomainFlow,
  type FlowFilter,
} from "../domainData";
import type { GraphNode } from "@understand-anything/core/types";

/** 최소 DomainFlow 픽스처 — §4-2 필터는 name/path/method/entryType/grounding만 본다. */
function flow(over: Partial<DomainFlow>): DomainFlow {
  return {
    id: "flow:x",
    method: "GET",
    path: "/x",
    name: "x",
    desc: "",
    stepCount: 0,
    entryType: "http",
    grounding: null,
    ...over,
  };
}

const FLOWS: DomainFlow[] = [
  flow({ id: "f1", name: "주문 생성", path: "/actions/Order.action?newOrder", method: "POST" }),
  flow({
    id: "f2",
    name: "주문 조회",
    path: "/actions/Order.action?viewOrder",
    method: "GET",
    grounding: { verdict: "GROUNDED", citations: [] },
  }),
  flow({
    id: "f3",
    name: "야간 정산",
    path: "settleJob",
    method: "BATCH",
    entryType: "cron",
    grounding: { verdict: "NEEDS_REVIEW", citations: [] },
  }),
];

function f(over: Partial<FlowFilter>): FlowFilter {
  return { ...EMPTY_FLOW_FILTER, ...over };
}

describe("filterFlows (§4-2 클라이언트 필터)", () => {
  it("빈 필터는 전량 통과(순서 보존)", () => {
    expect(filterFlows(FLOWS, EMPTY_FLOW_FILTER).map((x) => x.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("검색어는 이름/경로/메소드 부분일치(대소문자 무시)", () => {
    expect(filterFlows(FLOWS, f({ query: "주문" })).map((x) => x.id)).toEqual(["f1", "f2"]);
    expect(filterFlows(FLOWS, f({ query: "vieworder" })).map((x) => x.id)).toEqual(["f2"]);
    expect(filterFlows(FLOWS, f({ query: "post" })).map((x) => x.id)).toEqual(["f1"]);
    expect(filterFlows(FLOWS, f({ query: "없는말" }))).toEqual([]);
  });

  it("그룹 칩은 entryType 버킷 기준", () => {
    expect(filterFlows(FLOWS, f({ groups: new Set(["batch"]) })).map((x) => x.id)).toEqual(["f3"]);
    expect(filterFlows(FLOWS, f({ groups: new Set(["http"]) })).map((x) => x.id)).toEqual(["f1", "f2"]);
  });

  it("메소드·verdict 칩(미채움 = none 버킷) + AND 결합", () => {
    expect(filterFlows(FLOWS, f({ methods: new Set(["GET"]) })).map((x) => x.id)).toEqual(["f2"]);
    expect(filterFlows(FLOWS, f({ verdicts: new Set(["none"]) })).map((x) => x.id)).toEqual(["f1"]);
    expect(
      filterFlows(FLOWS, f({ query: "주문", verdicts: new Set(["GROUNDED"]) })).map((x) => x.id),
    ).toEqual(["f2"]);
  });

  it("같은 파셋 안에서 다중 선택은 OR", () => {
    expect(
      filterFlows(FLOWS, f({ methods: new Set(["GET", "BATCH"]) })).map((x) => x.id),
    ).toEqual(["f2", "f3"]);
  });

  it("isFilterActive — 공백 검색어는 비활성", () => {
    expect(isFilterActive(EMPTY_FLOW_FILTER)).toBe(false);
    expect(isFilterActive(f({ query: "  " }))).toBe(false);
    expect(isFilterActive(f({ query: "a" }))).toBe(true);
    expect(isFilterActive(f({ groups: new Set(["http"]) }))).toBe(true);
  });

  it("flowVerdictKey — grounding 없으면 none", () => {
    expect(flowVerdictKey(FLOWS[0])).toBe("none");
    expect(flowVerdictKey(FLOWS[1])).toBe("GROUNDED");
    expect(flowVerdictKey(FLOWS[2])).toBe("NEEDS_REVIEW");
  });
});

describe("resolveWorkspaceView (§3 탭 해석 — URL이 진실)", () => {
  it("명시 ?view= 이 최우선", () => {
    expect(resolveWorkspaceView("business", "flow:x", false)).toBe("business");
    expect(resolveWorkspaceView("code", null, true)).toBe("code");
  });

  it("알 수 없는 view 값은 미지정과 동일하게 폴백", () => {
    expect(resolveWorkspaceView("banana", null, false)).toBe("code");
    expect(resolveWorkspaceView("banana", null, true)).toBe("business");
  });

  it("기존 ?flow= 딥링크는 code 탭(하위호환 파손 0)", () => {
    expect(resolveWorkspaceView(null, "flow:order-create", true)).toBe("code");
  });

  it("미지정: businessFlow 있으면 business, 없으면 code(기존 동작)", () => {
    expect(resolveWorkspaceView(null, null, true)).toBe("business");
    expect(resolveWorkspaceView(null, null, false)).toBe("code");
  });
});

describe("hasBusinessFlow (P4 데이터 전방 배선)", () => {
  const node = (domainMeta?: unknown): GraphNode =>
    ({ id: "domain:d", type: "domain", name: "d", summary: "", domainMeta }) as GraphNode;

  it("businessFlow.nodes 비어있지 않을 때만 true", () => {
    expect(hasBusinessFlow(undefined)).toBe(false);
    expect(hasBusinessFlow(node())).toBe(false);
    expect(hasBusinessFlow(node({ businessFlow: {} }))).toBe(false);
    expect(hasBusinessFlow(node({ businessFlow: { nodes: [] } }))).toBe(false);
    expect(hasBusinessFlow(node({ businessFlow: { nodes: [{ id: "start" }] } }))).toBe(true);
  });
});
