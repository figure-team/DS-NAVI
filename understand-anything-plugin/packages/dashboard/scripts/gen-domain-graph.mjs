// Throwaway generator for the domain-graph.json test fixture (US-000).
// Run: node scripts/gen-domain-graph.mjs
// Writes public/domain-graph.json. Weights are full-precision i/(N+1).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/domain-graph.json");

const nodes = [];
const edges = [];

function addNode(n) {
  nodes.push({
    tags: [],
    complexity: "moderate",
    summary: n.summary ?? n.name,
    ...n,
  });
}
function addEdge(e) {
  edges.push({ direction: "forward", weight: 0.5, ...e });
}

// ── Domains ─────────────────────────────────────────────────────────────────
const domains = [
  { id: "domain:order", name: "주문", entities: ["Order", "OrderItem"] },
  { id: "domain:product", name: "상품", entities: ["Product", "Stock"] },
  { id: "domain:member", name: "회원", entities: ["Member"] },
  { id: "domain:payment", name: "결제", entities: ["Payment"] },
];
for (const d of domains) {
  addNode({
    id: d.id,
    type: "domain",
    name: d.name,
    summary: `${d.name} 도메인`,
    domainMeta: { entities: d.entities },
  });
}

// cross_domain edges (domain ↔ domain)
addEdge({ source: "domain:order", target: "domain:product", type: "cross_domain", direction: "forward", description: "주문 생성 시 재고 차감" });
addEdge({ source: "domain:order", target: "domain:payment", type: "cross_domain", direction: "forward", description: "주문 생성 시 결제 요청" });
addEdge({ source: "domain:order", target: "domain:member", type: "cross_domain", direction: "bidirectional", description: "회원 주문 이력" });

// helper: a 4-layer step chain authored for a flow
function fourLayerSteps(prefix, basePkg) {
  // [className, relPath, name] tuples spanning api→service→dao→db
  return [
    {
      id: `${prefix}:ctrl`,
      className: `${prefix.replace(/[^a-zA-Z]/g, "")}Controller`,
      relPath: `src/main/java/${basePkg}/web/OrderController.java`,
      name: "OrderController.createOrder",
      line: 42,
    },
    {
      id: `${prefix}:svc`,
      className: "OrderServiceImpl",
      relPath: `src/main/java/${basePkg}/service/impl/OrderServiceImpl.java`,
      name: "OrderServiceImpl.create",
      line: 88,
    },
    {
      id: `${prefix}:dao`,
      className: "OrderMapper",
      relPath: `src/main/java/${basePkg}/mapper/OrderMapper.java`,
      name: "OrderMapper.insertOrder",
      line: 17,
    },
    {
      id: `${prefix}:db`,
      className: null,
      relPath: `src/main/resources/sql/order/OrderMapper.xml`,
      name: "ORDER_HEADER",
      line: 1,
    },
  ];
}

// Generic flow authoring helper. Weights = i/(N+1), full precision.
function authorFlow({ domainId, flowId, flowName, entryPoint, entryType, steps }) {
  addNode({
    id: flowId,
    type: "flow",
    name: flowName,
    summary: flowName,
    domainMeta: { entryPoint, entryType },
  });
  addEdge({ source: domainId, target: flowId, type: "contains_flow" });
  const N = steps.length;
  steps.forEach((s, idx) => {
    const i = idx + 1; // 1-based
    const weight = i / (N + 1);
    addNode({
      id: s.id,
      type: "step",
      name: s.name,
      summary: s.name,
      filePath: s.relPath,
      lineRange: [s.line, s.line],
      // StepSource shape rides along via schema passthrough (deriveLayer's
      // primary signal). className may be null for pure-SQL artifacts.
      stepSource: { stepId: s.id, relPath: s.relPath, line: s.line, className: s.className },
    });
    addEdge({ source: flowId, target: s.id, type: "flow_step", weight });
  });
}

// ── Flow 1: 4-layer order creation ──────────────────────────────────────────
authorFlow({
  domainId: "domain:order",
  flowId: "flow:order-create",
  flowName: "POST /orders 주문생성",
  entryPoint: "POST /orders",
  entryType: "http",
  steps: fourLayerSteps("order-create", "com/ktds/shop/order"),
});

// ── Flow 2: contains a step that derives to `unknown` (Facade/Manager/Job) ───
authorFlow({
  domainId: "domain:payment",
  flowId: "flow:payment-settle",
  flowName: "결제 정산 배치",
  entryPoint: "settlePaymentJob",
  entryType: "cron",
  steps: [
    {
      id: "payment-settle:ctrl",
      className: "PaymentController",
      relPath: "src/main/java/com/ktds/shop/payment/web/PaymentController.java",
      name: "PaymentController.settle",
      line: 30,
    },
    {
      // Facade → intentionally `unknown` (not clean service).
      id: "payment-settle:facade",
      className: "PaymentSettlementFacade",
      relPath: "src/main/java/com/ktds/shop/payment/PaymentSettlementFacade.java",
      name: "PaymentSettlementFacade.run",
      line: 12,
    },
    {
      // BatchJob → `unknown`.
      id: "payment-settle:job",
      className: "SettlementBatchJob",
      relPath: "src/main/java/com/ktds/shop/payment/SettlementBatchJob.java",
      name: "SettlementBatchJob.execute",
      line: 55,
    },
    {
      id: "payment-settle:dao",
      className: "PaymentDao",
      relPath: "src/main/java/com/ktds/shop/payment/dao/PaymentDao.java",
      name: "PaymentDao.updateSettled",
      line: 21,
    },
    {
      id: "payment-settle:db",
      className: null,
      relPath: "src/main/resources/sql/payment/PaymentMapper.xml",
      name: "TB_PAYMENT_SETTLEMENT",
      line: 1,
    },
  ],
});

// ── Flow 3: 0-step flow (error-state fixture) ───────────────────────────────
addNode({
  id: "flow:product-empty",
  type: "flow",
  name: "상품 미구현 플로우",
  summary: "no backend steps",
  domainMeta: { entryPoint: "TBD", entryType: "manual" },
});
addEdge({ source: "domain:product", target: "flow:product-empty", type: "contains_flow" });

// ── Flow 4: malformed-weight edge (NaN-sorts-last exercise) ─────────────────
// Schema clamps weight to [0,1] (schema.ts autoFixGraph 335-344) and requires a
// number; an out-of-range numeric would be CLAMPED (not preserved) and a
// non-number would FAIL validation. To exercise the component's NaN/defensive
// sort WITHOUT breaking validateGraph, we author a SHORT in-range flow here and
// rely on the *unit test* to inject a NaN/out-of-range weight at the
// orderFlowSteps boundary (the JSON cannot carry NaN — see report note).
authorFlow({
  domainId: "domain:member",
  flowId: "flow:member-login",
  flowName: "POST /members/login 로그인",
  entryPoint: "POST /members/login",
  entryType: "http",
  steps: [
    {
      id: "member-login:ctrl",
      className: "MemberController",
      relPath: "src/main/java/com/ktds/shop/member/web/MemberController.java",
      name: "MemberController.login",
      line: 24,
    },
    {
      id: "member-login:svc",
      className: "MemberService",
      relPath: "src/main/java/com/ktds/shop/member/service/MemberService.java",
      name: "MemberService.authenticate",
      line: 60,
    },
    {
      id: "member-login:repo",
      className: "MemberRepository",
      relPath: "src/main/java/com/ktds/shop/member/repository/MemberRepository.java",
      name: "MemberRepository.findByLoginId",
      line: 14,
    },
  ],
});

// ── Flow 5: ≥100-step flow for scale/gate testing ───────────────────────────
// Cycles realistic Spring layer artifacts so deriveLayer exercises all buckets
// and keeps `unknown` rate ≤15% (only the periodic Facade/Manager are unknown).
function bigFlowSteps(count) {
  const out = [];
  const layerCycle = [
    (i) => ({ className: `Order${i}Controller`, relPath: `src/main/java/com/ktds/shop/order/web/Order${i}Controller.java`, name: `Order${i}Controller.handle`, line: 10 + i }),
    (i) => ({ className: `Order${i}ServiceImpl`, relPath: `src/main/java/com/ktds/shop/order/service/impl/Order${i}ServiceImpl.java`, name: `Order${i}ServiceImpl.process`, line: 20 + i }),
    (i) => ({ className: `Order${i}Mapper`, relPath: `src/main/java/com/ktds/shop/order/mapper/Order${i}Mapper.java`, name: `Order${i}Mapper.select`, line: 30 + i }),
    (i) => ({ className: null, relPath: `src/main/resources/sql/order/Order${i}Mapper.xml`, name: `ORDER_DETAIL_${i}`, line: 1 }),
    // every 7th-ish position injects an unknown (Facade) to prove the lane works
    (i) => ({ className: `Order${i}Facade`, relPath: `src/main/java/com/ktds/shop/order/Order${i}Facade.java`, name: `Order${i}Facade.orchestrate`, line: 40 + i }),
  ];
  for (let i = 0; i < count; i++) {
    // weight pattern: mostly the 4 clean layers; ~1 in 12 is a Facade (unknown)
    const isUnknown = i % 12 === 11;
    const gen = isUnknown ? layerCycle[4] : layerCycle[i % 4];
    const s = gen(i);
    out.push({ id: `order-detail:${i}`, ...s });
  }
  return out;
}
authorFlow({
  domainId: "domain:order",
  flowId: "flow:order-detail-big",
  flowName: "주문 상세 대용량 조회",
  entryPoint: "GET /orders/{id}/detail",
  entryType: "http",
  steps: bigFlowSteps(110),
});

// ── Assemble graph ──────────────────────────────────────────────────────────
const graph = {
  version: "1.0.0",
  kind: "codebase",
  project: {
    name: "ktds-shop (domain-map fixture)",
    languages: ["java"],
    frameworks: ["Spring", "MyBatis"],
    description: "Spring-flavored e-commerce domain-map fixture for the cross-layer flow view.",
    analyzedAt: "2026-06-15T00:00:00.000Z",
    gitCommitHash: "fixture0000000000000000000000000000000000",
  },
  nodes,
  edges,
  layers: [],
  tour: [],
};

writeFileSync(OUT, JSON.stringify(graph, null, 2) + "\n", "utf8");
const counts = nodes.reduce((acc, n) => ((acc[n.type] = (acc[n.type] ?? 0) + 1), acc), {});
const ecounts = edges.reduce((acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc), {});
console.log("wrote", OUT);
console.log("nodes:", nodes.length, counts);
console.log("edges:", edges.length, ecounts);
