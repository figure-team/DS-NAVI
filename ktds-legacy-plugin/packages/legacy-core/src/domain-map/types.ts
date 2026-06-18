import { z } from "zod";

// /understand-map Stage-14 artifact contracts (ADR-001 D3 S1-S2, D6).
// All artifacts live under .spec/map/ — NOT .understand-anything/ — so U-A's
// /understand Phase 7 intermediate cleanup can never delete them (ADR D6).
//
// Determinism contract (M1 / A11): these artifacts must be byte-identical
// across re-runs on the same commit. Therefore: no timestamps, no ordinals
// derived from traversal order, fixed key order (schema order = construction
// order), and every array sorted by an explicit natural key.

/** Subdirectory of .spec/ holding /understand-map intermediates + outputs. */
export const SPEC_MAP_DIR = "map";

export const CENSUS_FILENAME = "census.json";
export const ROUTES_FILENAME = "routes.json";
export const EDGES_FILENAME = "edges.json";
export const SLICES_FILENAME = "slices.json";
export const CANDIDATES_FILENAME = "candidates.json";
export const SKELETON_FILENAME = "skeleton.json";
/** 영속물 (D6) — 사람 게이트의 결정. 재실행의 결정론 닻. */
export const CONFIRMED_PLAN_FILENAME = "domain-plan.confirmed.json";

// ── Census (S1) ────────────────────────────────────────────────────────────

/** Source languages the census recognises. Everything else is out of scope. */
export const SOURCE_LANG_BY_EXT: Readonly<Record<string, string>> = {
  ".java": "java",
  ".kt": "kotlin",
  ".xml": "xml",
  ".jsp": "jsp",
  ".sql": "sql",
  ".properties": "properties",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
  ".mjs": "js",
  ".cjs": "js",
  ".vue": "vue",
  ".py": "python",
};

export const CensusFileSchema = z.object({
  /** Project-root-relative path with forward slashes (sort key). */
  relPath: z.string(),
  lang: z.string(),
});
export type CensusFile = z.infer<typeof CensusFileSchema>;

/**
 * Two-tier KG cross-check (task 14.2): mismatches are REPORTED, never fixed —
 * the census is its own inventory, the KG is advisory (ADR D5: order-independent
 * of /understand).
 */
export const KgCrossCheckSchema = z.object({
  /** KG file nodes excluded by our filters on purpose (tests, ignored, non-source ext). */
  kgOnlyIgnored: z.array(z.string()),
  /** KG file nodes absent from census and NOT explained by any filter. */
  kgOnlyMissing: z.array(z.string()),
  /** Census files with no KG file node (KG stale or partial). */
  censusOnly: z.array(z.string()),
});
export type KgCrossCheck = z.infer<typeof KgCrossCheckSchema>;

export const CensusReportSchema = z.object({
  schemaVersion: z.literal(1),
  /**
   * HEAD commit at scan time; null outside git. Deterministic for the same
   * commit with a CLEAN worktree — untracked files are censused too, so a
   * dirty tree can yield different bytes under the same commit stamp.
   */
  gitCommit: z.string().nullable(),
  fileCount: z.number().int().nonnegative(),
  files: z.array(CensusFileSchema),
  /** null when .understand-anything/knowledge-graph.json is absent. */
  kgCrossCheck: KgCrossCheckSchema.nullable(),
});
export type CensusReport = z.infer<typeof CensusReportSchema>;

// ── Routes / entry points (S2) ─────────────────────────────────────────────

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
  /** Framework accepts any verb (e.g. @RequestMapping without method=, servlet). */
  "ANY",
] as const;
export const HttpMethodSchema = z.enum(HTTP_METHODS);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const ROUTE_FRAMEWORKS = [
  "spring",
  "stripes",
  "webxml",
  "jsp",
  "nextjs",
] as const;
export type RouteFramework = (typeof ROUTE_FRAMEWORKS)[number];

export const ROUTE_KINDS = [
  /** JSON/data endpoint. */
  "api",
  /** View-rendering controller route. */
  "form",
  /** Directly addressable page resource (JSP, Next.js page). */
  "page",
  /** Raw servlet-mapping from web.xml. */
  "servlet",
] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export const RouteEntrySchema = z.object({
  /**
   * Natural key (A15 — never ordinal): "route:<METHOD> <path>", with
   * "@<relPath>" appended only when two files declare the same (method, path).
   * Stable across KG regeneration, LLM naming, and file re-ordering.
   */
  routeId: z.string(),
  method: HttpMethodSchema,
  /** Normalized path (leading "/", collapsed "//", no trailing "/" except root). */
  path: z.string(),
  /** Path exactly as declared in source, before normalization. */
  rawPath: z.string(),
  kind: z.enum(ROUTE_KINDS),
  framework: z.enum(ROUTE_FRAMEWORKS),
  /** Project-root-relative path of the declaring file. */
  filePath: z.string(),
  /** 1-based line of the declaration (route's deterministic evidence anchor). */
  line: z.number().int().positive(),
  /** "ClassName#method" when known, else null (e.g. JSP page routes). */
  handler: z.string().nullable(),
  /** Extraction provenance flags, sorted: "composed:@X", "constant:Y", "name-based-convention", "dispatcher", ... */
  notes: z.array(z.string()),
});
export type RouteEntry = z.infer<typeof RouteEntrySchema>;

export const BATCH_TRIGGERS = [
  /** @Scheduled annotation on a method. */
  "scheduled",
  /** Quartz bean definitions in Spring XML. */
  "quartz",
  /** <task:scheduled> in Spring XML. */
  "task-xml",
  /** public static void main entry point. */
  "main",
] as const;
export type BatchTrigger = (typeof BATCH_TRIGGERS)[number];

export const BatchEntrySchema = z.object({
  /** Natural key: "batch:<relPath>#<symbol>" — file + symbol, never ordinal. */
  entryId: z.string(),
  trigger: z.enum(BATCH_TRIGGERS),
  /** Cron/fixedRate expression text when declared, else null. */
  schedule: z.string().nullable(),
  filePath: z.string(),
  line: z.number().int().positive(),
  /** "ClassName#method" when known. */
  handler: z.string().nullable(),
  notes: z.array(z.string()),
});
export type BatchEntry = z.infer<typeof BatchEntrySchema>;

// ── Call-chain edges (S3, Stage-15) ────────────────────────────────────────

export const EDGE_KINDS = [
  /** Resolved import statement. */
  "import",
  /** @Autowired/@Resource/@Inject field type. */
  "injection",
  /** Plain field type resolved via import/same-package/unique candidate. */
  "field-type",
  /** Constructor parameter type (Spring constructor injection). */
  "ctor-param",
  /** class → superclass file. */
  "extends",
  /** class → implemented interface file. */
  "implements",
  /** interface → implementor (name convention *Impl/*ServiceImpl OR explicit implements). */
  "impl",
  /** Java string call "ns.id" → MyBatis mapper XML (SqlSession pattern). */
  "mybatis",
  /** Typed mapper interface (FQN == namespace) → mapper XML. */
  "mapper-xml",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const FileEdgeSchema = z.object({
  /** Project-relative path of the depending file. */
  source: z.string(),
  /** Project-relative path of the dependency. */
  target: z.string(),
  kind: z.enum(EDGE_KINDS),
  /** 1-based evidence line in source when the signal has one (imports, fields, calls). */
  line: z.number().int().positive().nullable(),
});
export type FileEdge = z.infer<typeof FileEdgeSchema>;

/** Unresolved references are REPORTED, never silently dropped (S4 미해소 큐 원칙). */
export const UnresolvedRefSchema = z.object({
  source: z.string(),
  ref: z.string(),
  reason: z.enum(["ambiguous", "not-found"]),
});
export type UnresolvedRef = z.infer<typeof UnresolvedRefSchema>;

export const EdgesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  edges: z.array(FileEdgeSchema),
  unresolved: z.array(UnresolvedRefSchema),
});
export type EdgesReport = z.infer<typeof EdgesReportSchema>;

// ── Reachability slices (S4, Stage-15) ─────────────────────────────────────

export const SliceSchema = z.object({
  /** Entry file (declares one or more routes/batch entries). */
  root: z.string(),
  /** route/batch natural keys declared by this file, sorted. */
  entryIds: z.array(z.string()),
  /** Files reachable from root via edges (root included), sorted. */
  reached: z.array(z.string()),
});
export type Slice = z.infer<typeof SliceSchema>;

export const FileOwnershipSchema = z.object({
  relPath: z.string(),
  /** sole=단독 도달(그 도메인 후보) / shared=다중 도달(common 격리 후보) / unreached=미해소 큐 */
  status: z.enum(["sole", "shared", "unreached"]),
  /** Roots that reach this file, sorted. */
  owners: z.array(z.string()),
});
export type FileOwnership = z.infer<typeof FileOwnershipSchema>;

export const SlicesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  depthCap: z.number().int().positive(),
  slices: z.array(SliceSchema),
  ownership: z.array(FileOwnershipSchema),
});
export type SlicesReport = z.infer<typeof SlicesReportSchema>;

// ── Domain candidates (S4-S5 통합, Stage-16) ───────────────────────────────

export const CLASSIFY_SIGNALS = [
  /** 도달성 단독 소유 (주 신호). */
  "reachability",
  /** 디렉토리 분류기 (LCP 제거 + 레이어 키워드 제외 + 과반 하강). */
  "directory",
  /** 파일명 prefix 클러스터 (폴백). */
  "prefix",
] as const;
export type ClassifySignal = (typeof CLASSIFY_SIGNALS)[number];

export const DomainFileSchema = z.object({
  relPath: z.string(),
  /** 이 파일을 이 도메인에 배정한 신호. */
  via: z.enum(CLASSIFY_SIGNALS),
});
export type DomainFile = z.infer<typeof DomainFileSchema>;

export const DomainCandidateSchema = z.object({
  /** 자연키: 분류 토큰 (예: "account"). 게이트의 개명은 표시명만 바꾼다. */
  key: z.string(),
  /** 이 도메인의 엔트리(루트) 파일, 정렬. */
  roots: z.array(z.string()),
  /** 루트가 선언한 route/batch 자연키 수. */
  entryCount: z.number().int().nonnegative(),
  files: z.array(DomainFileSchema),
});
export type DomainCandidate = z.infer<typeof DomainCandidateSchema>;

export const CandidatesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  /** 디렉토리 분류기 퇴화 감지 결과 — null이면 비퇴화(디렉토리 신호 사용). */
  directoryDegenerate: z
    .object({ reason: z.enum(["too-few-clusters", "single-cluster-concentration"]) })
    .nullable(),
  candidates: z.array(DomainCandidateSchema),
  /** 다중 도달(공용) 파일 — common 격리 후보. */
  common: z.array(z.object({ relPath: z.string(), owners: z.array(z.string()) })),
  /** 신호 충돌 — 도달성 배정과 디렉토리 신호가 서로 다른 도메인을 가리킴. */
  ambiguous: z.array(
    z.object({
      relPath: z.string(),
      reachKey: z.string(),
      directoryKey: z.string(),
    }),
  ),
  /** 어떤 신호로도 배정 불가 — 미해소 큐 (조용한 누락 금지). */
  unresolved: z.array(z.string()),
});
export type CandidatesReport = z.infer<typeof CandidatesReportSchema>;

// ── Skeleton (S6, Stage-16) — U-A domain-graph 호환 노드/엣지 ──────────────
// U-A core GraphNodeSchema/GraphEdgeSchema의 데이터 스냅샷 (on-disk 계약만
// 의존, D5 — UA_DEFAULT_IGNORE_PATTERNS와 같은 원칙). domain/flow/step에
// 실제로 쓰는 필드만 좁혀 검증한다.

export const UaDomainMetaSchema = z
  .object({
    entities: z.array(z.string()).optional(),
    businessRules: z.array(z.string()).optional(),
    crossDomainInteractions: z.array(z.string()).optional(),
    entryPoint: z.string().optional(),
    entryType: z.enum(["http", "cli", "event", "cron", "manual"]).optional(),
  })
  .passthrough();

// ── Variation points (변경점) — flow 내 분기/확장 지점 ──────────────────────
// step 노드에 얹히는 결정론 신호(LLM 아님): "기존 상품이 어디서 갈라지나 +
// 새 변형을 어디에 끼우나". 두 종류를 하나의 앵커(step 파일+메서드+라인)로 통합:
//   polymorphic — 인터페이스(impl≥2)를 통한 디스패치 호출 지점 (분기 = 구현체)
//   switch      — switch(판별식) (분기 = case)
//   if-chain    — 같은 판별식을 상수와 비교하는 if/else-if 체인 (분기 = 상수)
// 게이트는 variation-points.ts: switch/if 모두 "변형 분기 ≥2"일 때만 VP가 된다.
export const VARIATION_KINDS = ["polymorphic", "switch", "if-chain"] as const;
export type VariationKind = (typeof VARIATION_KINDS)[number];

export const VariationBranchSchema = z.object({
  /** 표시 라벨: 구현체 클래스명 | switch case 값 | if 비교 상수. */
  label: z.string(),
  /** 분기가 곧 파일일 때(다형성 구현체)의 대상 파일 — 그 외 null. */
  relPath: z.string().nullable(),
  /** 증거 라인(구현체 클래스 선언 / case·조건 라인) — 미상이면 null. */
  line: z.number().int().positive().nullable(),
  /** 이 분기에서 실행되는 호출(메서드 분기만) — "그 분기가 무엇을 하는가". */
  calls: z.array(z.string()),
});
export type VariationBranch = z.infer<typeof VariationBranchSchema>;

export const VariationPointSchema = z.object({
  kind: z.enum(VARIATION_KINDS),
  /** 디스패치가 일어나는 step 파일(이 VP가 붙는 step). */
  relPath: z.string(),
  /** 감싸는 메서드명 — 클래스 레벨(필드 다형성)이면 null. */
  method: z.string().nullable(),
  line: z.number().int().positive(),
  /** 변형 키: 인터페이스명 | switch 판별식 | if 공통 좌변. */
  discriminant: z.string(),
  branches: z.array(VariationBranchSchema),
  /** 결정론 확장 힌트(새 변형 추가법) — LLM이 산문만 다듬을 수 있다. */
  extension: z.string(),
});
export type VariationPoint = z.infer<typeof VariationPointSchema>;

export const UaGraphNodeSchema = z
  .object({
    id: z.string(),
    type: z.enum(["domain", "flow", "step"]),
    name: z.string(),
    filePath: z.string().optional(),
    lineRange: z.tuple([z.number(), z.number()]).optional(),
    summary: z.string(),
    tags: z.array(z.string()),
    complexity: z.enum(["simple", "moderate", "complex"]),
    domainMeta: UaDomainMetaSchema.optional(),
    /**
     * 이 step에서 흐름이 상품/유형별로 갈라지는 변경점 — 엔진 ground-truth
     * (구조 신호). step 노드에만, 있을 때만 존재. domain-map/variation-points.ts가
     * 채우고 skeleton이 부착한다.
     */
    variationPoints: z.array(VariationPointSchema).optional(),
    /**
     * step 노드의 계층 역할(엔진 ground-truth). non-step 노드와 옛 그래프는
     * 이 필드가 없으므로 optional — 대시보드는 있으면 그대로 읽고 없으면
     * 파일명 휴리스틱으로 폴백한다. domain-map/step-layer.ts가 채운다.
     */
    layer: z.enum(["api", "service", "dao", "db", "unknown"]).optional(),
  })
  .passthrough();
export type UaGraphNode = z.infer<typeof UaGraphNodeSchema>;

export const UaGraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  // calls = 실제 step→step 호출/의존(부모→자식) 엣지. flow_step(flow→step,
  // 멤버십·순서)과 별개로 진짜 호출 토폴로지를 실어 대시보드가 fan-out/분기를
  // 정확히 그린다(합성 순서 엣지 대체). core EdgeType의 "calls" 재사용.
  type: z.enum(["contains_flow", "flow_step", "cross_domain", "calls"]),
  direction: z.enum(["forward", "backward", "bidirectional"]),
  description: z.string().optional(),
  weight: z.number().min(0).max(1),
});
export type UaGraphEdge = z.infer<typeof UaGraphEdgeSchema>;

/** LLM이 채울 의미 필드의 빈칸 마커 — 검증기가 "미채움"을 식별하는 기준. */
export const SKELETON_BLANK = "";

export const StepSourceSchema = z.object({
  stepId: z.string(),
  relPath: z.string(),
  /** 주 클래스 선언 라인 (Java) — 그 외 1. */
  line: z.number().int().positive(),
  className: z.string().nullable(),
});
export type StepSource = z.infer<typeof StepSourceSchema>;

// KG fingerprint는 의도적으로 여기 없다 — KG는 commit의 함수가 아니라서
// (analyzedAt·LLM 산문 포함) 포함하면 M1 byte-identity가 깨진다(리뷰 반영).
// freshness 대조는 S10 domain-graph emit 시점에 기록한다.
export const SkeletonReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  /** flow당 step 수 상한 — 초과분은 truncatedSteps로 보고 (조용한 누락 금지). */
  stepCap: z.number().int().positive(),
  nodes: z.array(UaGraphNodeSchema),
  edges: z.array(UaGraphEdgeSchema),
  /** step → 파일/클래스 사상 (스키마 밖 데이터, 17.1 번들 조립의 입력). */
  stepSources: z.array(StepSourceSchema),
  /** flowId → cap으로 잘린 파일 목록. */
  truncatedSteps: z.array(
    z.object({ flowId: z.string(), dropped: z.array(z.string()) }),
  ),
});
export type SkeletonReport = z.infer<typeof SkeletonReportSchema>;

// ── 확정 게이트 (S7, Stage-16) ─────────────────────────────────────────────

export const ConfirmedDomainSchema = z.object({
  /** 후보 key (자연키 — skeleton ID의 닻). */
  key: z.string(),
  /** 표시명 (개명 반영, 기본 = key). */
  name: z.string(),
  roots: z.array(z.string()),
  /** 병합으로 흡수된 후보 key — 디렉토리/prefix 신호 파일의 귀속 추적용. */
  aliasKeys: z.array(z.string()),
});
export type ConfirmedDomain = z.infer<typeof ConfirmedDomainSchema>;

export const ConfirmedPlanSchema = z.object({
  schemaVersion: z.literal(1),
  /** 확정 시점의 candidates 입력 commit (드리프트 감지용). */
  gitCommit: z.string().nullable(),
  /** 승인 주체 핸들 (O3: 실명·사번 미저장) — auto-approve는 "auto". */
  decidedBy: z.string(),
  domains: z.array(ConfirmedDomainSchema),
  /** 게이트에서 제외 결정된 후보 key. */
  excludedKeys: z.array(z.string()),
});
export type ConfirmedPlan = z.infer<typeof ConfirmedPlanSchema>;

export const RoutesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  /**
   * Detected servlet context path (web.xml prefix mapping / server.servlet.context-path).
   * Informational only — routeId natural keys deliberately EXCLUDE it so that
   * deployment-config changes never re-key flows (A15 stability).
   */
  contextPath: z.string().nullable(),
  routes: z.array(RouteEntrySchema),
  batchEntries: z.array(BatchEntrySchema),
});
export type RoutesReport = z.infer<typeof RoutesReportSchema>;
