/**
 * fetch/axios API 호출 추출 + 백엔드 라우트 조인(P5) — 파일 단위 순수 함수.
 *
 * `fetch(...)` / `axios.get|post|put|delete|patch(...)` / `axios(...)` 의 첫 인자가
 * '/'로 시작하는 문자열 또는 템플릿 리터럴이면 수집한다. 템플릿 보간(`${...}`)은
 * 보간 시작 전 접두 경로 + '*' 로 기록하고 그 이후는 버린다(예:
 * `/api/trust/members/${id}` -> '/api/trust/members/*') — 결정론 우선, 부분 정보라도
 * 누락 없이 남기되 과잉 구체화(오탐)는 피한다.
 * method 는 fetch 2번째 인자 옵션 객체의 `method: 'X'` 문자열 리터럴, 또는 axios
 * 메서드명(get/post/put/delete/patch)에서 결정한다. 판정 불가 -> null(GET 으로 임의 추정 금지).
 */
import type { Node } from 'web-tree-sitter';
import type { RouteMethod } from './types.js';
/** 단일 API 호출 수집 결과. */
export interface TsApiCall {
    relPath: string;
    /** fetch 옵션/axios 메서드명에서 판정. 불가 -> null(추정 금지). */
    method: string | null;
    /** '/'로 시작하는 경로(보간부는 '*'). */
    path: string;
    /** 1-based 줄. */
    line: number;
}
/**
 * 파싱된 루트(단일 파일)에서 fetch/axios API 호출을 추출한다.
 * relPath 는 호출자가 census 로 알고 있는 값을 그대로 전달한다(AST 에서 유도 불가).
 */
export declare function extractTsApiCalls(root: Node, relPath: string): TsApiCall[];
/** 백엔드 라우트 조인 대상(정) — RouteEntry 의 path/method 부분집합. */
export interface JoinableRoute {
    path: string;
    method: RouteMethod;
}
/** call ↔ route 매칭 결과 1건. */
export interface ApiRouteLink {
    from: string;
    toRoute: string;
    method: string | null;
    line: number;
}
/**
 * 프런트 API 호출과 백엔드 라우트 목록을 결정론 조인한다.
 * 하나의 호출이 여러 라우트에 매칭될 수 있으면(모호) 전부 보고한다(누락 금지).
 */
export declare function joinApiCallsToRoutes(calls: TsApiCall[], routes: JoinableRoute[]): ApiRouteLink[];
//# sourceMappingURL=ts-api-calls.d.ts.map