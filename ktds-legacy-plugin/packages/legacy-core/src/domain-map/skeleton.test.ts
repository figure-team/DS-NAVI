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

test("Phase B: 핸들러별 step 체인 — 본문이 호출하는 서비스만 포함, 미호출은 제외", async () => {
  // ActionBean 한 파일에 두 서비스 필드(accountService, catalogService)가 주입되고,
  // signon() 본문은 accountService만 호출한다 → signon 체인은 root + AccountService,
  // CatalogService는 제외되어야 한다(핸들러가 호출하지 않으므로).
  const ROOT = "src/com/shop/AccountActionBean.java";
  const ACCT = "src/com/shop/AccountService.java";
  const CAT = "src/com/shop/CatalogService.java";
  const files = [ROOT, ACCT, CAT];

  const c: CensusReport = {
    schemaVersion: 1,
    gitCommit: "b".repeat(40),
    fileCount: files.length,
    files: files.map((relPath) => ({ relPath, lang: "java" as const })),
    kgCrossCheck: null,
  };
  const r: RoutesReport = {
    schemaVersion: 1,
    gitCommit: "b".repeat(40),
    contextPath: null,
    routes: [
      {
        routeId: "route:GET /signon",
        method: "GET" as const,
        path: "/signon",
        rawPath: "/signon",
        kind: "api" as const,
        framework: "stripes" as const,
        filePath: ROOT,
        line: 10,
        handler: "AccountActionBean#signon",
        notes: [],
      },
    ],
    batchEntries: [],
  };
  const e: EdgesReport = {
    schemaVersion: 1,
    gitCommit: "b".repeat(40),
    edges: [
      // 클래스 레벨 인접: ActionBean이 두 서비스를 모두 참조(필드)지만,
      // signon 핸들러는 accountService만 호출한다.
      { source: ROOT, target: ACCT, kind: "field-type" as const, line: 3 },
      { source: ROOT, target: CAT, kind: "field-type" as const, line: 4 },
    ],
    unresolved: [],
  };

  const jf = new Map<string, JavaFileFacts>();
  jf.set(
    ROOT,
    await scanJavaFile(
      [
        "package shop;",
        "public class AccountActionBean {",
        "  private AccountService accountService;",
        "  private CatalogService catalogService;",
        "  public String signon() { return accountService.login(); }",
        "}",
      ].join("\n"),
    ),
  );
  jf.set(ACCT, await scanJavaFile("package shop;\npublic class AccountService {}"));
  jf.set(CAT, await scanJavaFile("package shop;\npublic class CatalogService {}"));

  const s = buildSlices(c, r, e);
  const candidates = buildCandidates(c, r, s);
  const plan = buildAutoPlan(candidates, "auto");
  const sk = buildSkeleton(plan, candidates, r, s, e, jf);

  const stepIds = sk.nodes
    .filter((n) => n.type === "step" && n.id.startsWith("step:GET /signon:"))
    .map((n) => n.id);
  expect(stepIds).toContain(`step:GET /signon:${ROOT}`); // root는 항상 step 1
  expect(stepIds).toContain(`step:GET /signon:${ACCT}`); // 호출됨
  expect(stepIds).not.toContain(`step:GET /signon:${CAT}`); // 미호출 → 제외
});

test("calls 엣지에 흐름의 실제 호출 메서드가 순서대로 description으로 부착된다", async () => {
  const ROOT = "src/com/shop/AccountActionBean.java";
  const ACCT = "src/com/shop/AccountService.java";
  const files = [ROOT, ACCT];

  const c: CensusReport = {
    schemaVersion: 1,
    gitCommit: "c".repeat(40),
    fileCount: files.length,
    files: files.map((relPath) => ({ relPath, lang: "java" as const })),
    kgCrossCheck: null,
  };
  const r: RoutesReport = {
    schemaVersion: 1,
    gitCommit: "c".repeat(40),
    contextPath: null,
    routes: [
      {
        routeId: "route:POST /editAccount",
        method: "POST" as const,
        path: "/editAccount",
        rawPath: "/editAccount",
        kind: "api" as const,
        framework: "stripes" as const,
        filePath: ROOT,
        line: 10,
        handler: "AccountActionBean#editAccount",
        notes: [],
      },
    ],
    batchEntries: [],
  };
  const e: EdgesReport = {
    schemaVersion: 1,
    gitCommit: "c".repeat(40),
    edges: [{ source: ROOT, target: ACCT, kind: "field-type" as const, line: 3 }],
    unresolved: [],
  };

  const jf = new Map<string, JavaFileFacts>();
  jf.set(
    ROOT,
    await scanJavaFile(
      [
        "package shop;",
        "public class AccountActionBean {",
        "  private AccountService accountService;",
        "  public String editAccount() {",
        "    accountService.updateAccount();",
        "    return accountService.getAccount();",
        "  }",
        "}",
      ].join("\n"),
    ),
  );
  jf.set(
    ACCT,
    await scanJavaFile(
      "package shop;\npublic class AccountService { public void updateAccount(){} public String getAccount(){return null;} }",
    ),
  );

  const s = buildSlices(c, r, e);
  const candidates = buildCandidates(c, r, s);
  const plan = buildAutoPlan(candidates, "auto");
  const sk = buildSkeleton(plan, candidates, r, s, e, jf);

  const callsEdge = sk.edges.find(
    (edge) =>
      edge.type === "calls" &&
      edge.source === `step:POST /editAccount:${ROOT}` &&
      edge.target === `step:POST /editAccount:${ACCT}`,
  );
  // 같은 협력자로의 두 호출이 순서대로 라벨링된다(파일 그래프가 잃던 정보).
  expect(callsEdge?.description).toBe("updateAccount → getAccount");
});

test("Phase B: 빈 시드(form-only 핸들러)는 root만, 무핸들러 배치는 전체 체인 폴백", async () => {
  // 같은 ActionBean에 form-only 핸들러(newAccountForm: 어떤 서비스도 호출 안 함)와
  // 무핸들러 배치 엔트리. form 핸들러 체인 = root만, 배치 = 전체 체인(폴백).
  const ROOT = "src/com/shop/AccountActionBean.java";
  const ACCT = "src/com/shop/AccountService.java";
  const files = [ROOT, ACCT];

  const c: CensusReport = {
    schemaVersion: 1,
    gitCommit: "c".repeat(40),
    fileCount: files.length,
    files: files.map((relPath) => ({ relPath, lang: "java" as const })),
    kgCrossCheck: null,
  };
  const r: RoutesReport = {
    schemaVersion: 1,
    gitCommit: "c".repeat(40),
    contextPath: null,
    routes: [
      {
        routeId: "route:GET /newAccountForm",
        method: "GET" as const,
        path: "/newAccountForm",
        rawPath: "/newAccountForm",
        kind: "api" as const,
        framework: "stripes" as const,
        filePath: ROOT,
        line: 12,
        handler: "AccountActionBean#newAccountForm",
        notes: [],
      },
    ],
    batchEntries: [
      {
        entryId: `batch:${ROOT}#main`,
        trigger: "main" as const,
        schedule: null,
        filePath: ROOT,
        line: 30,
        handler: "AccountActionBean#main",
        notes: [],
      },
    ],
  };
  const e: EdgesReport = {
    schemaVersion: 1,
    gitCommit: "c".repeat(40),
    edges: [{ source: ROOT, target: ACCT, kind: "field-type" as const, line: 3 }],
    unresolved: [],
  };

  const jf = new Map<string, JavaFileFacts>();
  jf.set(
    ROOT,
    await scanJavaFile(
      [
        "package shop;",
        "public class AccountActionBean {",
        "  private AccountService accountService;",
        "  public String newAccountForm() { return \"form\"; }",
        "}",
      ].join("\n"),
    ),
  );
  jf.set(ACCT, await scanJavaFile("package shop;\npublic class AccountService {}"));

  const s = buildSlices(c, r, e);
  const candidates = buildCandidates(c, r, s);
  const plan = buildAutoPlan(candidates, "auto");
  const sk = buildSkeleton(plan, candidates, r, s, e, jf);

  // form-only 핸들러: 빈 시드 → root만 step
  const formSteps = sk.nodes
    .filter((n) => n.type === "step" && n.id.startsWith("step:GET /newAccountForm:"))
    .map((n) => n.id);
  expect(formSteps).toEqual([`step:GET /newAccountForm:${ROOT}`]);

  // 무핸들러 배치: 전체 체인 폴백 → root + AccountService
  const batchSteps = sk.nodes
    .filter((n) => n.type === "step" && n.id.startsWith(`step:batch:${ROOT}#main:`))
    .map((n) => n.id);
  expect(batchSteps).toContain(`step:batch:${ROOT}#main:${ROOT}`);
  expect(batchSteps).toContain(`step:batch:${ROOT}#main:${ACCT}`);
});

test("결정론: 2회 조립 → JSON 동일 + 중복 노드 ID 불변식", async () => {
  const a = JSON.stringify(await build());
  const b = JSON.stringify(await build());
  expect(a).toBe(b);
});
