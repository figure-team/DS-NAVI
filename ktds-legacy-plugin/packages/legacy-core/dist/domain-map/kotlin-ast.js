import { startLine } from './tree-sitter.js';
/** 직계 named child 중 첫 번째 주어진 타입. */
export function ktChild(node, type) {
    for (const c of node.namedChildren) {
        if (c && c.type === type)
            return c;
    }
    return null;
}
/** 직계 named children 중 주어진 타입들(선언 순서). */
export function ktChildren(node, ...types) {
    const want = new Set(types);
    const out = [];
    for (const c of node.namedChildren) {
        if (c && want.has(c.type))
            out.push(c);
    }
    return out;
}
/** class_declaration 의 키워드 토큰으로 종류 판정(interface/enum/class). */
export function ktDeclKind(decl) {
    if (decl.type === 'object_declaration')
        return 'object';
    for (const c of decl.children) {
        if (!c)
            continue;
        if (c.type === 'interface')
            return 'interface';
        if (c.type === 'class')
            break;
    }
    // enum 은 `enum class` — modifiers > class_modifier 텍스트 또는 enum_class_body 로 판정.
    if (ktChild(decl, 'enum_class_body'))
        return 'enum';
    const mods = ktChild(decl, 'modifiers');
    if (mods && ktChildren(mods, 'class_modifier').some((m) => m.text === 'enum'))
        return 'enum';
    return 'class';
}
/**
 * 타입 노드의 외곽 식별자 — `List<User>` → `List`, `Foo?` → `Foo`, `a.b.C` → `C`.
 * user_type / nullable_type / type_projection 을 재귀 해체한다.
 */
export function ktTypeOuterName(node) {
    if (!node)
        return null;
    switch (node.type) {
        case 'identifier':
        case 'type_identifier':
            return node.text;
        case 'nullable_type':
            return ktTypeOuterName(node.namedChildren.filter((c) => c !== null)[0] ?? null);
        case 'user_type': {
            // user_type(identifier+, type_arguments?) — 점 표기는 identifier 나열: 마지막이 외곽 이름…
            // 이 아니라 첫 세그먼트가 기저이므로, type_arguments 이전의 마지막 identifier 를 취한다.
            const ids = ktChildren(node, 'identifier');
            return ids.length > 0 ? ids[ids.length - 1].text : null;
        }
        case 'type_projection':
            return ktTypeOuterName(node.namedChildren.filter((c) => c !== null)[0] ?? null);
        case 'parenthesized_type':
            return ktTypeOuterName(node.namedChildren.filter((c) => c !== null)[0] ?? null);
        default:
            // function_type / dynamic 등은 외곽 이름 없음.
            return null;
    }
}
/** annotation 노드에서 어노테이션 이름(마지막 식별자 — `@a.b.C` → `C`). */
export function ktAnnotationName(anno) {
    const target = ktChild(anno, 'constructor_invocation') ?? anno;
    const ut = ktChild(target, 'user_type');
    if (ut) {
        const ids = ktChildren(ut, 'identifier');
        if (ids.length > 0)
            return ids[ids.length - 1].text;
    }
    // use-site target(`@field:Id`) 등 — user_type 가 더 깊이 있을 수 있음.
    const anyUt = firstDescendant(anno, 'user_type');
    if (anyUt) {
        const ids = ktChildren(anyUt, 'identifier');
        if (ids.length > 0)
            return ids[ids.length - 1].text;
    }
    return null;
}
/** value_arguments 노드에서 인자 목록(named/positional). */
function argsFromValueArguments(va) {
    if (!va)
        return [];
    const out = [];
    for (const arg of ktChildren(va, 'value_argument')) {
        const named = arg.namedChildren.filter((c) => c !== null);
        if (named.length >= 2 && named[0].type === 'identifier') {
            out.push({ name: named[0].text, node: named[1] });
        }
        else if (named.length >= 1) {
            out.push({ name: null, node: named[0] });
        }
    }
    return out;
}
/** 분리형(annotated_expression) 어노테이션의 인자 — parenthesized_expression 으로 떨어진 형태. */
function argsFromParenExpr(paren) {
    const out = [];
    for (const c of paren.namedChildren) {
        if (!c)
            continue;
        // `(name = expr)` 는 분리형에서 assignment/binary 로 파싱될 수 있으나 실측 사례는
        // 위치 인자(문자열)뿐 — 보수적으로 위치 인자로만 취급한다.
        out.push({ name: null, node: c });
    }
    return out;
}
/** annotation 노드 1개 → KtAnnotation (인자는 constructor_invocation 의 value_arguments). */
function annoFact(anno) {
    const name = ktAnnotationName(anno);
    if (!name)
        return null;
    const ci = ktChild(anno, 'constructor_invocation');
    return {
        name,
        args: argsFromValueArguments(ci ? ktChild(ci, 'value_arguments') : null),
        line: startLine(anno),
    };
}
/** annotated_expression 체인에서 어노테이션들을 순서대로 수집(치유 전용). */
function annotationsFromChain(annotatedExpr) {
    const out = [];
    let cursor = annotatedExpr;
    let pendingParen = null;
    while (cursor) {
        let next = null;
        for (const c of cursor.namedChildren) {
            if (!c)
                continue;
            if (c.type === 'annotation') {
                const fact = annoFact(c);
                if (fact)
                    out.push(fact);
            }
            else if (c.type === 'annotated_expression') {
                next = c;
            }
            else if (c.type === 'parenthesized_expression') {
                // 분리형 인자 — 체인 말단에 하나 붙는 형태(실측). 마지막 어노테이션 몫.
                pendingParen = c;
            }
        }
        cursor = next;
    }
    if (pendingParen && out.length > 0) {
        const last = out[out.length - 1];
        if (last.args.length === 0)
            last.args = argsFromParenExpr(pendingParen);
    }
    return out;
}
/** 치유 대상 선언 노드 타입. */
const HEALABLE_DECLS = new Set([
    'class_declaration',
    'function_declaration',
    'property_declaration',
    'object_declaration',
]);
/**
 * 선언 노드의 어노테이션 전부 — modifiers 안(정상형) + 직전 형제 annotated_expression
 * 체인(분리형 치유)을 합쳐 소스 순서로 돌려준다.
 */
export function collectDeclAnnotations(decl) {
    const out = [];
    // 1) 분리형 치유 — 직전 실질 형제(주석 건너뜀)가 annotated_expression 이면 재결합.
    if (HEALABLE_DECLS.has(decl.type) && decl.parent) {
        const sibs = decl.parent.namedChildren.filter((c) => c !== null);
        const i = sibs.findIndex((s) => s.id === decl.id);
        let j = i - 1;
        while (j >= 0 && /comment/.test(sibs[j].type))
            j--;
        if (j >= 0 && sibs[j].type === 'annotated_expression') {
            out.push(...annotationsFromChain(sibs[j]));
        }
    }
    // 2) 정상형 — modifiers > annotation.
    const mods = ktChild(decl, 'modifiers');
    if (mods) {
        for (const a of ktChildren(mods, 'annotation')) {
            const fact = annoFact(a);
            if (fact)
                out.push(fact);
        }
    }
    return out;
}
/** string_literal 노드의 내용(문자열 보간 없는 단순형; 그 외 null). */
export function ktStringContent(node) {
    if (!node)
        return null;
    if (node.type === 'string_literal') {
        const parts = ktChildren(node, 'string_content');
        if (parts.length === node.namedChildren.filter(Boolean).length) {
            return parts.map((p) => p.text).join('');
        }
        return null; // 보간 포함 — 결정론 추출 불가.
    }
    if (node.type === 'parenthesized_expression') {
        return ktStringContent(node.namedChildren.filter((c) => c !== null)[0] ?? null);
    }
    return null;
}
/** package_header 의 FQN. */
export function ktPackageName(root) {
    const pkg = ktChild(root, 'package_header');
    if (!pkg)
        return null;
    const qi = ktChild(pkg, 'qualified_identifier');
    return qi ? qi.text : null;
}
/** import 문 FQN 목록(선언 순서, 와일드카드는 `.*` 보존). */
export function ktImports(root) {
    const out = [];
    for (const c of root.namedChildren) {
        if (!c || c.type !== 'import')
            continue;
        const qi = ktChild(c, 'qualified_identifier');
        if (!qi)
            continue;
        out.push(c.text.includes('*') ? `${qi.text}.*` : qi.text);
    }
    return out;
}
/** 깊이우선 첫 자손(타입 일치) — tree-sitter.ts firstDescendantOfType 와 동일 의미의 로컬판. */
function firstDescendant(node, type) {
    for (const c of node.namedChildren) {
        if (!c)
            continue;
        if (c.type === type)
            return c;
        const found = firstDescendant(c, type);
        if (found)
            return found;
    }
    return null;
}
//# sourceMappingURL=kotlin-ast.js.map