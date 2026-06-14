import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanDomainMap } from "./extract.js";
import { buildBundles, DomainBundleSchema, DEFAULT_BUNDLE_CHAR_CAP } from "./bundle.js";
import { stableJson } from "./persist.js";

// bundle.ts 직접 커버리지 (charCap 생략 거동 — fill-pipeline.test는 happy-path만).
// ⚠️ charCap은 현재 **slice.text.length만** 계상하고 kgHint(summary/tags) 오버헤드는
//    제외한다(미해결 의미론 부채 — handoff "실프로젝트 재평가" 보류). 아래 "#9" 테스트는
//    **실제 kgHint가 존재하는** 픽스처에서 그 거동을 고정한다 → 향후 kgHint 계상 수정은
//    이 테스트를 **반드시 깨뜨리므로** 의식적인 변경이 된다.

let root: string;

const ORDER_SVC = "src/main/java/shop/service/OrderService.java";
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
  [ORDER_SVC]: `package shop.service;
public class OrderService {
  /** 주문은 회원만 생성할 수 있다. */
  public void create() {}
}`,
};

// kgHint 오버헤드가 "계상된다면" cap을 넘기기에 충분히 긴 summary(슬라이스 텍스트 합과
// 같은 cap에서 한 파일이라도 밀려나게).
const LONG_SUMMARY = "주문 서비스. ".repeat(40); // ~320자

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ktds-bundle-"));
  for (const [rel, content] of Object.entries(FILES)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), content, "utf-8");
  }
  // KG 힌트 픽스처 — OrderService 파일 노드에 비어있지 않은 summary/tags.
  await mkdir(join(root, ".understand-anything"), { recursive: true });
  await writeFile(
    join(root, ".understand-anything", "knowledge-graph.json"),
    JSON.stringify({ nodes: [{ type: "file", filePath: ORDER_SVC, summary: LONG_SUMMARY, tags: ["domain", "order"] }] }),
    "utf-8",
  );
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test("기본 charCap: 모든 파일 슬라이스 채워짐, sliceOmitted 비어있음, kgHint 주입", async () => {
  const r = await scanDomainMap(root, { autoApprove: true });
  const { bundles } = await buildBundles(root, r.skeleton!);
  const order = bundles.find((b) => b.key === "order")!;
  expect(order.sliceOmitted).toEqual([]);
  for (const f of order.files) expect(f.slice).not.toBeNull();
  // KG 힌트가 실제로 주입됨(다음 #9 테스트의 전제)
  const svc = order.files.find((f) => f.relPath === ORDER_SVC)!;
  expect(svc.kgHint?.summary).toBe(LONG_SUMMARY);
  for (const b of bundles) expect(() => DomainBundleSchema.parse(b)).not.toThrow();
});

test("charCap=0: 모든 파일 슬라이스 생략(slice=null) + sliceOmitted에 전건 보고", async () => {
  const r = await scanDomainMap(root, { autoApprove: true });
  const { bundles } = await buildBundles(root, r.skeleton!, { charCap: 0 });
  const order = bundles.find((b) => b.key === "order")!;
  expect(order.files.length).toBeGreaterThan(0);
  for (const f of order.files) expect(f.slice).toBeNull(); // 조용한 누락 금지 — null로 명시
  expect(order.sliceOmitted).toEqual(order.files.map((f) => f.relPath)); // 정렬된 relPath 전건
  expect([...order.sliceOmitted]).toEqual([...order.sliceOmitted].sort());
});

test("charCap은 slice.text.length만 계상(kgHint ~320자 제외) — #9 현재 거동 고정", async () => {
  const r = await scanDomainMap(root, { autoApprove: true });
  // cap = 채워진 슬라이스 텍스트 총합. kgHint를 함께 셌다면 ~320자 초과로 한 파일이 밀려난다.
  const { bundles } = await buildBundles(root, r.skeleton!, { charCap: DEFAULT_BUNDLE_CHAR_CAP });
  const order = bundles.find((b) => b.key === "order")!;
  const svc = order.files.find((f) => f.relPath === ORDER_SVC)!;
  expect(svc.kgHint?.summary.length).toBeGreaterThan(300); // 힌트 오버헤드가 실재
  const sliceChars = order.files.reduce((n, f) => n + (f.slice?.text.length ?? 0), 0);
  const refit = await buildBundles(root, r.skeleton!, { charCap: sliceChars });
  const orderRefit = refit.bundles.find((b) => b.key === "order")!;
  expect(orderRefit.sliceOmitted).toEqual([]); // slice.text 합 == cap → 전건 포함(kgHint 미계상 증거)
});

test("결정론: 2회 실행 byte 동일(stableJson)", async () => {
  const r = await scanDomainMap(root, { autoApprove: true });
  const a = await buildBundles(root, r.skeleton!);
  const b = await buildBundles(root, r.skeleton!);
  expect(stableJson(a.bundles)).toBe(stableJson(b.bundles));
});
