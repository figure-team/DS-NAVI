import type { CandidatesReport, CensusReport, ConfirmedPlan, DomainMapSummary, EdgesReport, MethodCallGraph, RoutesReport, SkeletonReport, SlicesReport, UaGraphEdge, UaGraphNode } from './types.js';
/** 확정 플랜 파일명(`.spec/map/` 하위) — S7 사람 게이트 결정의 영속 닻. */
export declare const CONFIRMED_PLAN_FILENAME = "domain-plan.confirmed.json";
/** `.spec/map/` 정규 산출물 파일명 — 소비자(impact 엔진 등)가 재스캔 0회로 로드. */
export declare const CENSUS_FILENAME = "census.json";
export declare const ROUTES_FILENAME = "routes.json";
export declare const EDGES_FILENAME = "edges.json";
export declare const SLICES_FILENAME = "slices.json";
export declare const SKELETON_FILENAME = "skeleton.json";
/** `.spec/map/` 디렉터리 경로. */
export declare function specMapDir(projectRoot: string): string;
/**
 * 커밋의 커미터 시각(ISO, UTC 정규화) — emit envelope 의 analyzedAt 결정론 소스.
 * 같은 skeleton(=같은 커밋)이면 언제 emit 해도 같은 값(P5 에서 발견한 벽시계
 * 비결정론 교정 — CLI 의 "재실행 byte-diff=0" 주장과 산출물을 일치시킨다).
 */
export declare function gitCommitDate(projectRoot: string, hash: string): string | null;
/** 현재 git 커밋 해시(HEAD). git 저장소가 아니거나 실패하면 null. */
export declare function gitCommitHash(projectRoot: string): string | null;
/**
 * 안정 JSON 직렬화 — 키 재귀 정렬, 2칸 들여쓰기, 후행 개행.
 * 동일 입력 -> byte-identical 출력.
 */
export declare function stableJson(value: unknown): string;
/** census.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeCensus(projectRoot: string, report: CensusReport): void;
/** routes.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeRoutes(projectRoot: string, report: RoutesReport): void;
/** edges.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeEdges(projectRoot: string, report: EdgesReport): void;
/** slices.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeSlices(projectRoot: string, report: SlicesReport): void;
/** candidates.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeCandidates(projectRoot: string, report: CandidatesReport): void;
/**
 * domain-plan.confirmed.json 기록(`.spec/map/` mkdir -p 선행).
 * 기록한 파일의 절대 경로를 반환한다.
 */
export declare function writeConfirmedPlan(projectRoot: string, plan: ConfirmedPlan): string;
/**
 * domain-plan.confirmed.json 을 읽는다. 파일이 없으면 null.
 * 권한/IO 오류는 던진다(fail-closed: "미확정"으로 오인하지 않음).
 * 스키마 검증으로 손편집/버전 스큐를 조용히 통과시키지 않는다(zod parse).
 */
export declare function readConfirmedPlan(projectRoot: string): ConfirmedPlan | null;
/** skeleton.json 기록(`.spec/map/` mkdir -p 선행) — S6 결정론 골격의 영속. */
export declare function writeSkeleton(projectRoot: string, report: SkeletonReport): void;
/**
 * skeleton.json 을 읽는다(있으면). 파일 없음 -> null(흐름 영향은 ownership 폴백).
 * 권한/IO 오류는 던진다(fail-closed). zod parse 로 손편집/버전 스큐 차단.
 */
export declare function readSkeleton(projectRoot: string): SkeletonReport | null;
/**
 * `.spec/map/<fileName>` 에 임의 정규 산출물을 안정 JSON 으로 기록하고 절대 경로를
 * 반환한다(impact.json / impact-verify-report.json 등). 파일명 가드: 경로 세그먼트·
 * 숨김 파일·빈 이름은 거부(fail-closed) — `.spec/map` 밖 탈출 방지.
 */
export declare function writeMapArtifact(projectRoot: string, fileName: string, report: unknown): string;
/**
 * `.spec/map/<fileName>` 의 정규 산출물을 읽어 스키마로 파싱한다. 파일 없음 -> null.
 * 권한/IO 오류는 던진다(fail-closed).
 */
export declare function readMapArtifact<T>(projectRoot: string, fileName: string, schema: {
    parse: (v: unknown) => T;
}): T | null;
/** method-calls.json 기록(`.spec/map/` mkdir -p 선행) — P3 메서드 단위 호출 그래프. */
export declare function writeMethodCalls(projectRoot: string, report: MethodCallGraph): void;
/** domain-map.json 파일명(`.spec/map/` 하위) — AC-3 도메인 맵 요약. */
export declare const DOMAIN_MAP_SUMMARY_FILENAME = "domain-map.json";
/** domain-map.json 기록(`.spec/map/` mkdir -p 선행) — AC-3 도메인 맵 요약(E-a/E-b/E-c 결합). */
export declare function writeDomainMapSummary(projectRoot: string, report: DomainMapSummary): void;
/** `.understand-anything/` 디렉터리 경로 — dual-load 오버레이가 사는 곳(`.spec` 아님). */
export declare function uaDir(projectRoot: string): string;
/** dual-load 오버레이 파일명 — orchestrator(loadProjectGraph)가 fetch 하는 경로. */
export declare const DOMAIN_GRAPH_FILENAME = "domain-graph.json";
/**
 * domain-graph.json 기록 — `.understand-anything/`(NOT `.spec`)에 { nodes, edges }
 * 구조 오버레이를 쓴다. dual-load(orchestrator)가 이 파일을 읽어 UA KG 와 병합한다.
 * 기록한 파일의 절대 경로를 반환한다.
 *
 * 주: P2 는 name 이 공란(SKELETON_BLANK)인 구조 골격만 emit 한다. LLM 채움(S8)·
 * 인용 검증(S9)이 P4 에서 name/summary 를 enrich 한다. 대시보드/dual-load 가
 * P2 시점에 데이터를 갖도록 골격을 먼저 emit 하는 것이 목적이다.
 */
export declare function writeDomainGraph(projectRoot: string, graph: {
    nodes: UaGraphNode[];
    edges: UaGraphEdge[];
    [key: string]: unknown;
}): string;
/** 대시보드용 config.json 파일명(`.understand-anything/` 하위) — UA 대시보드가 fetch. */
export declare const DASHBOARD_CONFIG_FILENAME = "config.json";
/**
 * `.understand-anything/config.json` 기록 — UA 대시보드가 fetch 해 UI 언어(outputLanguage)를
 * 정하는 파일. UA 코어 persistence 의 기본값은 "en"(불변식 영역이라 무수정)이라, ktds 는
 * 사용자 설정(understanding.config.json, 기본 ko)을 이 경로로 오버레이해 한국어 기본을
 * 보장한다. understanding.config.json 이 없거나 손상이면 ko 로 폴백한다.
 * 기록한 파일의 절대 경로를 반환한다.
 */
export declare function writeDashboardConfig(projectRoot: string): string;
//# sourceMappingURL=persist.d.ts.map