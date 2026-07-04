/**
 * domain-map 데이터 계약(zod 스키마 + z.infer 타입).
 *
 * census(파일 인구조사)와 routes(라우트/배치 추출) 산출물의 단일 소스.
 * 블루프린트 관측 동작과 골든 등가: 스키마 버전·필드명·열거값을 핀.
 * 모든 산출 배열은 생산자에서 명시 키로 정렬되어 결정론을 보장한다.
 */
import { z } from 'zod'

/** census.json — 프로젝트 파일 인구조사. */
export const CensusReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  fileCount: z.number().int(),
  files: z.array(
    z.object({
      relPath: z.string(),
      lang: z.string(),
    }),
  ),
})
export type CensusReport = z.infer<typeof CensusReportSchema>

/** HTTP 메서드 — ANY 는 메서드 미특정(매핑 전체 수용). */
export const RouteMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
  'ANY',
])
export type RouteMethod = z.infer<typeof RouteMethodSchema>

/** 라우트 종류 — api(데이터) / form(뷰 제출) / page(렌더) / servlet(레거시). */
export const RouteKindSchema = z.enum(['api', 'form', 'page', 'servlet'])
export type RouteKind = z.infer<typeof RouteKindSchema>

/** 라우트 프레임워크. */
export const RouteFrameworkSchema = z.enum(['spring', 'stripes', 'webxml', 'jsp', 'nextjs'])
export type RouteFramework = z.infer<typeof RouteFrameworkSchema>

/** 단일 라우트 엔트리. */
export const RouteEntrySchema = z.object({
  routeId: z.string(),
  method: RouteMethodSchema,
  path: z.string(),
  rawPath: z.string(),
  kind: RouteKindSchema,
  framework: RouteFrameworkSchema,
  filePath: z.string(),
  line: z.number().int(),
  handler: z.string().nullable(),
  notes: z.array(z.string()),
})
export type RouteEntry = z.infer<typeof RouteEntrySchema>

/** 배치/스케줄 진입점 엔트리. */
export const BatchEntrySchema = z.object({
  entryId: z.string(),
  trigger: z.enum([
    'scheduled',
    'quartz',
    'task-xml',
    'main',
    // W2 확장 — spring-batch XML / Quartz Java API / 프로그램적 스케줄러 / 외부 트리거.
    'spring-batch',
    'quartz-java',
    'executor',
    'timer',
    'shell',
    'crontab',
  ]),
  schedule: z.string().nullable(),
  filePath: z.string(),
  line: z.number().int(),
  handler: z.string().nullable(),
  notes: z.array(z.string()),
  /**
   * W2: 해석된 잡 구현 파일 — XML 엔트리는 빈 ref → 클래스 → census 파일로 해석
   * (실패 시 null=[미확인]), Java 엔트리는 filePath 자명. 도달성 루트로 주입되어
   * "배치 잡 클래스 = 데드코드" 오판을 제거한다. optional: 구 routes.json 하위호환.
   */
  handlerFile: z.string().nullable().optional(),
})
export type BatchEntry = z.infer<typeof BatchEntrySchema>

/** routes.json — 라우트/배치 추출 산출물. */
export const RoutesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  contextPath: z.string().nullable(),
  routes: z.array(RouteEntrySchema),
  batchEntries: z.array(BatchEntrySchema),
})
export type RoutesReport = z.infer<typeof RoutesReportSchema>

/**
 * 엣지 종류 — 파일↔파일 의존을 한정한다.
 * import(import 문) / injection(@Autowired·@Resource·@Inject) / field-type(평범한 필드 타입) /
 * ctor-param(생성자 파라미터 타입) / extends / implements / impl(인터페이스→구현) /
 * mybatis(SqlSession 문자열 호출→매퍼) / mapper-xml(매퍼 인터페이스→매퍼 XML).
 */
export const EdgeKindSchema = z.enum([
  'import',
  'injection',
  'field-type',
  'ctor-param',
  'extends',
  'implements',
  'impl',
  'mybatis',
  'mapper-xml',
])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

/** 단일 엣지 — source/target 은 census relPath. */
export const EdgeRecordSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: EdgeKindSchema,
  line: z.number().int().nullable(),
})
export type EdgeRecord = z.infer<typeof EdgeRecordSchema>

/** 미해소 참조 — 절대 조용히 누락하지 않는다(ambiguous=다중후보 / not-found=후보없음). */
export const UnresolvedSchema = z.object({
  source: z.string(),
  ref: z.string(),
  reason: z.enum(['ambiguous', 'not-found']),
})
export type Unresolved = z.infer<typeof UnresolvedSchema>

/** edges.json — 파일 의존 엣지 산출물. */
export const EdgesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  edges: z.array(EdgeRecordSchema),
  unresolved: z.array(UnresolvedSchema),
})
export type EdgesReport = z.infer<typeof EdgesReportSchema>

/** 단일 슬라이스 — 루트에서 도달 가능한 파일 집합. */
export const SliceRecordSchema = z.object({
  root: z.string(),
  entryIds: z.array(z.string()),
  reached: z.array(z.string()),
})
export type SliceRecord = z.infer<typeof SliceRecordSchema>

/** 파일 소유권 — sole(단독)/shared(공유)/unreached(미도달). */
export const OwnershipSchema = z.object({
  relPath: z.string(),
  status: z.enum(['sole', 'shared', 'unreached']),
  owners: z.array(z.string()),
})
export type Ownership = z.infer<typeof OwnershipSchema>

/** slices.json — 슬라이스/소유권 산출물. */
export const SlicesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  depthCap: z.number().int(),
  slices: z.array(SliceRecordSchema),
  ownership: z.array(OwnershipSchema),
})
export type SlicesReport = z.infer<typeof SlicesReportSchema>

/**
 * 계층(layer) — ground-truth 신호로 동적 추론(하드코딩 4계층 아님, AC-2).
 * 신호가 없으면 'unknown'(정직성: 조용히 끼워맞추지 않음).
 */
export const FlowLayerSchema = z.enum(['api', 'service', 'dao', 'db', 'unknown'])
export type FlowLayer = z.infer<typeof FlowLayerSchema>

/**
 * 후보 파일에 도메인이 부여된 신호 출처.
 * reachability(도달성, 주) > directory(디렉토리, 교차검증) > prefix(파일명, 폴백).
 */
export const DomainViaSchema = z.enum(['reachability', 'directory', 'prefix'])
export type DomainVia = z.infer<typeof DomainViaSchema>

/** 후보 도메인 1건의 파일 멤버 — relPath + 부여 신호. */
export const DomainFileSchema = z.object({
  relPath: z.string(),
  via: DomainViaSchema,
})
export type DomainFile = z.infer<typeof DomainFileSchema>

/** 단일 도메인 후보 — key 는 불변(다운스트림 skeleton 의 닻). */
export const DomainCandidateSchema = z.object({
  key: z.string(),
  roots: z.array(z.string()),
  entryCount: z.number().int(),
  files: z.array(DomainFileSchema),
})
export type DomainCandidate = z.infer<typeof DomainCandidateSchema>

/**
 * candidates.json — 결정론적 도메인 분류(S4-5) 산출물.
 * 신호 우선순위: 도달성 > 디렉토리 > prefix. 모호/공용/미해소는 절대 누락하지 않는다.
 */
export const CandidatesReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  directoryDegenerate: z
    .object({ reason: z.enum(['too-few-clusters', 'single-cluster-concentration']) })
    .nullable(),
  candidates: z.array(DomainCandidateSchema),
  common: z.array(
    z.object({
      relPath: z.string(),
      owners: z.array(z.string()),
    }),
  ),
  ambiguous: z.array(
    z.object({
      relPath: z.string(),
      reachKey: z.string(),
      directoryKey: z.string(),
    }),
  ),
  unresolved: z.array(z.string()),
})
export type CandidatesReport = z.infer<typeof CandidatesReportSchema>

/** 확정된 단일 도메인 — key 는 불변, name 은 표시용(개명 가능). */
export const ConfirmedDomainSchema = z.object({
  key: z.string(),
  name: z.string(),
  roots: z.array(z.string()),
  aliasKeys: z.array(z.string()),
})
export type ConfirmedDomain = z.infer<typeof ConfirmedDomainSchema>

/**
 * domain-plan.confirmed.json — 사람 게이트(S7) 결정의 영속화.
 * 재실행 결정론의 닻이다. 모든 배열은 정렬되어 byte-identical 을 보장한다.
 */
export const ConfirmedPlanSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  decidedBy: z.string(),
  domains: z.array(ConfirmedDomainSchema),
  excludedKeys: z.array(z.string()),
})
export type ConfirmedPlan = z.infer<typeof ConfirmedPlanSchema>

// ──────────────────────────────────────────────────────────────────────────
// SKELETON(S6) — 결정론적 도메인 그래프 골격.
//
// U-A domain-graph 호환 domain/flow/step 노드 + contains_flow/flow_step/calls
// 엣지를 confirmed plan + 스캔 산출물에서 결정론으로 조립한다. 의미 필드
// (name/summary)는 SKELETON_BLANK — S8 LLM 채움이 P4에서 enrich, S9 인용검증이
// 이어진다. P2 는 구조 골격만 emit 해 대시보드/dual-load 가 데이터를 갖게 한다.
//
// 중요: P2 의 step 은 슬라이스(파일 단위 도달성)에서 STRUCTURALLY 도출한다.
// 메서드 단위 호출 그래프(8-receiver 해소)는 P3 — 여기서 빌드하지 않는다.
// (문서화된 폴백: 메서드 정밀 step 은 P3 enhancement.)
// ──────────────────────────────────────────────────────────────────────────

/** SKELETON 의 비어 있는 의미 필드 — S8 LLM 채움 전까지 name/summary 는 공란. */
export const SKELETON_BLANK = '' as const

/** flow 당 step 상한 — 초과분은 truncatedSteps 로 보고(조용한 누락 금지). */
export const DEFAULT_STEP_CAP = 8

/** 그래프 노드 종류. */
export const UaGraphNodeTypeSchema = z.enum(['domain', 'flow', 'step'])
export type UaGraphNodeType = z.infer<typeof UaGraphNodeTypeSchema>

/** 복잡도 등급 — 멤버 수/step 수 기반 결정론적 임계값. */
export const UaComplexitySchema = z.enum(['simple', 'moderate', 'complex'])
export type UaComplexity = z.infer<typeof UaComplexitySchema>

/** U-A domain-graph 호환 노드(domain/flow/step). name/summary 는 SKELETON_BLANK 로 시작. */
export const UaGraphNodeSchema = z.object({
  id: z.string(),
  type: UaGraphNodeTypeSchema,
  name: z.string(),
  filePath: z.string().optional(),
  lineRange: z.tuple([z.number().int(), z.number().int()]).optional(),
  summary: z.string(),
  tags: z.array(z.string()),
  complexity: UaComplexitySchema,
  domainMeta: z.record(z.string(), z.unknown()).optional(),
  layer: FlowLayerSchema.optional(),
})
export type UaGraphNode = z.infer<typeof UaGraphNodeSchema>

/** 그래프 엣지 종류 — contains_flow(도메인→흐름)/flow_step(흐름→단계)/calls(단계→단계). */
export const UaGraphEdgeTypeSchema = z.enum(['contains_flow', 'flow_step', 'calls'])
export type UaGraphEdgeType = z.infer<typeof UaGraphEdgeTypeSchema>

/** U-A domain-graph 호환 엣지. weight 는 flow_step 의 단조 진행도(마지막≈1). */
export const UaGraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: UaGraphEdgeTypeSchema,
  weight: z.number().optional(),
  description: z.string().optional(),
})
export type UaGraphEdge = z.infer<typeof UaGraphEdgeSchema>

/** step 노드의 근거 출처 — 인용 검증(S9)·문서화의 닻. */
export const StepSourceSchema = z.object({
  stepId: z.string(),
  relPath: z.string(),
  line: z.number().int(),
  className: z.string().nullable(),
})
export type StepSource = z.infer<typeof StepSourceSchema>

/**
 * skeleton.json — S6 결정론 골격 산출물.
 * 모든 배열은 자연키로 정렬되어 byte-identical 재실행을 보장한다.
 * truncatedSteps 는 stepCap 초과로 누락된 step 을 정직하게 보고한다(조용한 cap 금지).
 */
export const SkeletonReportSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  stepCap: z.number().int(),
  nodes: z.array(UaGraphNodeSchema),
  edges: z.array(UaGraphEdgeSchema),
  stepSources: z.array(StepSourceSchema),
  truncatedSteps: z.array(
    z.object({
      flowId: z.string(),
      dropped: z.array(z.string()),
    }),
  ),
})
export type SkeletonReport = z.infer<typeof SkeletonReportSchema>

// ──────────────────────────────────────────────────────────────────────────
// SUPPLEMENT E — 도메인 맵 요약 산출(E-a/E-b/E-c) + AC-3 요약.
//
// E-c: 교차 도메인 의존 그래프(AC-33) — 파일 의존 엣지를 도메인 단위로 집계하되
//      근거(evidence)는 실제 파일 엣지로 GROUNDED 하게 보존한다(합성 금지).
// E-b: 온보딩 우선순위(AC-32) — "여기부터 보세요" 결정론 랭킹.
// E-a: LLM 도메인명 제안 CONTEXT(AC-31) — 엔진은 LLM 을 호출하지 않고 컨텍스트만
//      만든다. 적용은 confirm.renameDomain 으로(키 불변).
// AC-3: 도메인 맵 요약 — 확정 플랜 + skeleton + 교차도메인 + 우선순위의 결합.
//
// 모든 배열은 생산자에서 정렬되어 byte-identical 재실행을 보장한다.
// ──────────────────────────────────────────────────────────────────────────

/**
 * 교차 도메인 엣지 1건의 근거 — 집계 이전의 실제 파일 의존 엣지.
 * source/target 은 census relPath, kind 는 EdgeKind 문자열, line 은 선언 라인(없으면 null).
 */
export const CrossDomainEvidenceSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: z.string(),
  line: z.number().int().nullable(),
})
export type CrossDomainEvidence = z.infer<typeof CrossDomainEvidenceSchema>

/** 교차 도메인 엣지 — from→to 도메인, weight=근거 엣지 수, evidence=근거 파일 엣지. */
export const CrossDomainEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number().int(),
  evidence: z.array(CrossDomainEvidenceSchema),
})
export type CrossDomainEdge = z.infer<typeof CrossDomainEdgeSchema>

/**
 * 교차 도메인 의존 그래프(E-c, AC-33).
 * 자기 도메인(self) 엣지는 제외, (from,to) 정렬. 모든 엣지는 grounded(근거 보유).
 */
export const CrossDomainGraphSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  edges: z.array(CrossDomainEdgeSchema),
})
export type CrossDomainGraph = z.infer<typeof CrossDomainGraphSchema>

/**
 * 도메인 온보딩 우선순위(E-b, AC-32).
 * priorityScore = 복잡도·크기·결합도의 결정론 가중합(고정 정수 가중치, 문서화됨).
 * rank 는 (priorityScore DESC, key ASC) 정렬의 1-based 위치(결정론 tie-break).
 */
export const DomainPrioritySchema = z.object({
  key: z.string(),
  sizeScore: z.number().int(),
  complexityScore: z.number().int(),
  couplingScore: z.number().int(),
  priorityScore: z.number().int(),
  rank: z.number().int(),
})
export type DomainPriority = z.infer<typeof DomainPrioritySchema>

/** 도메인 맵 요약의 단일 도메인 행(AC-3). */
export const DomainMapSummaryDomainSchema = z.object({
  key: z.string(),
  name: z.string(),
  flowCount: z.number().int(),
  nodeCount: z.number().int(),
  priorityScore: z.number().int(),
  rank: z.number().int(),
  grounded: z.boolean(),
  sampleAnchors: z.array(z.object({ file: z.string(), line: z.number().int() })),
})
export type DomainMapSummaryDomain = z.infer<typeof DomainMapSummaryDomainSchema>

/**
 * domain-map.json — AC-3 도메인 맵 요약 산출물.
 * 확정 플랜 표시명 + flow/node 집계 + grounded(앵커 완비 여부) + 우선순위 + 교차도메인.
 * 모든 배열은 정렬되어 byte-identical 재실행을 보장한다.
 */
export const DomainMapSummarySchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  domains: z.array(DomainMapSummaryDomainSchema),
  crossDomain: CrossDomainGraphSchema,
})
export type DomainMapSummary = z.infer<typeof DomainMapSummarySchema>

// ──────────────────────────────────────────────────────────────────────────
// METHOD-CALL GRAPH(P3.1) — 메서드 단위 호출 그래프(8-receiver 해소).
//
// 모든 메서드 본문의 각 호출(invocation)을 수신자(receiver) 종류별로 해소해
// 대상 메서드 선언(프로젝트 내 해소 가능 시)으로 잇는다. P2 의 파일 단위 step 을
// 메서드 정밀로 정련하기 위한 기반(skeleton 의 선택적 refinement).
//
// receiverKind 8종:
//   field/param/local/self/super/static/return-type/external + unresolved(보고, 누락 금지).
// 결정론: calls 는 (callerFile, callLine, calleeMethod) 자연키 정렬.
// ──────────────────────────────────────────────────────────────────────────

/**
 * 호출 수신자 해소 종류 — 8 receiver kinds + unresolved.
 *   field       : `this.svc.go()` / `svc.go()` (svc=필드) -> 필드 선언 타입.
 *   param       : `p.go()` (p=메서드 파라미터) -> 파라미터 선언 타입.
 *   local       : `Foo x = new Foo(); x.go()` -> 지역변수 선언/추론 타입.
 *   self        : `go()` / `this.go()` (수신자 없음) -> 외곽 클래스(+상위).
 *   super       : `super.go()` -> 슈퍼클래스.
 *   static      : `Foo.go()` (Foo=타입명) -> 타입 Foo 의 정적 메서드.
 *   return-type : `a.b().c()` -> `b()` 의 반환 타입 -> 그 타입의 `.c()`.
 *   external    : 수신자가 JDK/라이브러리 타입(java.* 등, 프로젝트 내 선언 없음).
 *   unresolved  : 해소 불가(람다/캐스트/추론불가 var 등) — 보고, 절대 누락 금지.
 */
export const ReceiverKindSchema = z.enum([
  'field',
  'param',
  'local',
  'self',
  'super',
  'static',
  'return-type',
  'external',
  'unresolved',
])
export type ReceiverKind = z.infer<typeof ReceiverKindSchema>

/**
 * 해소된 단일 호출 — caller(메서드)에서 callee(메서드)로의 메서드 단위 엣지.
 * calleeClass/calleeFile 은 external/unresolved 시 null(보고하되 드롭하지 않음).
 * overloadArity: 동명 오버로드를 argCount 로 선택했을 때 고른 오버로드의 파라미터 수.
 *   - 정확 일치 1건  -> 그 파라미터 수.
 *   - 후보 0/모호    -> null(정직성: 임의 선택 금지).
 */
export const ResolvedCallSchema = z.object({
  callerClass: z.string(),
  callerMethod: z.string(),
  callerFile: z.string(),
  callLine: z.number().int(),
  calleeClass: z.string().nullable(),
  calleeMethod: z.string(),
  calleeFile: z.string().nullable(),
  receiverKind: ReceiverKindSchema,
  argCount: z.number().int(),
  overloadArity: z.number().int().nullable(),
})
export type ResolvedCall = z.infer<typeof ResolvedCallSchema>

/**
 * method-calls.json — 메서드 단위 호출 그래프 산출물.
 * calls 는 (callerFile, callLine, calleeMethod) 자연키 정렬 — byte-identical 재실행 보장.
 */
export const MethodCallGraphSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  calls: z.array(ResolvedCallSchema),
})
export type MethodCallGraph = z.infer<typeof MethodCallGraphSchema>

/** LLM 도메인명 제안 컨텍스트의 단일 도메인(E-a, AC-31). */
export const NameSuggestionDomainSchema = z.object({
  key: z.string(),
  currentName: z.string(),
  sampleFiles: z.array(z.string()),
  tokens: z.array(z.string()),
})
export type NameSuggestionDomain = z.infer<typeof NameSuggestionDomainSchema>

/**
 * LLM 도메인명 제안 컨텍스트(E-a, AC-31).
 * 엔진은 LLM 을 호출하지 않는다 — HOST LLM 이 한국어 이름을 제안할 컨텍스트만 만든다.
 * 적용은 confirm.renameDomain(plan,key,name) 으로(key 불변).
 */
export const NameSuggestionContextSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  domains: z.array(NameSuggestionDomainSchema),
})
export type NameSuggestionContext = z.infer<typeof NameSuggestionContextSchema>
