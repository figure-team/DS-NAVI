/**
 * Kotlin AST 공용 유틸 — kotlin-facts / spring-kotlin routes / JPA / batch 가 공유한다.
 *
 * 그래머는 @tree-sitter-grammars/tree-sitter-kotlin(wasm 동봉). 실측 함정 1건:
 * 클래스 본문 구성에 따라 선언 직전의 어노테이션이 `modifiers` 가 아니라 형제
 * `annotated_expression` 으로 분리 파싱된다(hasError=false 인 채로). m-project 442파일
 * 실측 — 분리형은 전부 "선언(class/fun/property/object) 직전 형제" 위치였고, 선언과
 * 무관한 annotated_expression 은 `@Suppress` 류 정당한 표현식 어노테이션뿐이었다.
 * 치유 규칙: 선언 노드의 어노테이션 = modifiers 안 + 직전 형제 annotated_expression
 * 체인에서 재결합(collectDeclAnnotations). 분리형에서는 인자 목록도
 * `parenthesized_expression` 으로 떨어져 나가므로 마지막 어노테이션에 짝지어 준다.
 */
import type { Node } from 'web-tree-sitter';
/** Kotlin 선언 종류 — class_declaration 은 키워드 토큰으로 세분한다. */
export type KtDeclKind = 'class' | 'interface' | 'enum' | 'object';
/** 어노테이션 인자 — named arg(`cron = "..."`)면 name, 위치 인자면 null. */
export interface KtAnnoArg {
    name: string | null;
    /** 값 표현식 노드(string_literal / collection_literal / identifier 등). */
    node: Node;
}
/** 선언에 붙은 어노테이션(치유 반영). */
export interface KtAnnotation {
    name: string;
    args: KtAnnoArg[];
    line: number;
}
/** 직계 named child 중 첫 번째 주어진 타입. */
export declare function ktChild(node: Node, type: string): Node | null;
/** 직계 named children 중 주어진 타입들(선언 순서). */
export declare function ktChildren(node: Node, ...types: string[]): Node[];
/** class_declaration 의 키워드 토큰으로 종류 판정(interface/enum/class). */
export declare function ktDeclKind(decl: Node): KtDeclKind;
/**
 * 타입 노드의 외곽 식별자 — `List<User>` → `List`, `Foo?` → `Foo`, `a.b.C` → `C`.
 * user_type / nullable_type / type_projection 을 재귀 해체한다.
 */
export declare function ktTypeOuterName(node: Node | null): string | null;
/** annotation 노드에서 어노테이션 이름(마지막 식별자 — `@a.b.C` → `C`). */
export declare function ktAnnotationName(anno: Node): string | null;
/**
 * 선언 노드의 어노테이션 전부 — modifiers 안(정상형) + 직전 형제 annotated_expression
 * 체인(분리형 치유)을 합쳐 소스 순서로 돌려준다.
 */
export declare function collectDeclAnnotations(decl: Node): KtAnnotation[];
/** string_literal 노드의 내용(문자열 보간 없는 단순형; 그 외 null). */
export declare function ktStringContent(node: Node | null): string | null;
/** package_header 의 FQN. */
export declare function ktPackageName(root: Node): string | null;
/** import 문 FQN 목록(선언 순서, 와일드카드는 `.*` 보존). */
export declare function ktImports(root: Node): string[];
//# sourceMappingURL=kotlin-ast.d.ts.map