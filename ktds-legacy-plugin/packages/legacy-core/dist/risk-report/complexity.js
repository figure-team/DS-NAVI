import { parseSource } from '../domain-map/tree-sitter.js';
/** 그 자체로 결정 포인트 1 인 노드 타입. */
const DECISION_TYPES = new Set([
    'if_statement',
    'for_statement',
    'enhanced_for_statement',
    'while_statement',
    'do_statement',
    'catch_clause',
    'ternary_expression',
]);
/** McCabe 기저 1 을 더하는 단위(메서드/생성자). */
const METHOD_TYPES = new Set(['method_declaration', 'constructor_declaration']);
/** 파싱된 java 루트 노드에서 파일 복잡도를 센다(순수·결정론). */
export function countJavaComplexity(root) {
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
        else if (n.type === 'switch_label') {
            // `case …` 만 — default 는 분기 수에 안 센다. 신형 화살표 다중 라벨
            // (`case A, B ->`)은 라벨 1개이므로 쉼표 수로 분기를 보정한다(리뷰 R6.
            // 한계: 문자열 case 리터럴 안의 쉼표는 과대계상 — 근사 용도로 허용).
            const label = n.text.trimStart();
            if (!label.startsWith('default')) {
                decisions++;
                for (let i = 0; i < label.length; i++)
                    if (label[i] === ',')
                        decisions++;
            }
        }
        else if (n.type === 'binary_expression') {
            // 연산자는 무명 child — namedChildren 순회에 안 잡히므로 전 child 를 본다.
            for (let i = 0; i < n.childCount; i++) {
                const t = n.child(i)?.type;
                if (t === '&&' || t === '||') {
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
/** java 소스 → 파일 복잡도. 파싱 실패는 throw(호출자가 [미확인] 처리). */
export async function measureJavaComplexity(source) {
    return countJavaComplexity(await parseSource('java', source));
}
//# sourceMappingURL=complexity.js.map