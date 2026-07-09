/**
 * ktds legacy-core — 화면 발견/식별 정책(순수 함수).
 *
 * - URL 정규화(same-origin, jsessionid 제거)와 화면 동일성 키(path + 쿼리 "이름" 집합).
 *   값이 다른 viewProduct?productId=… 폭발은 대표 1건으로 수렴한다.
 * - 화면 id/slug 규칙, 크롤 방문 정책, JSP fragment 판별, 그래프 JSP 대조.
 */
import type { Screen } from './types.js';
/**
 * 원시 링크 → 정규화 URL. same-origin 이 아니거나 http(s) 가 아니면 null.
 * fragment 제거, jsessionid(매트릭스/쿼리) 제거.
 */
export declare function normalizeUrl(raw: string, base: URL): URL | null;
/** 컨텍스트 경로 제거 후 앱 상대 경로(선행 '/' 없는 형태). */
export declare function relativePath(u: URL, contextPath?: string | null): string;
/**
 * 화면 동일성 키 — path + 정렬된 쿼리 파라미터 "이름" 집합(값 제거).
 * 같은 키의 URL 은 같은 화면으로 보고 최초 도달분만 캡처한다.
 */
export declare function screenKey(u: URL, contextPath?: string | null): string;
/** 파일명 안전 slug — `[A-Za-z0-9._-]` 이외는 '_' 로, 연속 '_' 축약. */
export declare function slugify(s: string): string;
/**
 * 화면 안정 식별자 — `screen:<상대경로>__<쿼리키(정렬)>`.
 * 예: /jpetstore/actions/Account.action?signonForm= → "screen:actions/Account.action__signonForm"
 */
export declare function screenIdFor(u: URL, contextPath?: string | null): string;
/** 화면 id → 캡처 PNG 상대 경로(`screens/<slug>.png`). */
export declare function capturePathFor(screenId: string): string;
/** 크롤 방문 정책 — 자산/제외 정규식 필터(횟수 상한은 러너의 maxPages 가 담당). */
export declare function shouldVisit(u: URL, exclude: string[]): boolean;
/**
 * JSP fragment 판별 — 다른 JSP 가 include 지시자로 참조하는 파일은 독립 화면이
 * 아니라 조각이다(IncludeTop/IncludeAccountFields 등).
 * `<html>` 부재 휴리스틱은 레이아웃을 include 로 조립하는 앱(jpetstore 등)에서
 * 본문 페이지까지 오탐하므로 쓰지 않는다 — 피참조 여부가 결정론 기준.
 * 반환: fragment 로 판별된 path 목록(입력 순서 유지).
 */
export declare function detectFragments(jsps: Array<{
    path: string;
    content: string;
}>): string[];
/** 지식그래프 노드에서 JSP 파일 경로 추출(file 노드, .jsp 한정). */
export declare function listJspFilesFromGraph(nodes: Array<{
    id: string;
    type?: string;
    filePath?: string | null;
}>): string[];
/** JSP 폴더 파생 도메인 — `WEB-INF/jsp/<domain>/...`. 규약 밖이면 null. */
export declare function domainForJsp(jspFile: string): string | null;
/**
 * 그래프 JSP 대조 — 화면으로 매핑(jspFile)되지도, fragment 도 아닌 JSP 목록.
 * Stage A(전부 미매핑)와 Stage B 이후(validate) 양쪽에서 호출한다.
 */
export declare function reconcileJsps(graphJsps: string[], screens: Pick<Screen, 'jspFile'>[], fragments: string[]): string[];
//# sourceMappingURL=discover.d.ts.map