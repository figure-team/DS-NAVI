/**
 * 빌더 공유 입력 모델 + 결정론 헬퍼(노드 분류·근거 도출·정렬).
 *
 * grounding 보존(§3.4): 빌더는 노드/엣지 데이터를 재구성할 뿐 새 사실을 지어내지
 * 않는다. filePath+lineRange 가 있는 노드만 CONFIRMED(근거 보유)로 올린다.
 */
import type { UaGraphEdge, UaGraphNode } from '../../domain-map/types.js';
import type { RoutesReport, EdgeRecord } from '../../domain-map/types.js';
import type { JpaModel } from '../../jpa/types.js';
import type { MyBatisModel } from '../../mybatis/types.js';
import type { RawSqlModel } from '../raw-sql.js';
import type { TestLinkModel } from '../../rtm/test-links.js';
import type { MethodCallGraph } from '../../domain-map/types.js';
import type { PolicySignalSet } from '../../policy/types.js';
import type { DbSchemaModel } from '../../db-schema/types.js';
import type { DomainPolicyInput } from '../../domain-policy/types.js';
import type { InterfaceReport } from '../../interface-scan/types.js';
import type { BatchJobsReport } from '../../batch-scan/report.js';
import type { ProgramInventory } from '../../program-inventory/index.js';
import type { RiskReport } from '../../risk-report/index.js';
import type { RtmModel } from '../../rtm/types.js';
import type { WorkSummaryReport } from '../../work-summary/index.js';
import type { Claim, Evidence } from '../types.js';
/**
 * 빌더 정규 입력 — as-built 그래프(노드/엣지) + 선택적 프로젝트 메타·라우트 리포트.
 * nodes 는 UaGraphNode(domain/flow/step). 추가 종류(endpoint/table/module 등)는
 * node.tags 의 종류 태그로 식별한다(UaGraphNode.type 은 domain/flow/step 로 한정).
 */
export interface DocInput {
    project?: {
        languages?: string[];
        frameworks?: string[];
    };
    nodes: UaGraphNode[];
    edges: UaGraphEdge[];
    routes?: RoutesReport;
    /** JPA 모델(보완 B) — db-spec 가 entity↔table 매핑 섹션을 grounding 으로 추가(AC-16). */
    jpaModel?: JpaModel | null;
    /** MyBatis 모델(Tier B) — crud-matrix(기능×테이블) + si-테이블정의서(테이블/컬럼) grounding. */
    mybatisModel?: MyBatisModel | null;
    /**
     * 코드 raw SQL 모델(비-MyBatis·비-JPA 폴백) — crud-matrix/RTM 데이터 축이 손수 짠 JDBC/Kotlin
     * 영속화 파일의 SQL 에서 기능×테이블 CRUD 를 세운다(db-schema 테이블로 필터). MyBatis 부재 시 사용.
     */
    rawSqlModel?: RawSqlModel | null;
    /**
     * 테스트 → 프로덕션 클래스 링크 모델(RTM 테스트 축) — 테스트 파일이 참조하는 프로덕션 클래스
     * basename 으로 test↔기능을 잇는다(언어 무관). map-scan 이 test 신호를 안 만들던 갭 보완.
     */
    testLinks?: TestLinkModel | null;
    /** 메서드 호출그래프(P3) — crud-matrix 가 흐름별 핸들러→매퍼 메서드 정밀 귀속에 사용. */
    methodCallGraph?: MethodCallGraph | null;
    /** 빌드파일 의존성(pom.xml/gradle) — tech-stack 프레임워크/라이브러리 grounding(file:line). */
    buildDeps?: Array<{
        name: string;
        file: string;
        line: number;
    }>;
    /** 파일 의존 엣지(edges.json) — architecture 의존 방향/순환 grounding(source file:line). */
    fileEdges?: EdgeRecord[];
    /** 정책 신호(P1) — policy 방법론 빌더가 카테고리별 정책서 섹션을 grounding 으로 채운다. */
    policySignals?: PolicySignalSet | null;
    /** db-schema(PA3) — DB 명세서(db-spec)가 DDL 의 실제 컬럼/PK/FK/CHECK 를 grounding 으로 추가. */
    dbSchema?: DbSchemaModel | null;
    /** 도메인 정책서 입력(PD2) — domain-policy 방법론이 도메인당 1문서를 동적 산출. */
    domainPolicies?: DomainPolicyInput[];
    /** 대외 인터페이스(W1) — si-인터페이스정의서 §2 송신/라우트 외 수신 섹션 grounding. */
    interfaces?: InterfaceReport | null;
    /** 배치 인벤토리(W2) — si-배치정의서 grounding. */
    batchJobs?: BatchJobsReport | null;
    /** 프로그램 목록+FP 기초(W3) — si-프로그램목록 grounding. */
    programInventory?: ProgramInventory | null;
    /** 위험 모듈 리포트(W4) — si-위험모듈리포트 grounding. */
    riskReport?: RiskReport | null;
    /** RTM 원장(W5) — si-단위테스트시나리오 grounding(rtm.json 로드, zod 미경유 가능 — 방어적 접근). */
    rtm?: RtmModel | null;
    /** 실적 요약(W6) — si-실적요약보고서 grounding(work-summary.json 로드). */
    workSummary?: WorkSummaryReport | null;
}
/** node.id ASC 안정 정렬(결정론 tie-break). */
export declare function sortNodes(nodes: UaGraphNode[]): UaGraphNode[];
/** routeId 자연키 안정 정렬(결정론) — api-spec / si-인터페이스정의서 공용. */
export declare function sortedRoutes(input: DocInput): RoutesReport['routes'];
/** edges (source, target, type) 자연키 안정 정렬(결정론). */
export declare function sortEdges(edges: UaGraphEdge[]): UaGraphEdge[];
/** type 으로 노드를 거른 뒤 id 정렬. */
export declare function nodesOfType(nodes: UaGraphNode[], ...types: UaGraphNode['type'][]): UaGraphNode[];
/** tag 로 노드를 거른 뒤 id 정렬(endpoint/table/schema/module 등 비-core 종류 식별). */
export declare function nodesWithTag(nodes: UaGraphNode[], ...tags: string[]): UaGraphNode[];
/** type 으로 엣지를 거른 뒤 자연키 정렬. */
export declare function edgesOfType(edges: UaGraphEdge[], ...types: UaGraphEdge['type'][]): UaGraphEdge[];
/** 노드의 filePath+lineRange 를 Evidence[] 로 변환(없으면 []). */
export declare function nodeEvidence(node: UaGraphNode): Evidence[];
/**
 * 노드 기반 claim — grounded(filePath 보유) -> CONFIRMED + 근거, 아니면 INFERRED.
 * grounding 보존: 근거 없는 노드를 CONFIRMED 로 올리지 않는다.
 */
export declare function nodeClaim(node: UaGraphNode, text: string): Claim;
/** 구조/관례 추론 claim — 근거 없음, 검토 권장(INFERRED). */
export declare function inferred(text: string): Claim;
/** 동적/불명 claim — 근거 미확보(UNVERIFIED). */
export declare function unverified(text: string): Claim;
/** 노드 표시명 — name 이 공란(SKELETON_BLANK)이면 id 로 폴백(빈 텍스트 방지). */
export declare function displayName(node: UaGraphNode): string;
/** summary 가 있으면 " — {summary}" 접미사, 없으면 빈 문자열. */
export declare function summarySuffix(node: UaGraphNode): string;
/**
 * domainMeta 의 문자열/문자열배열 필드를 결정론적으로 평탄화(정렬).
 * feature-spec / si-기능명세서 공용 — 배열은 문자열만 골라 정렬, 단일 문자열은 1원소.
 */
export declare function metaList(meta: Record<string, unknown> | undefined, key: string): string[];
//# sourceMappingURL=shared.d.ts.map