import { expect, test, describe } from "vitest";
import { buildLayerSignals, deriveStepLayer, type LayerSignals } from "./step-layer.js";
import type { EdgesReport, RoutesReport } from "./types.js";

// step layer 분류기 — 간선 ground-truth 우선, 파일명 폴백, 결정론.

const EMPTY: LayerSignals = {
  routeEntryFiles: new Set(),
  daoFiles: new Set(),
  dbFiles: new Set(),
  serviceFiles: new Set(),
};

describe("deriveStepLayer — 파일명/클래스명 폴백 (간선 신호 없음)", () => {
  const cases: Array<[string, string | null, string]> = [
    // api
    ["src/x/OrderController.java", "OrderController", "api"],
    ["src/x/OrderResource.java", "OrderResource", "api"],
    ["src/x/LoginAction.java", "LoginAction", "api"],
    ["src/x/StatusEndpoint.java", "StatusEndpoint", "api"],
    // service
    ["src/x/OrderService.java", "OrderService", "service"],
    ["src/x/OrderServiceImpl.java", "OrderServiceImpl", "service"],
    // dao
    ["src/x/OrderMapper.java", "OrderMapper", "dao"],
    ["src/x/OrderDao.java", "OrderDao", "dao"],
    ["src/x/MemberRepository.java", "MemberRepository", "dao"],
    // db
    ["src/resources/sql/order.sql", null, "db"],
    ["src/resources/sql/OrderMapper.xml", null, "db"],
    // unknown — facade/manager/handler/job는 정직하게 unknown
    ["src/x/PaymentFacade.java", "PaymentFacade", "unknown"],
    ["src/x/SettlementBatchJob.java", "SettlementBatchJob", "unknown"],
    ["src/x/EventHandler.java", "EventHandler", "unknown"],
    ["src/x/OrderManager.java", "OrderManager", "unknown"],
  ];
  for (const [relPath, className, expected] of cases) {
    test(`${className ?? relPath} → ${expected}`, () => {
      expect(deriveStepLayer(relPath, className, EMPTY)).toBe(expected);
    });
  }
});

describe("deriveStepLayer — path token 폴백", () => {
  test("web/ 경로 → api", () => {
    expect(deriveStepLayer("src/main/java/x/web/Foo.java", "Foo", EMPTY)).toBe("api");
  });
  test("controller/ 경로 → api", () => {
    expect(deriveStepLayer("src/main/java/x/controller/Foo.java", "Foo", EMPTY)).toBe("api");
  });
});

describe("deriveStepLayer — 간선 ground-truth가 파일명을 이긴다", () => {
  test("mybatis 간선 source = DAO, 파일명이 Service여도", () => {
    const signals: LayerSignals = { ...EMPTY, daoFiles: new Set(["src/x/OrderService.java"]) };
    // 파일명 토큰만 보면 service지만, daoFiles(=mybatis 간선) 신호가 이긴다.
    expect(deriveStepLayer("src/x/OrderService.java", "OrderService", signals)).toBe("dao");
  });

  test("mapper-xml 간선 target = DB, 파일명이 .java여도", () => {
    const signals: LayerSignals = { ...EMPTY, dbFiles: new Set(["src/x/OrderMapper.java"]) };
    expect(deriveStepLayer("src/x/OrderMapper.java", "OrderMapper", signals)).toBe("db");
  });

  test("route 엔트리 파일 = API, 파일명에 신호 없어도", () => {
    const signals: LayerSignals = { ...EMPTY, routeEntryFiles: new Set(["src/x/Handler.java"]) };
    expect(deriveStepLayer("src/x/Handler.java", "Handler", signals)).toBe("api");
  });

  test("injection 간선 target = service, 파일명에 신호 없어도", () => {
    const signals: LayerSignals = { ...EMPTY, serviceFiles: new Set(["src/x/PaymentFacade.java"]) };
    expect(deriveStepLayer("src/x/PaymentFacade.java", "PaymentFacade", signals)).toBe("service");
  });
});

describe("deriveStepLayer — 우선순위 충돌", () => {
  test("DB가 DAO를 이긴다 (.sql + daoFiles)", () => {
    const signals: LayerSignals = { ...EMPTY, daoFiles: new Set(["x/order.sql"]) };
    expect(deriveStepLayer("x/order.sql", null, signals)).toBe("db");
  });
  test("DAO가 API를 이긴다 (daoFiles + Controller 이름)", () => {
    const signals: LayerSignals = { ...EMPTY, daoFiles: new Set(["x/OrderController.java"]) };
    expect(deriveStepLayer("x/OrderController.java", "OrderController", signals)).toBe("dao");
  });
  test("API가 SERVICE를 이긴다 (routeEntry + Service 이름)", () => {
    const signals: LayerSignals = { ...EMPTY, routeEntryFiles: new Set(["x/OrderService.java"]) };
    expect(deriveStepLayer("x/OrderService.java", "OrderService", signals)).toBe("api");
  });
});

describe("deriveStepLayer — 결정론 (순수 함수)", () => {
  test("동일 입력 → 동일 출력", () => {
    const signals: LayerSignals = { ...EMPTY, daoFiles: new Set(["x/Foo.java"]) };
    const a = deriveStepLayer("x/Foo.java", "Foo", signals);
    const b = deriveStepLayer("x/Foo.java", "Foo", signals);
    expect(a).toBe(b);
    expect(a).toBe("dao");
  });
});

describe("buildLayerSignals — routes + edges에서 집합 도출", () => {
  const routes: RoutesReport = {
    schemaVersion: 1,
    gitCommit: null,
    contextPath: null,
    routes: [
      {
        routeId: "route:POST /orders",
        method: "POST",
        path: "/orders",
        rawPath: "/orders",
        kind: "api",
        framework: "spring",
        filePath: "src/x/OrderController.java",
        line: 1,
        handler: "OrderController#create",
        notes: [],
      },
    ],
    batchEntries: [
      {
        entryId: "batch:src/x/Job.java#main",
        trigger: "main",
        schedule: null,
        filePath: "src/x/Job.java",
        line: 1,
        handler: "Job#main",
        notes: [],
      },
    ],
  };

  const edges: EdgesReport = {
    schemaVersion: 1,
    gitCommit: null,
    edges: [
      { source: "src/x/OrderMapper.java", target: "src/x/OrderMapper.xml", kind: "mybatis", line: 5 },
      { source: "src/x/MemberMapper.java", target: "src/x/MemberMapper.xml", kind: "mapper-xml", line: 3 },
      { source: "src/x/OrderController.java", target: "src/x/OrderService.java", kind: "injection", line: 2 },
      { source: "src/x/OrderService.java", target: "src/x/OrderServiceImpl.java", kind: "impl", line: 1 },
      { source: "src/x/A.java", target: "src/x/B.java", kind: "import", line: 1 },
    ],
    unresolved: [],
  };

  test("routeEntryFiles = route + batch 선언 파일", () => {
    const s = buildLayerSignals(routes, edges);
    expect(s.routeEntryFiles.has("src/x/OrderController.java")).toBe(true);
    expect(s.routeEntryFiles.has("src/x/Job.java")).toBe(true);
  });

  test("daoFiles = mybatis/mapper-xml 간선 source", () => {
    const s = buildLayerSignals(routes, edges);
    expect(s.daoFiles.has("src/x/OrderMapper.java")).toBe(true);
    expect(s.daoFiles.has("src/x/MemberMapper.java")).toBe(true);
    expect(s.daoFiles.has("src/x/A.java")).toBe(false); // import는 무관
  });

  test("dbFiles = mybatis/mapper-xml 간선 target", () => {
    const s = buildLayerSignals(routes, edges);
    expect(s.dbFiles.has("src/x/OrderMapper.xml")).toBe(true);
    expect(s.dbFiles.has("src/x/MemberMapper.xml")).toBe(true);
  });

  test("serviceFiles = injection/impl 간선 target", () => {
    const s = buildLayerSignals(routes, edges);
    expect(s.serviceFiles.has("src/x/OrderService.java")).toBe(true);
    expect(s.serviceFiles.has("src/x/OrderServiceImpl.java")).toBe(true);
  });
});
