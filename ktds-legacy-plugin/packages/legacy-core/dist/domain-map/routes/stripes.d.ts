/**
 * Stripes ActionBean 라우트 추출 — 파싱된 Java AST 기준.
 *
 * 베이스 URL: @UrlBinding("/x.action") 가 있으면 그 값을 verbatim 사용,
 * 없으면 NameBasedActionResolver 이름규약으로 유도한다
 * (마지막 패키지 세그먼트 + 클래스명에서 ActionBean/Bean suffix 제거 + ".action").
 * abstract 베이스 빈은 제외한다.
 * 이벤트 핸들러(= Resolution 을 반환하는 public 비정적 메서드)마다 라우트 1개:
 *   @DefaultHandler -> 베이스 URL,
 *   @HandlesEvent("name") -> 베이스?name,
 *   그 외 public Resolution 메서드 -> 베이스?<메서드명>.
 * framework "stripes", kind "form", handler = ClassName#method.
 */
import type { Node } from 'web-tree-sitter';
import type { RouteEntry } from '../types.js';
/**
 * 단일 파일에서 Stripes 라우트를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 */
export declare function extractStripesRoutes(root: Node, filePath: string): RouteEntry[];
//# sourceMappingURL=stripes.d.ts.map