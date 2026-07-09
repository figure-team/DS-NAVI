import { childrenOfType, startLine } from '../tree-sitter.js';
/** 직계 named child 중 첫 번째 주어진 타입. */
function child(node, type) {
    for (const c of node.namedChildren) {
        if (c && c.type === type)
            return c;
    }
    return null;
}
/** string_literal 노드의 실제 문자열(따옴표 제외). */
function stringLiteralValue(node) {
    const frag = childrenOfType(node, 'string_fragment')[0];
    return frag ? frag.text : '';
}
/** 어노테이션 이름(identifier). */
function annotationName(annot) {
    return child(annot, 'identifier')?.text ?? null;
}
/** modifiers 노드의 어노테이션들(annotation + marker_annotation). */
function annotationsOf(decl) {
    const mods = child(decl, 'modifiers');
    return mods ? childrenOfType(mods, 'annotation', 'marker_annotation') : [];
}
/** 단일 인자 어노테이션의 첫 문자열 리터럴 값(@UrlBinding / @HandlesEvent). */
function singleStringArg(annot) {
    const argList = child(annot, 'annotation_argument_list');
    if (!argList)
        return null;
    const lit = childrenOfType(argList, 'string_literal')[0];
    return lit ? stringLiteralValue(lit) : null;
}
/** package 선언의 FQN(없으면 null). */
function packageName(root) {
    const pkg = child(root, 'package_declaration');
    if (!pkg)
        return null;
    const scoped = child(pkg, 'scoped_identifier') ?? child(pkg, 'identifier');
    return scoped ? scoped.text : null;
}
/** program 전체에서 class_declaration 들을 재귀 수집. */
function findClassDeclarations(root) {
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        for (const c of node.namedChildren) {
            if (!c)
                continue;
            if (c.type === 'class_declaration')
                out.push(c);
            stack.push(c);
        }
    }
    return out;
}
/** method_declaration 의 이름(formal_parameters 직전 identifier). */
function methodName(method) {
    const named = method.namedChildren.filter((c) => c !== null);
    const fpIdx = named.findIndex((c) => c.type === 'formal_parameters');
    if (fpIdx > 0 && named[fpIdx - 1].type === 'identifier')
        return named[fpIdx - 1].text;
    return named.find((c) => c.type === 'identifier')?.text ?? null;
}
/** method_declaration 의 반환 타입 텍스트(최상위 type 노드). */
function returnTypeText(method) {
    for (const c of method.namedChildren) {
        if (!c)
            continue;
        if (c.type === 'type_identifier' ||
            c.type === 'generic_type' ||
            c.type === 'scoped_type_identifier' ||
            c.type === 'void_type' ||
            c.type === 'integral_type' ||
            c.type === 'array_type') {
            return c.text;
        }
    }
    return '';
}
/**
 * 클래스명에서 Stripes 이름규약 suffix 를 제거한다.
 * `XActionBean` -> `X`, 그 외 `XBean` -> `X`, 둘 다 아니면 그대로.
 */
function stripBeanSuffix(name) {
    if (name.endsWith('ActionBean'))
        return name.slice(0, -'ActionBean'.length);
    if (name.endsWith('Bean'))
        return name.slice(0, -'Bean'.length);
    return name;
}
/**
 * 단일 파일에서 Stripes 라우트를 추출한다.
 * @param root 파싱된 program 노드
 * @param filePath census relPath
 */
export function extractStripesRoutes(root, filePath) {
    const out = [];
    const pkg = packageName(root);
    const lastPkgSeg = pkg ? pkg.split('.').pop() ?? '' : '';
    for (const cls of findClassDeclarations(root)) {
        const clsName = child(cls, 'identifier')?.text;
        if (!clsName)
            continue;
        const mods = child(cls, 'modifiers');
        if (mods && /\babstract\b/.test(mods.text))
            continue;
        const clsAnnots = annotationsOf(cls);
        const urlBinding = clsAnnots.find((a) => annotationName(a) === 'UrlBinding');
        const nameBased = !urlBinding;
        let base;
        if (urlBinding) {
            const v = singleStringArg(urlBinding);
            if (!v)
                continue;
            base = v;
        }
        else {
            base = `/${lastPkgSeg}/${stripBeanSuffix(clsName)}.action`;
        }
        const body = child(cls, 'class_body');
        if (!body)
            continue;
        // ActionBean 신호가 약하면(매핑/이벤트 핸들러가 전혀 없으면) 라우트 없음.
        const handlerRoutes = [];
        for (const method of childrenOfType(body, 'method_declaration')) {
            const mMods = child(method, 'modifiers');
            const mModText = mMods ? mMods.text : '';
            // public 비정적 + Resolution(또는 서브타입) 반환만 이벤트 핸들러.
            // Stripes Resolution 구현은 전부 "…Resolution" 으로 끝난다(ForwardResolution,
            // RedirectResolution, StreamingResolution 등). 베이스 `Resolution` 만 매칭하면
            // ForwardResolution 핸들러(예: CatalogActionBean)를 통째로 놓친다.
            if (!/\bpublic\b/.test(mModText))
                continue;
            if (/\bstatic\b/.test(mModText))
                continue;
            if (!/Resolution\b/.test(returnTypeText(method)))
                continue;
            const mName = methodName(method) ?? '<unknown>';
            const mAnnots = annotationsOf(method);
            const isDefault = mAnnots.some((a) => annotationName(a) === 'DefaultHandler');
            const handlesEvent = mAnnots.find((a) => annotationName(a) === 'HandlesEvent');
            let path;
            if (isDefault) {
                path = base;
            }
            else if (handlesEvent) {
                const evt = singleStringArg(handlesEvent) ?? mName;
                path = `${base}?${evt}`;
            }
            else {
                path = `${base}?${mName}`;
            }
            const notes = nameBased ? ['name-based-convention', 'stripes-event'] : ['stripes-event'];
            handlerRoutes.push({
                routeId: '',
                method: 'ANY',
                path,
                rawPath: path,
                kind: 'form',
                framework: 'stripes',
                filePath,
                line: startLine(method),
                handler: `${clsName}#${mName}`,
                notes,
            });
        }
        out.push(...handlerRoutes);
    }
    return out;
}
//# sourceMappingURL=stripes.js.map