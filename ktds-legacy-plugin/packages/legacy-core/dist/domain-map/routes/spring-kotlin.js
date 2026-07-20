import { collectDeclAnnotations, ktChild, ktChildren, ktStringContent, } from '../kotlin-ast.js';
import { normalizePath } from '../route-key.js';
/** HTTP 동사 어노테이션 -> 메서드(Java판과 동일 매핑). */
const VERB_BY_MAPPING = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH',
};
/** RequestMethod.X (navigation_expression/identifier 원문) -> RouteMethod. */
function requestMethodToken(text) {
    const m = text.trim().replace(/^RequestMethod\./, '');
    const known = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    return known.includes(m) ? m : null;
}
/** 클래스 prefix 경로에서 후행 와일드카드(/* 등)를 제거한다. */
function stripWildcard(path) {
    return path.replace(/\/\*+$/, '').replace(/\*+$/, '');
}
/** 노트를 중복 제거 + 정렬(결정론). */
function dedupSort(notes) {
    return [...new Set(notes)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/**
 * 어노테이션 인자 값 노드 1개를 경로 문자열로 해소한다.
 * string_literal(비보간) / 상수 참조(identifier·navigation_expression) / 괄호식을 처리.
 */
function resolveKtPathExpr(node, ctx) {
    if (node.type === 'string_literal') {
        const s = ktStringContent(node);
        if (s !== null)
            return { value: s };
        return { value: null, unresolvedRef: node.text, note: `unresolved-constant:${node.text}` };
    }
    if (node.type === 'parenthesized_expression') {
        const inner = node.namedChildren.filter((c) => c !== null)[0];
        if (inner)
            return resolveKtPathExpr(inner, ctx);
        return { value: null, unresolvedRef: node.text, note: `unresolved-constant:${node.text}` };
    }
    if (node.type === 'identifier' || node.type === 'navigation_expression') {
        const ref = node.text;
        const v = ctx.constants.get(ref);
        if (v !== undefined)
            return { value: v, note: `constant:${ref}` };
        return { value: null, unresolvedRef: ref, note: `unresolved-constant:${ref}` };
    }
    return { value: null, unresolvedRef: node.text, note: `unresolved-constant:${node.text}` };
}
/** 경로 표현식(단일/collection_literal 배열)을 후보로 누적. */
function collectKtPathExprs(node, ctx, out) {
    if (node.type === 'collection_literal') {
        for (const child of node.namedChildren) {
            if (child)
                collectKtPathExprs(child, ctx, out);
        }
        return;
    }
    const r = resolveKtPathExpr(node, ctx);
    if (r.value !== null) {
        out.push({ rawPath: r.value, notes: r.note ? [r.note] : [] });
    }
    else {
        out.push({ rawPath: `/__unresolved__/${r.unresolvedRef}`, notes: r.note ? [r.note] : [] });
    }
}
/** method= 값(단일/collection_literal 배열)에서 RouteMethod 들을 누적. */
function collectKtMethods(node, out) {
    if (node.type === 'collection_literal') {
        for (const child of node.namedChildren) {
            if (child)
                collectKtMethods(child, out);
        }
        return;
    }
    const m = requestMethodToken(node.text);
    if (m)
        out.push(m);
}
/**
 * 매핑 어노테이션(KtAnnotation)에서 경로 후보 목록과 메서드 오버라이드를 추출.
 * 인자별 개별 판정(위 파일 헤더 주석의 "의도적 차이" 참조).
 */
function extractKtMappingArgs(annot, ctx) {
    const paths = [];
    const methods = [];
    for (const arg of annot.args) {
        if (arg.name === null || arg.name === 'value' || arg.name === 'path') {
            collectKtPathExprs(arg.node, ctx, paths);
        }
        else if (arg.name === 'method') {
            collectKtMethods(arg.node, methods);
        }
        // 그 외(produces/consumes/headers/name 등)는 라우트 추출과 무관 — 무시.
    }
    return { paths, methods };
}
/** program 전체에서 class_declaration 들을 재귀 수집(Java판과 동형). */
function findKotlinClassDeclarations(root) {
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        for (const child of node.namedChildren) {
            if (!child)
                continue;
            if (child.type === 'class_declaration')
                out.push(child);
            stack.push(child);
        }
    }
    return out;
}
/** function_declaration 의 반환 타입 텍스트 — 첫 non-boilerplate named child. */
function ktReturnTypeText(method) {
    const skip = new Set([
        'modifiers',
        'identifier',
        'function_value_parameters',
        'function_body',
        'type_parameters',
        'type_constraints',
    ]);
    for (const c of method.namedChildren) {
        if (c && !skip.has(c.type))
            return c.text;
    }
    return '';
}
/** 반환 타입이 ResponseEntity 면 api 신호(Java판과 동형). */
function returnsResponseEntity(method) {
    return /(^|[^A-Za-z])ResponseEntity\b/.test(ktReturnTypeText(method));
}
/**
 * 단일 Kotlin 파일에서 Spring 라우트를 추출한다.
 * @param root 파싱된 source_file 노드
 * @param filePath census relPath
 * @param ctx 상수/composed 레지스트리(Java 판과 공유 — extract 단계에서 구축)
 */
export function extractSpringKotlinRoutes(root, filePath, ctx) {
    const out = [];
    for (const cls of findKotlinClassDeclarations(root)) {
        const clsName = ktChild(cls, 'identifier')?.text;
        if (!clsName)
            continue;
        const clsAnnots = collectDeclAnnotations(cls);
        const clsAnnotNames = clsAnnots.map((a) => a.name);
        let isController = false;
        let isRest = false;
        const composedClassNotes = [];
        for (const name of clsAnnotNames) {
            if (name === 'RestController') {
                isRest = true;
                isController = true;
            }
            else if (name === 'Controller') {
                isController = true;
            }
            else if (ctx.composedStereotype.has(name)) {
                isController = true;
                composedClassNotes.push(`composed:@${name}`);
            }
        }
        if (!isController)
            continue;
        // 클래스 prefix(@RequestMapping value/path) — 첫 매칭 어노테이션만 사용(Java판과 동형).
        let classPrefix = '';
        const classPrefixNotes = [];
        const classMapping = clsAnnots.find((a) => a.name === 'RequestMapping');
        if (classMapping) {
            const { paths } = extractKtMappingArgs(classMapping, ctx);
            if (paths.length > 0) {
                classPrefix = stripWildcard(paths[0].rawPath);
                classPrefixNotes.push(...paths[0].notes);
            }
        }
        const body = ktChild(cls, 'class_body');
        if (!body)
            continue;
        const methods = ktChildren(body, 'function_declaration');
        for (const method of methods) {
            const mAnnots = collectDeclAnnotations(method);
            const hasResponseBody = mAnnots.some((a) => a.name === 'ResponseBody');
            for (const annot of mAnnots) {
                const name = annot.name;
                let verb;
                let composedNote = null;
                if (name in VERB_BY_MAPPING) {
                    verb = VERB_BY_MAPPING[name];
                }
                else if (name === 'RequestMapping') {
                    verb = undefined; // method= 로 결정, 없으면 ANY
                }
                else if (ctx.composedVerb.has(name)) {
                    verb = ctx.composedVerb.get(name);
                    composedNote = `composed:@${name}`;
                }
                else {
                    continue;
                }
                const { paths, methods: explicitMethods } = extractKtMappingArgs(annot, ctx);
                const line = annot.line;
                const mName = ktChild(method, 'identifier')?.text ?? '<unknown>';
                const handler = `${clsName}#${mName}`;
                let effectiveMethods;
                if (name in VERB_BY_MAPPING) {
                    effectiveMethods = [verb];
                }
                else if (explicitMethods.length > 0) {
                    effectiveMethods = explicitMethods;
                }
                else if (verb) {
                    effectiveMethods = [verb];
                }
                else {
                    effectiveMethods = ['ANY'];
                }
                const kind = isRest || hasResponseBody || returnsResponseEntity(method) ? 'api' : 'form';
                const candidates = paths.length > 0 ? paths : [{ rawPath: '', notes: [] }];
                for (const httpMethod of effectiveMethods) {
                    const byPath = new Map();
                    for (const cand of candidates) {
                        const isUnresolved = cand.rawPath.startsWith('/__unresolved__/');
                        const rawCombined = isUnresolved ? cand.rawPath : classPrefix + '/' + cand.rawPath;
                        const normPath = isUnresolved ? cand.rawPath : normalizePath(rawCombined);
                        const notes = [
                            ...classPrefixNotes,
                            ...(composedNote ? [composedNote] : []),
                            ...composedClassNotes,
                            ...cand.notes,
                        ];
                        const existing = byPath.get(normPath);
                        if (existing) {
                            const rawVariant = rawCombined.replace(/\/{2,}/g, '/');
                            const declNote = `also-declared-as:${rawVariant}`;
                            if (rawVariant !== existing.path && !existing.notes.includes(declNote)) {
                                existing.notes.push(declNote);
                            }
                            continue;
                        }
                        byPath.set(normPath, {
                            routeId: '',
                            method: httpMethod,
                            path: normPath,
                            rawPath: rawCombined,
                            kind,
                            framework: 'spring',
                            filePath,
                            line,
                            handler,
                            notes,
                        });
                    }
                    for (const entry of byPath.values()) {
                        entry.notes = dedupSort(entry.notes);
                        out.push(entry);
                    }
                }
            }
        }
    }
    return out;
}
/**
 * 파일에서 `const val NAME = "..."` 상수를 수집한다(top-level + companion object).
 * companion object 소속은 `ClassName.NAME` 와 bare `NAME` 두 키로, top-level 은 bare
 * `NAME` 만 등록한다(Java collectConstants 와 동일 소비 형태 — into 에 누적).
 * Kotlin 은 `const` 가 top-level/object/companion object 에서만 허용되므로
 * 일반 클래스 인스턴스 프로퍼티는 대상이 아니다(언어 제약 — 별도 판별 불필요).
 */
export function collectKotlinConstants(root, into) {
    walkForKtConstants(root, null, into);
}
function walkForKtConstants(node, enclosingClass, into) {
    for (const c of node.namedChildren) {
        if (!c)
            continue;
        if (c.type === 'class_declaration' || c.type === 'object_declaration') {
            const nm = ktChild(c, 'identifier')?.text ?? enclosingClass;
            const clsBody = ktChild(c, 'class_body');
            if (clsBody)
                walkForKtConstants(clsBody, nm, into);
            continue;
        }
        if (c.type === 'companion_object') {
            const coBody = ktChild(c, 'class_body');
            if (coBody)
                walkForKtConstants(coBody, enclosingClass, into);
            continue;
        }
        if (c.type === 'property_declaration') {
            const mods = ktChild(c, 'modifiers');
            const isConst = mods ? ktChildren(mods, 'property_modifier').some((m) => m.text === 'const') : false;
            if (isConst) {
                const varDecl = ktChild(c, 'variable_declaration');
                const nameId = varDecl ? ktChild(varDecl, 'identifier') : null;
                const named = c.namedChildren.filter((x) => x !== null);
                const valueNode = named[named.length - 1];
                const value = valueNode && valueNode !== varDecl && valueNode !== mods ? ktStringContent(valueNode) : null;
                if (nameId && value !== null) {
                    if (enclosingClass)
                        into.set(`${enclosingClass}.${nameId.text}`, value);
                    into.set(nameId.text, value);
                }
            }
            continue;
        }
        // 그 외 노드(함수 본문 등)도 재귀 — 함수 내부 로컬 object 등 예외적 중첩 대비.
        walkForKtConstants(c, enclosingClass, into);
    }
}
//# sourceMappingURL=spring-kotlin.js.map