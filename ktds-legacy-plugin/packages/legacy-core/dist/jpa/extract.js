/**
 * JPA / Spring Data 추출기(보완 B) — 결정론. java-facts.ts 무수정(additive 재파싱).
 *
 * tree-sitter 로 Java 를 재파싱해 @Entity/@Table/@Column/@Id/@OneToMany/@ManyToOne/
 * @OneToOne/@ManyToMany/@JoinColumn 과 Spring Data `JpaRepository<T,ID>` + 파생쿼리 +
 * @Query 를 추출한다. 3-Tier 신뢰(types.ts 주석 참조). MyBatis 와 공존(AC-16b).
 *
 * 결정론: 모든 배열 정렬, 타임스탬프 없음. 명시 애너테이션 = CONFIRMED, 암묵 명명전략
 * (camelCase→snake_case) = INFERRED + explicit=false 플래그(BF1).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSource, startLine } from '../domain-map/tree-sitter.js';
import { collectDeclAnnotations, ktChild, ktChildren, ktDeclKind, ktStringContent, ktTypeOuterName, } from '../domain-map/kotlin-ast.js';
import { gitCommitHash } from '../domain-map/persist.js';
import { JpaModelSchema, } from './types.js';
// JPA/관계형 Spring Data 베이스만(보완 B 는 JPA 한정). MongoRepository 등 비-관계형은
// entity↔table 레일 grounding 대상이 아니므로 제외(리뷰 MED-1). JpaSpecificationExecutor
// 는 보조 인터페이스(T,ID 1차 소스 아님)라 베이스로 채택하지 않는다.
const SPRING_DATA_BASES = new Set([
    'Repository',
    'CrudRepository',
    'PagingAndSortingRepository',
    'JpaRepository',
]);
const RELATION_ANNOS = new Set(['OneToMany', 'ManyToOne', 'OneToOne', 'ManyToMany']);
const DERIVED_PREFIX = /^(find|read|get|query|count|exists|delete|remove|stream)([A-Za-z0-9]*?)By([A-Z].*)$/;
const DERIVED_SUFFIXES = [
    'IgnoreCase', 'Containing', 'StartingWith', 'EndingWith', 'GreaterThanEqual', 'LessThanEqual',
    'GreaterThan', 'LessThan', 'Between', 'IsNotNull', 'IsNull', 'NotNull', 'NotIn', 'Like', 'After',
    'Before', 'True', 'False', 'Not', 'In',
];
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** camelCase/PascalCase → snake_case(Hibernate 암묵 명명전략 기본, BF1). */
export function snakeCase(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}
// ── tree-sitter 노드 헬퍼 ─────────────────────────────────────────────────────
function child(node, type) {
    for (const c of node.namedChildren)
        if (c && c.type === type)
            return c;
    return null;
}
function children(node, ...types) {
    const want = new Set(types);
    const out = [];
    for (const c of node.namedChildren)
        if (c && want.has(c.type))
            out.push(c);
    return out;
}
function modifiersOf(decl) {
    return child(decl, 'modifiers');
}
function declName(decl) {
    const n = decl.childForFieldName('name');
    return n ? n.text : null;
}
/** 선언/필드의 모디파이어에서 애너테이션 목록(이름 + 노드 + 라인). */
function annotationsOf(decl) {
    const mods = modifiersOf(decl);
    if (!mods)
        return [];
    const out = [];
    for (const a of children(mods, 'annotation', 'marker_annotation')) {
        const nameNode = a.childForFieldName('name') ?? child(a, 'identifier') ?? child(a, 'scoped_type_identifier');
        if (!nameNode)
            continue;
        const text = nameNode.text;
        const simple = text.includes('.') ? text.slice(text.lastIndexOf('.') + 1) : text;
        out.push({ name: simple, node: a, line: startLine(a) });
    }
    return out;
}
function findAnno(annos, name) {
    return annos.find((a) => a.name === name);
}
/** 문자열 리터럴 텍스트에서 둘러싼 따옴표 제거(+ 기본 escape 해제). */
function stripString(text) {
    let s = text.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
    }
    return s.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}
/** 애너테이션 인자: key→value(string) 맵 + 위치 인자(첫 string). */
function annoArgs(anno) {
    const list = child(anno, 'annotation_argument_list');
    const byKey = new Map();
    let positional = null;
    if (!list)
        return { byKey, positional };
    for (const c of list.namedChildren) {
        if (!c)
            continue;
        if (c.type === 'element_value_pair') {
            const key = c.childForFieldName('key')?.text;
            const value = c.childForFieldName('value');
            if (key && value)
                byKey.set(key, value.type === 'string_literal' ? stripString(value.text) : value.text.trim());
        }
        else if (c.type === 'string_literal' && positional === null) {
            positional = stripString(c.text);
        }
    }
    return { byKey, positional };
}
/** generic_type 의 타입 인자 외곽 식별자 목록(예: JpaRepository<Owner,Integer> → [Owner,Integer]). */
function genericTypeArgs(typeNode) {
    const args = child(typeNode, 'type_arguments');
    if (!args)
        return [];
    const out = [];
    for (const c of args.namedChildren) {
        if (!c)
            continue;
        if (c.type === 'type_identifier' || c.type === 'identifier')
            out.push(c.text);
        else if (c.type === 'generic_type') {
            const base = child(c, 'type_identifier');
            if (base)
                out.push(base.text);
        }
        else if (c.type === 'scoped_type_identifier') {
            const t = c.text;
            out.push(t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t);
        }
    }
    return out;
}
/** 필드 타입 노드에서 원소 타입(제네릭이면 첫 타입 인자, 예: List<Pet> → Pet). */
function elementType(typeNode) {
    if (!typeNode)
        return null;
    if (typeNode.type === 'type_identifier' || typeNode.type === 'identifier')
        return typeNode.text;
    if (typeNode.type === 'generic_type') {
        const args = genericTypeArgs(typeNode);
        if (args.length > 0)
            return args[0];
        const base = child(typeNode, 'type_identifier');
        return base ? base.text : null;
    }
    if (typeNode.type === 'scoped_type_identifier') {
        const t = typeNode.text;
        return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
    }
    return null;
}
function fieldTypeNode(field) {
    for (const c of field.namedChildren) {
        if (!c)
            continue;
        if (['type_identifier', 'generic_type', 'array_type', 'scoped_type_identifier'].includes(c.type))
            return c;
    }
    return null;
}
function fieldName(field) {
    const d = child(field, 'variable_declarator');
    const n = d?.childForFieldName('name') ?? (d ? child(d, 'identifier') : null);
    return n ? n.text : null;
}
function bodyOf(decl) {
    return child(decl, 'class_body') ?? child(decl, 'interface_body') ?? null;
}
// ── 파생쿼리 파싱 ─────────────────────────────────────────────────────────────
/** findByFirstNameAndLastName → [first_name, last_name](정렬). 미매치 → []. */
export function parseDerivedQuery(method) {
    const m = DERIVED_PREFIX.exec(method);
    if (!m)
        return [];
    let body = m[3];
    // OrderBy 절 제거
    const orderIdx = body.indexOf('OrderBy');
    if (orderIdx >= 0)
        body = body.slice(0, orderIdx);
    const parts = body.split(/And|Or/).filter(Boolean);
    const cols = new Set();
    for (let token of parts) {
        // 접미사(연산 키워드) 제거 — token 이 키워드 자체와 같아도 제거(→ 빈 토큰은 드롭).
        // 이렇게 해야 `findByIn`(token='In') 처럼 속성 없는 순수 연산자가 컬럼으로 새지 않는다.
        for (const suf of DERIVED_SUFFIXES) {
            if (token.endsWith(suf))
                token = token.slice(0, -suf.length);
        }
        if (token.length > 0)
            cols.add(snakeCase(token));
    }
    return [...cols].sort(cmp);
}
// ── 엔티티 / 리포지토리 추출 ──────────────────────────────────────────────────
function extractEntity(decl, relPath) {
    const annos = annotationsOf(decl);
    if (!findAnno(annos, 'Entity'))
        return null;
    const className = declName(decl);
    if (!className)
        return null;
    const tableAnno = findAnno(annos, 'Table');
    let tableName = snakeCase(className);
    let tableExplicit = false;
    if (tableAnno) {
        const { byKey, positional } = annoArgs(tableAnno.node);
        const name = byKey.get('name') ?? positional;
        if (name) {
            tableName = name;
            tableExplicit = true;
        }
    }
    const columns = [];
    const relations = [];
    let idField = null;
    const body = bodyOf(decl);
    if (body) {
        for (const field of children(body, 'field_declaration')) {
            const fname = fieldName(field);
            if (!fname)
                continue;
            const fannos = annotationsOf(field);
            if (findAnno(fannos, 'Id'))
                idField = fname;
            if (findAnno(fannos, 'Transient'))
                continue;
            const rel = fannos.find((a) => RELATION_ANNOS.has(a.name));
            if (rel) {
                const join = findAnno(fannos, 'JoinColumn');
                let joinColumn = null;
                if (join) {
                    const { byKey, positional } = annoArgs(join.node);
                    joinColumn = byKey.get('name') ?? positional ?? null;
                }
                relations.push({
                    fieldName: fname,
                    kind: rel.name,
                    targetType: elementType(fieldTypeNode(field)),
                    joinColumn,
                    line: startLine(field),
                    confidence: 'INFERRED', // Tier B
                });
                continue;
            }
            // 컬럼: @Column(name=) 명시 → CONFIRMED, 부재 → 암묵 명명전략 INFERRED.
            const colAnno = findAnno(fannos, 'Column');
            let columnName = snakeCase(fname);
            let explicit = false;
            if (colAnno) {
                const { byKey, positional } = annoArgs(colAnno.node);
                const name = byKey.get('name') ?? positional;
                if (name) {
                    columnName = name;
                    explicit = true;
                }
            }
            columns.push({
                fieldName: fname,
                columnName,
                explicit,
                line: startLine(field),
                confidence: explicit ? 'CONFIRMED' : 'INFERRED',
            });
        }
    }
    columns.sort((a, b) => cmp(a.fieldName, b.fieldName));
    relations.sort((a, b) => cmp(a.fieldName, b.fieldName));
    return {
        className,
        relPath,
        line: startLine(decl),
        tableName,
        tableExplicit,
        tableConfidence: tableExplicit ? 'CONFIRMED' : 'INFERRED',
        idField,
        columns,
        relations,
    };
}
function springDataBase(decl) {
    const ext = child(decl, 'extends_interfaces');
    if (!ext)
        return null;
    const typeList = child(ext, 'type_list');
    if (!typeList)
        return null;
    for (const t of typeList.namedChildren) {
        if (!t)
            continue;
        if (t.type === 'generic_type') {
            const base = child(t, 'type_identifier');
            if (base && SPRING_DATA_BASES.has(base.text)) {
                const args = genericTypeArgs(t);
                return { base: base.text, entity: args[0] ?? null, id: args[1] ?? null };
            }
        }
        else if (t.type === 'type_identifier' && SPRING_DATA_BASES.has(t.text)) {
            return { base: t.text, entity: null, id: null };
        }
    }
    return null;
}
function extractRepository(decl, relPath) {
    const base = springDataBase(decl);
    if (!base)
        return null;
    const className = declName(decl);
    if (!className)
        return null;
    const derivedQueries = [];
    const queries = [];
    const unresolved = [];
    const body = bodyOf(decl);
    if (body) {
        for (const method of children(body, 'method_declaration')) {
            const mname = method.childForFieldName('name')?.text;
            if (!mname)
                continue;
            const mannos = annotationsOf(method);
            const queryAnno = findAnno(mannos, 'Query');
            if (queryAnno) {
                const { byKey, positional } = annoArgs(queryAnno.node);
                const native = byKey.get('nativeQuery') === 'true';
                const q = byKey.get('value') ?? positional ?? null;
                queries.push({
                    method: mname,
                    native,
                    query: q,
                    line: startLine(method),
                    confidence: native ? 'UNVERIFIED' : 'CONFIRMED', // Tier C(native) / Tier A(JPQL)
                });
                continue;
            }
            const cols = parseDerivedQuery(mname);
            if (cols.length > 0) {
                derivedQueries.push({ method: mname, columns: cols, line: startLine(method), confidence: 'INFERRED' });
            }
        }
    }
    if (base.entity === null) {
        unresolved.push({ ref: `${relPath}:${className}`, reason: `${base.base} 의 entity 타입 미해소(제네릭 인자 없음)` });
    }
    derivedQueries.sort((a, b) => cmp(a.method, b.method));
    queries.sort((a, b) => cmp(a.method, b.method));
    return {
        repo: {
            className,
            relPath,
            line: startLine(decl),
            entityType: base.entity,
            idType: base.id,
            baseInterface: base.base,
            derivedQueries,
            queries,
        },
        unresolved,
    };
}
function collectDecls(root, types) {
    const out = [];
    const walk = (n) => {
        for (const c of n.namedChildren) {
            if (!c)
                continue;
            if (types.has(c.type))
                out.push(c);
            walk(c);
        }
    };
    walk(root);
    return out;
}
// ── Kotlin ────────────────────────────────────────────────────────────────
// 그래머 실측(탐색 파싱, 본 파일 한정): class_declaration 1종이 class/interface/enum
// 을 겸한다(kotlin-ast.ts ktDeclKind 로 구분). primary_constructor>class_parameters>
// class_parameter 와 class_body>property_declaration 양쪽에 프로퍼티가 나뉘어 있고,
// 어노테이션은 반드시 collectDeclAnnotations 경유(분리형 치유 + use-site target).
/** annotation 노드에서 named/positional 인자 맵(Java annoArgs 와 동형). */
function ktAnnoArgs(anno) {
    const byKey = new Map();
    let positional = null;
    for (const a of anno.args) {
        const value = ktStringContent(a.node) ?? a.node.text.trim();
        if (a.name)
            byKey.set(a.name, value);
        else if (positional === null)
            positional = value;
    }
    return { byKey, positional };
}
/** nullable_type 을 벗겨 user_type(또는 그 외 타입 노드)을 노출. */
function ktUnwrapNullable(node) {
    if (!node)
        return null;
    if (node.type === 'nullable_type') {
        return ktUnwrapNullable(node.namedChildren.filter((c) => c !== null)[0] ?? null);
    }
    return node;
}
/** 타입 노드에서 원소 타입(제네릭이면 첫 type_projection, 예: List<Order> → Order). Java elementType 대응. */
function ktElementType(typeNode) {
    const t = ktUnwrapNullable(typeNode);
    if (!t)
        return null;
    if (t.type === 'user_type') {
        const typeArgs = ktChild(t, 'type_arguments');
        if (typeArgs) {
            const proj = ktChild(typeArgs, 'type_projection');
            const inner = proj ? ktUnwrapNullable(proj.namedChildren.filter((c) => c !== null)[0] ?? null) : null;
            const innerName = ktTypeOuterName(inner);
            if (innerName)
                return innerName;
        }
    }
    return ktTypeOuterName(t);
}
/** primary_constructor 의 class_parameter 목록(없으면 []). */
function ktPrimaryConstructorParams(decl) {
    const pc = ktChild(decl, 'primary_constructor');
    if (!pc)
        return [];
    const params = ktChild(pc, 'class_parameters');
    if (!params)
        return [];
    return ktChildren(params, 'class_parameter');
}
/** class_parameter 의 이름/타입 노드 — [modifiers?, identifier, <type>, <default>?] 고정 순서. */
function ktParamNameType(param) {
    const named = param.namedChildren.filter((c) => c !== null);
    const idIdx = named.findIndex((c) => c.type === 'identifier');
    if (idIdx < 0)
        return { name: null, type: null };
    return { name: named[idIdx].text, type: named[idIdx + 1] ?? null };
}
/** property_declaration 의 이름/타입 노드 — variable_declaration(identifier, <type>?) 경유. */
function ktPropNameType(prop) {
    const vd = ktChild(prop, 'variable_declaration');
    if (!vd)
        return { name: null, type: null };
    const named = vd.namedChildren.filter((c) => c !== null);
    const id = named.find((c) => c.type === 'identifier');
    if (!id)
        return { name: null, type: null };
    return { name: id.text, type: named.find((c) => c !== id) ?? null };
}
function ktFindAnno(annos, name) {
    return annos.find((a) => a.name === name);
}
/** class_declaration(entity 후보, class_parameter + property_declaration 양쪽 필드) → JpaEntity. */
function extractKotlinEntity(decl, relPath) {
    const declAnnos = collectDeclAnnotations(decl);
    if (!ktFindAnno(declAnnos, 'Entity'))
        return null;
    const className = ktChild(decl, 'identifier')?.text ?? null;
    if (!className)
        return null;
    const tableAnno = ktFindAnno(declAnnos, 'Table');
    let tableName = snakeCase(className);
    let tableExplicit = false;
    if (tableAnno) {
        const { byKey, positional } = ktAnnoArgs(tableAnno);
        const name = byKey.get('name') ?? positional;
        if (name) {
            tableName = name;
            tableExplicit = true;
        }
    }
    const columns = [];
    const relations = [];
    let idField = null;
    // 필드 후보: 주생성자 class_parameter + class_body property_declaration(양쪽).
    const fieldCandidates = [];
    for (const param of ktPrimaryConstructorParams(decl)) {
        const { name, type } = ktParamNameType(param);
        fieldCandidates.push({ node: param, fname: name, ftype: type, fannos: collectDeclAnnotations(param) });
    }
    const body = ktChild(decl, 'class_body');
    if (body) {
        for (const prop of ktChildren(body, 'property_declaration')) {
            const { name, type } = ktPropNameType(prop);
            fieldCandidates.push({ node: prop, fname: name, ftype: type, fannos: collectDeclAnnotations(prop) });
        }
    }
    for (const { node: field, fname, ftype, fannos } of fieldCandidates) {
        if (!fname)
            continue;
        if (ktFindAnno(fannos, 'Id'))
            idField = fname;
        if (ktFindAnno(fannos, 'Transient'))
            continue;
        const rel = fannos.find((a) => RELATION_ANNOS.has(a.name));
        if (rel) {
            const join = ktFindAnno(fannos, 'JoinColumn');
            let joinColumn = null;
            if (join) {
                const { byKey, positional } = ktAnnoArgs(join);
                joinColumn = byKey.get('name') ?? positional ?? null;
            }
            relations.push({
                fieldName: fname,
                kind: rel.name,
                targetType: ktElementType(ftype),
                joinColumn,
                line: startLine(field),
                confidence: 'INFERRED', // Tier B
            });
            continue;
        }
        const colAnno = ktFindAnno(fannos, 'Column');
        let columnName = snakeCase(fname);
        let explicit = false;
        if (colAnno) {
            const { byKey, positional } = ktAnnoArgs(colAnno);
            const name = byKey.get('name') ?? positional;
            if (name) {
                columnName = name;
                explicit = true;
            }
        }
        columns.push({
            fieldName: fname,
            columnName,
            explicit,
            line: startLine(field),
            confidence: explicit ? 'CONFIRMED' : 'INFERRED',
        });
    }
    columns.sort((a, b) => cmp(a.fieldName, b.fieldName));
    relations.sort((a, b) => cmp(a.fieldName, b.fieldName));
    return {
        className,
        relPath,
        line: startLine(decl),
        tableName,
        tableExplicit,
        tableConfidence: tableExplicit ? 'CONFIRMED' : 'INFERRED',
        idField,
        columns,
        relations,
    };
}
/** delegation_specifiers 에서 Spring Data 베이스(JpaRepository 등) + 제네릭 인자. Java springDataBase 대응. */
function ktSpringDataBase(decl) {
    const ds = ktChild(decl, 'delegation_specifiers');
    if (!ds)
        return null;
    for (const spec of ktChildren(ds, 'delegation_specifier')) {
        const ut = ktChild(spec, 'user_type') ?? ktChild(ktChild(spec, 'constructor_invocation') ?? spec, 'user_type');
        if (!ut)
            continue;
        const baseName = ktTypeOuterName(ut);
        if (!baseName || !SPRING_DATA_BASES.has(baseName))
            continue;
        const typeArgs = ktChild(ut, 'type_arguments');
        const args = [];
        if (typeArgs) {
            for (const proj of ktChildren(typeArgs, 'type_projection')) {
                const inner = proj.namedChildren.filter((c) => c !== null)[0] ?? null;
                const name = ktTypeOuterName(inner);
                if (name)
                    args.push(name);
            }
        }
        return { base: baseName, entity: args[0] ?? null, id: args[1] ?? null };
    }
    return null;
}
/** interface(ktDeclKind==='interface') + Spring Data 베이스 → JpaRepository. Java extractRepository 대응. */
function extractKotlinRepository(decl, relPath) {
    const base = ktSpringDataBase(decl);
    if (!base)
        return null;
    const className = ktChild(decl, 'identifier')?.text ?? null;
    if (!className)
        return null;
    const derivedQueries = [];
    const queries = [];
    const unresolved = [];
    const body = ktChild(decl, 'class_body');
    if (body) {
        for (const method of ktChildren(body, 'function_declaration')) {
            const mname = ktChild(method, 'identifier')?.text;
            if (!mname)
                continue;
            const mannos = collectDeclAnnotations(method);
            const queryAnno = ktFindAnno(mannos, 'Query');
            if (queryAnno) {
                const { byKey, positional } = ktAnnoArgs(queryAnno);
                const native = byKey.get('nativeQuery') === 'true';
                const q = byKey.get('value') ?? positional ?? null;
                queries.push({
                    method: mname,
                    native,
                    query: q,
                    line: startLine(method),
                    confidence: native ? 'UNVERIFIED' : 'CONFIRMED', // Tier C(native) / Tier A(JPQL)
                });
                continue;
            }
            const cols = parseDerivedQuery(mname);
            if (cols.length > 0) {
                derivedQueries.push({ method: mname, columns: cols, line: startLine(method), confidence: 'INFERRED' });
            }
        }
    }
    if (base.entity === null) {
        unresolved.push({ ref: `${relPath}:${className}`, reason: `${base.base} 의 entity 타입 미해소(제네릭 인자 없음)` });
    }
    derivedQueries.sort((a, b) => cmp(a.method, b.method));
    queries.sort((a, b) => cmp(a.method, b.method));
    return {
        repo: {
            className,
            relPath,
            line: startLine(decl),
            entityType: base.entity,
            idType: base.id,
            baseInterface: base.base,
            derivedQueries,
            queries,
        },
        unresolved,
    };
}
function collectKtClassDecls(root) {
    const out = [];
    const walk = (n) => {
        for (const c of n.namedChildren) {
            if (!c)
                continue;
            if (c.type === 'class_declaration')
                out.push(c);
            walk(c);
        }
    };
    walk(root);
    return out;
}
/** 단일 Kotlin 소스에서 JPA 엔티티/리포지토리 추출(순수, 파싱만). extractJpaFromSource 의 Kotlin 대응. */
export async function extractJpaFromKotlinSource(source, relPath) {
    const root = await parseSource('kotlin', source);
    const entities = [];
    const repositories = [];
    const unresolved = [];
    for (const decl of collectKtClassDecls(root)) {
        const kind = ktDeclKind(decl);
        if (kind === 'interface') {
            const r = extractKotlinRepository(decl, relPath);
            if (r) {
                repositories.push(r.repo);
                unresolved.push(...r.unresolved);
            }
        }
        else {
            const e = extractKotlinEntity(decl, relPath);
            if (e)
                entities.push(e);
        }
    }
    return { entities, repositories, unresolved };
}
/** 단일 Java 소스에서 JPA 엔티티/리포지토리 추출(순수, 파싱만). */
export async function extractJpaFromSource(source, relPath) {
    const root = await parseSource('java', source);
    const entities = [];
    const repositories = [];
    const unresolved = [];
    for (const decl of collectDecls(root, new Set(['class_declaration']))) {
        const e = extractEntity(decl, relPath);
        if (e)
            entities.push(e);
    }
    for (const decl of collectDecls(root, new Set(['interface_declaration']))) {
        const r = extractRepository(decl, relPath);
        if (r) {
            repositories.push(r.repo);
            unresolved.push(...r.unresolved);
        }
    }
    return { entities, repositories, unresolved };
}
/**
 * W8 캐시 섹션 salt — JPA 추출 의미(애너테이션 인식/파생쿼리 규칙)가 바뀌면 bump.
 * v2: Kotlin 지원 추가(census 필터 java→java+kotlin, lang 분기 워커) — 섹션 범위가
 * 넓어져 bump(java 산출 자체는 무회귀, 재계산 1회 유발).
 */
const JPA_FACTS_SALT = 'v2';
/** 프로젝트 전체 census 의 Java/Kotlin 파일을 스캔해 jpa-model.json 모델을 만든다(결정론). */
export async function extractJpaModel(projectRoot, census, cache) {
    const entities = [];
    const repositories = [];
    const unresolved = [];
    // W8: null 캐시 = 판독 실패(기존 동작대로 제외). 사전필터 미스는 빈 팩트로 캐시 —
    // full 스캔에서도 기여가 없는 파일이라 산출 동일, 재실행 때 판독까지 생략된다.
    const jpaSec = cache?.section('jpa-facts', JPA_FACTS_SALT);
    for (const f of census.files) {
        if (f.lang !== 'java' && f.lang !== 'kotlin')
            continue;
        const hit = jpaSec?.get(f.relPath);
        if (hit !== undefined) {
            if (hit !== null) {
                entities.push(...hit.entities);
                repositories.push(...hit.repositories);
                unresolved.push(...hit.unresolved);
            }
            continue;
        }
        let source;
        try {
            source = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            // null 캐시는 fingerprint 도 'absent' 일 때만(일시 오류 박제 방지, 리뷰 R2).
            if (cache?.isAbsent(f.relPath))
                jpaSec?.put(f.relPath, null);
            continue;
        }
        // 빠른 사전 필터: JPA 신호가 전혀 없으면 파싱 생략(결정론 무관, 성능). 어노테이션/
        // 키워드 표기는 java/kotlin 동일이라 필터는 언어 공용.
        if (!/@Entity|Repository|@Table|@Column|@Query|@OneToMany|@ManyToOne|@OneToOne|@ManyToMany/.test(source)) {
            jpaSec?.put(f.relPath, { entities: [], repositories: [], unresolved: [] });
            continue;
        }
        // 파일별 파싱 오류 격리(정직성): 한 파일이 실패해도 스캔 전체를 중단하지 않고
        // unresolved 로 보고한다. scanDomainMap 이 모든 스캔 경로에서 호출되므로 필수.
        // 실패 메시지도 소스의 순수 함수 — 팩트에 포함해 재생 동일성 유지.
        let facts;
        try {
            facts = f.lang === 'kotlin'
                ? await extractJpaFromKotlinSource(source, f.relPath)
                : await extractJpaFromSource(source, f.relPath);
        }
        catch (err) {
            facts = { entities: [], repositories: [], unresolved: [{ ref: f.relPath, reason: `JPA 파싱 실패: ${err.message}` }] };
        }
        jpaSec?.put(f.relPath, facts);
        entities.push(...facts.entities);
        repositories.push(...facts.repositories);
        unresolved.push(...facts.unresolved);
    }
    entities.sort((a, b) => cmp(a.relPath, b.relPath) || cmp(a.className, b.className));
    repositories.sort((a, b) => cmp(a.relPath, b.relPath) || cmp(a.className, b.className));
    unresolved.sort((a, b) => cmp(a.ref, b.ref) || cmp(a.reason, b.reason));
    return JpaModelSchema.parse({
        schemaVersion: 1,
        gitCommit: gitCommitHash(projectRoot),
        entities,
        repositories,
        unresolved,
    });
}
//# sourceMappingURL=extract.js.map