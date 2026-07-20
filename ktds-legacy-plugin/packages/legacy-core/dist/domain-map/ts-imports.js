/**
 * TS/TSX/JS import 엣지 추출 — census 파일 목록 기반, 상대경로만 결정론 해소(P5).
 *
 * `import ... from '...'` / `export { x } from '...'` / `export * from '...'` /
 * 동적 `import('...')` 의 경로 리터럴(문자열·보간없는 템플릿)을 모아, 상대경로
 * (`./`·`../`)만 census 파일 집합에 대해 고정 우선순위로 해소한다.
 * 비상대(패키지) 임포트, 보간 포함 템플릿, 미해소 참조는 조용히 건너뛴다(엣지 미생산 —
 * edges.ts 의 java 경로와 달리 unresolved 보고는 본 모듈 책무 밖, 통합 시 필요하면 호출자가 추가).
 * 산출은 edges.ts 의 EdgeRecord 형태(kind='import')로 맞춰 그대로 병합 가능하게 한다.
 */
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { childrenOfType, parseSource, startLine } from './tree-sitter.js';
/** 대상 census lang 값 — typescript(.ts) / tsx(.tsx) / javascript(.js·.jsx). */
const TS_LANGS = new Set(['typescript', 'tsx', 'javascript']);
/**
 * 확장자 없는 상대 스펙 해소 시 시도할 접미사 우선순위(고정 — 팀 규약).
 * `./x` -> x.ts > x.tsx > x.js > x.jsx > x/index.ts > x/index.tsx > x/index.js > x/index.jsx.
 */
const RESOLVE_SUFFIXES = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '/index.ts',
    '/index.tsx',
    '/index.js',
    '/index.jsx',
];
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** relPath 로 파싱 그래머 선택 — nextjs.ts 와 동일 관례(.tsx/.jsx = tsx, 그외 = typescript). */
function grammarFor(relPath) {
    return relPath.endsWith('.tsx') || relPath.endsWith('.jsx') ? 'tsx' : 'typescript';
}
/** string/template_string(보간 없음) 리터럴에서 경로 문자열을 읽는다. 해당 없으면 null. */
function literalPathValue(node) {
    if (node.type === 'string') {
        const frag = childrenOfType(node, 'string_fragment')[0];
        return frag ? frag.text : '';
    }
    if (node.type === 'template_string') {
        if (childrenOfType(node, 'template_substitution').length > 0)
            return null; // 보간 포함 — 정적 해소 불가.
        const frag = childrenOfType(node, 'string_fragment')[0];
        return frag ? frag.text : '';
    }
    return null;
}
/**
 * 파싱된 루트에서 상대경로 import/export-from/동적 import() 스펙을 모은다.
 * 비상대(패키지) 임포트, 보간 포함 템플릿은 조용히 제외한다. 정렬: (line, spec).
 */
export function collectRelativeImportSpecs(root) {
    const out = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node.type === 'import_statement' || node.type === 'export_statement') {
            const src = node.childForFieldName('source');
            if (src) {
                const value = literalPathValue(src);
                if (value !== null && (value.startsWith('./') || value.startsWith('../'))) {
                    out.push({ spec: value, line: startLine(node) });
                }
            }
            // import/export 문 내부에는 추가로 뒤질 대상이 없다(named binding 뿐).
            continue;
        }
        if (node.type === 'call_expression') {
            const fn = node.childForFieldName('function');
            if (fn?.type === 'import') {
                const args = node.childForFieldName('arguments');
                const first = args?.namedChildren.filter((x) => x !== null)[0];
                if (first) {
                    const value = literalPathValue(first);
                    if (value !== null && (value.startsWith('./') || value.startsWith('../'))) {
                        out.push({ spec: value, line: startLine(node) });
                    }
                }
            }
        }
        for (const c of node.namedChildren)
            if (c)
                stack.push(c);
    }
    return out.sort((a, b) => cmp(a.line, b.line) || cmp(a.spec, b.spec));
}
/**
 * 상대경로 스펙을 census 파일 집합에 대해 고정 우선순위로 해소한다.
 * 스펙에 이미 확장자가 있으면(예: `./data.json`) 그 경로만 그대로 확인한다.
 * 해소 실패(후보 없음) -> null(누락 없이 조용히 제외 — 호출자가 필요시 unresolved 로 승격).
 */
export function resolveRelativeSpec(fromRelPath, spec, fileSet) {
    const dir = posix.dirname(fromRelPath);
    const base = posix.normalize(posix.join(dir, spec));
    const lastSeg = base.slice(base.lastIndexOf('/') + 1);
    if (lastSeg.includes('.')) {
        return fileSet.has(base) ? base : null;
    }
    for (const suf of RESOLVE_SUFFIXES) {
        const candidate = base + suf;
        if (fileSet.has(candidate))
            return candidate;
    }
    return null;
}
/** 엣지 중복제거 + (source,target,kind,line) 정렬 — edges.ts 와 동일 관례. */
function dedupSortEdges(edges) {
    const seen = new Set();
    const out = [];
    for (const e of edges) {
        const key = `${e.source} ${e.target} ${e.kind} ${e.line ?? ''}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(e);
    }
    return out.sort((a, b) => cmp(a.source, b.source) ||
        cmp(a.target, b.target) ||
        cmp(a.kind, b.kind) ||
        cmp(a.line ?? -1, b.line ?? -1));
}
/**
 * census 의 ts/tsx/javascript 파일 전체에서 import 엣지를 추출한다(파일 기록 없음).
 * 파일별 읽기/파싱 실패는 그 파일만 조용히 제외한다(다른 스캐너와 동일 격리 관례).
 */
export async function extractTsImportEdges(projectRoot, census) {
    const files = census.files.filter((f) => TS_LANGS.has(f.lang));
    const fileSet = new Set(census.files.map((f) => f.relPath));
    const edges = [];
    const sorted = [...files].sort((a, b) => cmp(a.relPath, b.relPath));
    for (const f of sorted) {
        let src;
        try {
            src = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            continue;
        }
        let root;
        try {
            root = await parseSource(grammarFor(f.relPath), src);
        }
        catch {
            continue;
        }
        for (const ref of collectRelativeImportSpecs(root)) {
            const target = resolveRelativeSpec(f.relPath, ref.spec, fileSet);
            if (!target || target === f.relPath)
                continue; // 자기참조 제외(edges.ts 와 동일 규약).
            edges.push({ source: f.relPath, target, kind: 'import', line: ref.line });
        }
    }
    return dedupSortEdges(edges);
}
//# sourceMappingURL=ts-imports.js.map