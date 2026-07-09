/**
 * domain-map 라우트 추출 오케스트레이션.
 *
 * census -> 각 .java 파일 1회 파싱(상수/composed 레지스트리 구축 후 추출) ->
 * Spring 추출 + Next.js 추출 -> routeId 할당 -> 전순서 정렬 ->
 * contextPath 해소 -> routes.json/census.json 기록.
 * 배치(batch)는 @Scheduled / public static void main 만 결정론적으로 탐지한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCensus } from './census.js';
import { extractEdges } from './edges.js';
import { buildSlices } from './slices.js';
import { buildCandidates } from './classify.js';
import { buildMethodCallGraph } from './method-calls.js';
import { readConfirmedPlan, writeCandidates, writeCensus, writeDashboardConfig, writeEdges, writeMapArtifact, writeMethodCalls, writeRoutes, writeSkeleton, writeSlices, } from './persist.js';
import { extractJpaModel } from '../jpa/extract.js';
import { JPA_MODEL_FILENAME } from '../jpa/types.js';
import { extractDbSchema, writeDbSchema } from '../db-schema/index.js';
import { extractInterfaces, INTERFACES_FILENAME } from '../interface-scan/index.js';
import { buildSpringBeanIndex } from '../batch-scan/bean-index.js';
import { resolveBatchHandlers } from '../batch-scan/resolve.js';
import { extractCrontabEntries, extractJavaBatchEntriesW2, extractShellBatchEntries, extractSpringBatchXmlJobs, isCrontabPath, } from '../batch-scan/extract.js';
import { buildBatchJobs, BATCH_JOBS_FILENAME } from '../batch-scan/report.js';
import { buildProgramInventory, PROGRAM_INVENTORY_FILENAME } from '../program-inventory/index.js';
import { buildRiskReport, collectGitChurn, RISK_REPORT_FILENAME } from '../risk-report/index.js';
import { buildCoverageReport } from '../coverage-report/index.js';
import { buildSystemMap, writeSystemMap } from '../system-map/index.js';
import { ScanCacheSession } from '../scan-cache/index.js';
import { readSkeleton } from './persist.js';
/** `.spec/map/` 통합 커버리지 리포트 파일명(보완 D-c). */
export const COVERAGE_FILENAME = 'coverage.json';
/** `.spec/map/` 증분 재스캔용 파일 fingerprint 스냅샷 파일명(보완 D-b). */
export const FINGERPRINTS_FILENAME = 'fingerprints.json';
import { buildSkeleton } from './skeleton.js';
import { emitDomainGraph } from './emit.js';
import { assignRouteIds, sortBatchEntries, sortRoutes } from './route-key.js';
import { parseSource } from './tree-sitter.js';
import { extractNextjsRoutes } from './routes/nextjs.js';
import { extractStripesRoutes } from './routes/stripes.js';
import { extractJspRoutes } from './routes/jsp.js';
import { extractWebXmlRoutesFromCensus } from './routes/web-xml.js';
import { extractJavaBatchEntries, extractXmlBatchEntries } from './routes/batch.js';
import { collectComposedAnnotations, collectConstants, extractSpringRoutes, } from './routes/spring.js';
/**
 * spring-routes 캐시 팩트(W8) — 한 java 파일의 ctx 기여분 + 추출 결과 + consumed-ctx.
 * **salt bump 규약**: 이 형태나 라우트/배치 추출 의미가 바뀌면 SPRING_ROUTES_SALT bump.
 * (이력: v1→v2 — consumed 에 constantsHas 추가 + 기록 래퍼 위반-즉시-실패화, 리뷰 C2.)
 */
const SPRING_ROUTES_SALT = 'v2';
function emptyConsumed() {
    return { constants: {}, constantsHas: {}, composedVerbHas: {}, composedVerb: {}, composedStereotype: {} };
}
/** 기록 래퍼가 지원하지 않는 소비 방식 — 침묵 누락 대신 즉시 실패(비평 C2). */
function unsupportedCtxAccess(what) {
    throw new Error(`[scan-cache] spring ctx 를 ${what} 로 소비하려 했습니다 — consumed-ctx 기록은 get/has 만 ` +
        '지원합니다. spring.ts 의 소비 방식을 바꿨다면 recordingSpringContext/consumedSpringCtxValid 를 ' +
        '함께 재설계하고 SPRING_ROUTES_SALT 를 bump 하세요.');
}
/**
 * 기록용 ctx 래퍼 — extractSpringRoutes 가 실제 조회한 키·결과를 consumed 에 남긴다.
 * get/has 이외의 소비(순회·size·entries 등)는 기록 불가능한 의존이므로 **조용히 틀리는
 * 대신 즉시 던진다**(비평 C2) — 소비 방식이 바뀌면 테스트가 요란하게 실패한다.
 */
function recordingSpringContext(base, rec) {
    const constants = new (class extends Map {
        get(k) {
            const v = base.constants.get(k);
            rec.constants[k] = v ?? null;
            return v;
        }
        has(k) {
            const r = base.constants.has(k);
            rec.constantsHas[k] = r;
            return r;
        }
        get size() {
            return unsupportedCtxAccess('constants.size');
        }
        entries() {
            return unsupportedCtxAccess('constants.entries()');
        }
        keys() {
            return unsupportedCtxAccess('constants.keys()');
        }
        values() {
            return unsupportedCtxAccess('constants.values()');
        }
        forEach() {
            return unsupportedCtxAccess('constants.forEach()');
        }
        [Symbol.iterator]() {
            return unsupportedCtxAccess('constants 순회');
        }
    })();
    const composedVerb = new (class extends Map {
        has(k) {
            const r = base.composedVerb.has(k);
            rec.composedVerbHas[k] = r;
            return r;
        }
        get(k) {
            const v = base.composedVerb.get(k);
            rec.composedVerb[k] = v ?? null;
            return v;
        }
        get size() {
            return unsupportedCtxAccess('composedVerb.size');
        }
        entries() {
            return unsupportedCtxAccess('composedVerb.entries()');
        }
        keys() {
            return unsupportedCtxAccess('composedVerb.keys()');
        }
        values() {
            return unsupportedCtxAccess('composedVerb.values()');
        }
        forEach() {
            return unsupportedCtxAccess('composedVerb.forEach()');
        }
        [Symbol.iterator]() {
            return unsupportedCtxAccess('composedVerb 순회');
        }
    })();
    const composedStereotype = new (class extends Set {
        has(k) {
            const r = base.composedStereotype.has(k);
            rec.composedStereotype[k] = r;
            return r;
        }
        get size() {
            return unsupportedCtxAccess('composedStereotype.size');
        }
        entries() {
            return unsupportedCtxAccess('composedStereotype.entries()');
        }
        keys() {
            return unsupportedCtxAccess('composedStereotype.keys()');
        }
        values() {
            return unsupportedCtxAccess('composedStereotype.values()');
        }
        forEach() {
            return unsupportedCtxAccess('composedStereotype.forEach()');
        }
        [Symbol.iterator]() {
            return unsupportedCtxAccess('composedStereotype 순회');
        }
    })();
    return { constants, composedVerb, composedStereotype };
}
/** 기록된 consumed-ctx 를 새 병합 ctx 에 재생 — 전부 동치면 캐시 라우트 재사용 가능. */
function consumedSpringCtxValid(c, ctx) {
    for (const [k, v] of Object.entries(c.constants)) {
        if ((ctx.constants.get(k) ?? null) !== v)
            return false;
    }
    for (const [k, v] of Object.entries(c.constantsHas ?? {})) {
        if (ctx.constants.has(k) !== v)
            return false;
    }
    for (const [k, v] of Object.entries(c.composedVerbHas)) {
        if (ctx.composedVerb.has(k) !== v)
            return false;
    }
    for (const [k, v] of Object.entries(c.composedVerb)) {
        if ((ctx.composedVerb.get(k) ?? null) !== v)
            return false;
    }
    for (const [k, v] of Object.entries(c.composedStereotype)) {
        if (ctx.composedStereotype.has(k) !== v)
            return false;
    }
    return true;
}
/** 프로젝트 루트에서 라우트/배치 보고를 추출한다(파일 기록 없음). */
export async function extractRoutes(projectRoot, census, cache) {
    const javaFiles = census.files.filter((f) => f.lang === 'java');
    const routeSec = cache?.section('spring-routes', SPRING_ROUTES_SALT);
    // 1) 파일별 준비 — 캐시 히트(내용 해시 일치)는 파싱 생략, 미스만 1회 파싱.
    //    null 캐시 = 판독 실패 파일(기존 동작대로 제외, 매회 재시도 안 함).
    const parsed = new Map();
    const cachedByPath = new Map();
    for (const f of javaFiles) {
        const hit = routeSec?.get(f.relPath);
        if (hit !== undefined) {
            if (hit !== null)
                cachedByPath.set(f.relPath, hit);
            continue;
        }
        try {
            const src = readFileSync(join(projectRoot, f.relPath), 'utf8');
            parsed.set(f.relPath, await parseSource('java', src));
        }
        catch {
            // 파싱 실패 파일은 조용히 건너뛰지 않고 단순 제외(증거 없는 라우트 금지).
            // null 캐시는 fingerprint 도 판독 실패('absent')에 동의할 때만 — 일시 오류가
            // 실제 내용 해시에 "팩트 없음"으로 박제되는 것을 막는다(리뷰 R2).
            if (cache?.isAbsent(f.relPath))
                routeSec?.put(f.relPath, null);
        }
    }
    // 2) 상수 + composed 레지스트리 구축 — census 순서로 파일 기여분을 재생(full 과 동일
    //    순서·동일 override 규칙 → 병합 결과 동일). 신규 파일은 기여분을 지금 수집.
    const ctx = {
        constants: new Map(),
        composedVerb: new Map(),
        composedStereotype: new Set(),
    };
    const freshContrib = new Map();
    for (const f of javaFiles) {
        const hit = cachedByPath.get(f.relPath);
        if (hit) {
            for (const [k, v] of hit.constants)
                ctx.constants.set(k, v);
            for (const [k, v] of hit.composedVerb)
                ctx.composedVerb.set(k, v === null ? undefined : v);
            for (const k of hit.composedStereotype)
                ctx.composedStereotype.add(k);
            continue;
        }
        const root = parsed.get(f.relPath);
        if (!root)
            continue;
        const cMap = new Map();
        const vMap = new Map();
        const sSet = new Set();
        collectConstants(root, cMap);
        collectComposedAnnotations(root, vMap, sSet);
        freshContrib.set(f.relPath, {
            constants: [...cMap],
            composedVerb: [...vMap].map(([k, v]) => [k, v ?? null]),
            composedStereotype: [...sSet],
        });
        for (const [k, v] of cMap)
            ctx.constants.set(k, v);
        for (const [k, v] of vMap)
            ctx.composedVerb.set(k, v);
        for (const k of sSet)
            ctx.composedStereotype.add(k);
    }
    // 3) Java 기반 추출(Spring 라우트 + Stripes 라우트 + Java 배치 진입점).
    //    relPath 정렬 순회로 결정론을 보장한다. 캐시 재사용은 consumed-ctx(그 파일이 실제
    //    조회한 상수/composed)가 새 ctx 에서도 전부 동치일 때만 — 다른 파일의 상수 변경이
    //    이 파일 라우트에 실제 영향을 줄 때만 재추출된다.
    const routes = [];
    const batchEntries = [];
    const sortedJava = [...new Set([...parsed.keys(), ...cachedByPath.keys()])].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    for (const relPath of sortedJava) {
        const hit = cachedByPath.get(relPath);
        if (hit && consumedSpringCtxValid(hit.consumed, ctx)) {
            routes.push(...hit.routes);
            batchEntries.push(...hit.batch);
            continue;
        }
        let root = parsed.get(relPath);
        if (!root) {
            // 내용은 그대로인데 consumed-ctx 무효(다른 파일의 상수 변경) — 이제 파싱 필요.
            try {
                root = await parseSource('java', readFileSync(join(projectRoot, relPath), 'utf8'));
            }
            catch {
                if (cache?.isAbsent(relPath))
                    routeSec?.put(relPath, null);
                continue;
            }
            parsed.set(relPath, root);
        }
        const consumed = emptyConsumed();
        const recCtx = cache ? recordingSpringContext(ctx, consumed) : ctx;
        const fileRoutes = [...extractSpringRoutes(root, relPath, recCtx), ...extractStripesRoutes(root, relPath)];
        // W2: quartz-java / executor / timer 는 extractJavaBatchEntriesW2.
        const fileBatch = [...extractJavaBatchEntries(root, relPath), ...extractJavaBatchEntriesW2(root, relPath)];
        routes.push(...fileRoutes);
        batchEntries.push(...fileBatch);
        if (routeSec) {
            // 기여분은 내용의 순수 함수 — 해시 유효 캐시(ctx 무효 케이스)에서 그대로 승계.
            const contrib = freshContrib.get(relPath) ?? {
                constants: hit.constants,
                composedVerb: hit.composedVerb,
                composedStereotype: hit.composedStereotype,
            };
            routeSec.put(relPath, { ...contrib, routes: fileRoutes, batch: fileBatch, consumed });
        }
    }
    // 4) Next.js 라우트 추출(census 기반).
    routes.push(...(await extractNextjsRoutes(projectRoot, census)));
    // 5) JSP 페이지 + web.xml 서블릿 라우트(census 기반).
    routes.push(...extractJspRoutes(census));
    routes.push(...extractWebXmlRoutesFromCensus(projectRoot, census));
    // 6) XML 배치 진입점(Quartz CronTrigger / task:scheduled). xml census 파일 스캔.
    const sortedXml = census.files
        .filter((f) => f.lang === 'xml')
        .map((f) => f.relPath)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const relPath of sortedXml) {
        let text;
        try {
            text = readFileSync(join(projectRoot, relPath), 'utf8');
        }
        catch {
            continue;
        }
        batchEntries.push(...extractXmlBatchEntries(text, relPath));
        // W2: spring-batch XML 잡(전자정부 배치 표준).
        batchEntries.push(...extractSpringBatchXmlJobs(text, relPath));
    }
    // 6b) W2: shell(java 실행 라인) + crontab. census 전체에서 대상 선별.
    const shellAndCron = census.files
        .filter((f) => f.lang === 'sh' || f.lang === 'bat' || f.lang === 'cmd' || isCrontabPath(f.relPath))
        .map((f) => ({ relPath: f.relPath, lang: f.lang }))
        .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
    for (const f of shellAndCron) {
        let text;
        try {
            text = readFileSync(join(projectRoot, f.relPath), 'utf8');
        }
        catch {
            continue;
        }
        if (isCrontabPath(f.relPath))
            batchEntries.push(...extractCrontabEntries(text, f.relPath));
        else
            batchEntries.push(...extractShellBatchEntries(text, f.relPath));
    }
    // 7) routeId 할당 + 정렬.
    const sortedRoutes = sortRoutes(routes);
    assignRouteIds(sortedRoutes);
    const finalRoutes = sortRoutes(sortedRoutes);
    // 8) W2: 배치 핸들러 해석 — 스프링 빈 인덱스로 XML 엔트리의 잡 클래스 파일을 푼다.
    const beanIndex = buildSpringBeanIndex(projectRoot, census);
    const resolvedBatch = resolveBatchHandlers(batchEntries, beanIndex, census);
    return {
        schemaVersion: 1,
        gitCommit: census.gitCommit,
        contextPath: readContextPath(projectRoot),
        routes: finalRoutes,
        batchEntries: sortBatchEntries(resolvedBatch),
    };
}
/** buildCensus -> extractRoutes -> 기록. census/routes 반환. */
export async function scanRoutes(projectRoot) {
    const census = buildCensus(projectRoot);
    const routes = await extractRoutes(projectRoot, census);
    writeCensus(projectRoot, census);
    writeRoutes(projectRoot, routes);
    return { census, routes };
}
/**
 * 전체 domain-map 스캔: census -> routes -> edges -> slices -> candidates.
 * 다섯 산출물을 `.spec/map/` 에 기록하고 모두 반환한다(결정론).
 * 후보(candidates)는 빌드/기록만 한다 — 확정(confirm)은 별도 사람 게이트 단계다(자동 확정 금지).
 */
export async function scanDomainMap(projectRoot, opts = {}) {
    const census = buildCensus(projectRoot);
    // W8: 파일단위 팩트 캐시 세션 — fingerprint 1회 계산(캐시 검증 + fingerprints.json 공용).
    const scanCache = new ScanCacheSession(projectRoot, census, { read: opts.readCache !== false });
    const routes = await extractRoutes(projectRoot, census, scanCache);
    const edges = await extractEdges(projectRoot, census, scanCache);
    const slices = buildSlices(census, routes, edges);
    const candidates = buildCandidates(census, routes, slices);
    writeCensus(projectRoot, census);
    writeRoutes(projectRoot, routes);
    writeEdges(projectRoot, edges);
    writeSlices(projectRoot, slices);
    writeCandidates(projectRoot, candidates);
    // 보완 B(JPA): jpa-model.json 도 스캔 시 산출 — impact db-grounding 이 동기 로드한다.
    // (JPA 신호 없는 프로젝트는 entities/repositories 빈 배열. MyBatis 와 공존, AC-16b.)
    const jpaModel = await extractJpaModel(projectRoot, census, scanCache);
    writeMapArtifact(projectRoot, JPA_MODEL_FILENAME, jpaModel);
    // PA1: db-schema(정적 .sql DDL/dataload + 라이브 신호 정적 탐지) — map 이 단독 소유.
    // jpa-model 과 동형(census 파생·scan 시점·.spec/map/ 기록). 소비자(docs/policy)는 로드만.
    const dbSchema = extractDbSchema(projectRoot, census, scanCache);
    writeDbSchema(projectRoot, dbSchema);
    // W1: 대외 인터페이스(송신/라우트 외 수신) 스캔 — interfaces.json. 소비자(docs)는 로드만.
    const interfaces = await extractInterfaces(projectRoot, census, scanCache);
    writeMapArtifact(projectRoot, INTERFACES_FILENAME, interfaces);
    // W2: 배치 인벤토리 — batch-jobs.json(내용 파생 안정 id + 도달 범위 + 의심신호).
    const batchJobs = buildBatchJobs(projectRoot, routes.batchEntries, edges, census);
    writeMapArtifact(projectRoot, BATCH_JOBS_FILENAME, batchJobs);
    // W3: 프로그램 목록 + FP 산정 기초 — program-inventory.json(W1/W2 취합).
    const programInventory = buildProgramInventory(projectRoot, {
        census,
        routes,
        edges,
        candidates,
        jpaModel,
        dbSchema,
        interfaces,
        batchJobs,
    });
    writeMapArtifact(projectRoot, PROGRAM_INVENTORY_FILENAME, programInventory);
    // W4: 위험 모듈 리포트 — risk-report.json(지표 백분위 합산, gitCommit 앵커 결정론).
    // 파이프라인 마지막 부가 단계라 실패해도 선행 산출물을 지킨다(null degrade, 리뷰 R2).
    let riskReport = null;
    try {
        riskReport = await buildRiskReport(projectRoot, {
            census,
            edges,
            slices,
            programInventory,
            churn: collectGitChurn(projectRoot),
        }, scanCache);
        writeMapArtifact(projectRoot, RISK_REPORT_FILENAME, riskReport);
    }
    catch (err) {
        console.error(`[risk-report] 산출 실패 — 다른 산출물은 유지: ${err.message}`);
    }
    // 보완 D-c/D-b: 통합 커버리지 리포트 + 파일 fingerprint 스냅샷(증분 재스캔 기준).
    const coverage = buildCoverageReport({
        census,
        routes,
        edges,
        slices,
        skeleton: readSkeleton(projectRoot),
        jpaModel,
        interfaces,
        batchJobs,
        programInventory,
    });
    writeMapArtifact(projectRoot, COVERAGE_FILENAME, coverage);
    // WORK_MAP P2: 시스템 구성도 브리지 — 인터페이스/DB/배치 조인을 대시보드 소비 위치에 기록.
    const systemMap = buildSystemMap({ interfaces, dbSchema, batchJobs });
    writeSystemMap(projectRoot, systemMap);
    // 세션이 스캔 선두에 계산한 동일 함수·동일 census 의 fingerprint 를 그대로 기록.
    writeMapArtifact(projectRoot, FINGERPRINTS_FILENAME, scanCache.fingerprints);
    scanCache.finalize();
    return { census, routes, edges, slices, candidates, dbSchema, interfaces, batchJobs, programInventory, riskReport, scanCache, coverage, systemMap };
}
/**
 * 전체 도메인 맵 빌드 — 스캔 후 확정 플랜이 있으면 skeleton/emit 까지.
 *
 * 1) scanDomainMap(census→routes→edges→slices→candidates, `.spec/map/` 기록).
 * 2) readConfirmedPlan:
 *    - 플랜 있음  → buildSkeleton + emitDomainGraph + writeSkeleton.
 *                   skeleton.json(`.spec/map/`) + domain-graph.json(`.understand-anything/`).
 *    - 플랜 없음  → 스캔 결과만 반환(needsConfirm=true). 자동 확정하지 않는다
 *                   (사람 게이트 필수 — /understand-map confirm).
 */
export async function buildMap(projectRoot, options = {}) {
    const scan = await scanDomainMap(projectRoot);
    const plan = readConfirmedPlan(projectRoot);
    if (!plan) {
        return { needsConfirm: true, ...scan };
    }
    // P3: 메서드 단위 호출 그래프 빌드/기록 후 skeleton refinement 로 전달.
    // 트레이스가 핸들러에서 프로젝트 파일로 해소되면 step 이 메서드 정밀이 되고,
    // 아니면 skeleton 내부에서 슬라이스 파일 단위로 폴백한다(P2 동작 유지).
    const methodCallGraph = await buildMethodCallGraph(projectRoot, scan.census, scan.scanCache);
    // method-calls 의 java-facts 관측까지 반영해 캐시 재기록(finalize 는 멱등).
    scan.scanCache.finalize();
    writeMethodCalls(projectRoot, methodCallGraph);
    const skeleton = await buildSkeleton(projectRoot, {
        census: scan.census,
        routes: scan.routes,
        edges: scan.edges,
        slices: scan.slices,
        candidates: scan.candidates,
        plan,
        methodCallGraph,
    }, options);
    writeSkeleton(projectRoot, skeleton);
    emitDomainGraph(projectRoot, skeleton);
    // 대시보드 UI 언어를 사용자 설정(기본 ko)으로 오버레이 — UA 코어의 "en" 기본 무력화.
    writeDashboardConfig(projectRoot);
    return { needsConfirm: false, ...scan, plan, skeleton, methodCallGraph };
}
/** server.servlet.context-path 를 properties/yaml 에서 best-effort 로 읽는다. */
function readContextPath(projectRoot) {
    const candidates = [
        'src/main/resources/application.properties',
        'src/main/resources/application.yml',
        'src/main/resources/application.yaml',
        'application.properties',
        'application.yml',
        'application.yaml',
    ];
    for (const rel of candidates) {
        const abs = join(projectRoot, rel);
        if (!existsSync(abs))
            continue;
        let text;
        try {
            text = readFileSync(abs, 'utf8');
        }
        catch {
            continue;
        }
        if (rel.endsWith('.properties')) {
            const m = text.match(/^\s*server\.servlet\.context-path\s*[=:]\s*(.+?)\s*$/m);
            if (m)
                return m[1].trim();
        }
        else {
            // 단순 yaml: server: \n  servlet: \n    context-path: /foo
            const m = text.match(/context-path\s*:\s*(.+?)\s*$/m);
            if (m)
                return m[1].trim().replace(/^["']|["']$/g, '');
        }
    }
    return null;
}
//# sourceMappingURL=extract.js.map