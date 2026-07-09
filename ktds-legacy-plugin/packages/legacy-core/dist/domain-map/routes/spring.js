import { childrenOfType, startLine } from '../tree-sitter.js';
import { normalizePath } from '../route-key.js';
/** HTTP 동사 어노테이션 -> 메서드. */
const VERB_BY_MAPPING = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH',
};
const STEREOTYPE_NAMES = new Set(['Controller', 'RestController']);
/** RequestMethod.X -> RouteMethod. */
function requestMethodToken(text) {
    const m = text.trim().replace(/^RequestMethod\./, '');
    const known = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    return known.includes(m) ? m : null;
}
/** 어노테이션 이름(identifier) 추출. */
function annotationName(annot) {
    const id = childrenOfType(annot, 'identifier')[0];
    return id ? id.text : null;
}
/** string_literal 노드의 실제 문자열(따옴표 제외). */
function stringLiteralValue(node) {
    const frag = childrenOfType(node, 'string_fragment')[0];
    if (frag)
        return frag.text;
    // 빈 문자열 리터럴("") 은 string_fragment 가 없다.
    return '';
}
function resolveExpr(node, ctx) {
    switch (node.type) {
        case 'string_literal':
            return { value: stringLiteralValue(node) };
        case 'identifier': {
            const ref = node.text;
            const v = ctx.constants.get(ref);
            if (v !== undefined)
                return { value: v, note: `constant:${ref}` };
            return { value: null, unresolvedRef: ref, note: `unresolved-constant:${ref}` };
        }
        case 'field_access': {
            const ref = node.text;
            const v = ctx.constants.get(ref);
            if (v !== undefined)
                return { value: v, note: `constant:${ref}` };
            return { value: null, unresolvedRef: ref, note: `unresolved-constant:${ref}` };
        }
        case 'binary_expression': {
            // 양변(named children)을 좌->우로 해소해 연결한다.
            const parts = node.namedChildren.filter((c) => c !== null);
            let acc = '';
            for (const part of parts) {
                const r = resolveExpr(part, ctx);
                if (r.value === null) {
                    // 표현식 일부 미해소 — 원문 ref 로 보고.
                    return { value: null, unresolvedRef: node.text, note: `constant:${node.text}` };
                }
                acc += r.value;
            }
            return { value: acc, note: `constant:${node.text}` };
        }
        default:
            return { value: null, unresolvedRef: node.text, note: `unresolved-constant:${node.text}` };
    }
}
/** annotation_argument_list 에서 경로 후보 목록과 메서드 오버라이드를 추출. */
function extractMappingArgs(annot, ctx) {
    const argList = childrenOfType(annot, 'annotation_argument_list')[0];
    const paths = [];
    const methods = [];
    if (!argList)
        return { paths, methods };
    const pairs = childrenOfType(argList, 'element_value_pair');
    if (pairs.length > 0) {
        // 속성형: value=/path=/method= 처리.
        for (const pair of pairs) {
            const name = childrenOfType(pair, 'identifier')[0]?.text;
            const valueNode = pair.namedChildren.filter((c) => c !== null)[1];
            if (!valueNode)
                continue;
            if (name === 'value' || name === 'path') {
                collectPathExprs(valueNode, ctx, paths);
            }
            else if (name === 'method') {
                collectMethods(valueNode, methods);
            }
        }
        return { paths, methods };
    }
    // 위치형: argList 직속 표현식들이 경로.
    for (const child of argList.namedChildren) {
        if (child)
            collectPathExprs(child, ctx, paths);
    }
    return { paths, methods };
}
/** 경로 표현식(단일/배열)을 후보로 누적. */
function collectPathExprs(node, ctx, out) {
    if (node.type === 'block_comment' || node.type === 'line_comment')
        return;
    if (node.type === 'element_value_array_initializer') {
        for (const child of node.namedChildren) {
            if (child)
                collectPathExprs(child, ctx, out);
        }
        return;
    }
    const r = resolveExpr(node, ctx);
    if (r.value !== null) {
        out.push({ rawPath: r.value, notes: r.note ? [r.note] : [] });
    }
    else {
        out.push({
            rawPath: `/__unresolved__/${r.unresolvedRef}`,
            notes: r.note ? [r.note] : [],
            // unresolved 경로는 정규화를 우회한다(마커 보존).
        });
    }
}
/** method= 값에서 RouteMethod 들을 누적. */
function collectMethods(node, out) {
    if (node.type === 'element_value_array_initializer') {
        for (const child of node.namedChildren) {
            if (child)
                collectMethods(child, out);
        }
        return;
    }
    const m = requestMethodToken(node.text);
    if (m)
        out.push(m);
}
/** 클래스 prefix 경로에서 후행 와일드카드(/* 등)를 제거한다. */
function stripWildcard(path) {
    return path.replace(/\/\*+$/, '').replace(/\*+$/, '');
}
/** method_declaration 의 메서드 이름. */
function methodName(method) {
    // modifiers, returnType, identifier(name), formal_parameters ... 순.
    // 이름은 formal_parameters 직전의 identifier.
    const named = method.namedChildren.filter((c) => c !== null);
    const fpIdx = named.findIndex((c) => c.type === 'formal_parameters');
    if (fpIdx > 0) {
        const before = named[fpIdx - 1];
        if (before.type === 'identifier')
            return before.text;
    }
    // 폴백: 첫 identifier.
    const id = named.find((c) => c.type === 'identifier');
    return id ? id.text : null;
}
/** method_declaration 의 반환 타입 텍스트(최상위 type 노드). */
function returnTypeText(method) {
    const named = method.namedChildren.filter((c) => c !== null);
    for (const c of named) {
        if (c.type === 'type_identifier' ||
            c.type === 'generic_type' ||
            c.type === 'void_type' ||
            c.type === 'integral_type' ||
            c.type === 'array_type' ||
            c.type === 'scoped_type_identifier') {
            return c.text;
        }
    }
    return '';
}
/** 메서드의 어노테이션 노드들(annotation + marker_annotation). */
function methodAnnotations(method) {
    const mods = childrenOfType(method, 'modifiers')[0];
    if (!mods)
        return [];
    return childrenOfType(mods, 'annotation', 'marker_annotation');
}
/** 클래스의 어노테이션 노드들. */
function classAnnotations(cls) {
    const mods = childrenOfType(cls, 'modifiers')[0];
    if (!mods)
        return [];
    return childrenOfType(mods, 'annotation', 'marker_annotation');
}
/** 클래스 이름. */
function className(cls) {
    const id = childrenOfType(cls, 'identifier')[0];
    return id ? id.text : null;
}
/**
 * 단일 파일에서 Spring 라우트를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 * @param ctx 상수/composed 레지스트리(extract 단계에서 구축)
 */
export function extractSpringRoutes(root, filePath, ctx) {
    const out = [];
    const classes = findClassDeclarations(root);
    for (const cls of classes) {
        const clsName = className(cls);
        if (!clsName)
            continue;
        const annots = classAnnotations(cls);
        const annotNames = annots.map(annotationName).filter((n) => n !== null);
        // composed stereotype 까지 펼친 클래스 어노테이션 집합.
        const composedClassNotes = [];
        let isController = false;
        let isRest = false;
        for (const name of annotNames) {
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
        // 클래스 prefix(@RequestMapping value/path).
        let classPrefix = '';
        const classPrefixNotes = [];
        const classMapping = annots.find((a) => annotationName(a) === 'RequestMapping');
        if (classMapping) {
            const { paths } = extractMappingArgs(classMapping, ctx);
            if (paths.length > 0) {
                classPrefix = stripWildcard(paths[0].rawPath);
                classPrefixNotes.push(...paths[0].notes);
            }
        }
        const body = childrenOfType(cls, 'class_body')[0];
        if (!body)
            continue;
        const methods = childrenOfType(body, 'method_declaration');
        for (const method of methods) {
            const mAnnots = methodAnnotations(method);
            const mAnnotNames = mAnnots.map(annotationName);
            const hasResponseBody = mAnnotNames.includes('ResponseBody');
            // 매핑 어노테이션(직접 or composed) 탐색.
            for (let i = 0; i < mAnnots.length; i++) {
                const annot = mAnnots[i];
                const name = mAnnotNames[i];
                if (!name)
                    continue;
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
                const { paths, methods: explicitMethods } = extractMappingArgs(annot, ctx);
                const line = startLine(annot);
                const mName = methodName(method) ?? '<unknown>';
                const handler = `${clsName}#${mName}`;
                // 메서드 집합 결정.
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
                // kind 추론.
                const kind = isRest || hasResponseBody || returnsResponseEntity(method) ? 'api' : 'form';
                // 경로 후보(없으면 빈 경로 1개로 클래스 prefix 만 적용).
                const candidates = paths.length > 0 ? paths : [{ rawPath: '', notes: [] }];
                // (정규화경로 -> 누적 RouteEntry per method) dedup.
                for (const httpMethod of effectiveMethods) {
                    const byPath = new Map();
                    for (const cand of candidates) {
                        const isUnresolved = cand.rawPath.startsWith('/__unresolved__/');
                        // prefix + path 는 "/" 로 join 후 정규화(중복 슬래시 축약)해 세그먼트 경계를 보장.
                        const rawCombined = isUnresolved
                            ? cand.rawPath
                            : classPrefix + '/' + cand.rawPath;
                        const normPath = isUnresolved ? cand.rawPath : normalizePath(rawCombined);
                        const notes = [
                            ...classPrefixNotes,
                            ...(composedNote ? [composedNote] : []),
                            ...composedClassNotes,
                            ...cand.notes,
                        ];
                        const existing = byPath.get(normPath);
                        if (existing) {
                            // 정규화 충돌 — also-declared-as 로 변형 원경로를 보고(중복 슬래시만 축약, 후행 유지).
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
/** 반환 타입이 ResponseEntity 면 api 신호. */
function returnsResponseEntity(method) {
    return /(^|[^A-Za-z])ResponseEntity\b/.test(returnTypeText(method));
}
/** 노트를 중복 제거 + 정렬(결정론). */
function dedupSort(notes) {
    return [...new Set(notes)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/** program 전체에서 class_declaration 들을 재귀 수집. */
function findClassDeclarations(root) {
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
/**
 * 파일에서 `static final String NAME = "..."` 상수를 수집한다.
 * `ClassName.NAME` 와 bare `NAME` 두 키로 등록(교차파일 + 파일내 해소용).
 */
export function collectConstants(root, into) {
    const classes = findClassDeclarations(root);
    for (const cls of classes) {
        const clsName = className(cls);
        const body = childrenOfType(cls, 'class_body')[0];
        if (!body)
            continue;
        for (const field of childrenOfType(body, 'field_declaration')) {
            const typeId = childrenOfType(field, 'type_identifier')[0];
            if (!typeId || typeId.text !== 'String')
                continue;
            const mods = childrenOfType(field, 'modifiers')[0];
            const modText = mods ? mods.text : '';
            if (!/\bstatic\b/.test(modText) || !/\bfinal\b/.test(modText))
                continue;
            for (const decl of childrenOfType(field, 'variable_declarator')) {
                const nameId = childrenOfType(decl, 'identifier')[0];
                const lit = childrenOfType(decl, 'string_literal')[0];
                if (!nameId || !lit)
                    continue;
                const value = stringLiteralValue(lit);
                if (clsName)
                    into.set(`${clsName}.${nameId.text}`, value);
                into.set(nameId.text, value);
            }
        }
    }
}
/**
 * 파일의 composed 메타어노테이션 정의(@interface)를 수집한다.
 * @interface 가 @GetMapping 등으로 메타어노테이트되면 동사를,
 * @Controller 로 메타어노테이트되면 stereotype 을 등록한다.
 */
export function collectComposedAnnotations(root, composedVerb, composedStereotype) {
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        for (const child of node.namedChildren) {
            if (!child)
                continue;
            if (child.type === 'annotation_type_declaration') {
                const id = childrenOfType(child, 'identifier')[0];
                if (id)
                    classifyComposed(child, id.text, composedVerb, composedStereotype);
            }
            stack.push(child);
        }
    }
}
function classifyComposed(annotDecl, name, composedVerb, composedStereotype) {
    const mods = childrenOfType(annotDecl, 'modifiers')[0];
    if (!mods)
        return;
    const metaAnnots = childrenOfType(mods, 'annotation', 'marker_annotation');
    for (const meta of metaAnnots) {
        const metaName = annotationName(meta);
        if (!metaName)
            continue;
        if (metaName in VERB_BY_MAPPING) {
            composedVerb.set(name, VERB_BY_MAPPING[metaName]);
        }
        else if (metaName === 'RequestMapping') {
            // method= 에서 동사 추출(없으면 undefined -> ANY).
            const methods = [];
            const argList = childrenOfType(meta, 'annotation_argument_list')[0];
            if (argList) {
                for (const pair of childrenOfType(argList, 'element_value_pair')) {
                    if (childrenOfType(pair, 'identifier')[0]?.text === 'method') {
                        const valueNode = pair.namedChildren.filter((c) => c !== null)[1];
                        if (valueNode)
                            collectMethods(valueNode, methods);
                    }
                }
            }
            composedVerb.set(name, methods.length > 0 ? methods[0] : undefined);
        }
        else if (STEREOTYPE_NAMES.has(metaName)) {
            composedStereotype.add(name);
        }
    }
}
//# sourceMappingURL=spring.js.map