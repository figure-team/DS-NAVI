/**
 * 순환복잡도 근사(TS/TSX, P5) — complexity.ts(java)의 counting 철학을 TS 노드타입으로 이식.
 *
 * 파일 복잡도 = 함수 단위 수(function_declaration/arrow_function/method_definition/
 * function_expression) + 결정 포인트 총수(if/for/for-in·for-of/while/do/catch/삼항/
 * switch case(default 제외)/&&/||/??). Java 판과 동일하게 함수 밖 결정포인트(필드
 * 초기화의 삼항 등)도 계상되며, 함수 0개 파일은 자연히 0.
 */
import type { Node } from 'web-tree-sitter';
/** 파싱된 TS/TSX 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export declare function countTsComplexity(root: Node): number;
/** TS/TSX 소스 -> 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리 — java 판과 동일 관례). */
export declare function measureTsComplexity(source: string, lang?: 'typescript' | 'tsx'): Promise<number>;
//# sourceMappingURL=complexity-ts.d.ts.map