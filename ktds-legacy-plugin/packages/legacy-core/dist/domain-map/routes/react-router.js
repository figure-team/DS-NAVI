import { childrenOfType, startLine } from '../tree-sitter.js';
import { normalizePath } from '../route-key.js';
const ROUTER_FACTORY_NAMES = new Set(['createBrowserRouter', 'createHashRouter', 'useRoutes']);
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function stringLiteralValue(node) {
    const frag = childrenOfType(node, 'string_fragment')[0];
    return frag ? frag.text : '';
}
/** object 리터럴에서 key 이름으로 pair 의 value 노드를 찾는다. */
function objPair(obj, key) {
    for (const pair of childrenOfType(obj, 'pair')) {
        if (pair.childForFieldName('key')?.text === key)
            return pair.childForFieldName('value');
    }
    return null;
}
/** JSX 태그 이름(jsx_element/jsx_self_closing_element 공용). */
function tagName(elem) {
    if (elem.type === 'jsx_self_closing_element') {
        return childrenOfType(elem, 'identifier')[0]?.text ?? null;
    }
    if (elem.type === 'jsx_element') {
        const opening = childrenOfType(elem, 'jsx_opening_element')[0];
        return opening ? (childrenOfType(opening, 'identifier')[0]?.text ?? null) : null;
    }
    return null;
}
/** 속성이 실려있는 노드(self-closing 은 자신, jsx_element 는 opening element). */
function attrHost(elem) {
    if (elem.type === 'jsx_self_closing_element')
        return elem;
    if (elem.type === 'jsx_element')
        return childrenOfType(elem, 'jsx_opening_element')[0] ?? null;
    return null;
}
/** jsx_attribute 값(있으면 named child[1], boolean shorthand 는 undefined). */
function jsxAttrValue(host, name) {
    for (const attr of childrenOfType(host, 'jsx_attribute')) {
        const named = attr.namedChildren.filter((c) => c !== null);
        if (named[0]?.text === name)
            return named[1] ?? null;
    }
    return null;
}
/** jsx_attribute 가 존재하는지(값 유무 무관 — boolean shorthand 판정용). */
function jsxAttrPresent(host, name) {
    return childrenOfType(host, 'jsx_attribute').some((attr) => attr.namedChildren.filter((c) => c !== null)[0]?.text === name);
}
/** `element: <Foo/>` 또는 `element={<Foo/>}` 값에서 컴포넌트 이름을 읽는다. */
function elementComponentName(value) {
    if (!value)
        return null;
    let target = value;
    if (target.type === 'jsx_expression') {
        const inner = target.namedChildren.filter((c) => c !== null)[0];
        if (!inner)
            return null;
        target = inner;
    }
    return tagName(target);
}
function makeRoute(path, filePath, line, compName) {
    return {
        routeId: '',
        method: 'GET',
        path,
        rawPath: path,
        kind: 'page',
        framework: 'react-router',
        filePath,
        line,
        handler: null,
        notes: compName ? [`element:${compName}`] : [],
    };
}
function joinPath(parentPath, ownSeg) {
    return normalizePath(`${parentPath || '/'}/${ownSeg}`);
}
/** createBrowserRouter/createHashRouter/useRoutes 의 객체 라우트 배열을 재귀 처리. */
function walkRouteObjectArray(arr, parentPath, filePath, out) {
    for (const el of arr.namedChildren) {
        if (!el || el.type !== 'object')
            continue;
        const pathVal = objPair(el, 'path');
        const indexVal = objPair(el, 'index');
        const childrenVal = objPair(el, 'children');
        const elementVal = objPair(el, 'element');
        let ownSeg = null;
        if (pathVal && pathVal.type === 'string') {
            ownSeg = stringLiteralValue(pathVal);
        }
        else if (indexVal && indexVal.type === 'true') {
            ownSeg = '';
        }
        // path 가 문자열 리터럴이 아니면(indexVal 도 없으면) 이 레벨의 경로는 없다(pathless layout
        // 가능 — children 은 부모 경로 그대로 계속 내려간다).
        const combined = ownSeg !== null ? joinPath(parentPath, ownSeg) : parentPath || '/';
        if (ownSeg !== null) {
            out.push(makeRoute(combined, filePath, startLine(el), elementComponentName(elementVal)));
        }
        if (childrenVal && childrenVal.type === 'array') {
            walkRouteObjectArray(childrenVal, combined, filePath, out);
        }
    }
}
/** 전체 jsx_element 자식 중 태그명 'Route' 인 것들(직계만 — 손자는 재귀 호출에서 처리). */
function directChildRoutes(elem) {
    if (elem.type !== 'jsx_element')
        return [];
    return elem.namedChildren
        .filter((c) => c !== null)
        .filter((c) => c.type === 'jsx_element' || c.type === 'jsx_self_closing_element')
        .filter((c) => tagName(c) === 'Route');
}
/** JSX `<Route path="...">...</Route>` 트리를 재귀 처리. */
function walkJsxRoute(elem, parentPath, filePath, out) {
    const host = attrHost(elem);
    if (!host)
        return;
    const pathAttr = jsxAttrValue(host, 'path');
    const hasIndex = jsxAttrPresent(host, 'index');
    let ownSeg = null;
    if (pathAttr && pathAttr.type === 'string') {
        ownSeg = stringLiteralValue(pathAttr);
    }
    else if (hasIndex) {
        ownSeg = '';
    }
    const combined = ownSeg !== null ? joinPath(parentPath, ownSeg) : parentPath || '/';
    if (ownSeg !== null) {
        const compName = elementComponentName(jsxAttrValue(host, 'element'));
        out.push(makeRoute(combined, filePath, startLine(elem), compName));
    }
    for (const child of directChildRoutes(elem)) {
        walkJsxRoute(child, combined, filePath, out);
    }
}
/** 결과 중복제거 + (path,method,line,filePath) 정렬. */
function dedupSortRoutes(routes) {
    const seen = new Set();
    const out = [];
    for (const r of routes) {
        const key = `${r.path} ${r.method} ${r.line} ${r.filePath}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(r);
    }
    return out.sort((a, b) => cmp(a.path, b.path) || cmp(a.method, b.method) || cmp(a.line, b.line) || cmp(a.filePath, b.filePath));
}
/**
 * 단일 파일에서 React Router 라우트를 추출한다.
 * @param root 파싱된 program 노드(tsx 그래머 권장 — JSX 포함 가능성)
 * @param filePath census relPath
 */
export function extractReactRouterRoutes(root, filePath) {
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node.type === 'call_expression') {
            const fn = node.childForFieldName('function');
            if (fn?.type === 'identifier' && ROUTER_FACTORY_NAMES.has(fn.text)) {
                const argsNode = node.childForFieldName('arguments');
                const first = argsNode?.namedChildren.filter((x) => x !== null)[0];
                if (first && first.type === 'array') {
                    walkRouteObjectArray(first, '', filePath, out);
                }
                continue; // 서브트리는 이미 처리 완료 — 재순회로 인한 컨텍스트 유실 방지.
            }
        }
        if (node.type === 'jsx_element' || node.type === 'jsx_self_closing_element') {
            if (tagName(node) === 'Route') {
                walkJsxRoute(node, '', filePath, out);
                continue;
            }
        }
        for (const c of node.namedChildren)
            if (c)
                stack.push(c);
    }
    return dedupSortRoutes(out);
}
//# sourceMappingURL=react-router.js.map