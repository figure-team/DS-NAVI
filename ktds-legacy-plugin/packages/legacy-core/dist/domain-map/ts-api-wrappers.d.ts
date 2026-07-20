/**
 * 프런트 API "래퍼 함수" 해소 — 파일-로컬 결정론 분석.
 *
 * 실전 관용구(BFF 래퍼): `const BASE = import.meta.env.X ?? "/api"` +
 * `async function request(path, init) { fetch(\`${BASE}${path}\`, ...) }` +
 * `function post(path, body) { return request(path, { method: "POST", ... }) }` +
 * `export const listMembers = () => request("/trust/members")`.
 * fetch 리터럴 직접 호출만 보는 ts-api-calls.ts 로는 이 관용구가 전부 누락된다(m-project 실측 0건).
 *
 * 규칙(전부 파일 안에서만, 교차 파일 전파 없음 — 화면→래퍼 파일은 import 엣지가 잇는다):
 *  1) 문자열 상수: `const N = "lit"` 또는 `const N = <아무 식> ?? "lit"` → N→lit.
 *  2) 근원 래퍼: 함수(선언/화살표)의 파라미터 p 가 `fetch(\`${N}${p}...\`)` 에 쓰이면
 *     래퍼(접두=상수 N 값, 경로 파라미터=p 위치). 템플릿 머리가 상수·경로 순이 아닐 땐 제외.
 *  3) 전이 래퍼(고정점, 파일 내): 함수 G 가 자기 파라미터 q 를 알려진 래퍼 W 의 경로 위치에
 *     그대로 넘기면 G 도 래퍼. method 는 (a) 그 호출 인자 객체의 `method: "LIT"` 리터럴,
 *     (b) 함수명이 get/post/put/patch/delete 면 그 동사, (c) W 의 method 상속 순으로 결정.
 *  4) 호출 지점: 알려진 래퍼를 경로 위치 문자열 리터럴(또는 리터럴 머리 템플릿)로 호출하면
 *     TsApiCall{path=접두+리터럴(+보간 꼬리는 '*'), method=래퍼 method} 를 낸다.
 * 산출은 ts-api-calls.ts 의 TsApiCall 과 동형 — 동일 조인(joinApiCallsToRoutes)에 그대로 태운다.
 */
import type { Node } from 'web-tree-sitter';
import type { TsApiCall } from './ts-api-calls.js';
/** 4) 래퍼 호출 지점 → TsApiCall 목록(라인 순 정렬, 결정론). */
export declare function extractWrapperApiCalls(root: Node, relPath: string): TsApiCall[];
//# sourceMappingURL=ts-api-wrappers.d.ts.map