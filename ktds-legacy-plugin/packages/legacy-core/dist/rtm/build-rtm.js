import { nodeEvidence } from '../doc-generator/builders/shared.js';
import { namespaceBaseName } from '../mybatis/index.js';
import { reachableMethods } from '../domain-map/method-calls.js';
import { isRawSqlModelEmpty } from '../doc-generator/raw-sql.js';
import { computeCoverage } from './coverage.js';
import { computeDiagnostics } from './validate.js';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** flow id 가 미귀속(어느 도메인 contains_flow 에도 없음)일 때의 가상 도메인. */
const UNASSIGNED_ID = '__unassigned__';
const UNASSIGNED_NAME = '미분류';
function baseName(filePath) {
    return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '');
}
/** "Class#method" → "method"(없으면 null). crud-matrix.bareHandler 와 동일 규약. */
function bareHandler(entryPoint) {
    if (typeof entryPoint !== 'string')
        return null;
    return entryPoint.includes('#') ? entryPoint.slice(entryPoint.lastIndexOf('#') + 1) : null;
}
/** calls 엣지 description("m1 → m2 …")의 메서드 토큰 전부(매퍼 메서드명 = MyBatis statement id). */
function calleeMethods(desc) {
    if (!desc)
        return [];
    return desc.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}
/** CRUD 글자 집합 → 'CRUD' 정준 순서 문자열(비었으면 ''). */
function crudOrder(letters) {
    return ['C', 'R', 'U', 'D'].filter((l) => letters.has(l)).join('');
}
function displayName(node) {
    return node.name.length > 0 ? node.name : node.id;
}
/** 빈/미상 셀(근거 없음). */
function inferredCell(value = '') {
    return { value, confidence: 'INFERRED', evidence: [] };
}
/** 근거 보유 시 CONFIRMED, 아니면 INFERRED(grounding 보존). */
function cellOf(value, evidence) {
    const confidence = evidence.length > 0 ? 'CONFIRMED' : 'INFERRED';
    return { value, confidence, evidence };
}
/** 매퍼 basename → {문맵, relPath}. crud-matrix 와 동일 인덱스. */
function indexMappers(input) {
    const out = new Map();
    const model = input.mybatisModel;
    if (!model)
        return out;
    for (const m of model.mappers) {
        out.set(namespaceBaseName(m.namespace), {
            stmts: new Map(m.statements.map((s) => [s.id, { crud: s.crud, tables: s.tables, line: s.line }])),
            relPath: m.relPath,
        });
    }
    return out;
}
/**
 * 한 flow 의 데이터 셀(테이블×CRUD + 근거). methodCallGraph 가 있으면 핸들러가 실제 호출하는
 * 매퍼 메서드만 귀속(정밀), 없으면 flow_step dao 스텝의 사용 메서드로 폴백(파일 단위).
 * 합성 금지: 근거 없으면 빈 INFERRED.
 */
/**
 * 한 flow 의 데이터 셀 (raw SQL 폴백, 비-MyBatis) — 흐름이 도달하는 step 파일의 코드 SQL
 * (rawSqlModel, db-schema 테이블로 필터)에서 테이블×CRUD 를 귀속한다. crud-matrix buildByRawSql
 * 과 동일 규약. layer 무관(영속화가 service 로 오분류돼도 filePath 매칭). 근거=소스 file:line.
 */
function dataCellFromRawSql(flow, input, stepById) {
    const model = input.rawSqlModel;
    if (isRawSqlModelEmpty(model))
        return inferredCell();
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
    if (byTable.size === 0)
        return inferredCell();
    const value = [...byTable.keys()]
        .sort(cmp)
        .map((t) => `${t}(${crudOrder(byTable.get(t))})`)
        .join(' · ');
    return { value, confidence: 'CONFIRMED', evidence: ev.sort((a, b) => cmp(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0)) };
}
function dataCell(flow, input, mapperByBase, stepById, incoming) {
    // MyBatis 부재 시 코드 raw SQL 폴백(손수 짠 JDBC/Kotlin 영속화). 둘 다 없으면 빈 셀.
    if (mapperByBase.size === 0)
        return dataCellFromRawSql(flow, input, stepById);
    const byTable = new Map();
    const ev = [];
    const evSeen = new Set();
    const addStmt = (stmt, relPath) => {
        for (const t of stmt.tables) {
            const set = byTable.get(t) ?? new Set();
            set.add(stmt.crud);
            byTable.set(t, set);
        }
        const key = `${relPath}:${stmt.line}`;
        if (!evSeen.has(key)) {
            evSeen.add(key);
            ev.push({ file: relPath, line: stmt.line });
        }
    };
    const handler = bareHandler(flow.domainMeta?.entryPoint);
    if (input.methodCallGraph && handler && typeof flow.filePath === 'string') {
        // 정밀: 핸들러에서 도달하는 (파일, 메서드) → 매퍼 문.
        for (const { file, method } of reachableMethods(input.methodCallGraph, flow.filePath, handler)) {
            const mapper = mapperByBase.get(baseName(file));
            const stmt = mapper?.stmts.get(method);
            if (mapper && stmt)
                addStmt(stmt, mapper.relPath);
        }
    }
    else {
        // 폴백: flow_step dao 스텝이 들어오는 calls 로 쓰는 메서드.
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
                if (stmt)
                    addStmt(stmt, mapper.relPath);
            }
        }
    }
    if (byTable.size === 0)
        return inferredCell();
    const value = [...byTable.keys()]
        .sort(cmp)
        .map((t) => `${t}(${crudOrder(byTable.get(t))})`)
        .join(' · ');
    return { value, confidence: 'CONFIRMED', evidence: ev };
}
/** 한 flow 의 진입점 셀 — entryPoint 핸들러 ↔ routes 핸들러 매칭(매칭 시 라우트 file:line). */
function entryPointCell(flow, routeByHandler) {
    const entry = flow.domainMeta?.entryPoint;
    const entryStr = typeof entry === 'string' && entry.length > 0 ? entry : null;
    if (entryStr) {
        const route = routeByHandler.get(entryStr);
        if (route) {
            return { value: `${route.method} ${route.path}`, confidence: 'CONFIRMED', evidence: [{ file: route.file, line: route.line }] };
        }
        // 라우트 미매칭 — 핸들러 문자열 유지, 근거는 flow 노드(핸들러 위치).
        return cellOf(entryStr, nodeEvidence(flow));
    }
    // entryPoint 메타 없음 — 근거 없음.
    return inferredCell();
}
/** 한 flow 의 구현 셀 — 핸들러 파일 + flow_step step 파일(클래스 basename, file:line 근거). */
function implementationCell(flow, input, stepById) {
    const files = new Map(); // relPath → 첫 근거
    const add = (node) => {
        if (typeof node.filePath !== 'string')
            return;
        if (!files.has(node.filePath))
            files.set(node.filePath, { file: node.filePath, line: node.lineRange ? node.lineRange[0] : null });
    };
    add(flow);
    for (const e of input.edges) {
        if (e.type !== 'flow_step' || e.source !== flow.id)
            continue;
        const step = stepById.get(e.target);
        if (step)
            add(step);
    }
    const evidence = [...files.values()].sort((a, b) => cmp(a.file, b.file));
    const value = [...new Set(evidence.map((e) => baseName(e.file)))].sort(cmp).join(', ');
    return cellOf(value, evidence);
}
/**
 * 한 flow 의 테스트 셀 — 흐름의 구현 클래스(핸들러 파일 + step 파일 basename)를 참조하는
 * 테스트 파일을 testLinks 에서 조회한다(RTM 테스트 축). 근거=테스트 file:line. 파일명 관례
 * (`XxxTest`→`Xxx`)면 CONFIRMED(정식 단위테스트), 참조-only 면 INFERRED. 링크 없으면 UNVERIFIED
 * (합성 금지 — 없는 테스트를 지어내지 않는다).
 */
function testCell(flow, input, stepById) {
    const links = input.testLinks;
    if (!links || Object.keys(links.byProdClass).length === 0) {
        return { value: '', confidence: 'UNVERIFIED', evidence: [] };
    }
    // 흐름의 프로덕션 클래스 basename 집합(핸들러 + step 파일).
    const prodClasses = new Set();
    if (typeof flow.filePath === 'string')
        prodClasses.add(baseName(flow.filePath));
    for (const e of input.edges) {
        if (e.type !== 'flow_step' || e.source !== flow.id)
            continue;
        const step = stepById.get(e.target);
        if (step && typeof step.filePath === 'string')
            prodClasses.add(baseName(step.filePath));
    }
    // 링크 수집(테스트 파일 단위 중복 제거 — 여러 클래스를 한 테스트가 참조해도 1건).
    const byTestFile = new Map();
    for (const pc of prodClasses) {
        for (const link of links.byProdClass[pc] ?? []) {
            const prev = byTestFile.get(link.testFile);
            if (!prev || link.convention || link.line < prev.line) {
                byTestFile.set(link.testFile, {
                    testClass: link.testClass,
                    line: link.line,
                    convention: link.convention || (prev?.convention ?? false),
                });
            }
        }
    }
    if (byTestFile.size === 0)
        return { value: '', confidence: 'UNVERIFIED', evidence: [] };
    // 정식 단위테스트(파일명 관례 `XxxTest`)가 하나라도 있으면 그것만 남긴다 — 광역 통합테스트가
    // 공유 클래스를 참조해 과다 링크되는 소음을 줄인다(정밀). 없으면 참조 기반 전부(폭넓은 근사).
    const all = [...byTestFile.entries()];
    const conventional = all.filter(([, v]) => v.convention);
    const chosen = conventional.length > 0 ? conventional : all;
    const entries = chosen.sort((a, b) => cmp(a[0], b[0]));
    const evidence = entries.map(([file, v]) => ({ file, line: v.line }));
    const value = [...new Set(entries.map(([, v]) => v.testClass))].sort(cmp).join(', ');
    const confidence = conventional.length > 0 ? 'CONFIRMED' : 'INFERRED';
    return { value, confidence, evidence };
}
/**
 * AS-IS RTM 모델 빌더. flow 노드를 도메인별로 묶어 기능 행을 만들고 4축을 근거로 채운다.
 * gitCommit 은 호출자가 주입(결정론). requirements=[] (R1).
 */
export function buildRtm(input, gitCommit = null) {
    const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]));
    // dao 스텝 id → 사용 메서드(폴백 데이터 셀용).
    const incoming = new Map();
    for (const e of input.edges) {
        if (e.type !== 'calls')
            continue;
        incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)]);
    }
    // routes 핸들러 → 라우트(진입점 매칭용). 첫 출현 우선(routeId 정렬).
    const routeByHandler = new Map();
    for (const r of [...(input.routes?.routes ?? [])].sort((a, b) => cmp(a.routeId, b.routeId))) {
        if (typeof r.handler === 'string' && r.handler.length > 0 && !routeByHandler.has(r.handler)) {
            routeByHandler.set(r.handler, { method: r.method, path: r.path, file: r.filePath, line: r.line });
        }
    }
    const mapperByBase = indexMappers(input);
    // 도메인 노드 인덱스 + flow→도메인 귀속(contains_flow).
    const domainById = new Map(input.nodes.filter((n) => n.type === 'domain').map((n) => [n.id, n]));
    const domainOfFlow = new Map();
    for (const e of input.edges) {
        if (e.type === 'contains_flow')
            domainOfFlow.set(e.target, e.source);
    }
    const flows = input.nodes.filter((n) => n.type === 'flow').sort((a, b) => cmp(a.id, b.id));
    // 도메인 그룹 키 정렬: 도메인 id ASC, 미귀속은 마지막.
    const groupKeys = [...new Set(flows.map((f) => domainOfFlow.get(f.id) ?? UNASSIGNED_ID))].sort((a, b) => {
        if (a === UNASSIGNED_ID)
            return 1;
        if (b === UNASSIGNED_ID)
            return -1;
        return cmp(a, b);
    });
    const functions = [];
    const domainCounts = new Map();
    let seq = 0;
    for (const gk of groupKeys) {
        const groupFlows = flows.filter((f) => (domainOfFlow.get(f.id) ?? UNASSIGNED_ID) === gk);
        const domainNode = domainById.get(gk);
        const domainName = gk === UNASSIGNED_ID ? UNASSIGNED_NAME : domainNode ? displayName(domainNode) : gk;
        domainCounts.set(gk, groupFlows.length);
        for (const flow of groupFlows) {
            seq += 1;
            const impl = implementationCell(flow, input, stepById);
            functions.push({
                id: flow.id,
                featureId: `FN-${String(seq).padStart(3, '0')}`,
                name: displayName(flow),
                domainId: gk,
                domainName,
                entryPoint: entryPointCell(flow, routeByHandler),
                implementation: impl,
                data: dataCell(flow, input, mapperByBase, stepById, incoming),
                test: testCell(flow, input, stepById),
                origin: 'AS_IS',
                state: impl.evidence.length > 0 ? 'IMPLEMENTED' : 'PLANNED',
                requirementHistory: [],
                nfrTags: [],
                rules: [],
                deliverableRefs: [],
                custom: {},
            });
        }
    }
    const domains = groupKeys.map((gk) => ({
        id: gk,
        name: gk === UNASSIGNED_ID ? UNASSIGNED_NAME : domainById.get(gk) ? displayName(domainById.get(gk)) : gk,
        functionCount: domainCounts.get(gk) ?? 0,
    }));
    // testScenarios 는 여기서 비움 — rules(AC 역참조)가 applyRequirements 뒤에 채워지므로
    // 시나리오 생성은 attachTestScenarios(파이프라인 후단) 몫(W5).
    const model = {
        schemaVersion: 2,
        gitCommit,
        domains,
        functions,
        requirements: [],
        testScenarios: [],
        customFields: [],
    };
    const withCov = { ...model, coverage: computeCoverage(model) };
    return { ...withCov, diagnostics: computeDiagnostics(withCov) };
}
//# sourceMappingURL=build-rtm.js.map