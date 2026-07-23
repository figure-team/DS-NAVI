import { parseSource, startLine } from './tree-sitter.js';
const DECL_KINDS = {
    class_declaration: 'class',
    interface_declaration: 'interface',
    enum_declaration: 'enum',
    record_declaration: 'record',
};
/** 직계 named child 중 첫 번째 주어진 타입. */
function child(node, type) {
    for (const c of node.namedChildren) {
        if (c && c.type === type)
            return c;
    }
    return null;
}
/** 직계 named children 중 주어진 타입들(선언 순서). */
function children(node, ...types) {
    const want = new Set(types);
    const out = [];
    for (const c of node.namedChildren) {
        if (c && want.has(c.type))
            out.push(c);
    }
    return out;
}
/** scoped_identifier 등에서 최종(외곽) 식별자 텍스트. */
function lastIdentifier(node) {
    if (node.type === 'identifier' || node.type === 'type_identifier')
        return node.text;
    // scoped_identifier / scoped_type_identifier: 마지막 identifier 가 외곽 이름.
    const ids = node.namedChildren.filter((c) => c !== null);
    for (let i = ids.length - 1; i >= 0; i--) {
        const c = ids[i];
        if (c.type === 'identifier' || c.type === 'type_identifier')
            return c.text;
    }
    // 폴백: 텍스트의 마지막 점 뒤.
    const t = node.text;
    const dot = t.lastIndexOf('.');
    return dot >= 0 ? t.slice(dot + 1) : t;
}
/**
 * 타입 노드에서 외곽 식별자만 추출한다.
 * generic_type -> 기저 type_identifier, array_type -> 원소 타입,
 * scoped_type_identifier -> 마지막 식별자, type_identifier -> 그대로.
 */
function typeOuterName(node) {
    if (!node)
        return null;
    switch (node.type) {
        case 'type_identifier':
        case 'identifier':
            return node.text;
        case 'generic_type': {
            const base = child(node, 'type_identifier') ?? child(node, 'scoped_type_identifier');
            return base ? typeOuterName(base) : null;
        }
        case 'array_type': {
            const el = child(node, 'type_identifier') ??
                child(node, 'scoped_type_identifier') ??
                child(node, 'generic_type');
            return el ? typeOuterName(el) : null;
        }
        case 'scoped_type_identifier':
            return lastIdentifier(node);
        default:
            // integral_type/void_type/floating_point_type 등 기본형은 무시.
            return null;
    }
}
/** 모디파이어 노드에서 어노테이션 앵커(이름+그 어노테이션 라인, 선언 순서). */
function annotationAnchorsOf(mods) {
    if (!mods)
        return [];
    const out = [];
    for (const a of children(mods, 'annotation', 'marker_annotation')) {
        const id = child(a, 'identifier');
        if (id)
            out.push({ name: id.text, line: startLine(a) });
    }
    return out;
}
/** 모디파이어 노드에서 어노테이션 이름 목록(정렬 없이 선언 순서). */
function annotationNames(mods) {
    return annotationAnchorsOf(mods).map((a) => a.name);
}
/** 모디파이어 텍스트에 abstract 키워드가 있는지. */
function isAbstractMods(mods) {
    return mods ? /\babstract\b/.test(mods.text) : false;
}
/** 선언 노드의 첫 type 노드(필드 타입). field_declaration 전용. */
function fieldTypeNode(field) {
    for (const c of field.namedChildren) {
        if (!c)
            continue;
        if (c.type === 'type_identifier' ||
            c.type === 'generic_type' ||
            c.type === 'array_type' ||
            c.type === 'scoped_type_identifier') {
            return c;
        }
    }
    return null;
}
/** 클래스 본문(class_body / interface_body / enum_body)에서 멤버 컨테이너. */
function bodyOf(decl) {
    return (child(decl, 'class_body') ??
        child(decl, 'interface_body') ??
        child(decl, 'enum_body') ??
        null);
}
/** record_declaration 의 헤더 파라미터 타입(생성자 파라미터로 취급). */
function recordParamTypes(decl) {
    const fps = child(decl, 'formal_parameters');
    if (!fps)
        return [];
    return formalParamTypes(fps);
}
/** formal_parameters 노드에서 파라미터 타입 외곽 식별자(선언 순서). */
function formalParamTypes(fps) {
    const out = [];
    for (const p of children(fps, 'formal_parameter', 'spread_parameter')) {
        const typeNode = child(p, 'type_identifier') ??
            child(p, 'generic_type') ??
            child(p, 'array_type') ??
            child(p, 'scoped_type_identifier');
        const name = typeOuterName(typeNode);
        if (name)
            out.push(name);
    }
    return out;
}
/** extends 대상 외곽 식별자 목록. */
function extendsNames(decl, kind) {
    if (kind === 'class') {
        const sc = child(decl, 'superclass');
        if (!sc)
            return [];
        const t = typeOuterName(sc.namedChildren.filter((c) => c !== null)[0] ?? null);
        return t ? [t] : [];
    }
    if (kind === 'interface') {
        const ext = child(decl, 'extends_interfaces');
        if (!ext)
            return [];
        return typeListNames(child(ext, 'type_list'));
    }
    return [];
}
/** implements 인터페이스 외곽 식별자 목록(class/enum/record). */
function implementsNames(decl) {
    const si = child(decl, 'super_interfaces');
    if (!si)
        return [];
    return typeListNames(child(si, 'type_list'));
}
/** type_list 노드에서 타입 외곽 식별자들. */
function typeListNames(typeList) {
    if (!typeList)
        return [];
    const out = [];
    for (const c of typeList.namedChildren) {
        const name = typeOuterName(c);
        if (name)
            out.push(name);
    }
    return out;
}
/** 임의 타입 노드에서 외곽 식별자(generic/array/scoped 처리). returnType/local 타입용. */
function anyTypeOuterName(node) {
    if (!node)
        return null;
    switch (node.type) {
        case 'type_identifier':
        case 'identifier':
            return node.text;
        case 'generic_type':
        case 'array_type':
        case 'scoped_type_identifier':
            return typeOuterName(node);
        default:
            return null;
    }
}
/** method_declaration 의 반환 타입 노드(이름이 'type' 인 필드 또는 첫 타입). */
function returnTypeName(method) {
    const t = method.childForFieldName('type');
    if (t)
        return anyTypeOuterName(t);
    // 폴백: name 앞의 첫 타입 노드.
    for (const c of method.namedChildren) {
        if (!c)
            continue;
        const n = anyTypeOuterName(c);
        if (n)
            return n;
    }
    return null;
}
/**
 * 표현식 노드를 ReceiverDesc 로 변환한다(재귀). 해소 가능한 형태만 생산하고,
 * 알 수 없는 형태(캐스트/람다/배열접근/생성식/삼항 등)는 `{ kind: 'unknown' }` 을 돌려
 * 호출자가 unresolved 로 처리하게 한다. null 은 "수신자 노드 자체가 없음"(묵시적 self)에만
 * 쓰인다 — 명시 수신자가 있는데 미해소인 경우를 self 로 오인하지 않기 위함.
 */
function exprToReceiver(node) {
    if (!node)
        return null;
    switch (node.type) {
        case 'this':
            return { kind: 'this' };
        case 'super':
            return { kind: 'super' };
        case 'identifier':
            return { kind: 'name', text: node.text };
        case 'field_access': {
            // `<obj>.<field>` — obj 가 super 면 super, this 면 this, 그 외 receiver 재귀.
            const objNode = node.childForFieldName('object');
            const fieldNode = node.childForFieldName('field');
            if (!fieldNode)
                return { kind: 'unknown' };
            if (objNode?.type === 'super') {
                // super.field 는 흔치 않으나 field on super 로 표현.
                return { kind: 'field', on: { kind: 'super' }, field: fieldNode.text };
            }
            const on = objNode ? exprToReceiver(objNode) : null;
            // obj 가 해소 불가(unknown && objNode 존재)면 전체 미해소.
            if (on?.kind === 'unknown')
                return { kind: 'unknown' };
            return { kind: 'field', on, field: fieldNode.text };
        }
        case 'method_invocation': {
            // 체이닝: `<obj>.<name>(...)` — obj 의 반환 타입으로 해소.
            const objNode = node.childForFieldName('object');
            const nameNode = node.childForFieldName('name');
            if (!nameNode)
                return { kind: 'unknown' };
            if (objNode?.type === 'super') {
                return { kind: 'call', on: { kind: 'super' }, methodName: nameNode.text };
            }
            const on = objNode ? exprToReceiver(objNode) : null;
            if (on?.kind === 'unknown')
                return { kind: 'unknown' };
            return { kind: 'call', on, methodName: nameNode.text };
        }
        case 'parenthesized_expression': {
            const inner = node.namedChildren.filter((c) => c !== null)[0] ?? null;
            // 괄호 안이 비어 있으면(불가능에 가까움) 미해소. 그 외 내부 식 그대로 해소.
            return inner ? exprToReceiver(inner) : { kind: 'unknown' };
        }
        default:
            // cast_expression / array_access / object_creation_expression / 람다 / 삼항 등은 미해소.
            return { kind: 'unknown' };
    }
}
/** arguments 노드의 인자 개수(named children 수). */
function argCountOf(invocation) {
    const args = invocation.childForFieldName('arguments');
    if (!args)
        return 0;
    return args.namedChildren.filter((c) => c !== null).length;
}
/**
 * 메서드 본문에서 호출 지점(소스 순서)과 지역변수 선언을 수집한다.
 * 호출은 깊이우선 전위순회(소스 순서 ≈ startIndex 오름차순)로 모으되, 마지막에 startIndex 정렬한다.
 */
function collectBodyFacts(body) {
    const calls = [];
    const locals = [];
    const visit = (node) => {
        if (node.type === 'method_invocation') {
            const nameNode = node.childForFieldName('name');
            const objNode = node.childForFieldName('object');
            if (nameNode) {
                let receiver;
                let receiverText;
                if (!objNode) {
                    // 묵시적 self 호출 — `m(...)`.
                    receiver = null;
                    receiverText = null;
                }
                else {
                    receiver = exprToReceiver(objNode);
                    receiverText = objNode.text;
                }
                calls.push({
                    methodName: nameNode.text,
                    argCount: argCountOf(node),
                    receiver,
                    receiverText,
                    line: startLine(node),
                    startIndex: node.startIndex,
                });
            }
        }
        else if (node.type === 'local_variable_declaration') {
            const typeNode = child(node, 'type_identifier') ??
                child(node, 'generic_type') ??
                child(node, 'array_type') ??
                child(node, 'scoped_type_identifier');
            let typeName;
            if (typeNode) {
                typeName = anyTypeOuterName(typeNode);
            }
            else {
                // `var x = ...` — type 가 식별자 'var' 로 파싱될 수 있음.
                const firstId = child(node, 'identifier');
                typeName = firstId && firstId.text === 'var' ? 'var' : null;
            }
            for (const declr of children(node, 'variable_declarator')) {
                const nameId = child(declr, 'identifier');
                if (nameId && typeName) {
                    locals.push({ name: nameId.text, typeName, startIndex: node.startIndex });
                }
            }
        }
        for (const c of node.namedChildren) {
            if (c)
                visit(c);
        }
    };
    visit(body);
    calls.sort((a, b) => a.startIndex - b.startIndex);
    return { calls, locals };
}
/** class_body 등에서 메서드(+생성자) 선언을 MethodFact 로 수집(선언 순서). */
function collectMethods(body) {
    const out = [];
    for (const m of children(body, 'method_declaration', 'constructor_declaration')) {
        const id = child(m, 'identifier');
        if (!id)
            continue;
        const fps = child(m, 'formal_parameters');
        const paramCount = fps
            ? children(fps, 'formal_parameter', 'spread_parameter').length
            : 0;
        const mbody = child(m, 'block') ?? child(m, 'constructor_body');
        const { calls, locals } = mbody
            ? collectBodyFacts(mbody)
            : { calls: [], locals: [] };
        const mannotAnchors = annotationAnchorsOf(child(m, 'modifiers'));
        out.push({
            name: id.text,
            paramCount,
            paramsText: fps ? fps.text : '()',
            returnType: m.type === 'constructor_declaration' ? null : returnTypeName(m),
            line: startLine(m),
            annotations: mannotAnchors.map((a) => a.name),
            annotationAnchors: mannotAnchors,
            locals,
            calls,
        });
    }
    return out;
}
/** 단일 선언 노드에서 ClassFact 를 만든다. */
function declToFact(decl, kind, packageName) {
    const id = child(decl, 'identifier');
    if (!id)
        return null;
    const name = id.text;
    const mods = child(decl, 'modifiers');
    const fields = [];
    const ctorParamTypes = [];
    const methods = [];
    const body = bodyOf(decl);
    if (body) {
        methods.push(...collectMethods(body));
        for (const field of children(body, 'field_declaration')) {
            const typeName = typeOuterName(fieldTypeNode(field));
            const fmods = child(field, 'modifiers');
            const fannotAnchors = annotationAnchorsOf(fmods);
            const fannots = fannotAnchors.map((a) => a.name);
            for (const declr of children(field, 'variable_declarator')) {
                const nameId = child(declr, 'identifier');
                if (!nameId || !typeName)
                    continue;
                fields.push({
                    name: nameId.text,
                    type: typeName,
                    line: startLine(field),
                    annotations: fannots,
                    annotationAnchors: fannotAnchors,
                });
            }
        }
        for (const ctor of children(body, 'constructor_declaration')) {
            const fps = child(ctor, 'formal_parameters');
            if (fps)
                ctorParamTypes.push(...formalParamTypes(fps));
        }
    }
    if (kind === 'record')
        ctorParamTypes.push(...recordParamTypes(decl));
    return {
        name,
        fqn: packageName ? `${packageName}.${name}` : name,
        kind,
        isAbstract: isAbstractMods(mods),
        extends: extendsNames(decl, kind),
        implements: implementsNames(decl),
        line: startLine(decl),
        fields,
        ctorParamTypes,
        annotations: annotationNames(mods),
        annotationAnchors: annotationAnchorsOf(mods),
        methods,
    };
}
/** 모든 (중첩 포함) 타입 선언을 결정론적 깊이우선으로 수집. */
function collectDecls(root) {
    const out = [];
    const stack = [root];
    // 스택 사용으로 인한 역순을 막기 위해, 자식을 역순으로 push 한다.
    while (stack.length > 0) {
        const node = stack.pop();
        const named = node.namedChildren.filter((c) => c !== null);
        for (let i = named.length - 1; i >= 0; i--) {
            stack.push(named[i]);
        }
        const kind = DECL_KINDS[node.type];
        if (kind)
            out.push({ node, kind });
    }
    return out;
}
/** import 문 FQN 목록(선언 순서). */
function collectImports(root) {
    const out = [];
    for (const c of root.namedChildren) {
        if (!c || c.type !== 'import_declaration')
            continue;
        // `import a.b.C;` / `import static a.b.C.m;` / `import a.b.*;`
        const scoped = child(c, 'scoped_identifier');
        if (scoped) {
            const asterisk = c.text.includes('.*') ? '.*' : '';
            out.push(scoped.text + asterisk);
        }
    }
    return out;
}
/** package 선언의 FQN. */
function readPackage(root) {
    const pkg = child(root, 'package_declaration');
    if (!pkg)
        return null;
    const scoped = child(pkg, 'scoped_identifier') ?? child(pkg, 'identifier');
    return scoped ? scoped.text : null;
}
/** 한 Java 파일에서 팩트를 추출한다(파일당 1회 파싱). */
export async function extractJavaFacts(relPath, src) {
    const root = await parseSource('java', src);
    const packageName = readPackage(root);
    const imports = collectImports(root);
    const classes = [];
    for (const { node, kind } of collectDecls(root)) {
        const fact = declToFact(node, kind, packageName);
        if (fact)
            classes.push(fact);
    }
    return { relPath, packageName, imports, classes };
}
//# sourceMappingURL=java-facts.js.map