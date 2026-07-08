import { describe, expect, it } from "vitest";
import { buildFormMergeMap } from "../domainData";
import type { GraphNode } from "@understand-anything/core/types";

/** 최소 flow 노드 픽스처 — 병합 판정은 id/type/entryPoint 만 본다. */
const flow = (id: string, entryPoint?: string): GraphNode =>
  ({ id, type: "flow", name: id, summary: "", domainMeta: entryPoint ? { entryPoint } : {} }) as GraphNode;

describe("buildFormMergeMap — 폼 표시 흐름 병합(A안)", () => {
  it("같은 베이스 URL에 처리 흐름이 실존하는 ?xxxForm 만 접는다", () => {
    const map = buildFormMergeMap([
      flow("flow:ANY /actions/Account.action?editAccount"),
      flow("flow:ANY /actions/Account.action?editAccountForm"),
      flow("flow:ANY /actions/Order.action?newOrder"),
      flow("flow:ANY /actions/Order.action?newOrderForm"),
      // 짝 없는 Form — 독립 기능으로 유지되어야 한다.
      flow("flow:ANY /actions/Feedback.action?surveyForm"),
      // Form 접미사 없음 — 대상 아님.
      flow("flow:ANY /actions/Account.action?signon"),
    ]);
    expect(map.get("flow:ANY /actions/Account.action?editAccountForm")).toBe(
      "flow:ANY /actions/Account.action?editAccount",
    );
    expect(map.get("flow:ANY /actions/Order.action?newOrderForm")).toBe(
      "flow:ANY /actions/Order.action?newOrder",
    );
    expect(map.size).toBe(2);
  });

  it("베이스 라우트(@DefaultHandler)도 핸들러명이 …Form 이고 짝이 있으면 접는다", () => {
    const map = buildFormMergeMap([
      // Account.action 의 @DefaultHandler = signonForm → ?signon 에 병합.
      flow("flow:ANY /actions/Account.action", "AccountActionBean#signonForm"),
      flow("flow:ANY /actions/Account.action?signon", "AccountActionBean#signon"),
      // 핸들러명이 Form 이 아니면(실제 메인 화면) 유지.
      flow("flow:ANY /actions/Catalog.action", "CatalogActionBean#viewMain"),
    ]);
    expect(map.get("flow:ANY /actions/Account.action")).toBe(
      "flow:ANY /actions/Account.action?signon",
    );
    expect(map.size).toBe(1);
  });

  it("짝 없는 베이스 폼과 비-http id 는 건드리지 않는다", () => {
    const map = buildFormMergeMap([
      // 핸들러는 Form 이지만 ?signoff 처리 흐름이 없음 — 독립 유지.
      flow("flow:ANY /actions/Feedback.action", "FeedbackActionBean#surveyForm"),
      flow("flow:batch:NightlySettleJob"),
      flow("flow:order-create"), // 슬러그형 데모 id
    ]);
    expect(map.size).toBe(0);
  });
});
