/**
 * EDGES 단계 — 파일↔파일 의존 엣지를 결정론적으로 생산한다.
 *
 * 모든 Java 파일을 1회 파싱해 팩트를 모으고, 전체 ClassIndex(단순명/FQN)를 만든 뒤
 * import/injection/field-type/ctor-param/extends/implements/impl 엣지를 낸다.
 * MyBatis: *Mapper.xml 의 namespace 와 SqlSession 문자열 호출을 매퍼 인터페이스/XML 로 잇는다.
 * 미해소 참조는 절대 누락하지 않고 unresolved(ambiguous/not-found)로 보고한다.
 * 엣지는 (source,target,kind,line), unresolved 는 (source,ref,reason)로 정렬·중복제거.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractJavaFacts } from './java-facts.js';
import { extractKotlinFacts } from './kotlin-facts.js';
import { extractTsImportEdges } from './ts-imports.js';
import { parseSource } from './tree-sitter.js';
/**
 * W8 캐시 섹션 salt — JavaFileFacts 형태(java-facts.ts)나 mybatis namespace 수집 의미가
 * 바뀌면 bump. `java-facts` 섹션은 method-calls.ts 와 공유(동일 extractJavaFacts 출력).
 * `kotlin-facts` 섹션은 kotlin-facts.ts 출력 전용 — Java 와 독립적으로 salt 를 올린다.
 */
export const JAVA_FACTS_SALT = 'v1';
export const KOTLIN_FACTS_SALT = 'v1';
const MYBATIS_NS_SALT = 'v1';
/** 주입 어노테이션(필드/생성자). */
const INJECT_ANNOTATIONS = new Set(['Autowired', 'Resource', 'Inject']);
/** MyBatis SqlSession 호출 메서드 이름. */
const MYBATIS_METHODS = new Set([
    'selectOne',
    'selectList',
    'selectMap',
    'selectCursor',
    'insert',
    'update',
    'delete',
]);
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** 전체 Java 팩트로 ClassIndex 를 만든다. */
function buildClassIndex(allFacts) {
    const simple = new Map();
    const byFqn = new Map();
    for (const facts of allFacts) {
        for (const cls of facts.classes) {
            let set = simple.get(cls.name);
            if (!set) {
                set = new Set();
                simple.set(cls.name, set);
            }
            set.add(facts.relPath);
            const existing = byFqn.get(cls.fqn);
            if (existing === undefined || facts.relPath < existing) {
                byFqn.set(cls.fqn, facts.relPath);
            }
        }
    }
    const bySimpleName = new Map();
    for (const [name, set] of simple) {
        bySimpleName.set(name, [...set].sort(cmp));
    }
    return { bySimpleName, byFqn };
}
/** import FQN 에서 마지막 식별자(단순명). 와일드카드/static 도 처리. */
function importSimpleName(fqn) {
    const clean = fqn.replace(/\.\*$/, '');
    const dot = clean.lastIndexOf('.');
    return dot >= 0 ? clean.slice(dot + 1) : clean;
}
function resolveSimpleName(simpleName, facts, index) {
    // import 로 FQN 이 명시된 경우 우선.
    for (const imp of facts.imports) {
        if (imp.endsWith('.*'))
            continue;
        if (importSimpleName(imp) === simpleName) {
            const byFqn = index.byFqn.get(imp);
            if (byFqn)
                return { target: byFqn };
        }
    }
    // 같은 패키지 FQN 시도.
    if (facts.packageName) {
        const samePkg = index.byFqn.get(`${facts.packageName}.${simpleName}`);
        if (samePkg)
            return { target: samePkg };
    }
    // 단순명 후보.
    const candidates = index.bySimpleName.get(simpleName);
    if (!candidates || candidates.length === 0)
        return { target: null, reason: 'not-found' };
    if (candidates.length === 1)
        return { target: candidates[0] };
    return { target: null, reason: 'ambiguous' };
}
/** *Impl 규칙으로 인터페이스 구현 후보를 찾는다(단순명 기준). */
function resolveImplName(interfaceName, index) {
    const impl = index.bySimpleName.get(`${interfaceName}Impl`);
    return impl ? impl : [];
}
/** mapper-xml: *Mapper.xml 의 namespace 추출. */
function readXmlNamespace(text) {
    const m = text.match(/<mapper\b[^>]*\bnamespace\s*=\s*"([^"]+)"/);
    return m ? m[1].trim() : null;
}
/** MyBatis 문자열 호출(selectOne("ns.id"))의 namespace 들을 모은다(파일당). */
function collectMyBatisNamespaces(root) {
    const out = new Set();
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        for (const c of node.namedChildren) {
            if (!c)
                continue;
            stack.push(c);
        }
        if (node.type !== 'method_invocation')
            continue;
        const name = node.childForFieldName('name')?.text;
        if (!name || !MYBATIS_METHODS.has(name))
            continue;
        const args = node.childForFieldName('arguments');
        if (!args)
            continue;
        const first = args.namedChildren.filter((x) => x !== null)[0];
        if (!first || first.type !== 'string_literal')
            continue;
        const frag = first.namedChildren.filter((x) => x !== null)[0];
        const value = frag && frag.type === 'string_fragment' ? frag.text : '';
        const dot = value.lastIndexOf('.');
        if (dot <= 0)
            continue;
        out.add(value.slice(0, dot));
    }
    return out;
}
/** edges 산출 — census 기반, 파일 기록 없음. */
export async function extractEdges(projectRoot, census, cache) {
    const javaFiles = census.files.filter((f) => f.lang === 'java');
    const kotlinFiles = census.files.filter((f) => f.lang === 'kotlin');
    const xmlFiles = census.files.filter((f) => f.lang === 'xml' && f.relPath.endsWith('Mapper.xml'));
    // W8: 파일단위 팩트 캐시 — null 값 = 판독 실패 파일(기존 동작대로 제외).
    // mybatis ns 는 소비부가 정렬 순회라 배열(집합 원소)로 저장해도 동일 결과.
    const factsSec = cache?.section('java-facts', JAVA_FACTS_SALT);
    const factsKtSec = cache?.section('kotlin-facts', KOTLIN_FACTS_SALT);
    const nsSec = cache?.section('mybatis-ns', MYBATIS_NS_SALT);
    // 1) Java 팩트 + (mybatis 탐지용) 파싱 루트를 relPath 정렬 순으로 수집.
    const factsByPath = new Map();
    const mybatisNs = new Map();
    const sortedJava = [...javaFiles].sort((a, b) => cmp(a.relPath, b.relPath));
    for (const f of sortedJava) {
        const factsHit = factsSec?.get(f.relPath);
        const nsHit = nsSec?.get(f.relPath);
        if (factsHit !== undefined && nsHit !== undefined) {
            if (factsHit !== null && nsHit !== null) {
                factsByPath.set(f.relPath, factsHit);
                mybatisNs.set(f.relPath, new Set(nsHit));
            }
            continue;
        }
        let src;
        try {
            src = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            // null 캐시는 fingerprint 도 'absent' 일 때만(일시 오류 박제 방지, 리뷰 R2).
            if (cache?.isAbsent(f.relPath)) {
                factsSec?.put(f.relPath, null);
                nsSec?.put(f.relPath, null);
            }
            continue;
        }
        // 파일별 오류 격리(다른 스캐너와 동일 규약, 비평 C7) — 추출 실패는 캐시하지 않고
        // 그 파일만 제외한다(다음 실행에 재시도).
        try {
            const facts = await extractJavaFacts(f.relPath, src);
            const ns = collectMyBatisNamespaces(await parseSource('java', src));
            factsByPath.set(f.relPath, facts);
            mybatisNs.set(f.relPath, ns);
            factsSec?.put(f.relPath, facts);
            nsSec?.put(f.relPath, [...ns]);
        }
        catch {
            // 증거 없는 엣지 금지 — facts 없이 둔다.
        }
    }
    // 1b) Kotlin 팩트 — JavaFileFacts 동형(kotlin-facts.ts). MyBatis ns 스캔은 Java 전용이라 없음.
    const sortedKotlin = [...kotlinFiles].sort((a, b) => cmp(a.relPath, b.relPath));
    for (const f of sortedKotlin) {
        const hit = factsKtSec?.get(f.relPath);
        if (hit !== undefined) {
            if (hit !== null)
                factsByPath.set(f.relPath, hit);
            continue;
        }
        let src;
        try {
            src = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            if (cache?.isAbsent(f.relPath))
                factsKtSec?.put(f.relPath, null);
            continue;
        }
        try {
            const facts = await extractKotlinFacts(f.relPath, src);
            factsByPath.set(f.relPath, facts);
            factsKtSec?.put(f.relPath, facts);
        }
        catch {
            // 증거 없는 엣지 금지 — Java 루프와 동일 규약(그 파일만 제외, 추출 실패는 미캐시).
        }
    }
    const allFacts = [...factsByPath.values()];
    const index = buildClassIndex(allFacts);
    // FQN(namespace) -> relPath: 매퍼 인터페이스/클래스 해소용(byFqn 재사용).
    const edges = [];
    const unresolved = [];
    const addEdge = (source, target, kind, line) => {
        if (source === target)
            return; // 자기참조 제외.
        edges.push({ source, target, kind, line });
    };
    const addUnresolved = (source, ref, reason) => {
        unresolved.push({ source, ref, reason });
    };
    /** 단순명 -> 엣지 또는 unresolved. */
    const linkType = (facts, simpleName, kind, line) => {
        const res = resolveSimpleName(simpleName, facts, index);
        if (res.target) {
            addEdge(facts.relPath, res.target, kind, line);
        }
        else if (res.reason) {
            addUnresolved(facts.relPath, simpleName, res.reason);
        }
    };
    for (const facts of allFacts) {
        // import 엣지: import 의 FQN -> 파일.
        for (const imp of facts.imports) {
            if (imp.endsWith('.*'))
                continue; // 와일드카드는 단일 파일로 해소 불가 — 조용히 누락하지 않되 엣지도 없음(별도 not-found 보고도 의미 약함이라 생략하지 않기 위해 simpleName 해소 시도).
            const byFqn = index.byFqn.get(imp);
            if (byFqn) {
                addEdge(facts.relPath, byFqn, 'import', null);
            }
            else {
                // FQN 직접 매칭 실패 -> 단순명으로 보고.
                const simple = importSimpleName(imp);
                const candidates = index.bySimpleName.get(simple);
                if (!candidates || candidates.length === 0) {
                    addUnresolved(facts.relPath, imp, 'not-found');
                }
                else if (candidates.length === 1) {
                    addEdge(facts.relPath, candidates[0], 'import', null);
                }
                else {
                    addUnresolved(facts.relPath, imp, 'ambiguous');
                }
            }
        }
        for (const cls of facts.classes) {
            // extends / implements.
            for (const ext of cls.extends) {
                linkType(facts, ext, 'extends', cls.line);
            }
            for (const impl of cls.implements) {
                linkType(facts, impl, 'implements', cls.line);
            }
            // impl: 인터페이스 -> *Impl(또는 선언된 구현체).
            if (cls.kind === 'interface') {
                const implPaths = resolveImplName(cls.name, index);
                for (const p of implPaths) {
                    addEdge(facts.relPath, p, 'impl', cls.line);
                }
            }
            // 필드: injection vs field-type.
            for (const field of cls.fields) {
                const injected = field.annotations.some((a) => INJECT_ANNOTATIONS.has(a));
                linkType(facts, field.type, injected ? 'injection' : 'field-type', field.line);
            }
            // 생성자 파라미터.
            for (const t of cls.ctorParamTypes) {
                linkType(facts, t, 'ctor-param', cls.line);
            }
        }
    }
    // MyBatis mapper-xml: 인터페이스(FQN==namespace) -> XML 파일.
    for (const xf of xmlFiles) {
        let text;
        try {
            text = readFileSync(join(projectRoot, xf.relPath), 'utf8');
        }
        catch {
            continue;
        }
        const ns = readXmlNamespace(text);
        if (!ns)
            continue;
        const ifacePath = index.byFqn.get(ns);
        if (ifacePath) {
            addEdge(ifacePath, xf.relPath, 'mapper-xml', null);
        }
        else {
            // namespace 에 대응하는 매퍼 인터페이스를 못 찾음 — XML 자체를 source 로 보고.
            addUnresolved(xf.relPath, ns, 'not-found');
        }
    }
    // MyBatis 문자열 호출 -> 해당 namespace 의 매퍼 파일.
    for (const facts of allFacts) {
        const namespaces = mybatisNs.get(facts.relPath);
        if (!namespaces)
            continue;
        for (const ns of [...namespaces].sort(cmp)) {
            const target = index.byFqn.get(ns);
            if (target) {
                addEdge(facts.relPath, target, 'mybatis', null);
            }
            else {
                addUnresolved(facts.relPath, ns, 'not-found');
            }
        }
    }
    // TS/TSX/JS import 그래프 — 상대 임포트를 census 파일로 결정론 해소(kind='import').
    edges.push(...(await extractTsImportEdges(projectRoot, census)));
    return {
        schemaVersion: 1,
        gitCommit: census.gitCommit,
        edges: dedupSortEdges(edges),
        unresolved: dedupSortUnresolved(unresolved),
    };
}
/** 엣지 중복제거 + (source,target,kind,line) 정렬 — api-call 후병합(extract.ts)도 재사용. */
export function dedupSortEdges(edges) {
    const seen = new Set();
    const out = [];
    for (const e of edges) {
        const key = `${e.source} ${e.target} ${e.kind} ${e.line ?? ''}`;
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
/** unresolved 중복제거 + (source,ref,reason) 정렬. */
function dedupSortUnresolved(items) {
    const seen = new Set();
    const out = [];
    for (const u of items) {
        const key = `${u.source} ${u.ref} ${u.reason}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(u);
    }
    return out.sort((a, b) => cmp(a.source, b.source) || cmp(a.ref, b.ref) || cmp(a.reason, b.reason));
}
//# sourceMappingURL=edges.js.map