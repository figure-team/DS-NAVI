/**
 * DB 스키마 스캐너(정책서 P0) — census 의 .sql 파일을 정적 파싱해 db-schema.json 생성.
 *
 * 3-Tier 자산 게이팅:
 *  - 사용 가능한 구조(테이블)가 하나라도 추출되면 tier = 'ddl+data'(데이터 행 있음) | 'ddl'.
 *  - .sql 이 없거나 추출 0이면 JPA/MyBatis 코드 역추론 폴백(code-infer.ts)으로 tables 를
 *    채우고 tier = 'code-inferred'(근사·origin 표기). 역추론도 빈손이면 'code-only'.
 *    DDL 이 생기면 역추론은 실행되지 않는다(상위 = 진실 소스, 하위 = 임시 근사).
 *
 * 정직성: 파일별 파싱 실패는 throw 하지 않고 unresolved 로 격리(jpa/extract 와 동일 규약).
 * 결정론: 테이블은 name 정렬, 컬럼·제약·행은 등장 순서 보존, unresolved 정렬.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitCommitHash } from '../domain-map/persist.js';
import { inferTablesFromCode } from './code-infer.js';
import { extractDdlFromSource } from './ddl-scan.js';
import { extractDataloadFromSource } from './dataload-scan.js';
import { discoverLiveDbSignals } from './discover.js';
import { DbSchemaModelSchema, DATALOAD_ROW_CAP } from './types.js';
/** W8 캐시 섹션 salt — ddl-scan/dataload-scan 의 파싱 의미가 바뀌면 bump. v3: DbTable.origin 추가. */
const SQL_FACTS_SALT = 'v3';
function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** 코드/룩업 테이블 휴리스틱 — 명명 패턴 또는 (코드컬럼 + 라벨컬럼) 동반. 판정 사유 반환(미해당 null). */
const CODE_NAME_RE = /(^|_)(code|cd|codes|type|types|status|common|comm|grp|group|category|categories|lookup|kind)(_|$)/i;
function codeTableReasonOf(table) {
    const m = CODE_NAME_RE.exec(table.name);
    if (m)
        return `테이블명 패턴 '${m[2].toLowerCase()}'`;
    const codeCol = table.columns.find((c) => {
        const n = c.name.toLowerCase();
        return n === 'code' || n === 'cd' || /(_cd|_code|code|cd)$/.test(n);
    });
    const labelCol = table.columns.find((c) => {
        const n = c.name.toLowerCase();
        return /(name|nm|label|desc|title)$/.test(n) || n === 'name';
    });
    return codeCol && labelCol ? `코드컬럼 '${codeCol.name}' + 라벨컬럼 '${labelCol.name}'` : null;
}
/**
 * 중복 CREATE TABLE 구조 비교 — 채택 정의(kept) 대비 중복 정의(dup)의 차이 요약 목록(비었으면 동일).
 * 비교 대상: 컬럼(type·NULL·키·DEFAULT)·PK·UNIQUE·FK·CHECK·INDEX. 이름 소문자 정규화,
 * 그룹은 정렬 후 서명 비교. relPath·line·comment 는 제외(방언 파일 간 무의미 차이).
 */
function diffTableDefs(kept, dup) {
    const diffs = [];
    const lc = (s) => s.toLowerCase();
    const norm = (s) => (s ?? '').replace(/\s+/g, '').toUpperCase();
    const effPk = (t, c) => c.primaryKey || t.primaryKey.some((p) => lc(p) === lc(c.name));
    const keptCols = new Map(kept.columns.map((c) => [lc(c.name), c]));
    const dupCols = new Map(dup.columns.map((c) => [lc(c.name), c]));
    for (const [k, dc] of dupCols) {
        const kc = keptCols.get(k);
        if (!kc) {
            diffs.push(`컬럼 추가 '${dc.name}'`);
        }
        else if (norm(kc.type) !== norm(dc.type)) {
            diffs.push(`컬럼 상이 '${dc.name}'(type ${kc.type}≠${dc.type})`);
        }
        else if (kc.nullable !== dc.nullable) {
            diffs.push(`컬럼 상이 '${dc.name}'(NULL 제약)`);
        }
        else if (effPk(kept, kc) !== effPk(dup, dc) || kc.unique !== dc.unique) {
            diffs.push(`컬럼 상이 '${dc.name}'(키 제약)`);
        }
        else if (norm(kc.default) !== norm(dc.default)) {
            diffs.push(`컬럼 상이 '${dc.name}'(DEFAULT)`);
        }
    }
    for (const [k, kc] of keptCols)
        if (!dupCols.has(k))
            diffs.push(`컬럼 누락 '${kc.name}'`);
    const pkSig = (t) => [...new Set([...t.primaryKey.map(lc), ...t.columns.filter((c) => c.primaryKey).map((c) => lc(c.name))])]
        .sort()
        .join(',');
    if (pkSig(kept) !== pkSig(dup))
        diffs.push('PK 상이');
    const groupSig = (groups) => groups.map((g) => g.map(lc).sort().join('+')).sort().join('|');
    if (groupSig(kept.uniques) !== groupSig(dup.uniques))
        diffs.push('UNIQUE 상이');
    const fkSig = (t) => t.foreignKeys
        .map((f) => `${f.columns.map(lc).sort().join('+')}>${lc(f.refTable)}(${f.refColumns.map(lc).sort().join('+')})`)
        .sort()
        .join('|');
    if (fkSig(kept) !== fkSig(dup))
        diffs.push('FK 상이');
    const checkSig = (t) => t.checks.map((c) => norm(c.expression)).sort().join('|');
    if (checkSig(kept) !== checkSig(dup))
        diffs.push('CHECK 상이');
    const idxSig = (t) => t.indexes.map((i) => `${i.columns.map(lc).sort().join('+')}:${i.unique}`).sort().join('|');
    if (idxSig(kept) !== idxSig(dup))
        diffs.push('INDEX 상이');
    return diffs;
}
/**
 * census 의 .sql 파일을 파싱해 DB 스키마 모델 생성.
 * jpaModel 은 code-inferred 폴백의 JPA 소스(선택 — 없으면 MyBatis 역추론만).
 */
export function extractDbSchema(projectRoot, census, cache, jpaModel) {
    const tableByKey = new Map();
    const unresolved = [];
    let sqlFileCount = 0;
    const key = (name) => name.toLowerCase();
    const sqlSec = cache?.section('sql-facts', SQL_FACTS_SALT);
    // 파일별 팩트 수집 — 캐시 히트는 판독·파싱 생략(null 캐시 = 판독 실패, 카운트 제외 동일).
    const fileFacts = [];
    for (const f of census.files) {
        if (f.lang !== 'sql')
            continue;
        sqlFileCount++;
        const hit = sqlSec?.get(f.relPath);
        if (hit !== undefined) {
            if (hit === null)
                sqlFileCount--;
            else
                fileFacts.push({ relPath: f.relPath, facts: hit });
            continue;
        }
        let source;
        try {
            source = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            sqlFileCount--;
            // null 캐시는 fingerprint 도 'absent' 일 때만(일시 오류 박제 방지, 리뷰 R2).
            if (cache?.isAbsent(f.relPath))
                sqlSec?.put(f.relPath, null);
            continue;
        }
        const facts = { ddl: null, ddlError: null, inserts: null, insertsError: null };
        try {
            facts.ddl = extractDdlFromSource(source, f.relPath);
        }
        catch (err) {
            facts.ddlError = err.message;
        }
        try {
            facts.inserts = extractDataloadFromSource(source);
        }
        catch (err) {
            facts.insertsError = err.message;
        }
        sqlSec?.put(f.relPath, facts);
        fileFacts.push({ relPath: f.relPath, facts });
    }
    // 패스 1: 모든 DDL(테이블) 수집 — dataload 합성이 실제 DDL 을 가리지 않게 선행.
    const pendingComments = [];
    for (const { relPath, facts } of fileFacts) {
        if (facts.ddlError !== null) {
            unresolved.push({ ref: relPath, reason: `DDL 파싱 실패: ${facts.ddlError}` });
            continue;
        }
        if (facts.ddl === null)
            continue;
        const { tables, comments } = facts.ddl;
        for (const t of tables) {
            const k = key(t.name);
            if (tableByKey.has(k)) {
                // 구조 diff — 동일 정의(방언별 부트스트랩 중복 등)는 info 로 강등, 상이만 warn 유지.
                const diffs = diffTableDefs(tableByKey.get(k), t);
                if (diffs.length === 0) {
                    unresolved.push({ ref: `${relPath}:${t.name}`, reason: '중복 CREATE TABLE(동일 정의·첫 정의 유지)', severity: 'info' });
                }
                else {
                    const head = diffs.slice(0, 3).join(', ');
                    const rest = diffs.length > 3 ? ` 외 ${diffs.length - 3}건` : '';
                    unresolved.push({
                        ref: `${relPath}:${t.name}`,
                        reason: `중복 CREATE TABLE(정의 상이·첫 정의 유지) — ${head}${rest}`,
                        severity: 'warn',
                    });
                }
                continue;
            }
            tableByKey.set(k, t);
        }
        for (const c of comments)
            pendingComments.push({ relPath, ...c });
    }
    // 패스 1b: COMMENT ON 부착(모든 CREATE 수집 후 — 파일 경계 무관).
    for (const c of pendingComments) {
        const t = tableByKey.get(key(c.table));
        if (!t) {
            unresolved.push({ ref: `${c.relPath}:COMMENT ${c.table}`, reason: '미발견 테이블에 COMMENT' });
            continue;
        }
        if (c.column === null) {
            if (t.comment === null)
                t.comment = c.text;
        }
        else {
            const col = t.columns.find((cc) => key(cc.name) === key(c.column));
            if (col && col.comment === null)
                col.comment = c.text;
            else if (!col)
                unresolved.push({ ref: `${c.relPath}:COMMENT ${c.table}.${c.column}`, reason: '미발견 컬럼에 COMMENT' });
        }
    }
    // 패스 2: dataload INSERT(실제 DDL 테이블 존재 후 부착·합성).
    for (const { relPath: f_relPath, facts } of fileFacts) {
        if (facts.insertsError !== null) {
            unresolved.push({ ref: f_relPath, reason: `dataload 파싱 실패: ${facts.insertsError}` });
            continue;
        }
        for (const ins of facts.inserts ?? []) {
            const k = key(ins.table);
            let t = tableByKey.get(k);
            if (!t) {
                // DDL 없는 dataload-only 테이블 — 데이터 보존 위해 합성(컬럼은 INSERT 기준).
                t = {
                    name: ins.table,
                    relPath: f_relPath,
                    line: ins.line,
                    comment: null,
                    columns: (ins.columns ?? ins.values.map((_, i) => `col${i}`)).map((n) => ({
                        name: n,
                        type: 'UNKNOWN',
                        nullable: true,
                        primaryKey: false,
                        unique: false,
                        default: null,
                        comment: null,
                        line: ins.line,
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
                    origin: 'sql',
                };
                tableByKey.set(k, t);
            }
            const colNames = ins.columns ?? t.columns.map((c) => c.name);
            t.rowCount++;
            if (t.rows.length < DATALOAD_ROW_CAP) {
                const values = {};
                ins.values.forEach((v, i) => {
                    values[colNames[i] ?? `col${i}`] = v;
                });
                t.rows.push({ values, line: ins.line });
            }
        }
    }
    let tables = [...tableByKey.values()];
    let tier;
    if (tables.length === 0) {
        // Tier 3 폴백 — .sql 자산 전무 시에만 JPA/MyBatis 역추론(상위 tier 게이팅).
        const inferred = inferTablesFromCode(projectRoot, census, jpaModel, cache);
        tables = inferred.tables;
        tier = tables.length === 0 ? 'code-only' : 'code-inferred';
        if (tables.length > 0) {
            unresolved.push({
                ref: '(code-infer)',
                reason: `.sql 부재 — 테이블 ${tables.length}개 역추론(MyBatis ${inferred.fromMyBatis}개/매퍼 XML ${inferred.mapperCount}개 · JPA 엔티티 ${inferred.fromJpa}개). 구조 근사이며 DDL 확보 시 자동 대체.`,
                severity: 'info',
            });
        }
    }
    else {
        const hasData = tables.some((t) => t.rowCount > 0);
        tier = hasData ? 'ddl+data' : 'ddl';
    }
    for (const t of tables) {
        t.codeTableReason = codeTableReasonOf(t);
        t.isCodeTable = t.codeTableReason !== null;
    }
    tables.sort((a, b) => cmp(a.name, b.name) || cmp(a.relPath, b.relPath));
    unresolved.sort((a, b) => cmp(a.ref, b.ref) || cmp(a.reason, b.reason));
    // 라이브 DB 연결 신호(정적 탐지, 무연결) — .sql 유무와 별개로 항상 수집.
    const liveDbSignals = discoverLiveDbSignals(projectRoot, census);
    return DbSchemaModelSchema.parse({
        schemaVersion: 1,
        gitCommit: gitCommitHash(projectRoot),
        tier,
        sqlFileCount,
        tables,
        liveDbSignals,
        unresolved,
    });
}
//# sourceMappingURL=extract.js.map