/**
 * Spring MVC/Boot 라우트 추출 — 파싱된 Kotlin AST 기준.
 *
 * Java판(spring.ts)과 산출 형태(RouteEntry)는 동일하되, 어노테이션 인자는
 * kotlin-ast.ts 의 `collectDeclAnnotations`(분리형 미스파스 치유 포함)를 소비한다.
 * 상수 해소(`const val`)·composed 메타어노테이션(Java 쪽에서 정의된 것만 — Kotlin
 * `annotation class` 선언 자체는 이 tree-sitter 그래머가 `infix_expression` 으로
 * 오파싱해 정의부를 신뢰성 있게 인식할 수 없다. 실측: `annotation class Foo` 가
 * identifier 3개짜리 infix_expression 으로 떨어짐 — 정의 탐지는 스킵, 소비만 지원)
 * kind 추론(api/form), 와일드카드 제거, 경로 배열 전개 + 정규화 중복 dedup 은 동형.
 *
 * ★Java 판과의 의도적 차이: Java 어노테이션은 위치 인자와 named 인자를 섞을 수
 * 없어(`pairs.length>0` 이면 named 전용 처리) 무해하지만, Kotlin 은
 * `@GetMapping("/{id}", produces = [...])` 처럼 위치 인자(경로) 뒤에 named 인자를
 * 붙이는 관용구가 흔하다(m-project 실측: LicensingController/TransferController).
 * 그래서 여기서는 인자별로 개별 판정한다 — unnamed 또는 name∈{value,path} 는 경로
 * 후보, name===method 는 메서드 오버라이드, 그 외(produces/consumes 등)는 무시.
 */
import type { Node } from 'web-tree-sitter';
import type { RouteEntry } from '../types.js';
import type { SpringContext } from './spring.js';
/**
 * 단일 Kotlin 파일에서 Spring 라우트를 추출한다.
 * @param root 파싱된 source_file 노드
 * @param filePath census relPath
 * @param ctx 상수/composed 레지스트리(Java 판과 공유 — extract 단계에서 구축)
 */
export declare function extractSpringKotlinRoutes(root: Node, filePath: string, ctx: SpringContext): RouteEntry[];
/**
 * 파일에서 `const val NAME = "..."` 상수를 수집한다(top-level + companion object).
 * companion object 소속은 `ClassName.NAME` 와 bare `NAME` 두 키로, top-level 은 bare
 * `NAME` 만 등록한다(Java collectConstants 와 동일 소비 형태 — into 에 누적).
 * Kotlin 은 `const` 가 top-level/object/companion object 에서만 허용되므로
 * 일반 클래스 인스턴스 프로퍼티는 대상이 아니다(언어 제약 — 별도 판별 불필요).
 */
export declare function collectKotlinConstants(root: Node, into: Map<string, string>): void;
//# sourceMappingURL=spring-kotlin.d.ts.map