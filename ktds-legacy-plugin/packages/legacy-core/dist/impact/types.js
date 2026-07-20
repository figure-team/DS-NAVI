/**
 * /understand-impact 산출물 계약(zod 스키마 + z.infer 타입) — Component 4.
 *
 * 엔진 출력 `impact.json` 은 소비하는 `/understand-map` 산출물 옆 `.spec/map/` 에 산다.
 *
 * 결정론 계약(domain-map/types.ts 와 동형): 동일 commit + 동일 seeds 면 byte-identical.
 * → 타임스탬프 없음, 순회 순서 파생 순번 없음, 키 순서 고정, 모든 배열은 명시 키 정렬.
 * host(LLM) 산문/표 인용은 ImpactResult 에 들어가지 않는다(발행 시점에만 합류).
 *
 * 신뢰도 단일 소스: `../types.js` 의 CONFIDENCE_VALUES
 * (CONFIRMED/CONFIRMED_AI/INFERRED/UNVERIFIED). 블루프린트의 NEEDS_REVIEW 는
 * 본 fork 에서 UNVERIFIED 로 매핑한다(사람 확정은 doc-state 로). 중복 정의 금지.
 */
import { z } from 'zod';
import { EdgeKindSchema } from '../domain-map/types.js';
import { CONFIDENCE_VALUES } from '../types.js';
export const IMPACT_REPORT_FILENAME = 'impact.json';
/** Confidence 는 CONFIDENCE_VALUES 단일 소스에서 파생(수동 동기화 제거). */
export const ImpactConfidenceSchema = z.enum(CONFIDENCE_VALUES);
/**
 * 기본 역방향 도달성 엣지 필터 = `import` 를 제외한 모든 구조 엣지 종류.
 * 상수-only `import x.Y;` 는 종이상 의존이나 런타임 호출이 아니라 역방향 영향
 * 집합을 부풀린다 → 기본 제외. `field-type` 은 IN(타입 T 필드 보유는 진짜 구조
 * 의존). hub 폭발은 fanInThreshold 로 별도 제어, `import` 는 옵트인 가능.
 */
export const STRONG_EDGE_KINDS = [
    'injection',
    'field-type',
    'ctor-param',
    'extends',
    'implements',
    'impl',
    'mybatis',
    'mapper-xml',
    // 프런트 화면→백엔드 라우트 결선 — 런타임 실호출 근거(fetch/axios 리터럴)라 강엣지.
    'api-call',
];
export const DEFAULT_IMPACT_DEPTH_CAP = 12; // slices DEFAULT_DEPTH_CAP 과 대칭
export const DEFAULT_FAN_IN_THRESHOLD = 24; // 역방향 fan-in 이 이를 넘으면 hub 후보
export const ImpactOptionsSchema = z.object({
    depthCap: z.number().int().positive().default(DEFAULT_IMPACT_DEPTH_CAP),
    /** 영향 전파로 치는 엣지 종류. 기본 = 강신호만. */
    edgeKinds: z.array(EdgeKindSchema).default([...STRONG_EDGE_KINDS]),
    fanInThreshold: z.number().int().positive().default(DEFAULT_FAN_IN_THRESHOLD),
});
// ── 시드(seed) ────────────────────────────────────────────────────────────────
export const SEED_ORIGINS = [
    /** 명시 --path: 사용자가 파일을 직접 지정(최고 신뢰). */
    'path',
    /** host(Claude)가 자연어 → 파일 매핑(UNVERIFIED 가능). */
    'nl',
    /** 라우트 선언 파일에서 파생. */
    'route',
    /** 도메인/흐름 노드에서 파생. */
    'domain',
];
export const ImpactSeedSchema = z.object({
    /** 프로젝트 루트 상대 경로(forward slash) — 알고리즘 입력. */
    relPath: z.string(),
    origin: z.enum(SEED_ORIGINS),
    /** 시드 자체 신뢰도 — 'nl' origin 은 UNVERIFIED 일 수 있다. */
    confidence: ImpactConfidenceSchema,
});
// ── 인용(검증 가능한 근거 앵커) ──────────────────────────────────────────────
// impact/verify.ts 가 path-escape → file-exist → line-range → text-match 게이트를
// 돌릴 수 있도록 {filePath,line} 앵커 + 선택 snippet.
export const ImpactCitationSchema = z.object({
    filePath: z.string().min(1),
    line: z.number().int().positive(),
    /**
     * 실제 소스 라인 텍스트. 순수 단계(reach/api/persistence/flow)는 앵커만 방출하고
     * snippet 은 엔진(IO)이 채운다(고정 commit 의 라인 텍스트는 commit 의 함수 → 결정론).
     * 엔진이 못 읽은 파일은 snippet 없이 발행되고 verify 가 trivial-snippet 으로 강등.
     */
    snippet: z.string().optional(),
});
// ── 영향 파일(도달성 폐포) ──────────────────────────────────────────────────
export const AffectedFileSchema = z.object({
    relPath: z.string(),
    /** 이 파일이 시드 집합에 도달/의존하는 엣지 종류들(정렬). */
    viaKinds: z.array(EdgeKindSchema),
    /** 가장 가까운 시드로부터의 최단 BFS 거리(1 = 직접 이웃). */
    minDepth: z.number().int().nonnegative(),
    /** 전파 엣지의 이 파일 근거 라인(있을 때). */
    citation: ImpactCitationSchema.nullable(),
});
// ── API / 배치 진입점 영향 ──────────────────────────────────────────────────
export const API_IMPACT_VIA = ['ownership', 'reverse', 'both'];
export const ApiImpactSchema = z.object({
    /** 'route' → id 는 routeId; 'batch' → id 는 entryId. */
    targetKind: z.enum(['route', 'batch']),
    id: z.string(),
    filePath: z.string(),
    line: z.number().int().positive(),
    handler: z.string().nullable(),
    /** ownership=1차(캡일관), reverse=2차 교차, both=양쪽 일치. */
    via: z.enum(API_IMPACT_VIA),
    confidence: ImpactConfidenceSchema,
});
// ── DB / 영속성 영향 ────────────────────────────────────────────────────────
export const PersistenceMapperSchema = z.object({
    relPath: z.string(),
    /** MyBatis namespace(mapper XML)을 알면 채움, 아니면 null. */
    namespace: z.string().nullable(),
    /** 이 매퍼에 도달하는 진입점(라우트/배치 루트), 정렬. */
    owners: z.array(z.string()),
    citation: ImpactCitationSchema.nullable(),
});
export const PersistenceSqlFileSchema = z.object({
    relPath: z.string(),
    lang: z.string(),
});
/** host-fill 닻: host 가 테이블/컬럼 인용을 추출할 SQL 슬라이스 위치. */
export const TableCandidateSlotSchema = z.object({
    mapperRelPath: z.string(),
    sqlSlice: z.object({
        filePath: z.string(),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
    }),
});
/** KG table 노드 카탈로그(host-추출 테이블명의 DDL 근거 닻). */
export const KgTableEntrySchema = z.object({
    name: z.string(),
    filePath: z.string(),
    startLine: z.number().int().positive().nullable(),
    endLine: z.number().int().positive().nullable(),
});
/**
 * JPA entity↔table 영향(보완 B, AC-16). MyBatis Mapper-XML 대신 @Entity/@Table 애너테이션
 * 경로로 file:line grounding. 명시 @Table = CONFIRMED, 암묵 명명전략 = INFERRED([추정]).
 */
export const JpaTableImpactSchema = z.object({
    entityClass: z.string(),
    relPath: z.string(),
    tableName: z.string(),
    tableExplicit: z.boolean(),
    confidence: ImpactConfidenceSchema,
    citation: ImpactCitationSchema,
    /** 영향 컬럼(명시=CONFIRMED, 암묵=INFERRED), 정렬. */
    columns: z.array(z.object({ column: z.string(), confidence: ImpactConfidenceSchema, line: z.number().int().positive() })),
});
export const PersistenceImpactSchema = z.object({
    mappers: z.array(PersistenceMapperSchema),
    sqlFiles: z.array(PersistenceSqlFileSchema),
    tableCandidateSlots: z.array(TableCandidateSlotSchema),
    kgTableCatalog: z.array(KgTableEntrySchema),
    /** JPA entity↔table 영향(MyBatis 전용 프로젝트는 빈 배열). */
    jpaTables: z.array(JpaTableImpactSchema).default([]),
    /** 항상 존재하는 노트: SQL 파일은 도달성 그래프 밖. */
    note: z.string(),
});
// ── 흐름 / 도메인 영향 ──────────────────────────────────────────────────────
export const FLOW_IMPACT_VIA = ['step', 'ownership-fallback'];
export const FlowImpactSchema = z.object({
    flowId: z.string(),
    /** 'flow:'→'route:' prefix 치환(흐름이 라우트에 매핑될 때). */
    routeId: z.string().nullable(),
    domainId: z.string().nullable(),
    domainKey: z.string().nullable(),
    /** 확정 표시명(domain-plan.confirmed.json), 없으면 null → UNVERIFIED. */
    domainName: z.string().nullable(),
    viaStepId: z.string().nullable(),
    via: z.enum(FLOW_IMPACT_VIA),
    /** step 입도가 라우트-선언-파일 단위라 '실 호출'이 아닌 '체인 내 도달' → INFERRED. */
    confidence: ImpactConfidenceSchema,
});
export const DomainImpactSchema = z.object({
    domainId: z.string().nullable(),
    key: z.string(),
    name: z.string().nullable(),
    confidence: ImpactConfidenceSchema,
});
// ── 과도전파 투명성 ──────────────────────────────────────────────────────────
export const OverEdgesSchema = z.object({
    /** 역방향 fan-in 이 fanInThreshold 를 넘는 파일(hub 후보). */
    hubNodes: z.array(z.object({ relPath: z.string(), fanIn: z.number().int().nonnegative() })),
    /**
     * import(약신호)로만 도달하는 "숨은" 의존 파일 수 — 강신호 기본 필터가 제외한,
     * import 를 옵트인하면 추가로 보일 파일 수. edgeKinds 에 import 가 이미 포함되면 0.
     */
    importOnlyCount: z.number().int().nonnegative(),
    /** API ownership(1차)과 reverse(2차)가 불일치한 항목 → UNVERIFIED. */
    crossCheckDiff: z.array(z.object({ id: z.string(), side: z.enum(['ownership-only', 'reverse-only']) })),
});
export const NeedsReviewItemSchema = z.object({
    ref: z.string(),
    reason: z.string(),
});
// ── 최상위 리포트(= impact.json) ─────────────────────────────────────────────
export const ImpactResultSchema = z.object({
    schemaVersion: z.literal(1),
    /** 소비한 .spec/map 산출물 생산 시점의 HEAD commit. */
    gitCommit: z.string().nullable(),
    /** 재현/투명성을 위해 echo 한 해소된 옵션. */
    depthCap: z.number().int().positive(),
    edgeKinds: z.array(EdgeKindSchema),
    fanInThreshold: z.number().int().positive(),
    seeds: z.array(ImpactSeedSchema),
    /** upstream = 시드에 의존하는 파일/진입점(변경에 영향받음). */
    upstream: z.object({
        files: z.array(AffectedFileSchema),
        api: z.array(ApiImpactSchema),
        persistence: PersistenceImpactSchema,
        flows: z.array(FlowImpactSchema),
        domains: z.array(DomainImpactSchema),
    }),
    /** downstream = 시드가 의존하는 협력자(보조). */
    downstream: z.object({
        files: z.array(AffectedFileSchema),
    }),
    overEdges: OverEdgesSchema,
    needsReview: z.array(NeedsReviewItemSchema),
});
//# sourceMappingURL=types.js.map