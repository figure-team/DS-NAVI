import { nodesOfType } from './shared.js';
import { namespaceBaseName } from '../../mybatis/index.js';
import { isRawSqlModelEmpty } from '../raw-sql.js';
import { reachableMethods } from '../../domain-map/method-calls.js';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** 메서드명 → CRUD 글자(접두 규칙, 폴백 경로). 미상이면 null. */
export function crudOf(method) {
    const m = method.toLowerCase();
    if (/^(insert|save|add|create|regist|new|persist)/.test(m))
        return 'C';
    if (/^(update|modify|edit|set|merge|change)/.test(m))
        return 'U';
    if (/^(delete|remove|drop|destroy|purge)/.test(m))
        return 'D';
    if (/^(select|get|find|list|search|query|count|read|load|exist|fetch|view|retrieve)/.test(m))
        return 'R';
    return null;
}
/**
 * JPA/Spring Data 리포지토리 메서드 → CRUD 글자. crud-matrix(기능×테이블 JPA 경로)와
 * RTM 데이터 축(build-rtm)이 **동일 규약**을 쓰도록 단일 소스로 export 한다(드리프트 차단).
 *
 * @Query 명시 쿼리면 본문 선두 동사(JPQL/native)로 판정 — 이름 규칙보다 우선. 파생쿼리(findByX)는
 * 조회. save/persist 는 업서트라 **C+U**(crudOf 는 save→C 로만 봐 수정 흐름을 전부 Create 로 오표기).
 */
export function jpaCrud(method, repo) {
    const q = repo.queries.find((x) => x.method === method);
    if (q && q.query) {
        const verb = q.query.trimStart().toLowerCase();
        if (verb.startsWith('insert'))
            return 'C';
        if (verb.startsWith('update'))
            return 'U';
        if (verb.startsWith('delete'))
            return 'D';
        if (verb.startsWith('select'))
            return 'R';
    }
    if (repo.derivedQueries.some((d) => d.method === method))
        return 'R';
    if (/^(save|persist|store)/.test(method.toLowerCase()))
        return 'CU';
    return crudOf(method);
}
/**
 * calls 엣지 description 의 사용 메서드들. description 은 "m1 → m2 → m3 …" 형태로 caller 가
 * callee(매퍼) 에서 호출 순서대로 쓰는 **메서드 전부**를 나열한다(skeleton P1). 모든 토큰을
 * 추출한다(매퍼 메서드명 = MyBatis statement id).
 */
function calleeMethods(desc) {
    if (!desc)
        return [];
    return desc.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}
function baseName(filePath) {
    return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '');
}
/** CRUD 글자 집합 → 'CRUD' 정준 순서 문자열. 비었으면 접근표시 '○'. */
function crudCell(letters) {
    if (letters.size === 0)
        return '○';
    return ['C', 'R', 'U', 'D'].filter((l) => letters.has(l)).join('');
}
function doc(columns, rows, prose) {
    return {
        docId: '07_crud-matrix',
        title: 'CRUD 매트릭스',
        methodology: 'as-built',
        sections: [{ heading: 'CRUD 매트릭스', key: 'crud-matrix', claims: [], ...(prose ? { prose } : {}), table: { columns, rows } }],
    };
}
/** 정밀도 caveat — calls 엣지의 사용 메서드 라벨이 파일 단위라, 같은 매퍼를 쓰는 흐름들은
 *  그 매퍼의 CRUD 전체가 귀속될 수 있다(기능별 핸들러 정밀 추적은 후속). */
const TABLE_PROSE = 'CRUD 는 기능이 도달하는 매퍼가 해당 테이블에 수행하는 SQL 문 종류(select=R/insert=C/update=U/delete=D)에서 판정한다. ' +
    '사용 메서드 라벨이 파일 단위이므로 같은 매퍼를 공유하는 기능들은 그 매퍼의 CRUD 전체가 귀속될 수 있다(핸들러 단위 정밀 추적은 후속). 근거=Mapper XML file:line.';
/** 정밀 경로 prose — methodCallGraph 로 핸들러가 실제 호출하는 매퍼 메서드만 귀속. */
const PRECISE_PROSE = 'CRUD 는 기능 핸들러가 실제 호출하는 매퍼 메서드의 SQL 문 종류(select=R/insert=C/update=U/delete=D)에서 판정한다(메서드 호출그래프 정밀 귀속). 근거=Mapper XML file:line.';
/** 흐름 핸들러 메서드 — entryPoint "Class#method" → "method"(없으면 null). */
function bareHandler(entryPoint) {
    if (typeof entryPoint !== 'string')
        return null;
    return entryPoint.includes('#') ? entryPoint.slice(entryPoint.lastIndexOf('#') + 1) : null;
}
/** 기능×테이블 (mybatisModel 기반, SQL 문에서 CRUD 판정 → [확정]). */
function buildByTable(input, model) {
    const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]));
    // 매퍼 basename → {namespace 문맵, relPath}.
    const mapperByBase = new Map();
    for (const m of model.mappers) {
        const stmts = new Map(m.statements.map((s) => [s.id, { crud: s.crud, tables: s.tables, line: s.line }]));
        mapperByBase.set(namespaceBaseName(m.namespace), { stmts, relPath: m.relPath });
    }
    // dao 스텝 id → 사용 메서드(들어오는 calls 의 callee).
    const incoming = new Map();
    for (const e of input.edges) {
        if (e.type !== 'calls')
            continue;
        incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)]);
    }
    const flows = nodesOfType(input.nodes, 'flow');
    const tablesSet = new Set();
    const perFlow = new Map();
    for (const flow of flows) {
        const byTable = new Map();
        const ev = [];
        const evSeen = new Set();
        for (const e of input.edges) {
            if (e.type !== 'flow_step' || e.source !== flow.id)
                continue;
            const step = stepById.get(e.target);
            if (!step || step.layer !== 'dao' || typeof step.filePath !== 'string')
                continue;
            const mapper = mapperByBase.get(baseName(step.filePath));
            if (!mapper)
                continue;
            for (const method of incoming.get(step.id) ?? []) {
                const stmt = mapper.stmts.get(method);
                if (!stmt)
                    continue;
                for (const t of stmt.tables) {
                    tablesSet.add(t);
                    const set = byTable.get(t) ?? new Set();
                    set.add(stmt.crud);
                    byTable.set(t, set);
                }
                const key = `${mapper.relPath}:${stmt.line}`;
                if (!evSeen.has(key)) {
                    evSeen.add(key);
                    ev.push({ file: mapper.relPath, line: stmt.line });
                }
            }
        }
        perFlow.set(flow.id, { byTable, ev });
    }
    const tableCols = [...tablesSet].sort(cmp);
    const columns = ['기능', ...tableCols];
    const rows = flows.map((flow) => {
        const { byTable, ev } = perFlow.get(flow.id);
        const cells = [
            flow.name.length > 0 ? flow.name : flow.id,
            ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)) : '')),
        ];
        // 테이블 접근(근거 보유)이 있으면 CONFIRMED(SQL 문 근거), 없으면 INFERRED(접근 없음).
        return ev.length > 0
            ? { cells, confidence: 'CONFIRMED', evidence: ev }
            : { cells, confidence: 'INFERRED', evidence: [] };
    });
    return doc(columns, rows, TABLE_PROSE);
}
/** 기능×DAO(매퍼) 폴백 — 메서드명 CRUD 추론([추정]). */
function buildByDao(input) {
    const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]));
    const incoming = new Map();
    for (const e of input.edges) {
        if (e.type !== 'calls')
            continue;
        incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)]);
    }
    const flows = nodesOfType(input.nodes, 'flow');
    const daoSet = new Set();
    const perFlow = new Map();
    for (const flow of flows) {
        const perDao = new Map();
        for (const e of input.edges) {
            if (e.type !== 'flow_step' || e.source !== flow.id)
                continue;
            const step = stepById.get(e.target);
            if (!step || step.layer !== 'dao' || typeof step.filePath !== 'string')
                continue;
            const dao = baseName(step.filePath);
            daoSet.add(dao);
            const letters = perDao.get(dao) ?? new Set();
            for (const meth of incoming.get(step.id) ?? []) {
                const c = crudOf(meth);
                if (c)
                    letters.add(c);
            }
            perDao.set(dao, letters);
        }
        perFlow.set(flow.id, perDao);
    }
    const daoCols = [...daoSet].sort(cmp);
    const columns = ['기능', ...daoCols];
    const rows = flows.map((flow) => {
        const perDao = perFlow.get(flow.id);
        const cells = [
            flow.name.length > 0 ? flow.name : flow.id,
            ...daoCols.map((d) => (perDao.has(d) ? crudCell(perDao.get(d)) : '')),
        ];
        return {
            cells,
            confidence: 'INFERRED',
            evidence: typeof flow.filePath === 'string' ? [{ file: flow.filePath, line: flow.lineRange ? flow.lineRange[0] : null }] : [],
        };
    });
    return doc(columns, rows);
}
/** 기능×테이블 (정밀) — 흐름 핸들러에서 methodCallGraph 로 실제 도달하는 매퍼 메서드만 귀속. */
function buildByTablePrecise(input, model, graph) {
    const mapperByBase = new Map();
    for (const m of model.mappers) {
        mapperByBase.set(namespaceBaseName(m.namespace), {
            stmts: new Map(m.statements.map((s) => [s.id, { crud: s.crud, tables: s.tables, line: s.line }])),
            relPath: m.relPath,
        });
    }
    const flows = nodesOfType(input.nodes, 'flow');
    const tablesSet = new Set();
    const perFlow = new Map();
    for (const flow of flows) {
        const byTable = new Map();
        const ev = [];
        const evSeen = new Set();
        const handler = bareHandler(flow.domainMeta?.entryPoint);
        if (handler && typeof flow.filePath === 'string') {
            for (const { file, method } of reachableMethods(graph, flow.filePath, handler)) {
                const mapper = mapperByBase.get(baseName(file));
                if (!mapper)
                    continue;
                const stmt = mapper.stmts.get(method);
                if (!stmt)
                    continue;
                for (const t of stmt.tables) {
                    tablesSet.add(t);
                    const set = byTable.get(t) ?? new Set();
                    set.add(stmt.crud);
                    byTable.set(t, set);
                }
                const key = `${mapper.relPath}:${stmt.line}`;
                if (!evSeen.has(key)) {
                    evSeen.add(key);
                    ev.push({ file: mapper.relPath, line: stmt.line });
                }
            }
        }
        perFlow.set(flow.id, { byTable, ev });
    }
    const tableCols = [...tablesSet].sort(cmp);
    const columns = ['기능', ...tableCols];
    const rows = flows.map((flow) => {
        const { byTable, ev } = perFlow.get(flow.id);
        const cells = [
            flow.name.length > 0 ? flow.name : flow.id,
            ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)) : '')),
        ];
        return ev.length > 0
            ? { cells, confidence: 'CONFIRMED', evidence: ev }
            : { cells, confidence: 'INFERRED', evidence: [] };
    });
    return doc(columns, rows, PRECISE_PROSE);
}
/** 코드 raw SQL prose — 비-MyBatis 영속화의 SQL 문자열에서 CRUD 판정. */
const RAW_SQL_PROSE = 'MyBatis 매퍼가 없어(손수 짠 JDBC/영속화) 코드 내 SQL 문자열에서 테이블·CRUD 를 판정한다 ' +
    '(select/join=R, insert=C, update=U, delete=D). 테이블은 DB 스키마(db-schema)에 실재하는 것만 ' +
    '축으로 세운다. 귀속은 흐름이 도달하는 영속화 파일 단위다(핸들러 단위 정밀 추적은 후속). 근거=소스 file:line.';
/**
 * 기능×테이블 (raw SQL 폴백) — MyBatis·JPA 신호가 없는 손수 짠 영속화 프로젝트용.
 * 흐름이 도달하는 step 의 파일 SQL(rawSqlModel)에서 테이블×CRUD 를 귀속한다.
 * layer 에 의존하지 않는다(영속화 파일이 service 로 오분류돼도 filePath 로 매칭).
 */
function buildByRawSql(input, model) {
    const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]));
    const flows = nodesOfType(input.nodes, 'flow');
    const tablesSet = new Set();
    const perFlow = new Map();
    for (const flow of flows) {
        const byTable = new Map();
        const ev = [];
        const evSeen = new Set();
        for (const e of input.edges) {
            if (e.type !== 'flow_step' || e.source !== flow.id)
                continue;
            const step = stepById.get(e.target);
            if (!step || typeof step.filePath !== 'string')
                continue;
            const accesses = model.byFile[step.filePath];
            if (!accesses)
                continue;
            for (const a of accesses) {
                tablesSet.add(a.table);
                const set = byTable.get(a.table) ?? new Set();
                set.add(a.crud);
                byTable.set(a.table, set);
                const key = `${step.filePath}:${a.line}`;
                if (!evSeen.has(key)) {
                    evSeen.add(key);
                    ev.push({ file: step.filePath, line: a.line });
                }
            }
        }
        perFlow.set(flow.id, { byTable, ev });
    }
    const tableCols = [...tablesSet].sort(cmp);
    const columns = ['기능', ...tableCols];
    const rows = flows.map((flow) => {
        const { byTable, ev } = perFlow.get(flow.id);
        const cells = [
            flow.name.length > 0 ? flow.name : flow.id,
            ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)) : '')),
        ];
        return ev.length > 0
            ? { cells, confidence: 'CONFIRMED', evidence: ev }
            : { cells, confidence: 'INFERRED', evidence: [] };
    });
    return doc(columns, rows, RAW_SQL_PROSE);
}
/** JPA/Spring Data prose — 리포→entity→table 귀속, 호출부 근거. */
const JPA_PROSE = 'CRUD 는 기능 핸들러가 실제 호출하는 Spring Data 리포지토리 메서드에서 판정한다 — @Query 는 SQL 선두 동사, ' +
    '파생쿼리(findByX)는 R, save/persist 는 업서트(C+U). 테이블은 리포지토리의 entity→@Entity/@Table 로 해소한다. ' +
    '귀속은 method-call 그래프의 실제 호출부이며 근거=호출부 file:line(리포 접근 지점).';
/**
 * 기능×테이블 (JPA/Spring Data 폴백) — MyBatis·raw-SQL 신호가 없는 Spring Data 프로젝트용.
 * 흐름 핸들러에서 도달하는 리포지토리 메서드 호출(method-calls)을 리포→entity→table 로 귀속하고,
 * CRUD 는 jpaCrud(호출 메서드)로 판정한다. 근거=실제 호출부 file:line(RTM 데이터 축 DEF-6 과 동일 소스).
 * 도달 테이블이 0이면(리포는 있으나 호출/entity 미해소) 열='기능'만 남는 퇴화 표를 정직하게 낸다
 * (crud-export 가 source='jpa'·degraded·'no-jpa-tables-resolved' 로 보고 — 조용한 퇴화 금지).
 */
function buildByJpa(input, jpa) {
    const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]));
    const incoming = new Map();
    for (const e of input.edges) {
        if (e.type !== 'calls')
            continue;
        incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)]);
    }
    const repoByPath = new Map(jpa.repositories.map((r) => [r.relPath, r]));
    const tableOf = (repo) => {
        if (!repo.entityType)
            return null;
        const e = jpa.entities.find((x) => x.className === repo.entityType);
        return e ? e.tableName : null;
    };
    const flows = nodesOfType(input.nodes, 'flow');
    const tablesSet = new Set();
    const perFlow = new Map();
    for (const flow of flows) {
        const byTable = new Map();
        const ev = [];
        const evSeen = new Set();
        const attribute = (repo, method, evFile, evLine) => {
            const table = tableOf(repo);
            if (!table)
                return;
            const crud = jpaCrud(method, repo);
            if (!crud)
                return;
            tablesSet.add(table);
            const set = byTable.get(table) ?? new Set();
            for (const ch of crud)
                set.add(ch); // 업서트(CU) 등 다글자 → 글자별 편입.
            byTable.set(table, set);
            if (evLine != null) {
                const key = `${evFile}:${evLine}`;
                if (!evSeen.has(key)) {
                    evSeen.add(key);
                    ev.push({ file: evFile, line: evLine });
                }
            }
        };
        const handler = bareHandler(flow.domainMeta?.entryPoint);
        const graph = input.methodCallGraph;
        if (graph && handler && typeof flow.filePath === 'string') {
            // 정밀: 핸들러에서 도달하는 (파일, 메서드) 중 리포지토리 호출 — 호출부 근거.
            const reached = new Set(reachableMethods(graph, flow.filePath, handler).map((m) => `${m.file}\n${m.method}`));
            reached.add(`${flow.filePath}\n${handler}`);
            for (const c of graph.calls) {
                if (c.calleeFile == null)
                    continue;
                const repo = repoByPath.get(c.calleeFile);
                if (!repo)
                    continue;
                if (!reached.has(`${c.callerFile}\n${c.callerMethod}`))
                    continue;
                attribute(repo, c.calleeMethod, c.callerFile, c.callLine);
            }
        }
        else {
            // 폴백: flow_step 스텝이 리포지토리 파일이면 들어오는 calls 메서드로 CRUD.
            for (const e of input.edges) {
                if (e.type !== 'flow_step' || e.source !== flow.id)
                    continue;
                const step = stepById.get(e.target);
                if (!step || typeof step.filePath !== 'string')
                    continue;
                const repo = repoByPath.get(step.filePath);
                if (!repo)
                    continue;
                for (const method of incoming.get(step.id) ?? []) {
                    attribute(repo, method, step.filePath, step.lineRange ? step.lineRange[0] : null);
                }
            }
        }
        perFlow.set(flow.id, { byTable, ev });
    }
    const tableCols = [...tablesSet].sort(cmp);
    const columns = ['기능', ...tableCols];
    const rows = flows.map((flow) => {
        const { byTable, ev } = perFlow.get(flow.id);
        const cells = [
            flow.name.length > 0 ? flow.name : flow.id,
            ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)) : '')),
        ];
        return ev.length > 0
            ? { cells, confidence: 'CONFIRMED', evidence: ev.sort((a, b) => cmp(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0)) }
            : { cells, confidence: 'INFERRED', evidence: [] };
    });
    return doc(columns, rows, JPA_PROSE);
}
export function buildCrudMatrix(input) {
    const model = input.mybatisModel;
    if (model && model.mappers.length > 0) {
        // 정밀(methodCallGraph): 흐름 핸들러가 실제 호출하는 매퍼 메서드만 귀속(과다귀속 해소).
        if (input.methodCallGraph)
            return buildByTablePrecise(input, model, input.methodCallGraph);
        // 폴백: 파일 단위 사용메서드 라벨(과다귀속 가능, caveat).
        return buildByTable(input, model);
    }
    // 비-MyBatis: 코드 raw SQL 로 기능×테이블(db-schema 필터).
    if (!isRawSqlModelEmpty(input.rawSqlModel))
        return buildByRawSql(input, input.rawSqlModel);
    // JPA/Spring Data: 리포→entity→table, 호출부 근거(DEF-6 RTM 데이터 축과 동일 소스). 자바 지배 ORM 축 공백 해소.
    if (input.jpaModel && input.jpaModel.repositories.length > 0)
        return buildByJpa(input, input.jpaModel);
    // 신호 전무: 기능×DAO 폴백([추정]).
    return buildByDao(input);
}
//# sourceMappingURL=crud-matrix.js.map