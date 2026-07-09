/**
 * ktds legacy-core — 주석 ↔ routes.json 결정론 조인(순수 함수).
 *
 * href/form action 을 `.spec/map/routes.json` 의 라우트 path 와 대조해
 * 핸들러(`AccountActionBean#signon` 등)를 CONFIRMED(file:line 근거)로 선기입한다.
 * LLM 없이 확정 근거를 만드는 이 설계의 최대 지렛대.
 *
 * Stripes 이벤트 규약:
 * - 링크: `Account.action?signonForm=` → 이벤트 = 쿼리 파라미터 이름.
 * - 폼 제출: `<stripes:submit name="signon">` → 이벤트 = submit 요소의 name.
 * routes.json 의 path 는 이벤트 포함형(`/actions/Account.action?signon`)과
 * 기본형(`/actions/Account.action`)이 공존한다 — 이벤트 우선, 기본형 폴백.
 */
import type { RouteEntry } from '../domain-map/types.js';
import type { Annotation } from './types.js';
export interface RouteJoinContext {
    routes: RouteEntry[];
    /** 앱 컨텍스트 경로(예: "/jpetstore") — href 정규화 시 제거. */
    contextPath?: string | null;
}
export interface NormalizedAction {
    /** 컨텍스트 제거·jsessionid 제거된 앱 상대 path(선행 '/'). */
    path: string;
    /** 쿼리 파라미터 이름 목록(문서 순서, 값 제거). */
    queryKeys: string[];
}
/**
 * href/formAction 원문 → 조인용 정규화. 조인 불가 형태(javascript:, mailto:,
 * 순수 fragment, 빈 값)는 null.
 */
export declare function normalizeActionPath(raw: string, contextPath?: string | null): NormalizedAction | null;
/** 주석 1건의 조인 후보 경로들(우선순위 순). */
export declare function candidatePaths(a: Annotation, contextPath?: string | null): string[];
/**
 * routes.json 조인 — 매칭되고 handler 가 있으면 CONFIRMED handler 를 채운 새 배열 반환.
 * (handler 가 이미 채워진 주석은 건드리지 않는다 — 멱등.)
 */
export declare function joinRoutes(annotations: Annotation[], ctx: RouteJoinContext): Annotation[];
//# sourceMappingURL=routes-join.d.ts.map