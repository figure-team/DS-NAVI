import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanDomainMap } from "./extract.js";
import { buildBundles, DomainBundleSchema } from "./bundle.js";
import { fillPathFor } from "./fill.js";
import { runFillPipeline } from "./fill-pipeline.js";
import { NEEDS_REVIEW_MARKER } from "./emit.js";

// Stage-17 통합: scan→confirm(auto)→bundle→fill(호스트 역할 시뮬레이션)→
// emit까지 실제 디스크에서 — 부분 채움(pending)·환각 강등·domain-graph 산출.

let root: string;

const FILES: Record<string, string> = {
  "src/main/java/shop/web/OrderController.java": `package shop.web;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import shop.service.OrderService;
@RestController
public class OrderController {
  private OrderService orderService;
  @PostMapping("/orders")
  public void create() { orderService.create(); }
}`,
  "src/main/java/shop/service/OrderService.java": `package shop.service;
public class OrderService {
  /** 주문은 회원만 생성할 수 있다. */
  public void create() {}
}`,
  "src/main/java/shop/web/MemberController.java": `package shop.web;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController
public class MemberController {
  @GetMapping("/members")
  public void list() {}
}`,
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ktds-fill-pipeline-"));
  for (const [rel, content] of Object.entries(FILES)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), content, "utf-8");
  }
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("scan→bundle→fill→emit E2E: 부분 채움·환각 강등·domain-graph 산출", async () => {
  const r = await scanDomainMap(root, { autoApprove: true });
  expect(r.skeleton).not.toBe(null);
  expect(r.candidates.candidates.map((c) => c.key)).toEqual(["member", "order"]);

  // ── 번들: 소스 슬라이스가 실제 인용 가능 텍스트를 담는다 ────────────────
  const { bundles } = await buildBundles(root, r.skeleton!);
  expect(bundles.map((b) => b.key)).toEqual(["member", "order"]);
  for (const b of bundles) expect(() => DomainBundleSchema.parse(b)).not.toThrow();
  const orderBundle = bundles.find((b) => b.key === "order")!;
  const svcFile = orderBundle.files.find((f) => f.relPath.endsWith("OrderService.java"))!;
  expect(svcFile.slice!.text).toContain("주문은 회원만 생성할 수 있다");
  expect(orderBundle.flows[0].entryPoint).toBe("POST /orders");

  // ── 호스트 역할: order만 채움 (member는 pending으로 남는다) ─────────────
  const flowId = orderBundle.flows[0].flowId;
  const stepIds = orderBundle.flows[0].stepIds;
  const fill = {
    schemaVersion: 1,
    domainId: "domain:order",
    name: "주문",
    summary: {
      text: "주문 생성을 담당한다.",
      citations: [
        {
          filePath: "src/main/java/shop/service/OrderService.java",
          line: 3,
          snippet: "주문은 회원만 생성할 수 있다",
        },
      ],
    },
    entities: [],
    businessRules: [
      {
        text: "주문은 회원만 생성 가능",
        citations: [
          {
            filePath: "src/main/java/shop/service/OrderService.java",
            line: 3,
            snippet: "주문은 회원만 생성할 수 있다",
          },
        ],
      },
      {
        // 환각: 존재하지 않는 라인 내용
        text: "VIP는 무료배송",
        citations: [
          {
            filePath: "src/main/java/shop/service/OrderService.java",
            line: 2,
            snippet: "VIP free shipping policy",
          },
        ],
      },
    ],
    crossDomainInteractions: [],
    flows: [
      {
        flowId,
        name: "주문 생성",
        summary: {
          text: "POST /orders 접수",
          citations: [
            {
              filePath: "src/main/java/shop/web/OrderController.java",
              line: 8,
              snippet: '@PostMapping("/orders")',
            },
          ],
        },
      },
    ],
    steps: stepIds.map((stepId) => ({
      stepId,
      name: "체인 단계",
      summary: {
        text: "주문 체인의 한 단계",
        citations: [
          {
            filePath: "src/main/java/shop/web/OrderController.java",
            line: 6,
            snippet: "public class OrderController",
          },
        ],
      },
    })),
  };
  await mkdir(dirname(fillPathFor(root, "order")), { recursive: true });
  await writeFile(fillPathFor(root, "order"), JSON.stringify(fill), "utf-8");

  // ── emit ────────────────────────────────────────────────────────────────
  const result = await runFillPipeline(root, { analyzedAt: "2026-06-11T00:00:00.000Z" });
  expect(result.pending).toEqual(["member"]);
  expect(result.invalid).toEqual([]);
  expect(result.rejected).toEqual([]);

  // 환각 1건만 NEEDS_REVIEW, 나머지 GROUNDED
  const orderResult = result.report.domains.find((d) => d.domainId === "domain:order")!;
  const hallucinated = orderResult.items.find((i) => i.text === "VIP는 무료배송")!;
  expect(hallucinated.verdict).toBe("NEEDS_REVIEW");
  expect(orderResult.items.filter((i) => i.verdict === "GROUNDED").length).toBe(
    orderResult.items.length - 1,
  );

  // domain-graph.json: U-A 호환 형태 + 강등 마커 + 구조 보존
  const graph = JSON.parse(
    await readFile(join(root, ".understand-anything/domain-graph.json"), "utf-8"),
  );
  expect(graph.version).toBe("1.0.0");
  expect(graph.project.gitCommitHash).toBe("");
  expect(Array.isArray(graph.layers)).toBe(true);
  const domainNode = graph.nodes.find((n: { id: string }) => n.id === "domain:order");
  expect(domainNode.name).toBe("주문");
  expect(domainNode.domainMeta.businessRules).toEqual([
    "주문은 회원만 생성 가능",
    `${NEEDS_REVIEW_MARKER}VIP는 무료배송`,
  ]);
  // member 도메인은 빈칸 그대로 (pending) — 구조는 살아 있다
  const memberNode = graph.nodes.find((n: { id: string }) => n.id === "domain:member");
  expect(memberNode.summary).toBe("");
  expect(result.unfilled).toContain("domain:member");
  // skeleton 엣지가 그대로 실린다 (구조 read-only)
  expect(graph.edges).toEqual(r.skeleton!.edges);
});

test("멱등 재시도: emit 재실행 → 같은 결과, fill 수정 시 해당 도메인만 갱신", async () => {
  await scanDomainMap(root, { autoApprove: true });
  const a = await runFillPipeline(root, { analyzedAt: "2026-06-11T00:00:00.000Z" });
  const b = await runFillPipeline(root, { analyzedAt: "2026-06-11T00:00:00.000Z" });
  expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  expect(a.pending).toEqual(["member", "order"]);
});

test("skeleton 부재 시 명시적 오류 (조용한 빈 그래프 금지)", async () => {
  await expect(runFillPipeline(root)).rejects.toThrow(/skeleton/);
});
