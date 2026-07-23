/**
 * 분기 스캐너(PD1) — Java/Kotlin 소스의 결정 지점(if/else if/switch·when/삼항) + 조건식 추출.
 *
 * tree-sitter AST 를 순회하며 소속 클래스/메서드를 추적하고, 각 분기 노드의 조건식 원문
 * (공백 정규화·바깥 괄호 제거)을 file:line 과 함께 수집한다. 합성 없음 — 소스에 있는 분기만.
 * 도메인 귀속은 상위(PD3: skeleton.stepSources → relPath 매핑)에서.
 *
 * 언어: `.kt` 는 Kotlin 문법(if_expression·when_expression — 삼항 없음), 그 외는 Java 문법.
 * (2026-07-23: Kotlin 프로젝트에서 Java 파서 하드코딩 탓에 분기 0 으로 퇴화하던 갭 해소.)
 *
 * 결정론: AST 소스 순서 순회 후 (relPath,line,kind,condition) 정렬.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource, startLine } from '../domain-map/tree-sitter.js';
import { gitCommitHash } from '../domain-map/persist.js';
import { BranchSignalSetSchema } from './types.js';
/** 확장자 → 파서 언어. `.kt` = kotlin, 그 외(.java 등) = java. */
function langOf(relPath) {
    return relPath.endsWith('.kt') ? 'kotlin' : 'java';
}
const CLASS_TYPES = new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'record_declaration',
]);
const METHOD_TYPES = new Set(['method_declaration', 'constructor_declaration']);
/** Kotlin 클래스/메서드 노드 타입(name = 'name' 필드 또는 첫 identifier). */
const KT_CLASS_TYPES = new Set(['class_declaration', 'object_declaration']);
const KT_METHOD_TYPES = new Set(['function_declaration', 'secondary_constructor']);
function nameField(node) {
    const n = node.childForFieldName('name');
    return n ? n.text : null;
}
/** name 필드가 없으면 첫 identifier child 로 폴백(Kotlin 그래머 대응). */
function nameOrIdent(node) {
    return nameField(node) ?? node.namedChildren.find((c) => c != null && c.type === 'identifier')?.text ?? null;
}
/** 바깥 괄호 1겹 제거 + 공백 정규화(Kotlin when_subject `(x)` 등). */
function stripParens(text) {
    let t = text.replace(/\s+/g, ' ').trim();
    if (t.startsWith('(') && t.endsWith(')'))
        t = t.slice(1, -1).trim();
    return t;
}
/** 조건식 텍스트 정규화 — 공백 1칸, 바깥 괄호 1겹 제거(parenthesized_expression). */
function condText(node) {
    if (!node)
        return '';
    let t = node.text;
    if (node.type === 'parenthesized_expression' && t.startsWith('(') && t.endsWith(')')) {
        t = t.slice(1, -1);
    }
    return t.replace(/\s+/g, ' ').trim();
}
/** if/switch 의 조건 — field 'condition'(parenthesized_expression), 없으면 첫 괄호식 폴백. */
function parenCond(node) {
    const c = node.childForFieldName('condition');
    if (c)
        return condText(c);
    for (const ch of node.namedChildren) {
        if (ch && ch.type === 'parenthesized_expression')
            return condText(ch);
    }
    return '';
}
/** 삼항의 조건 — field 'condition', 없으면 첫 named child 폴백. */
function ternaryCond(node) {
    const c = node.childForFieldName('condition');
    if (c)
        return condText(c);
    const first = node.namedChildren.find((x) => x !== null);
    return condText(first ?? null);
}
/** 본문 텍스트 요약 — 공백 1칸·바깥 중괄호 제거·길이 캡(THEN 시드). */
const THEN_CAP = 140;
function summarizeBody(node) {
    if (!node)
        return '';
    let t = node.text.replace(/\s+/g, ' ').trim();
    if (t.startsWith('{') && t.endsWith('}'))
        t = t.slice(1, -1).trim();
    return t.length > THEN_CAP ? `${t.slice(0, THEN_CAP - 1).trimEnd()}…` : t;
}
/** 처리 본문(THEN) — if=consequence 블록 / 삼항="결과 : 대안" / switch=공란(케이스별). */
function thenText(node) {
    if (node.type === 'if_statement') {
        return summarizeBody(node.childForFieldName('consequence'));
    }
    if (node.type === 'ternary_expression') {
        const c = node.childForFieldName('consequence');
        const a = node.childForFieldName('alternative');
        return [c, a].filter((n) => n != null).map((n) => summarizeBody(n)).join(' : ');
    }
    return '';
}
/**
 * 한 Java 파일에서 분기 신호를 추출한다(순수, 파싱 포함). 소스 순서 보존.
 */
async function extractBranchesJava(relPath, src) {
    const root = await parseSource('java', src);
    const out = [];
    const walk = (node, className, methodName) => {
        let cls = className;
        let mth = methodName;
        if (CLASS_TYPES.has(node.type)) {
            cls = nameField(node) ?? className;
        }
        else if (METHOD_TYPES.has(node.type)) {
            mth = nameField(node) ?? (node.type === 'constructor_declaration' ? '<init>' : methodName);
        }
        if (node.type === 'if_statement') {
            out.push({ relPath, line: startLine(node), className: cls, methodName: mth, kind: 'if', condition: parenCond(node), then: thenText(node) });
        }
        else if (node.type === 'switch_expression') {
            out.push({ relPath, line: startLine(node), className: cls, methodName: mth, kind: 'switch', condition: parenCond(node), then: thenText(node) });
        }
        else if (node.type === 'ternary_expression') {
            out.push({ relPath, line: startLine(node), className: cls, methodName: mth, kind: 'ternary', condition: ternaryCond(node), then: thenText(node) });
        }
        for (const c of node.namedChildren) {
            if (c)
                walk(c, cls, mth);
        }
    };
    walk(root, null, null);
    return out;
}
/**
 * 한 Kotlin 파일에서 분기 신호를 추출한다. Kotlin 은 `if`·`when` 이 식(expression)이고
 * 삼항이 없다(if 가 겸함). if_expression=if, when_expression=switch 로 매핑(스키마 kind 유지).
 *  - if 조건 = childForFieldName('condition')(괄호 밖 식) · THEN = condition 다음 named child(본문).
 *  - when 조건 = when_subject `(x)` 의 괄호 제거 · THEN = 공란(케이스별, Java switch 와 동형).
 */
async function extractBranchesKotlin(relPath, src) {
    const root = await parseSource('kotlin', src);
    const out = [];
    const walk = (node, className, methodName) => {
        let cls = className;
        let mth = methodName;
        if (KT_CLASS_TYPES.has(node.type)) {
            cls = nameOrIdent(node) ?? className;
        }
        else if (KT_METHOD_TYPES.has(node.type)) {
            mth = nameOrIdent(node) ?? (node.type === 'secondary_constructor' ? '<init>' : methodName);
        }
        if (node.type === 'if_expression') {
            // Kotlin if_expression named children = [condition, consequence, alternative?] (실측 고정).
            // web-tree-sitter 는 접근마다 다른 Node 래퍼를 줘 indexOf 가 안 맞으므로 위치로 집는다.
            const named = node.namedChildren.filter((c) => c != null);
            const cond = node.childForFieldName('condition') ?? named[0] ?? null;
            const consequence = named[1] ?? null;
            out.push({
                relPath,
                line: startLine(node),
                className: cls,
                methodName: mth,
                kind: 'if',
                condition: condText(cond),
                then: summarizeBody(consequence),
            });
        }
        else if (node.type === 'when_expression') {
            const subj = node.namedChildren.find((c) => c != null && c.type === 'when_subject');
            out.push({
                relPath,
                line: startLine(node),
                className: cls,
                methodName: mth,
                kind: 'switch',
                condition: subj ? stripParens(subj.text) : '',
                then: '',
            });
        }
        for (const c of node.namedChildren) {
            if (c)
                walk(c, cls, mth);
        }
    };
    walk(root, null, null);
    return out;
}
/** 한 소스 파일에서 분기 신호를 추출한다 — 확장자로 Java/Kotlin 파서를 고른다. */
export async function extractBranches(relPath, src) {
    return langOf(relPath) === 'kotlin' ? extractBranchesKotlin(relPath, src) : extractBranchesJava(relPath, src);
}
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** 한 Java 파일의 enum 선언을 추출한다(이름 + 상수 목록). §3 상태값·§2 용어 시드. */
async function extractEnumsJava(relPath, src) {
    const root = await parseSource('java', src);
    const out = [];
    const walk = (node) => {
        if (node.type === 'enum_declaration') {
            const name = node.childForFieldName('name')?.text ?? '';
            const body = node.namedChildren.find((c) => c != null && c.type === 'enum_body');
            const constants = [];
            if (body) {
                for (const c of body.namedChildren) {
                    if (c && c.type === 'enum_constant') {
                        const cn = c.childForFieldName('name')?.text ?? c.namedChildren.find((x) => x != null && x.type === 'identifier')?.text;
                        if (cn)
                            constants.push(cn);
                    }
                }
            }
            if (name)
                out.push({ enumName: name, constants, relPath, line: startLine(node) });
        }
        for (const c of node.namedChildren)
            if (c)
                walk(c);
    };
    walk(root);
    return out;
}
/** Kotlin `enum class` — class_declaration(modifiers 에 enum) + enum_class_body/enum_entry. */
async function extractEnumsKotlin(relPath, src) {
    const root = await parseSource('kotlin', src);
    const out = [];
    const isEnumClass = (node) => {
        const mods = node.namedChildren.find((c) => c != null && c.type === 'modifiers');
        return mods != null && /\benum\b/.test(mods.text);
    };
    const walk = (node) => {
        if (node.type === 'class_declaration' && isEnumClass(node)) {
            const name = nameOrIdent(node) ?? '';
            const body = node.namedChildren.find((c) => c != null && c.type === 'enum_class_body');
            const constants = [];
            if (body) {
                for (const c of body.namedChildren) {
                    if (c && c.type === 'enum_entry') {
                        const cn = c.childForFieldName('name')?.text ?? c.namedChildren.find((x) => x != null && x.type === 'identifier')?.text;
                        if (cn)
                            constants.push(cn);
                    }
                }
            }
            if (name)
                out.push({ enumName: name, constants, relPath, line: startLine(node) });
        }
        for (const c of node.namedChildren)
            if (c)
                walk(c);
    };
    walk(root);
    return out;
}
/** 한 소스 파일의 enum 을 추출한다 — 확장자로 Java/Kotlin 파서를 고른다. */
export async function extractEnums(relPath, src) {
    return langOf(relPath) === 'kotlin' ? extractEnumsKotlin(relPath, src) : extractEnumsJava(relPath, src);
}
/**
 * 여러 Java 파일(relPaths)을 스캔해 분기 신호 집합을 만든다(IO).
 * 호출자가 대상 파일을 한정(PD3: 도메인 경계 = skeleton.stepSources 의 클래스 파일).
 * 읽기 실패는 조용히 건너뛰되(파일 누락 방어) fileCount 에는 미포함.
 */
export async function scanBranches(projectRoot, relPaths) {
    const signals = [];
    let fileCount = 0;
    // 중복 제거 + 정렬(결정론).
    const uniq = [...new Set(relPaths)].sort(cmp);
    for (const rel of uniq) {
        let src;
        try {
            src = readFileSync(join(projectRoot, rel), 'utf8');
        }
        catch {
            continue;
        }
        fileCount++;
        signals.push(...(await extractBranches(rel, src)));
    }
    signals.sort((a, b) => cmp(a.relPath, b.relPath) || a.line - b.line || cmp(a.kind, b.kind) || cmp(a.condition, b.condition));
    return BranchSignalSetSchema.parse({
        schemaVersion: 1,
        gitCommit: gitCommitHash(projectRoot),
        fileCount,
        signals,
    });
}
//# sourceMappingURL=branch-scanner.js.map