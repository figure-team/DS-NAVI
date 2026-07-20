import { parseSource } from '../domain-map/tree-sitter.js';
/** 그 자체로 결정 포인트 1 인 노드 타입. */
const DECISION_TYPES = new Set([
    'if_expression',
    'for_statement',
    'while_statement',
    'do_while_statement',
    'catch_block',
]);
/** McCabe 기저 1 을 더하는 단위(함수 선언/부생성자). */
const METHOD_TYPES = new Set(['function_declaration', 'secondary_constructor']);
/** 파싱된 kotlin 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export function countKotlinComplexity(root) {
    let methods = 0;
    let decisions = 0;
    const stack = [root];
    while (stack.length > 0) {
        const n = stack.pop();
        if (!n)
            continue;
        if (METHOD_TYPES.has(n.type)) {
            methods++;
        }
        else if (DECISION_TYPES.has(n.type)) {
            decisions++;
        }
        else if (n.type === 'when_entry') {
            // else 분기(when_entry 의 첫 child 가 `else` 키워드)는 미계상 — java switch 의
            // default 미계상과 동형. 콤마 다중 라벨(`1, 2 ->`)은 항목 1개로 계상(근사 한계).
            if (n.children[0]?.type !== 'else')
                decisions++;
        }
        else if (n.type === 'binary_expression') {
            // 연산자는 무명 child — namedChildren 순회에 안 잡히므로 전 child 를 본다.
            for (let i = 0; i < n.childCount; i++) {
                const t = n.child(i)?.type;
                if (t === '&&' || t === '||' || t === '?:') {
                    decisions++;
                    break;
                }
            }
        }
        for (const c of n.namedChildren)
            if (c)
                stack.push(c);
    }
    return methods + decisions;
}
/** kotlin 소스 → 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리). */
export async function measureKotlinComplexity(source) {
    return countKotlinComplexity(await parseSource('kotlin', source));
}
//# sourceMappingURL=complexity-kotlin.js.map