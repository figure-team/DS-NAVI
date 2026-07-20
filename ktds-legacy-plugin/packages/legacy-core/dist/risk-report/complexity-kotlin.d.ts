/**
 * 순환복잡도 근사(kotlin) — complexity.ts(java) 와 동일한 McCabe 근사 규약을 Kotlin
 * AST 노드타입에 적용한다(W4 확장, P4). Java 판 파일은 무수정(risk-report/index.ts
 * 게이트 배선은 그쪽 레인 몫).
 *
 * 파일 복잡도 = 함수/생성자 수 + 결정 포인트 총수
 * (= Σ 함수별 McCabe(1 + 결정포인트) 근사 — java 판과 동일 철학. 함수 0개인
 * 인터페이스/상수 object 는 자연히 0).
 * 결정 포인트: if_expression(else-if 포함, else 자체는 미계상) / for_statement /
 * while_statement / do_while_statement / catch_block / when_entry(else 분기 제외,
 * 콤마 다중 라벨은 항목 1개로 계상 — java 의 switch-label 콤마 보정과 달리 세분하지
 * 않음, 근사 용도 한계 명시) / && / || / elvis(?:).
 * 함수 단위: function_declaration(주생성자·부생성자 중 secondary_constructor 만 —
 * primary_constructor 는 별도 함수 노드가 아니라 class_parameters 선언부라 제외).
 *
 * 실측(그래머 탐색 파싱): Kotlin 에는 삼항 연산자가 없다(if-expression 이 그 역할을
 * 겸함) — ternary_expression 상당 노드 없음, 그래서 DECISION_TYPES 에서 제외.
 * elvis(`?:`)·&&·|| 는 모두 binary_expression 의 연산자 토큰으로만 구분된다.
 */
import type { Node } from 'web-tree-sitter';
/** 파싱된 kotlin 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export declare function countKotlinComplexity(root: Node): number;
/** kotlin 소스 → 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리). */
export declare function measureKotlinComplexity(source: string): Promise<number>;
//# sourceMappingURL=complexity-kotlin.d.ts.map