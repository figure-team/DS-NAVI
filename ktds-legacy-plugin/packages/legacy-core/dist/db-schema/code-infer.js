/**
 * 코드 역추론 폴백(Tier 3 = code-inferred) — .sql 자산이 전무할 때 JPA 엔티티와
 * MyBatis 매퍼 XML 에서 테이블을 역추론해 DbTable 로 합성한다. extract.ts 의 자산
 * 게이팅에서만 호출 — DDL(.sql)이 생기면 상위 tier 가 자동 대체(역추론은 근사·비권위).
 *
 * 정직성 규약:
 *  - JPA: @Table/@Column 매핑 그대로(컬럼·PK 있음) → origin='jpa'. 동일 테이블은
 *    매퍼 추론보다 우선(매핑이 더 구조적).
 *  - MyBatis: SQL 문이 참조한 테이블명만 확실. 컬럼은 단일 테이블 문(INSERT 컬럼리스트/
 *    UPDATE SET)에서만 귀속 — 다중 테이블 문 컬럼은 소속 불명이라 버림(합성 금지).
 *  - 코드에 타입/제약 정보 없음 → type='UNKNOWN', nullable=true, 제약 빈 배열.
 * 결정론: 앵커는 (relPath,line) 최소 문, 컬럼 정렬. isCodeTable 판정은 extract.ts 공용
 * 패스가 수행. DUAL 등 의사 테이블은 제외.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMapperXml } from '../mybatis/extract.js';
/** W8 캐시 섹션 salt — parseMapperXml 의 파싱 의미가 바뀌면 bump. */
const MYBATIS_FACTS_SALT = 'v1';
/** SQL 방언 의사 테이블 — 실테이블 아님(FROM DUAL 등). */
const PSEUDO_TABLES = new Set(['DUAL', 'SYSDUAL']);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const minRef = (a, b) => cmp(a.relPath, b.relPath) < 0 || (a.relPath === b.relPath && a.line <= b.line) ? a : b;
/**
 * census 의 매퍼 XML + jpa-model 엔티티 → 역추론 DbTable 목록.
 * 정렬·codeTable 판정은 호출자(extract.ts)의 공용 패스가 수행한다.
 */
export function inferTablesFromCode(projectRoot, census, jpaModel, cache) {
    const key = (n) => n.toLowerCase();
    const byKey = new Map();
    // 1) JPA 엔티티 — 컬럼·PK 매핑이 있어 매퍼 테이블명 추론보다 우선. 동일 테이블을
    //    매핑하는 중복 엔티티는 첫 정의 유지(entities 는 생산자 정렬 → 결정론).
    for (const e of jpaModel?.entities ?? []) {
        const k = key(e.tableName);
        if (byKey.has(k))
            continue;
        const idColumn = e.idField !== null ? (e.columns.find((c) => c.fieldName === e.idField)?.columnName ?? null) : null;
        byKey.set(k, {
            name: e.tableName,
            relPath: e.relPath,
            line: e.line,
            comment: null,
            columns: e.columns.map((c) => ({
                name: c.columnName,
                type: 'UNKNOWN',
                nullable: true,
                primaryKey: e.idField !== null && c.fieldName === e.idField,
                unique: false,
                default: null,
                comment: null,
                line: c.line,
            })),
            primaryKey: idColumn !== null ? [idColumn] : [],
            uniques: [],
            foreignKeys: [],
            checks: [],
            indexes: [],
            isCodeTable: false,
            codeTableReason: null,
            rows: [],
            rowCount: 0,
            origin: 'jpa',
        });
    }
    const fromJpa = byKey.size;
    // 2) MyBatis 매퍼 XML — 파일별 파싱은 내용의 순수 함수라 W8 캐시(비매퍼 XML 은 null 캐시).
    const sec = cache?.section('mybatis-facts', MYBATIS_FACTS_SALT);
    const mappers = [];
    for (const f of census.files) {
        if (f.lang !== 'xml')
            continue;
        const hit = sec?.get(f.relPath);
        if (hit !== undefined) {
            if (hit !== null)
                mappers.push(hit);
            continue;
        }
        let source;
        try {
            source = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            // null 캐시는 fingerprint 도 'absent' 일 때만(일시 오류 박제 방지 — sql-facts 와 동일 규약).
            if (cache?.isAbsent(f.relPath))
                sec?.put(f.relPath, null);
            continue;
        }
        const mapper = parseMapperXml(source, f.relPath);
        sec?.put(f.relPath, mapper);
        if (mapper !== null)
            mappers.push(mapper);
    }
    mappers.sort((a, b) => cmp(a.relPath, b.relPath));
    const anchor = new Map(); // 테이블 key → 최소 (relPath,line) 문 앵커.
    const nameOf = new Map(); // key → 표기 이름(추출기 대문자 보존).
    const colRefs = new Map(); // 테이블 key → 컬럼명 → 최소 앵커.
    for (const m of mappers) {
        for (const s of m.statements) {
            const ref = { relPath: m.relPath, line: s.line };
            for (const t of s.tables) {
                if (PSEUDO_TABLES.has(t))
                    continue;
                const k = key(t);
                anchor.set(k, anchor.has(k) ? minRef(anchor.get(k), ref) : ref);
                if (!nameOf.has(k))
                    nameOf.set(k, t);
                if (s.tables.length === 1 && s.columns.length > 0) {
                    let cols = colRefs.get(k);
                    if (!cols)
                        colRefs.set(k, (cols = new Map()));
                    for (const c of s.columns)
                        cols.set(c, cols.has(c) ? minRef(cols.get(c), ref) : ref);
                }
            }
        }
    }
    let fromMyBatis = 0;
    for (const k of [...anchor.keys()].sort(cmp)) {
        if (byKey.has(k))
            continue; // JPA 정의 우선.
        const ref = anchor.get(k);
        const cols = [...(colRefs.get(k) ?? new Map()).entries()].sort(([a], [b]) => cmp(a, b));
        byKey.set(k, {
            name: nameOf.get(k),
            relPath: ref.relPath,
            line: ref.line,
            comment: null,
            columns: cols.map(([name, r]) => ({
                name,
                type: 'UNKNOWN',
                nullable: true,
                primaryKey: false,
                unique: false,
                default: null,
                comment: null,
                line: r.line,
            })),
            primaryKey: [],
            uniques: [],
            foreignKeys: [],
            checks: [],
            indexes: [],
            isCodeTable: false,
            codeTableReason: null,
            rows: [],
            rowCount: 0,
            origin: 'mybatis',
        });
        fromMyBatis++;
    }
    return { tables: [...byKey.values()], mapperCount: mappers.length, fromJpa, fromMyBatis };
}
//# sourceMappingURL=code-infer.js.map