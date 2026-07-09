/**
 * 라우트 결정론 헬퍼 — 경로 정규화, 자연키, ID 할당, 전순서 정렬.
 *
 * 모든 라우트 산출은 명시 키로 전순서 정렬되며 routeId 는 충돌 시
 * 안정적으로 한정자를 덧붙여 유일성을 보장한다(인덱스 서수 금지).
 */
import type { BatchEntry, RouteEntry, RouteMethod } from './types.js';
/**
 * 경로 정규화 — 선행 "/", 중복 "//" 축약, 후행 "/" 제거(루트 "/" 예외).
 * 경로 파라미터({id} 등)는 그대로 둔다.
 */
export declare function normalizePath(raw: string): string;
/** (method, path) 자연키. */
export declare function routeNaturalKey(method: RouteMethod, path: string): string;
/**
 * routeId 를 할당한다.
 * 기본 `route:${method} ${path}`. (method,path) 충돌 시 `@${filePath}` 를
 * 덧붙이고, 그래도 충돌하면 `:${line}` 을 덧붙여 유일성을 보장한다.
 */
export declare function assignRouteIds(routes: RouteEntry[]): void;
/** 라우트 전순서 정렬 — (path, method, filePath, line, rawPath, routeId). */
export declare function sortRoutes(routes: RouteEntry[]): RouteEntry[];
/** 배치 엔트리 정렬 — (filePath, line, entryId). */
export declare function sortBatchEntries(entries: BatchEntry[]): BatchEntry[];
//# sourceMappingURL=route-key.d.ts.map