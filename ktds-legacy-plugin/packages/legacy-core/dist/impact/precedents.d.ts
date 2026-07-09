/**
 * 선례검색(precedent retrieval) — 보완 A 의 신규 결정론 알고리즘(A-A1).
 *
 * "이 기능을 새로 만들려면 기존 어느 흐름을 본떠야 하나?" 를 결정론으로 답한다.
 * host(LLM)가 자연어 의도에서 신호(도메인 힌트·엔티티·연산)를 뽑아 intent 로 넘기면,
 * 엔진은 confirmed domain-graph + skeleton + KG(similar_to/related)에서 유사 수직
 * 슬라이스(Controller→Service→Repo/Mapper→Entity→XML)를 랭킹해 top-N 후보를 낸다.
 *
 * 랭킹(F1): 도메인/흐름명 매칭 우선(강신호) → 엔티티/토큰 매칭 → KG 퍼지/확장(폴백)
 *           → 구조 완성도. 최고점 자동채택 아님(F2) — host 가 top-N 제시 후 사용자 선택.
 * precondition(F3): confirmed domain-map(skeleton+plan) 필수. 없으면 fail-closed.
 *
 * 결정론: 모든 점수는 고정 정수 가중치, 정렬은 (score DESC, flowId ASC). KG 퍼지
 * 매칭은 fuse.js 가 아니라 토큰 집합 겹침(순서 비의존)으로 재현 가능하게 구현한다.
 */
import type { CensusReport, ConfirmedPlan, RouteEntry, SkeletonReport } from '../domain-map/types.js';
import { type ImpactInputs } from './engine.js';
/** KG 유사도 그래프 — 선례 확장(similar_to/related)의 최소 입력. */
export interface KgSimilarity {
    /** id → filePath(있는 노드만). */
    fileById: Map<string, string>;
    /** similar_to/related 엣지(source,target) — 방향 무관. */
    edges: Array<{
        source: string;
        target: string;
    }>;
}
export declare class PrecedentPreconditionError extends Error {
    constructor(message: string);
}
/** 역할 — 수직 슬라이스의 계층(명명/패키지 관례 기반). */
export type PrecedentRole = 'controller' | 'service' | 'repository' | 'entity' | 'xml' | 'other';
/** host 가 자연어에서 추출한 의도 신호(엔진은 자연어를 받지 않는다). */
export interface PrecedentIntent {
    /** 도메인/흐름 힌트(예: "로그인", "account", "인증"). */
    domainHints: string[];
    /** 엔티티/명사 힌트(예: "Account", "User", "Kakao"). */
    entityHints?: string[];
    /** 연산 힌트(예: "login", "create") — 토큰 매칭에만 쓰임. */
    operationHints?: string[];
}
/** 한 흐름의 역할별 파일셋. */
export interface FlowSlice {
    flowId: string;
    routeId: string | null;
    domainKey: string | null;
    domainName: string | null;
    entryFile: string | null;
    entryLine: number | null;
    filesByRole: Record<PrecedentRole, string[]>;
    /** 슬라이스에 등장하는 모든 파일(정렬). */
    files: string[];
}
export interface PrecedentCandidate extends FlowSlice {
    score: number;
    /** 매칭 근거(grounding) — 사람이 왜 후보인지 읽는다. */
    whyMatched: string[];
    /** 강 = 도메인/흐름명 매칭, 부분 = 토큰/구조/KG 만. */
    matchStrength: 'strong' | 'partial';
}
export interface PrecedentsResult {
    intent: PrecedentIntent;
    topN: number;
    candidates: PrecedentCandidate[];
    /** 후보 0건 — host 는 선례없음 강등(역할 스캐폴드)로 진행(A-A3). */
    empty: boolean;
}
export declare const DEFAULT_PRECEDENT_TOP_N = 5;
/** 파일 경로/이름을 역할로 분류(명명·패키지 관례). 결정론. */
export declare function classifyRole(relPath: string): PrecedentRole;
/** 토큰화 — 영숫자 경계 + camelCase 분해, 소문자, 2자 이상. */
export declare function tokenize(s: string): string[];
/**
 * confirmed domain-map(skeleton + plan + routes + census)에서 흐름별 수직 슬라이스를
 * 결정론으로 조립한다. 흐름 파일 = 그 흐름의 step 들의 stepSources.relPath ∪ 진입 라우트
 * 선언 파일. 역할은 classifyRole 로 그룹핑.
 */
export declare function buildFlowSlices(skeleton: SkeletonReport, routes: readonly RouteEntry[], confirmed: ConfirmedPlan | null, _census: CensusReport): FlowSlice[];
/**
 * `.understand-anything/knowledge-graph.json` 에서 similar_to/related 유사도 그래프를
 * 읽는다(없거나 깨지면 null — 폴백 신호이므로 fatal 아님).
 */
export declare function loadKgSimilarity(projectRoot: string): KgSimilarity | null;
/**
 * 흐름 슬라이스들을 intent 로 랭킹해 top-N 후보를 낸다(순수). domain/흐름명 매칭이
 * 강신호, 토큰/구조/KG 는 보조. 매칭 0건이면 empty=true(선례없음 강등은 host/A-A3).
 */
export declare function rankPrecedents(slices: readonly FlowSlice[], intent: PrecedentIntent, kg: KgSimilarity | null, topN?: number): PrecedentsResult;
/**
 * 사용자가 top-N 에서 명시 선택(F2)한 flowId 를 PrecedentCandidate 로 만든다.
 * 랭킹을 거치지 않고 그 흐름의 수직 슬라이스를 그대로 후보화한다(사용자 선택 =
 * 실재 선례 → matchStrength 'strong'). 흐름이 없으면 null. whyMatched=사용자 선택.
 */
export declare function selectPrecedentByFlowId(inputs: {
    skeleton: SkeletonReport | null;
    routes: {
        routes: readonly RouteEntry[];
    };
    confirmed: ConfirmedPlan | null;
    census: CensusReport;
}, flowId: string): PrecedentCandidate | null;
/**
 * IO 진입점 — confirmed domain-map 로드 + KG 오버레이 로드 후 랭킹. F3 precondition:
 * skeleton/confirmed 둘 다 있어야(= confirm 완료) 진행. 없으면 PrecedentPreconditionError.
 */
export declare function findPrecedents(projectRoot: string, intent: PrecedentIntent, options?: {
    topN?: number;
    inputs?: ImpactInputs;
}): PrecedentsResult;
//# sourceMappingURL=precedents.d.ts.map