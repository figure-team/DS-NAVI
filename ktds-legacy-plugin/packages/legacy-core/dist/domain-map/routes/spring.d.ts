/**
 * Spring MVC/Boot 라우트 추출 — 파싱된 Java AST 기준.
 *
 * 매핑 어노테이션(@GetMapping 등 / @RequestMapping(method=...)), 클래스 prefix 결합,
 * 상수 해소(파일내/교차파일), composed 메타어노테이션, kind 추론(api/form),
 * 와일드카드 제거, 경로 배열 전개 + 정규화 중복 dedup 을 처리한다.
 */
import type { Node } from 'web-tree-sitter';
import type { RouteEntry, RouteMethod } from '../types.js';
/** 파일 단위 공유 컨텍스트(상수/composed 레지스트리). */
export interface SpringContext {
    /** `ClassName.FIELD` 와 bare `FIELD` -> 문자열 값. */
    constants: Map<string, string>;
    /** composed 어노테이션 이름 -> 유발하는 동사(없으면 undefined). */
    composedVerb: Map<string, RouteMethod | undefined>;
    /** composed 어노테이션 이름 -> stereotype(controller) 여부. */
    composedStereotype: Set<string>;
}
/**
 * 단일 파일에서 Spring 라우트를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 * @param ctx 상수/composed 레지스트리(extract 단계에서 구축)
 */
export declare function extractSpringRoutes(root: Node, filePath: string, ctx: SpringContext): RouteEntry[];
/**
 * 파일에서 `static final String NAME = "..."` 상수를 수집한다.
 * `ClassName.NAME` 와 bare `NAME` 두 키로 등록(교차파일 + 파일내 해소용).
 */
export declare function collectConstants(root: Node, into: Map<string, string>): void;
/**
 * 파일의 composed 메타어노테이션 정의(@interface)를 수집한다.
 * @interface 가 @GetMapping 등으로 메타어노테이트되면 동사를,
 * @Controller 로 메타어노테이트되면 stereotype 을 등록한다.
 */
export declare function collectComposedAnnotations(root: Node, composedVerb: Map<string, RouteMethod | undefined>, composedStereotype: Set<string>): void;
//# sourceMappingURL=spring.d.ts.map