import { type CensusReport, type RoutesReport } from './types.js';
import { type DbSchemaModel } from '../db-schema/index.js';
/** `.understand-anything/` 하위 UA 네이티브 KG 파일명 — domain-graph.json(오버레이)과 다르다. */
export declare const KNOWLEDGE_GRAPH_FILENAME = "knowledge-graph.json";
/** 최소 KG 의 노드 종류 — UA GraphNodeSchema 의 부분집합(클래스/함수/도메인 등은 만들지 않음). */
export type MinimalKgNodeType = 'file' | 'config' | 'schema' | 'document' | 'table';
export interface MinimalKgNode {
    id: string;
    type: MinimalKgNodeType;
    name: string;
    filePath: string;
    lineRange?: [number, number];
    summary: string;
    tags: string[];
    /** 상수 — UA 정식 값(별칭 아님). 헤더 주석 참조. */
    complexity: 'simple';
}
/** 최소 KG 의 엣지 종류 — schema 파일 → table 하나뿐(defines_schema, UA EdgeTypeSchema 값). */
export interface MinimalKgEdge {
    source: string;
    target: string;
    type: 'defines_schema';
    direction: 'forward';
    weight: 1;
}
export interface MinimalKg {
    version: '1.0.0';
    project: {
        name: string;
        languages: string[];
        frameworks: string[];
        description: string;
        analyzedAt: string;
        gitCommitHash: string;
    };
    nodes: MinimalKgNode[];
    edges: MinimalKgEdge[];
    layers: [];
    tour: [];
    /** ktds 확장(passthrough) — 가드 마커. UA 스키마 재구성(validateGraph)이 이 키를
     * 벗겨내지만, 우리 가드는 원본 파일을 직접 JSON.parse 해서 읽으므로 문제 없다. */
    ktdsStructure: {
        generatedFromCommit: string;
        minimal: true;
    };
}
/**
 * 하드 시크릿 캐리어 확장자 — 최소 KG 는 이 확장자 파일을 노드화하지 않는다(적대 리뷰
 * C2). 코드뷰어 allowlist 는 KG 노드의 filePath 로 결정되므로, 노드를 아예 안 만들면
 * allowlist 에서 자동 제외된다(census 가 census 전 파일을 열거해도 이 파일들만큼은
 * 노출 표면에 오르지 않음). `.properties`/`.yml` 은 레거시 분석의 중심 파일이자 기존
 * LLM KG 의 config 노드 관례와 패리티라 **유지**한다 — STRUCTURE_FROM_MAP_DESIGN.md §6
 * 사용자 사인오프 사항. pfx/ppk/der/gpg 는 적대 리뷰 C2 마감 라운드에서 동일 위협군으로
 * 추가(각각 PKCS#12 번들·PuTTY 개인키·바이너리 인증서·PGP 개인키).
 */
export declare const SECRET_CARRIER_EXTENSIONS: string[];
/**
 * 확장자와 무관하게 파일명 패턴으로 제외 — keystore 류(확장자 무관 명명 관례).
 * ssh 개인키(id_rsa 류)는 별도 SSH_PRIVATE_KEY_PREFIX_RE 로 처리(공개키 예외 로직이
 * 붙어있어 이 배열에 넣으면 표현이 어긋난다).
 */
export declare const SECRET_CARRIER_NAME_PATTERNS: RegExp[];
/**
 * 템플릿/샘플 접미사(적대 리뷰 C2 3차 라운드, 오탐 방지) — 파일명의 **최종** dot-세그먼트가
 * 이 값이면 공유 안전 템플릿(.env.example, .env.sample 등 — 실제 값이 아니라 안내용 사본)
 * 으로 보고 제외하지 않는다. ssh 개인키 프리픽스 룰보다는 후순위(위 주석 참조).
 */
export declare const TEMPLATE_SUFFIXES: string[];
/**
 * 최종 확장자 지배 규칙(적대 리뷰 C2 3차 라운드) — 파일명의 **마지막** 확장자가 이
 * 목록에 있으면 그 파일은 소스/문서로 확정하고 시크릿 세그먼트 스캔·keystore 명명
 * 패턴 검사를 전부 건너뛴다. `server.key.bak` 류 우회를 막으려고 중간 세그먼트까지
 * 보게 만들었더니 `api.key.md`·`render.der.js`·`messages.key.json`·`keyStore.java`
 * 처럼 실제로는 평범한 소스/문서인 파일까지 과대 제외(오탐)하는 부작용이 생겼다 —
 * 레거시 소스가 조용히 KG 에서 누락되는 것은 이 제품의 정직성 원칙 위반이므로, "파일이
 * 실제로 무엇으로 취급되는가"는 항상 **마지막** 확장자가 결정한다는 원칙으로 되돌린다.
 * `txt` 는 의도적으로 제외했다 — 넣으면 `server.key.txt` 같은 위장 사본이 다시 통과한다
 * (id_rsa.txt 는 위 ssh 프리픽스 룰이 확장자 무관으로 먼저 잡으므로 영향 없음).
 */
export declare const SOURCE_DOC_EXTENSIONS: string[];
/** relPath 가 하드 시크릿 캐리어 패턴에 해당하면 true(최소 KG 노드화 제외 대상). */
export declare function isSecretCarrierPath(relPath: string): boolean;
export interface MinimalKgBuildInputs {
    projectRoot: string;
    census: CensusReport;
    dbSchema: DbSchemaModel;
    /** routes.json — 없으면(스캔 전/부재) frameworks=[]. */
    routes?: RoutesReport | null;
    gitCommit: string | null;
    /** 결정론 analyzedAt — 호출자가 gitCommitDate 등으로 미리 해석해 넣는다(순수 함수 유지). */
    analyzedAt: string;
    projectName?: string;
}
/**
 * census+db-schema(+routes)로부터 최소 UA KG 호환 객체를 조립한다(순수 함수 — 동일
 * 입력 byte-identical). 파일 노드(census 전 파일) + 테이블 노드(db-schema 전 테이블) +
 * schema 파일→table 의 defines_schema 엣지만 만든다.
 */
export declare function buildMinimalKg(inputs: MinimalKgBuildInputs): MinimalKg;
export declare class MinimalKgInputMissingError extends Error {
    constructor(message: string);
}
/**
 * `.spec/map/{census,db-schema,routes}.json` + git 커밋 정보를 로드한다(재스캔 0회).
 * census/db-schema 는 scan 의 필수 산출물이라 없으면 던진다(fail-closed, impact 엔진의
 * readRequired 와 동일 관례). routes 는 없으면 null(frameworks=[] 폴백, 치명적이지 않음).
 */
export declare function loadMinimalKgInputs(projectRoot: string): Omit<MinimalKgBuildInputs, 'analyzedAt' | 'projectName'>;
/**
 * analyzedAt 결정론 센티널 — gitCommit 이 없거나(비-git 프로젝트) gitCommitDate 가 null 을
 * 주면(P1: 커밋이 히스토리에서 사라짐 등) now() 대신 이 상수로 떨어진다. now() 폴백은
 * 동일 입력 재실행마다 byte-diff 를 내므로(적대 리뷰 C1) 전면 금지 — 두 경우 모두 이미
 * "커밋 시각을 모른다"는 사실 자체가 결정론적이니 그 사실을 고정값으로 표현한다.
 */
export declare const ANALYZED_AT_SENTINEL = "1970-01-01T00:00:00.000Z";
export type MinimalKgWriteAction = 'written' | 'skipped-existing-llm-kg' | 'skipped-invalid-target';
export interface MinimalKgWriteResult {
    action: MinimalKgWriteAction;
    path: string;
    message: string;
    nodeCount?: number;
    edgeCount?: number;
}
/**
 * 최소 KG 를 `.understand-anything/knowledge-graph.json` 에 기록한다 — 단, 기존 파일이
 * 있고 ktdsStructure 마커가 없으면(=/understand 의 LLM 산출로 추정) **덮어쓰지 않고
 * 경고만 반환**한다(조용한 파괴 금지, policy 폴스루 사고와 동일 계열 방어). 마커가
 * 있거나(우리가 이전에 쓴 최소 KG) 파일이 아예 없으면 기록한다. overwriteKg=true 는
 * 마커 유무와 무관하게 강제 기록(사용자 명시 의사).
 */
export declare function writeMinimalKg(projectRoot: string, kg: MinimalKg, options?: {
    overwriteKg?: boolean;
}): MinimalKgWriteResult;
/**
 * loadMinimalKgInputs → buildMinimalKg → writeMinimalKg(가드 포함) 를 한 번에 수행한다.
 * CLI(`emit-kg`, `map`)의 공통 진입점.
 */
export declare function emitMinimalKg(projectRoot: string, options?: {
    overwriteKg?: boolean;
    analyzedAt?: string;
    projectName?: string;
}): MinimalKgWriteResult;
//# sourceMappingURL=minimal-kg.d.ts.map