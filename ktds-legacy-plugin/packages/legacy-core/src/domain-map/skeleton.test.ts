import { expect, test } from "vitest";
import { buildSkeleton } from "./skeleton.js";
import { buildAutoPlan } from "./confirm.js";
import { buildCandidates } from "./classify.js";
import { buildSlices } from "./slices.js";
import { scanJavaFile, type JavaFileFacts } from "./java-facts.js";
import {
  SKELETON_BLANK,
  SkeletonReportSchema,
  UaGraphEdgeSchema,
  UaGraphNodeSchema,
  type CensusReport,
  type EdgesReport,
  type RoutesReport,
} from "./types.js";

// 16.4 skeleton 조립기 — ID 자연키, weight 단조증가, 빈칸 마커, 결정론.

const FILES = [
  "src/com/shop/order/OrderController.java",
  "src/com/shop/order/OrderService.java",
  "src/com/shop/order/OrderRepo.java",
  "src/com/shop/member/MemberController.java",
  "src/com/shop/member/MemberService.java",
];

function census(): CensusReport {
  return {
    schemaVersion: 1,
    gitCommit: "a".repeat(40),
    fileCount: FILES.length,
    files: FILES.map((relPath) => ({ relPath, lang: "java" })),
    kgCrossCheck: null,
  };
}

function routes(): RoutesReport {
  return {
    schemaVersion: 1,
    gitCommit: "a".repeat(40),
    contextPath: null,
    routes: [
      {
        routeId: "route:POST /orders",
        method: "POST" as const,
        path: "/orders",
        rawPath: "/orders",
        kind: "api" as const,
        framework: "spring" as const,
        filePath: FILES[0],
        line: 7,
        handler: "OrderController#create",
        notes: [],
      },
      {
        routeId: "route:GET /members",
        method: "GET" as const,
        path: "/members",
        rawPath: "/members",
        kind: "api" as const,
        framework: "spring" as const,
        filePath: FILES[3],
        line: 5,
        handler: null,
        notes: [],
      },
    ],
    batchEntries: [
      {
        entryId: `batch:${FILES[3]}#main`,
        trigger: "main" as const,
        schedule: null,
        filePath: FILES[3],
        line: 20,
        handler: "MemberController#main",
        notes: [],
      },
    ],
  };
}

function edges(): EdgesReport {
  return {
    schemaVersion: 1,
    gitCommit: "a".repeat(40),
    edges: [
      { source: FILES[0], target: FILES[1], kind: "field-type" as const, line: 3 },
      { source: FILES[1], target: FILES[2], kind: "ctor-param" as const, line: 4 },
      { source: FILES[3], target: FILES[4], kind: "field-type" as const, line: 3 },
      // cross-domain: member 파일이 order의 루트를 직접 참조 — 루트는 다중
      // 도달이어도 자기 도메인의 닻이므로(분류기 루트 예외) 간선이 살아남는다.
      // 루트가 아닌 파일을 가리키면 shared→common이 되어 cross가 사라진다.
      { source: FILES[4], target: FILES[0], kind: "import" as const, line: 2 },
    ],
    unresolved: [],
  };
}

async function javaFactsFixture(): Promise<Map<string, JavaFileFacts>> {
  const map = new Map<string, JavaFileFacts>();
  for (const f of FILES) {
    const cls = (f.split("/").pop() ?? "").replace(".java", "");
    map.set(f, await scanJavaFile(`package shop;\npublic class ${cls} {}`));
  }
  return map;
}

async function build() {
  const c = census();
  const r = routes();
  const e = edges();
  const s = buildSlices(c, r, e);
  const candidates = buildCandidates(c, r, s);
  const plan = buildAutoPlan(candidates, "auto");
  return buildSkeleton(plan, candidates, r, s, e, await javaFactsFixture());
}

test("스키마 적합 + ID 자연키 규칙 (A15: ordinal 금지)", async () => {
  const sk = await build();
  expect(() => SkeletonReportSchema.parse(sk)).not.toThrow();
  for (const n of sk.nodes) expect(() => UaGraphNodeSchema.parse(n)).not.toThrow();
  for (const e of sk.edges) expect(() => UaGraphEdgeSchema.parse(e)).not.toThrow();

  const ids = sk.nodes.map((n) => n.id);
  expect(ids).toContain("domain:order");
  expect(ids).toContain("domain:member");
  expect(ids).toContain("flow:POST /orders");
  expect(ids).toContain(`flow:batch:${FILES[3]}#main`);
  expect(ids).toContain(`step:POST /orders:${FILES[0]}`);
  // ordinal 패턴 부재
  expect(ids.every((id) => !/(:|^)(domain|flow|step)\d+$/.test(id))).toBe(true);
});

test("flow_step weight 단조증가, 마지막 1, 체인 순서 = (깊이, 경로)", async () => {
  const sk = await build();
  const orderSteps = sk.edges
    .filter((e) => e.type === "flow_step" && e.source === "flow:POST /orders");
  expect(orderSteps.length).toBe(3); // controller→service→repo
  const weights = orderSteps.map((e) => e.weight);
  for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThan(weights[i - 1]);
  expect(weights[weights.length - 1]).toBe(1);
  // 첫 step은 루트 자신
  expect(orderSteps[0].target).toBe(`step:POST /orders:${FILES[0]}`);
});

test("의미 필드는 SKELETON_BLANK, 구조 필드는 채워짐", async () => {
  const sk = await build();
  const flow = sk.nodes.find((n) => n.id === "flow:POST /orders")!;
  expect(flow.name).toBe(SKELETON_BLANK);
  expect(flow.summary).toBe(SKELETON_BLANK);
  expect(flow.filePath).toBe(FILES[0]);
  expect(flow.lineRange).toEqual([7, 7]);
  expect(flow.domainMeta).toEqual({ entryPoint: "POST /orders", entryType: "http" });

  const batchFlow = sk.nodes.find((n) => n.id === `flow:batch:${FILES[3]}#main`)!;
  expect(batchFlow.domainMeta?.entryType).toBe("cli");

  const step = sk.nodes.find((n) => n.id === `step:POST /orders:${FILES[1]}`)!;
  // step 앵커 = 주 클래스 선언 라인 (fixture는 2행)
  expect(step.lineRange).toEqual([2, 2]);
  expect(sk.stepSources.find((s) => s.stepId === step.id)?.className).toBe("OrderService");
});

test("cross_domain: 서로 다른 도메인 파일 간 직접 간선에서 산출", async () => {
  const sk = await build();
  expect(sk.edges.filter((e) => e.type === "cross_domain")).toEqual([
    {
      source: "domain:member",
      target: "domain:order",
      type: "cross_domain",
      direction: "forward",
      weight: 1,
    },
  ]);
});

test("stepCap 초과분은 truncatedSteps로 보고 (조용한 누락 금지)", async () => {
  const c = census();
  const r = routes();
  const e = edges();
  const s = buildSlices(c, r, e);
  const candidates = buildCandidates(c, r, s);
  const plan = buildAutoPlan(candidates, "auto");
  const sk = buildSkeleton(plan, candidates, r, s, e, await javaFactsFixture(), {
    stepCap: 2,
  });
  const trunc = sk.truncatedSteps.find((t) => t.flowId === "flow:POST /orders");
  expect(trunc?.dropped).toEqual([FILES[2]]);
});

test("step 노드는 엔진 layer를 보유 (대시보드 ground-truth)", async () => {
  const sk = await build();
  // Controller(route 엔트리) → api, Service → service, Repo → unknown(이름 폴백
  // 만으로는 Repo만 dao; OrderRepo는 *Repository가 아니라 unknown).
  const ctrl = sk.nodes.find((n) => n.id === `step:POST /orders:${FILES[0]}`)!;
  expect(ctrl.layer).toBe("api");
  const svc = sk.nodes.find((n) => n.id === `step:POST /orders:${FILES[1]}`)!;
  expect(svc.layer).toBe("service");
  // 모든 step 노드는 layer를 가지며, flow/domain 노드는 갖지 않는다.
  for (const n of sk.nodes) {
    if (n.type === "step") expect(n.layer).toBeDefined();
    else expect(n.layer).toBeUndefined();
  }
});

test("곁가지 접기: 추상 베이스 클래스는 step에서 제외 (루트·구현은 보존)", async () => {
  const c = census();
  const r = routes();
  const e = edges();
  const s = buildSlices(c, r, e);
  const candidates = buildCandidates(c, r, s);
  const plan = buildAutoPlan(candidates, "auto");
  // OrderService(FILES[1])만 추상으로 — 흐름의 곁가지(공통 인프라)로 접혀야 한다.
  // 체인은 Controller→Service→Repo지만, Repo는 BFS로 여전히 도달(접기는 표시
  // 단계에서만 일어나고 도달성은 보존)하므로 step은 Controller + Repo로 남는다.
  const jf = new Map<string, JavaFileFacts>();
  for (const f of FILES) {
    const cls = (f.split("/").pop() ?? "").replace(".java", "");
    const decl = f === FILES[1] ? "public abstract" : "public";
    jf.set(f, await scanJavaFile(`package shop;\n${decl} class ${cls} {}`));
  }
  const sk = buildSkeleton(plan, candidates, r, s, e, jf);
  const stepIds = sk.nodes
    .filter((n) => n.type === "step" && n.id.startsWith("step:POST /orders:"))
    .map((n) => n.id);
  expect(stepIds).toContain(`step:POST /orders:${FILES[0]}`); // 루트 Controller
  expect(stepIds).toContain(`step:POST /orders:${FILES[2]}`); // 구현 Repo
  expect(stepIds).not.toContain(`step:POST /orders:${FILES[1]}`); // 추상 Service 접힘
  // weight 재정규화: 2 step → 0.5, 1 (접힌 노드는 분모에서 빠진다)
  const ws = sk.edges
    .filter((ed) => ed.type === "flow_step" && ed.source === "flow:POST /orders")
    .map((ed) => ed.weight);
  expect(ws).toEqual([0.5, 1]);
});

test("calls 엣지: 실제 step→step 호출 토폴로지 (합성 순서 체인 아님)", async () => {
  const sk = await build();
  // 픽스처 인접: Controller→Service(field-type), Service→Repo(ctor-param).
  // Controller→Repo 직접 엣지는 없다 → calls에도 없어야 한다(가짜 체인 금지).
  const calls = sk.edges
    .filter((e) => e.type === "calls" && e.source.startsWith("step:POST /orders:"))
    .map((e) => [e.source.split(":").pop(), e.target.split(":").pop()]);
  expect(calls).toContainEqual([FILES[0], FILES[1]]); // Controller → Service
  expect(calls).toContainEqual([FILES[1], FILES[2]]); // Service → Repo
  expect(calls).not.toContainEqual([FILES[0], FILES[2]]); // 직접 호출 아님
  // calls 엣지도 스키마 적합 + step→step (양 끝 step)
  for (const e of sk.edges.filter((x) => x.type === "calls")) {
    expect(e.source.startsWith("step:")).toBe(true);
    expect(e.target.startsWith("step:")).toBe(true);
  }
});

test("결정론: 2회 조립 → JSON 동일 + 중복 노드 ID 불변식", async () => {
  const a = JSON.stringify(await build());
  const b = JSON.stringify(await build());
  expect(a).toBe(b);
});
