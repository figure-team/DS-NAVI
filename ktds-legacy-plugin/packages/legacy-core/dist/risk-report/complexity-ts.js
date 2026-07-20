import { parseSource } from '../domain-map/tree-sitter.js';
/** 그 자체로 결정 포인트 1 인 노드 타입. */
const DECISION_TYPES = new Set([
    'if_statement',
    'for_statement',
    'for_in_statement', // for-in 과 for-of 모두 이 노드타입(anon 'in'/'of' 로만 구분).
    'while_statement',
    'do_statement',
    'catch_clause',
    'ternary_expression',
    'switch_case', // default 는 별개 노드타입(switch_default) — 자연히 미계상.
]);
/** McCabe 기저 1 을 더하는 단위(함수/메서드/화살표함수/함수식). */
const METHOD_TYPES = new Set([
    'function_declaration',
    'arrow_function',
    'method_definition',
    'function_expression',
]);
/** 파싱된 TS/TSX 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export function countTsComplexity(root) {
    let functions = 0;
    let decisions = 0;
    const stack = [root];
    while (stack.length > 0) {
        const n = stack.pop();
        if (!n)
            continue;
        if (METHOD_TYPES.has(n.type)) {
            functions++;
        }
        else if (DECISION_TYPES.has(n.type)) {
            decisions++;
        }
        else if (n.type === 'binary_expression') {
            // 연산자는 무명 child — namedChildren 순회에 안 잡히므로 전 child 를 본다.
            for (let i = 0; i < n.childCount; i++) {
                const t = n.child(i)?.type;
                if (t === '&&' || t === '||' || t === '??') {
                    decisions++;
                    break;
                }
            }
        }
        for (const c of n.namedChildren)
            if (c)
                stack.push(c);
    }
    return functions + decisions;
}
/** TS/TSX 소스 -> 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리 — java 판과 동일 관례). */
export async function measureTsComplexity(source, lang = 'typescript') {
    return countTsComplexity(await parseSource(lang, source));
}
//# sourceMappingURL=complexity-ts.js.map