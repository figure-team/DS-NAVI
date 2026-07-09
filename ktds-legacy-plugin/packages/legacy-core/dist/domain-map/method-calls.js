/**
 * METHOD-CALL GRAPH(P3.1) — 메서드 단위 호출 그래프(8-receiver 해소).
 *
 * 파일 단위 엣지(edges.ts)는 구조적 인접(import/injection/field-type/...)만 담을 뿐
 * "어느 메서드가 어느 메서드를 호출하는가"를 모른다. 이 모듈은 그 누락 계층을
 * 복원한다: 모든 메서드 본문의 각 호출(invocation)을 수신자(receiver) 종류로 해소해
 * 대상 메서드 선언(프로젝트 내 해소 가능 시)으로 잇는다.
 *
 * 수신자→타입 해소는 edges.ts 의 javac-식 우선순위를 그대로 따른다(독립 구현, 추가만):
 *   명시 import > 같은 패키지 > 단일 프로젝트 후보. java.*(및 JDK 단순명)는 external.
 *
 * 8 receiver kinds:
 *   field/param/local/self/super/static/return-type/external  (+ unresolved).
 *
 * 결정론: calls 는 (callerFile, callLine, calleeMethod) 자연키 정렬, 타임스탬프/서수/난수 없음.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractJavaFacts, } from './java-facts.js';
import { gitCommitHash } from './persist.js';
import { JAVA_FACTS_SALT } from './edges.js';
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** 슈퍼타입 해소 재귀 상한(순환/깊은 계층 방어). */
const MAX_SUPER_DEPTH = 16;
/** 흔한 JDK 최상위 패키지 — import FQN 이 이걸로 시작하면 external. */
const JDK_PACKAGE_PREFIXES = ['java.', 'javax.', 'jakarta.', 'sun.', 'com.sun.'];
/**
 * 별도 import 없이도 external 로 간주하는 java.lang 단순명(묵시적 import).
 * 프로젝트에 동명 선언이 있으면 그쪽이 우선이므로 여기 등재돼도 안전.
 */
const JAVA_LANG_TYPES = new Set([
    'String',
    'Object',
    'Integer',
    'Long',
    'Double',
    'Float',
    'Boolean',
    'Byte',
    'Short',
    'Character',
    'Number',
    'Math',
    'System',
    'Thread',
    'Runnable',
    'Exception',
    'RuntimeException',
    'Throwable',
    'Error',
    'Class',
    'StringBuilder',
    'StringBuffer',
    'Iterable',
    'Comparable',
]);
/** 전체 Java 팩트로 ClassIndex 를 만든다(edges.ts 와 동일 규칙: FQN 중복은 최소 relPath). */
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
/**
 * 단순 타입명을 프로젝트 파일로 해소한다(javac-식 우선순위).
 *   1) 동일 파일 import 의 FQN -> byFqn 매칭(resolved).
 *   2) import FQN 이 JDK 패키지면 external.
 *   3) 같은 패키지 FQN -> byFqn(resolved).
 *   4) 단순명 후보 1건 -> resolved.
 *   5) java.lang 단순명(묵시적) -> external.
 *   6) 그 외(후보 0/모호) -> unresolved.
 */
function resolveTypeRef(typeName, facts, index) {
    // 1)+2) 명시 import.
    for (const imp of facts.imports) {
        if (imp.endsWith('.*'))
            continue;
        if (importSimpleName(imp) === typeName) {
            const byFqn = index.byFqn.get(imp);
            if (byFqn)
                return { kind: 'resolved', relPath: byFqn };
            if (JDK_PACKAGE_PREFIXES.some((p) => imp.startsWith(p))) {
                return { kind: 'external', relPath: null };
            }
        }
    }
    // 3) 같은 패키지.
    if (facts.packageName) {
        const samePkg = index.byFqn.get(`${facts.packageName}.${typeName}`);
        if (samePkg)
            return { kind: 'resolved', relPath: samePkg };
    }
    // 4) 단순명 후보.
    const candidates = index.bySimpleName.get(typeName);
    if (candidates && candidates.length === 1) {
        return { kind: 'resolved', relPath: candidates[0] };
    }
    if (candidates && candidates.length > 1) {
        // 와일드카드 import 가 있고 후보 다수 -> 모호(unresolved).
        return { kind: 'unresolved', relPath: null };
    }
    // 5) java.lang 묵시적.
    if (JAVA_LANG_TYPES.has(typeName))
        return { kind: 'external', relPath: null };
    // 와일드카드 JDK import(java.util.* 등) 하에서의 미지 단순명 -> external 추정.
    for (const imp of facts.imports) {
        if (!imp.endsWith('.*'))
            continue;
        if (JDK_PACKAGE_PREFIXES.some((p) => imp.startsWith(p))) {
            return { kind: 'external', relPath: null };
        }
    }
    return { kind: 'unresolved', relPath: null };
}
/** relPath -> 그 파일의 주(첫 최상위) 클래스 단순명. */
function buildPrimaryClassNames(javaFacts) {
    const out = new Map();
    for (const [relPath, facts] of javaFacts) {
        const top = facts.classes.find((c) => c.fqn === c.name) ?? facts.classes[0];
        if (top)
            out.set(relPath, top.name);
    }
    return out;
}
/** 파라미터 텍스트("(Account a, final String n)")를 name->type 으로 파싱(외곽 식별자). */
function parseParams(paramsText) {
    const out = new Map();
    const inner = paramsText.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
    if (!inner)
        return out;
    for (const raw of splitTopLevel(inner)) {
        const seg = raw
            .replace(/@\w+(\([^)]*\))?/g, '')
            .replace(/\bfinal\b/g, '')
            .trim();
        const tokens = seg.split(/\s+/).filter(Boolean);
        if (tokens.length < 2)
            continue;
        const name = tokens[tokens.length - 1].replace(/\[\]/g, '');
        const type = stripGenerics(tokens[tokens.length - 2]);
        if (/^[A-Za-z_$][\w$]*$/.test(name) && type)
            out.set(name, type);
    }
    return out;
}
/** 제네릭/배열/varargs 표식을 제거한 외곽 타입명. */
function stripGenerics(typeText) {
    const open = typeText.indexOf('<');
    const base = open === -1 ? typeText : typeText.slice(0, open);
    const dot = base.lastIndexOf('.');
    const outer = dot >= 0 ? base.slice(dot + 1) : base;
    return outer.replace(/\[\]/g, '').replace(/\.\.\.$/, '').trim();
}
/** 최상위 콤마(꺾쇠/괄호 밖)로 파라미터 목록을 분리. */
function splitTopLevel(inner) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '<' || ch === '(')
            depth++;
        else if (ch === '>' || ch === ')')
            depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(inner.slice(start, i));
            start = i + 1;
        }
    }
    if (start < inner.length)
        parts.push(inner.slice(start));
    return parts;
}
/**
 * 사용 지점(before) 직전의 가장 가까운 동명 지역변수 선언(없으면 null).
 * 위치 매칭으로 렉시컬 스코프를 근사(재선언/루프 섀도잉 처리).
 */
function nearestLocal(locals, name, before) {
    let best = null;
    for (const d of locals) {
        if (d.name !== name || d.startIndex >= before)
            continue;
        if (best === null || d.startIndex > best.startIndex)
            best = d;
    }
    return best;
}
/** buildMethodCallGraph 의 내부 해소기 — javaFacts/classIndex 클로저. */
function makeResolver(javaFacts, classIndex) {
    const primaryClassOf = (relPath) => {
        const fs = javaFacts.get(relPath);
        if (!fs)
            return null;
        return fs.classes.find((c) => c.fqn === c.name) ?? fs.classes[0] ?? null;
    };
    /** relPath 타입의 methodName 반환 타입(슈퍼타입 walk). */
    const returnTypeOf = (relPath, methodName, depth = 0) => {
        if (depth > MAX_SUPER_DEPTH)
            return null;
        const fs = javaFacts.get(relPath);
        if (!fs)
            return null;
        for (const cls of fs.classes) {
            const m = cls.methods.find((mm) => mm.name === methodName && mm.returnType);
            if (m?.returnType)
                return { type: m.returnType, ownerRelPath: relPath };
        }
        const primary = primaryClassOf(relPath);
        for (const sup of supertypeNames(primary)) {
            const t = resolveTypeRef(sup, fs, classIndex);
            if (t.relPath) {
                const r = returnTypeOf(t.relPath, methodName, depth + 1);
                if (r)
                    return r;
            }
        }
        return null;
    };
    /** relPath 타입의 fieldName 선언 타입(슈퍼타입 walk). */
    const fieldTypeOf = (relPath, fieldName, depth = 0) => {
        if (depth > MAX_SUPER_DEPTH)
            return null;
        const fs = javaFacts.get(relPath);
        if (!fs)
            return null;
        for (const cls of fs.classes) {
            const f = cls.fields.find((ff) => ff.name === fieldName);
            if (f)
                return { type: f.type, ownerRelPath: relPath };
        }
        const primary = primaryClassOf(relPath);
        for (const sup of supertypeNames(primary)) {
            const t = resolveTypeRef(sup, fs, classIndex);
            if (t.relPath) {
                const r = fieldTypeOf(t.relPath, fieldName, depth + 1);
                if (r)
                    return r;
            }
        }
        return null;
    };
    const unresolvedType = (external = false) => ({
        relPath: null,
        external,
        kind: 'unresolved',
    });
    /** TypeRef + 판정된 receiverKind -> ReceiverType. external/unresolved 규칙 공유. */
    const typeRefToReceiver = (t, kind) => {
        if (t.kind === 'external')
            return { relPath: null, external: true, kind };
        if (t.kind === 'unresolved')
            return unresolvedType();
        return { relPath: t.relPath, external: false, kind };
    };
    /** 멤버 타입을 그 멤버 선언 파일의 import 로 해소. */
    const memberToType = (m, kind) => {
        const ownerFacts = javaFacts.get(m.ownerRelPath);
        if (!ownerFacts)
            return unresolvedType();
        return typeRefToReceiver(resolveTypeRef(m.type, ownerFacts, classIndex), kind);
    };
    /**
     * 수신자 표현식의 런타임 타입을 추론한다(재귀). null/this -> self,
     * super -> 슈퍼클래스, name -> local>param>field>static, call -> 반환 타입(return-type),
     * field -> 필드 타입. 따라갈 수 없는 형태는 unresolved(추측 금지).
     */
    const typeOfReceiver = (desc, ctx) => {
        if (desc === null || desc.kind === 'this') {
            return { relPath: ctx.relPath, external: false, kind: 'self' };
        }
        if (desc.kind === 'unknown') {
            // 명시 수신자가 있으나 형태 미해소(캐스트/람다/배열접근/생성식/삼항) — self 로 오인 금지.
            return unresolvedType();
        }
        if (desc.kind === 'super') {
            const supers = supertypeNames(ctx.cls);
            if (supers.length === 0)
                return unresolvedType();
            return typeRefToReceiver(resolveTypeRef(supers[0], ctx.facts, classIndex), 'super');
        }
        if (desc.kind === 'name') {
            const name = desc.text;
            // local > param > field > static(타입명).
            const localDecl = nearestLocal(ctx.locals, name, ctx.callStartIndex);
            if (localDecl !== null) {
                if (localDecl.typeName === 'var')
                    return unresolvedType();
                return typeRefToReceiver(resolveTypeRef(localDecl.typeName, ctx.facts, classIndex), 'local');
            }
            const paramType = ctx.params.get(name);
            if (paramType !== undefined) {
                return typeRefToReceiver(resolveTypeRef(paramType, ctx.facts, classIndex), 'param');
            }
            const fieldMember = fieldTypeOf(ctx.relPath, name);
            if (fieldMember !== null) {
                return memberToType(fieldMember, 'field');
            }
            // 대문자 시작 + 타입으로 해소 -> static Type.m().
            if (/^[A-Z]/.test(name)) {
                const t = resolveTypeRef(name, ctx.facts, classIndex);
                if (t.kind === 'resolved')
                    return { relPath: t.relPath, external: false, kind: 'static' };
                if (t.kind === 'external')
                    return { relPath: null, external: true, kind: 'static' };
            }
            return unresolvedType();
        }
        if (desc.kind === 'call') {
            const owner = typeOfReceiver(desc.on, ctx);
            if (owner.external)
                return unresolvedType(true);
            if (owner.relPath === null)
                return unresolvedType();
            const rt = returnTypeOf(owner.relPath, desc.methodName);
            if (rt === null)
                return unresolvedType();
            return memberToType(rt, 'return-type');
        }
        if (desc.kind === 'field') {
            const owner = typeOfReceiver(desc.on, ctx);
            if (owner.external)
                return unresolvedType(true);
            if (owner.relPath === null)
                return unresolvedType();
            const ft = fieldTypeOf(owner.relPath, desc.field);
            if (ft === null)
                return unresolvedType();
            // this.field / 단순 field 는 'field'; 더 깊은 a.b.c 는 return-type 류(체인 hop).
            const kind = desc.on === null || desc.on.kind === 'this' ? 'field' : 'return-type';
            return memberToType(ft, kind);
        }
        return unresolvedType();
    };
    return { typeOfReceiver, primaryClassOf, returnTypeOf, fieldTypeOf };
}
/** 클래스의 슈퍼타입 단순명(클래스 extends + implements + 인터페이스 extends). */
function supertypeNames(cls) {
    if (!cls)
        return [];
    // extends(클래스 0~1 / 인터페이스 다수) + implements 를 모두 후보로(메서드 탐색용).
    return [...cls.extends, ...cls.implements];
}
/**
 * callee 타입에서 동명 메서드 중 argCount 일치 오버로드를 골라 overloadArity 를 정한다.
 *   - 동명 메서드가 없음              -> null(타입엔 있으나 인터페이스/상위 미파싱 등).
 *   - argCount 정확 일치 1건          -> 그 paramCount.
 *   - argCount 정확 일치 다수          -> 모호: null(정직성).
 *   - 정확 일치 0건 & 동명 1건        -> 그 1건의 paramCount(유일 후보).
 *   - 정확 일치 0건 & 동명 다수        -> null(모호).
 * 슈퍼타입까지 walk 해 메서드를 찾는다.
 */
function selectOverloadArity(javaFacts, classIndex, relPath, methodName, argCount) {
    const sameName = collectSameNameMethods(javaFacts, classIndex, relPath, methodName);
    if (sameName.length === 0)
        return null;
    const exact = sameName.filter((m) => m.paramCount === argCount);
    if (exact.length === 1)
        return exact[0].paramCount;
    if (exact.length > 1)
        return null;
    if (sameName.length === 1)
        return sameName[0].paramCount;
    return null;
}
/** relPath 타입(+슈퍼타입)에서 methodName 과 동명인 모든 메서드(중복 paramCount 허용). */
function collectSameNameMethods(javaFacts, classIndex, relPath, methodName, depth = 0, seen = new Set()) {
    if (depth > MAX_SUPER_DEPTH || seen.has(relPath))
        return [];
    seen.add(relPath);
    const fs = javaFacts.get(relPath);
    if (!fs)
        return [];
    const out = [];
    for (const cls of fs.classes) {
        for (const m of cls.methods) {
            if (m.name === methodName)
                out.push(m);
        }
    }
    const primary = fs.classes.find((c) => c.fqn === c.name) ?? fs.classes[0] ?? null;
    for (const sup of supertypeNames(primary)) {
        const t = resolveTypeRef(sup, fs, classIndex);
        if (t.relPath) {
            out.push(...collectSameNameMethods(javaFacts, classIndex, t.relPath, methodName, depth + 1, seen));
        }
    }
    return out;
}
/**
 * javaFacts(단일 파싱 결과) + ClassIndex 로 프로젝트 전역 메서드 호출 그래프를 만든다.
 * 순수 함수(I/O 없음). calls 는 (callerFile, callLine, calleeMethod) 정렬.
 */
export function buildGraphFromFacts(javaFacts, gitCommit) {
    const allFacts = [...javaFacts.values()];
    const classIndex = buildClassIndex(allFacts);
    const primaryClassNames = buildPrimaryClassNames(javaFacts);
    const { typeOfReceiver } = makeResolver(javaFacts, classIndex);
    const calls = [];
    for (const relPath of [...javaFacts.keys()].sort(cmp)) {
        const facts = javaFacts.get(relPath);
        for (const cls of facts.classes) {
            for (const method of cls.methods) {
                const params = parseParams(method.paramsText);
                for (const call of method.calls) {
                    const ctx = {
                        relPath,
                        facts,
                        cls,
                        params,
                        locals: method.locals,
                        callStartIndex: call.startIndex,
                    };
                    const target = typeOfReceiver(call.receiver, ctx);
                    const base = {
                        callerClass: cls.name,
                        callerMethod: method.name,
                        callerFile: relPath,
                        callLine: call.line,
                        calleeMethod: call.methodName,
                        argCount: call.argCount,
                    };
                    if (target.external) {
                        calls.push({
                            ...base,
                            calleeClass: null,
                            calleeFile: null,
                            receiverKind: 'external',
                            overloadArity: null,
                        });
                    }
                    else if (target.relPath === null) {
                        calls.push({
                            ...base,
                            calleeClass: null,
                            calleeFile: null,
                            receiverKind: 'unresolved',
                            overloadArity: null,
                        });
                    }
                    else {
                        const calleeClass = target.kind === 'self'
                            ? cls.name
                            : (primaryClassNames.get(target.relPath) ?? null);
                        const overloadArity = selectOverloadArity(javaFacts, classIndex, target.relPath, call.methodName, call.argCount);
                        calls.push({
                            ...base,
                            calleeClass,
                            calleeFile: target.relPath,
                            receiverKind: target.kind,
                            overloadArity,
                        });
                    }
                }
            }
        }
    }
    calls.sort((a, b) => cmp(a.callerFile, b.callerFile) ||
        cmp(a.callLine, b.callLine) ||
        cmp(a.calleeMethod, b.calleeMethod) ||
        cmp(a.callerMethod, b.callerMethod) ||
        cmp(a.receiverKind, b.receiverKind) ||
        cmp(a.argCount, b.argCount));
    return { schemaVersion: 1, gitCommit, calls };
}
/**
 * 프로젝트 루트에서 메서드 단위 호출 그래프를 만든다.
 * census 의 java 파일을 1회씩 파싱해 facts 를 모은 뒤 buildGraphFromFacts 로 해소한다.
 */
export async function buildMethodCallGraph(projectRoot, census, cache) {
    // W8: edges.ts 와 `java-facts` 섹션 공유(동일 extractJavaFacts 출력) — 같은 실행에서
    // edges 가 먼저 채운 팩트도 read-your-writes 로 재사용(콜드 포함, 리뷰 R1).
    // null 값 = 판독 실패 파일(제외 동작 동일).
    const factsSec = cache?.section('java-facts', JAVA_FACTS_SALT);
    const javaFacts = new Map();
    const javaRels = census.files
        .filter((f) => f.lang === 'java')
        .map((f) => f.relPath)
        .sort(cmp);
    for (const rel of javaRels) {
        const hit = factsSec?.get(rel);
        if (hit !== undefined) {
            if (hit !== null)
                javaFacts.set(rel, hit);
            continue;
        }
        let src;
        try {
            src = readFileSync(join(projectRoot, rel), 'utf8');
        }
        catch {
            // null 캐시는 fingerprint 도 'absent' 일 때만(일시 오류 박제 방지, 리뷰 R2).
            if (cache?.isAbsent(rel))
                factsSec?.put(rel, null);
            continue;
        }
        try {
            const facts = await extractJavaFacts(rel, src);
            javaFacts.set(rel, facts);
            factsSec?.put(rel, facts);
        }
        catch {
            // 파싱 실패 파일은 facts 없이 둔다(증거 없는 호출 금지). 추출 실패는 캐시하지
            // 않는다 — edges.ts 와 동일 규약(그 파일만 제외, 다음 실행 재시도).
        }
    }
    return buildGraphFromFacts(javaFacts, gitCommitHash(projectRoot));
}
/** caller(파일/메서드/arity) 기준으로 calls 를 인덱싱(트레이스용). */
function indexCallsByCaller(graph) {
    // callerArity 는 ResolvedCall 에 없으므로 here arity 는 항상 -1(미사용) 버킷에 모은다.
    // (TASK 의 ResolvedCall 은 caller arity 를 노출하지 않는다 — caller 메서드명으로만 묶는다.)
    const byCaller = new Map();
    for (const c of graph.calls) {
        let byName = byCaller.get(c.callerFile);
        if (!byName)
            byCaller.set(c.callerFile, (byName = new Map()));
        let byArity = byName.get(c.callerMethod);
        if (!byArity)
            byName.set(c.callerMethod, (byArity = new Map()));
        const list = byArity.get(-1);
        if (list)
            list.push(c);
        else
            byArity.set(-1, [c]);
    }
    return byCaller;
}
/** caller 메서드의 모든 호출(arity 무시 — caller 는 핸들러라 오버로드 드묾). */
function callsOf(byCaller, file, method) {
    const byArity = byCaller.get(file)?.get(method);
    if (!byArity)
        return [];
    return [...byArity.values()].flat();
}
/**
 * flow 의 핸들러 메서드에서 시작해 해소된 호출(ResolvedCall)을 BFS 로 따라가며
 * 실제로 도달하는 프로젝트 파일을 호출-깊이 순으로 모은다(rootRelPath 가 첫 step).
 * external/unresolved callee 는 건너뛴다. self 호출(같은 파일)은 따라가되 새 파일은 아님.
 *
 * 핸들러의 호출이 어떤 프로젝트 파일로도 해소되지 않으면 root 만 반환 — 호출자는
 * 그 경우 기존 파일 단위(slices) 폴백을 쓴다.
 */
export function reachableFlowFiles(graph, rootRelPath, handlerMethod) {
    const byCaller = indexCallsByCaller(graph);
    const ordered = [rootRelPath];
    const seen = new Set([rootRelPath]);
    const visited = new Set();
    let frontier = [[rootRelPath, handlerMethod]];
    while (frontier.length > 0) {
        const next = [];
        for (const [file, method] of frontier) {
            const vkey = `${file}\n${method}`;
            if (visited.has(vkey))
                continue;
            visited.add(vkey);
            for (const call of callsOf(byCaller, file, method)) {
                const callee = call.calleeFile;
                if (callee === null)
                    continue; // external / unresolved.
                if (!seen.has(callee)) {
                    seen.add(callee);
                    ordered.push(callee);
                }
                next.push([callee, call.calleeMethod]);
            }
        }
        frontier = next;
    }
    return ordered;
}
/**
 * 핸들러 메서드에서 도달하는 (callee 파일, 메서드) 쌍을 BFS 로 모은다 — reachableFlowFiles 의
 * 메서드-정밀 버전. CRUD 매트릭스가 흐름별로 **실제 호출하는 매퍼 메서드만** 귀속하도록 쓴다
 * (파일 단위 사용메서드 라벨의 과다귀속 해소). external/unresolved callee 는 건너뛴다.
 * 결정론: (file, method) 사전순 정렬 후 반환.
 */
export function reachableMethods(graph, rootRelPath, handlerMethod) {
    const byCaller = indexCallsByCaller(graph);
    const seen = new Set();
    const out = [];
    const visited = new Set();
    let frontier = [[rootRelPath, handlerMethod]];
    while (frontier.length > 0) {
        const next = [];
        for (const [file, method] of frontier) {
            const vkey = `${file}\n${method}`;
            if (visited.has(vkey))
                continue;
            visited.add(vkey);
            for (const call of callsOf(byCaller, file, method)) {
                if (call.calleeFile === null)
                    continue;
                const key = `${call.calleeFile}\n${call.calleeMethod}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push({ file: call.calleeFile, method: call.calleeMethod });
                }
                next.push([call.calleeFile, call.calleeMethod]);
            }
        }
        frontier = next;
    }
    out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.method < b.method ? -1 : a.method > b.method ? 1 : 0));
    return out;
}
//# sourceMappingURL=method-calls.js.map