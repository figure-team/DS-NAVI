/**
 * Next.js 파일 라우팅 추출 — census 파일 목록 기반(파일시스템 라우팅).
 *
 * App Router(app/**): page.* -> page(GET), route.ts -> api(메서드 export별).
 * Pages Router(pages/**): *.tsx -> page(GET), api/** -> api. _app/_document 제외.
 * 경로 변환: 라우트그룹 (group)/병렬 @slot 제거, [id]->{id}, [...slug]->{slug}, index->부모.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource } from '../tree-sitter.js';
import { normalizePath } from '../route-key.js';
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const PAGE_EXTS = ['.tsx', '.ts', '.jsx', '.js'];
/** 세그먼트 변환: (group)/@slot 제거(빈 세그먼트로), [..]->{..}. */
function transformSegment(seg) {
    if (seg.length === 0)
        return null;
    // 라우트 그룹 (marketing) / 병렬 라우트 슬롯 @modal -> 경로에서 제거.
    if (seg.startsWith('(') && seg.endsWith(')'))
        return null;
    if (seg.startsWith('@'))
        return null;
    // [...slug] / [[...slug]] -> {slug}
    let m = seg.match(/^\[\[?\.\.\.([^\]]+)\]\]?$/);
    if (m)
        return `{${m[1]}}`;
    // [id] -> {id}
    m = seg.match(/^\[([^\]]+)\]$/);
    if (m)
        return `{${m[1]}}`;
    return seg;
}
/** 디렉터리 세그먼트 배열을 라우트 경로로 변환. */
function segmentsToPath(segments) {
    const parts = [];
    for (const seg of segments) {
        const t = transformSegment(seg);
        if (t !== null && t.length > 0)
            parts.push(t);
    }
    return parts.length === 0 ? '/' : normalizePath('/' + parts.join('/'));
}
/** 확장자를 떼어낸 파일 베이스. */
function stripExt(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
}
/** route.ts 에서 export 된 HTTP 메서드 const/function 들을 추출. */
async function extractRouteMethods(absPath) {
    let src;
    try {
        src = readFileSync(absPath, 'utf8');
    }
    catch {
        return [];
    }
    let root;
    try {
        root = await parseSource(absPath.endsWith('.tsx') ? 'tsx' : 'typescript', src);
    }
    catch {
        return [];
    }
    const found = new Set();
    collectExportedNames(root, found);
    return HTTP_METHODS.filter((m) => found.has(m));
}
/** export 선언에서 식별자 이름을 수집(function/const 형태 모두). */
function collectExportedNames(root, into) {
    for (const child of root.namedChildren) {
        if (!child)
            continue;
        if (child.type !== 'export_statement')
            continue;
        const decl = child.namedChildren.filter((c) => c !== null);
        for (const d of decl) {
            if (d.type === 'function_declaration') {
                const id = d.childForFieldName('name');
                if (id)
                    into.add(id.text);
            }
            else if (d.type === 'lexical_declaration' || d.type === 'variable_declaration') {
                for (const sub of d.namedChildren) {
                    if (sub && sub.type === 'variable_declarator') {
                        const id = sub.childForFieldName('name');
                        if (id)
                            into.add(id.text);
                    }
                }
            }
        }
    }
}
/** 단일 라우트 엔트리 생성 헬퍼(nextjs 공통값). */
function makeRoute(method, path, kind, filePath) {
    return {
        routeId: '',
        method,
        path,
        rawPath: path,
        kind,
        framework: 'nextjs',
        filePath,
        line: 1,
        handler: null,
        notes: [],
    };
}
/**
 * census 파일 목록에서 Next.js 라우트를 추출한다.
 * @param projectRoot 절대 루트(route.ts 파싱용)
 * @param census buildCensus 결과
 */
export async function extractNextjsRoutes(projectRoot, census) {
    const out = [];
    for (const file of census.files) {
        const rel = file.relPath;
        const parts = rel.split('/');
        // App Router: 루트 app/ 또는 src/app/ 접두만 인정(중첩 app 오인 방지).
        const appIdx = parts[0] === 'app' ? 0 : parts[0] === 'src' && parts[1] === 'app' ? 1 : -1;
        if (appIdx !== -1 && isAppRouterFile(parts, appIdx)) {
            const fileName = parts[parts.length - 1];
            const dirSegs = parts.slice(appIdx + 1, parts.length - 1);
            const base = stripExt(fileName);
            if (base === 'page') {
                out.push(makeRoute('GET', segmentsToPath(dirSegs), 'page', rel));
                continue;
            }
            if (base === 'route') {
                const methods = await extractRouteMethods(join(projectRoot, rel));
                const apiPath = segmentsToPath(dirSegs);
                if (methods.length === 0) {
                    out.push(makeRoute('ANY', apiPath, 'api', rel));
                }
                else {
                    for (const m of methods)
                        out.push(makeRoute(m, apiPath, 'api', rel));
                }
                continue;
            }
            continue;
        }
        // Pages Router: pages/ 접두.
        if (parts[0] === 'pages') {
            const fileName = parts[parts.length - 1];
            const base = stripExt(fileName);
            const ext = fileName.slice(fileName.lastIndexOf('.'));
            if (!PAGE_EXTS.includes(ext))
                continue;
            if (base === '_app' || base === '_document')
                continue;
            const isApi = parts[1] === 'api';
            // pages 세그먼트(접두 'pages' 제거), 파일베이스 포함.
            const dirSegs = parts.slice(1, parts.length - 1);
            const segs = base === 'index' ? dirSegs : [...dirSegs, base];
            const path = segmentsToPath(segs);
            if (isApi) {
                // Pages api: 단일 default handler -> 메서드 미특정(ANY).
                out.push(makeRoute('ANY', path, 'api', rel));
            }
            else {
                out.push(makeRoute('GET', path, 'page', rel));
            }
        }
    }
    return out;
}
/**
 * parts 의 app 세그먼트가 App Router 루트인지 판별한다.
 * page 또는 route 파일이며 app 디렉터리 하위여야 한다.
 */
function isAppRouterFile(parts, appIdx) {
    const fileName = parts[parts.length - 1];
    const base = stripExt(fileName);
    const ext = fileName.slice(fileName.lastIndexOf('.'));
    if (!PAGE_EXTS.includes(ext))
        return false;
    if (base !== 'page' && base !== 'route')
        return false;
    // app 이 파일 디렉터리 경로상에 있어야(파일명 자리가 아니라).
    return appIdx < parts.length - 1;
}
//# sourceMappingURL=nextjs.js.map