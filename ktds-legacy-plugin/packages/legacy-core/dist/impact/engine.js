/**
 * 영향도 엔진 조립 + 결정론. 순수 조립(buildImpactReport)과 동기 IO 래퍼
 * (analyzeImpact)를 분리한다. 엔진은 `.spec/map/` 영속 산출물을 재스캔 0회로 로드하고,
 * 모든 사실은 정렬·무타임스탬프라 동일 seeds+commit 이면 impact.json byte-diff=0.
 *
 * 의미론: upstream(역방향)→API/흐름 영향, downstream(정방향)→DB/영속성 영향.
 * 인용은 {filePath,line} 앵커만 impact.json 에 담고(경량), 스니펫은 검증 시점에만
 * 채워 impact-verify-report.json 에 기록한다.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { CensusReportSchema, EdgesReportSchema, RoutesReportSchema, SlicesReportSchema, } from '../domain-map/types.js';
import { CENSUS_FILENAME, EDGES_FILENAME, ROUTES_FILENAME, SLICES_FILENAME, readConfirmedPlan, readMapArtifact, readSkeleton, uaDir, writeMapArtifact, } from '../domain-map/persist.js';
import { JPA_MODEL_FILENAME, JpaModelSchema } from '../jpa/types.js';
import { buildAdjacency, computeFanIn, reachClosure } from './reach.js';
import { computeApiImpact } from './api.js';
import { computePersistenceImpact } from './persistence.js';
import { computeFlowImpact } from './flow.js';
import { IMPACT_VERIFY_FILENAME, verifyImpactClaims, } from './verify.js';
import { IMPACT_REPORT_FILENAME, ImpactOptionsSchema, ImpactResultSchema, } from './types.js';
import { cmp } from '../utils/cmp.js';
export class ImpactInputMissingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ImpactInputMissingError';
    }
}
// ── 입력 로드(재스캔 0회) ──────────────────────────────────────────────────
function readRequired(projectRoot, filename, schema) {
    const parsed = readMapArtifact(projectRoot, filename, schema);
    if (parsed === null) {
        throw new ImpactInputMissingError(`${filename} 없음 — 먼저 /understand-map scan을 실행하세요(.spec/map/ 산출물 필요)`);
    }
    return parsed;
}
export function loadImpactInputs(projectRoot) {
    const census = readRequired(projectRoot, CENSUS_FILENAME, CensusReportSchema);
    const routes = readRequired(projectRoot, ROUTES_FILENAME, RoutesReportSchema);
    const edges = readRequired(projectRoot, EDGES_FILENAME, EdgesReportSchema);
    const slices = readRequired(projectRoot, SLICES_FILENAME, SlicesReportSchema);
    const skeleton = readSkeleton(projectRoot);
    const confirmed = readConfirmedPlan(projectRoot);
    const jpaModel = readMapArtifact(projectRoot, JPA_MODEL_FILENAME, JpaModelSchema);
    return { census, routes, edges, slices, skeleton, confirmed, jpaModel, gitCommit: census.gitCommit };
}
/** KG table 노드 → DDL 근거 카탈로그(없으면 빈 배열). related 엣지는 채택 안 함. */
export function loadKgTableCatalog(projectRoot) {
    const p = join(uaDir(projectRoot), 'knowledge-graph.json');
    let raw;
    try {
        raw = readFileSync(p, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return [];
        throw err;
    }
    let g;
    try {
        g = JSON.parse(raw);
    }
    catch {
        return [];
    }
    const out = [];
    for (const n of g.nodes ?? []) {
        if (n.type !== 'table' || typeof n.filePath !== 'string' || typeof n.name !== 'string')
            continue;
        const lr = Array.isArray(n.lineRange) && n.lineRange.length === 2 ? n.lineRange : null;
        out.push({
            name: n.name,
            filePath: n.filePath,
            startLine: typeof lr?.[0] === 'number' ? lr[0] : null,
            endLine: typeof lr?.[1] === 'number' ? lr[1] : null,
        });
    }
    return out;
}
/** `<mapper namespace="...">` 첫 매치 추출(없으면 null). 결정론(텍스트의 함수). */
function extractMapperNamespace(xml) {
    const m = xml.match(/<mapper\b[^>]*\bnamespace\s*=\s*["']([^"']+)["']/);
    return m ? m[1] : null;
}
/** 매퍼 XML(엣지 target)을 읽어 namespace·라인수 인덱스 산출(IO). */
export function buildMapperInfo(projectRoot, edges) {
    const targets = new Set();
    for (const e of edges) {
        if (e.kind === 'mybatis' || e.kind === 'mapper-xml')
            targets.add(e.target);
    }
    const mapperNamespaceByPath = new Map();
    const mapperLineCounts = new Map();
    for (const rel of [...targets].sort(cmp)) {
        try {
            const c = readFileSync(join(projectRoot, rel), 'utf8');
            mapperLineCounts.set(rel, c.split('\n').length);
            const ns = extractMapperNamespace(c);
            if (ns !== null)
                mapperNamespaceByPath.set(rel, ns);
        }
        catch {
            /* 읽기 실패한 매퍼는 namespace 미상(null) + 슬롯 생략 */
        }
    }
    return { mapperNamespaceByPath, mapperLineCounts };
}
// ── 순수 조립 ─────────────────────────────────────────────────────────────────
function toAffected(r) {
    return {
        relPath: r.relPath,
        viaKinds: r.viaKinds,
        minDepth: r.minDepth,
        citation: r.citation ? { filePath: r.citation.filePath, line: r.citation.line } : null,
    };
}
export function buildImpactReport(inputs, seeds, options, extras) {
    const seedsSorted = [...seeds].sort((a, b) => cmp(a.relPath, b.relPath));
    const seedPaths = seedsSorted.map((s) => s.relPath);
    const allowed = new Set(options.edgeKinds);
    const revAdj = buildAdjacency(inputs.edges.edges, allowed, 'reverse');
    const fwdAdj = buildAdjacency(inputs.edges.edges, allowed, 'forward');
    const upstream = reachClosure(seedPaths, revAdj, options.depthCap);
    const downstream = reachClosure(seedPaths, fwdAdj, options.depthCap);
    const upstreamPaths = upstream.map((r) => r.relPath);
    const downstreamPaths = downstream.map((r) => r.relPath);
    const flowSet = new Set([...seedPaths, ...upstreamPaths]);
    const dataSet = new Set([...seedPaths, ...downstreamPaths]);
    const apiRes = computeApiImpact(seedPaths, upstreamPaths, inputs.slices.ownership, inputs.routes.routes, inputs.routes.batchEntries);
    const persistence = computePersistenceImpact(dataSet, inputs.edges.edges, inputs.census.files, {
        mapperNamespaceByPath: extras.mapperNamespaceByPath,
        mapperLineCounts: extras.mapperLineCounts,
        ownership: inputs.slices.ownership,
        kgTableCatalog: extras.kgTableCatalog,
        jpaModel: inputs.jpaModel,
    });
    const flowRes = computeFlowImpact(flowSet, inputs.skeleton, inputs.slices.ownership, inputs.routes.routes, inputs.confirmed);
    // 과도전파 투명 보고
    const fanIn = computeFanIn(inputs.edges.edges, allowed);
    const closureFiles = new Set([...upstreamPaths, ...downstreamPaths]);
    const hubNodes = [...closureFiles]
        .filter((f) => (fanIn.get(f) ?? 0) > options.fanInThreshold)
        .map((f) => ({ relPath: f, fanIn: fanIn.get(f) }))
        .sort((a, b) => cmp(a.relPath, b.relPath));
    // import-only(약신호)로만 도달하는 "숨은" 의존 파일 수. import 옵트인 폐포에서
    // 강신호 폐포를 뺀 차. import 가 이미 활성이면 0(숨김 없음).
    let importOnlyCount;
    if (allowed.has('import')) {
        importOnlyCount = 0;
    }
    else {
        const withImport = new Set(allowed);
        withImport.add('import');
        const upI = reachClosure(seedPaths, buildAdjacency(inputs.edges.edges, withImport, 'reverse'), options.depthCap);
        const dnI = reachClosure(seedPaths, buildAdjacency(inputs.edges.edges, withImport, 'forward'), options.depthCap);
        const hidden = new Set([...upI, ...dnI].map((r) => r.relPath));
        for (const f of closureFiles)
            hidden.delete(f);
        importOnlyCount = hidden.size;
    }
    // needsReview 집계 + dedup + 정렬
    const langByFile = new Map(inputs.census.files.map((f) => [f.relPath, f.lang]));
    const needsReview = [...flowRes.needsReview];
    for (const d of apiRes.crossCheckDiff) {
        needsReview.push({ ref: d.id, reason: `API 교차검증 불일치 (${d.side})` });
    }
    for (const s of seedsSorted) {
        const lang = langByFile.get(s.relPath);
        if (lang === undefined) {
            needsReview.push({ ref: s.relPath, reason: '시드가 census에 없음 — 경로 확인' });
        }
        else if (lang !== 'java') {
            needsReview.push({
                ref: s.relPath,
                reason: `비-Java 시드(${lang}) — edges가 java 기반이라 역방향 영향 빈약, host 보강 권장`,
            });
        }
        if (s.confidence === 'UNVERIFIED') {
            needsReview.push({ ref: s.relPath, reason: '시드 매핑 신뢰도 낮음(host 자연어 추론) — 확인 필요' });
        }
    }
    for (const h of hubNodes) {
        needsReview.push({ ref: h.relPath, reason: `hub(fan-in ${h.fanIn}) 경유 — 영향 과대 추정 가능` });
    }
    const slotMappers = new Set(persistence.tableCandidateSlots.map((s) => s.mapperRelPath));
    for (const m of persistence.mappers) {
        if (!slotMappers.has(m.relPath)) {
            needsReview.push({
                ref: m.relPath,
                reason: '매퍼 파일 읽기 실패 — 테이블 추출 슬라이스 없음(전체 파일 확인)',
            });
        }
    }
    const seen = new Set();
    const dedupNR = needsReview
        .filter((n) => {
        const k = `${n.ref} ${n.reason}`;
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    })
        .sort((a, b) => cmp(a.ref, b.ref) || cmp(a.reason, b.reason));
    return ImpactResultSchema.parse({
        schemaVersion: 1,
        gitCommit: inputs.gitCommit,
        depthCap: options.depthCap,
        edgeKinds: options.edgeKinds,
        fanInThreshold: options.fanInThreshold,
        seeds: seedsSorted,
        upstream: {
            files: upstream.map(toAffected),
            api: apiRes.api,
            persistence,
            flows: flowRes.flows,
            domains: flowRes.domains,
        },
        downstream: { files: downstream.map(toAffected) },
        overEdges: { hubNodes, importOnlyCount, crossCheckDiff: apiRes.crossCheckDiff },
        needsReview: dedupNR,
    });
}
// ── 검증 준비(스니펫 채움 = IO) ──────────────────────────────────────────────
// 인용은 반드시 **사본**으로 담는다: fillClaimSnippets 가 snippet 을 채우는데,
// result 의 citation 을 참조 공유하면 result 자체가 변이돼 직렬화가 "앵커만" 계약을 깬다.
export function buildClaimItems(result) {
    const copy = (c) => ({ filePath: c.filePath, line: c.line });
    const items = [];
    for (const f of result.upstream.files) {
        items.push({
            kind: 'upstream',
            ref: f.relPath,
            text: `상류 영향 파일: ${f.relPath}`,
            citations: f.citation ? [copy(f.citation)] : [],
        });
    }
    for (const f of result.downstream.files) {
        items.push({
            kind: 'downstream',
            ref: f.relPath,
            text: `하류 의존 파일: ${f.relPath}`,
            citations: f.citation ? [copy(f.citation)] : [],
        });
    }
    for (const a of result.upstream.api) {
        items.push({
            kind: 'api',
            ref: a.id,
            text: `진입점 영향: ${a.id}`,
            citations: [{ filePath: a.filePath, line: a.line }],
        });
    }
    for (const m of result.upstream.persistence.mappers) {
        items.push({
            kind: 'mapper',
            ref: m.relPath,
            text: `영속성 영향: ${m.relPath}`,
            citations: m.citation ? [copy(m.citation)] : [],
        });
    }
    for (const s of result.upstream.persistence.sqlFiles) {
        items.push({ kind: 'sql', ref: s.relPath, text: `영속성(SQL): ${s.relPath}`, citations: [] });
    }
    for (const fl of result.upstream.flows) {
        items.push({ kind: 'flow', ref: fl.flowId, text: `흐름 영향: ${fl.flowId}`, citations: [] });
    }
    for (const d of result.upstream.domains) {
        items.push({
            kind: 'domain',
            ref: d.domainId ?? d.key,
            text: `도메인 영향: ${d.key}`,
            citations: [],
        });
    }
    return items;
}
/** 인용 라인의 실제 텍스트로 snippet 채움(루트 밖 경로는 건너뜀 → verify 가 path-escape). */
export function fillClaimSnippets(projectRoot, items) {
    const rootAbs = resolve(projectRoot);
    const cache = new Map();
    for (const item of items) {
        for (const c of item.citations) {
            const abs = resolve(projectRoot, c.filePath);
            if (abs !== rootAbs && !abs.startsWith(rootAbs + sep))
                continue; // path-escape(어휘적)
            let lines = cache.get(abs);
            if (lines === undefined) {
                try {
                    // verifyCitation 과 동일 inode 를 읽도록 realpath 경유 + 심볼릭 탈출 가드.
                    const real = realpathSync(abs);
                    const realRoot = realpathSync(rootAbs);
                    lines =
                        real === realRoot || real.startsWith(realRoot + sep)
                            ? readFileSync(real, 'utf8').split('\n')
                            : null;
                }
                catch {
                    lines = null;
                }
                cache.set(abs, lines);
            }
            if (lines && c.line >= 1 && c.line <= lines.length)
                c.snippet = lines[c.line - 1];
        }
    }
}
// ── IO 래퍼 ───────────────────────────────────────────────────────────────────
export function analyzeImpact(projectRoot, seeds, optionsInput, 
/** 산출물 파일명 오버라이드 — SR 보관 등에서 사용. */
artifacts) {
    const inputs = loadImpactInputs(projectRoot);
    const options = ImpactOptionsSchema.parse(optionsInput ?? {});
    const kgTableCatalog = loadKgTableCatalog(projectRoot);
    const { mapperNamespaceByPath, mapperLineCounts } = buildMapperInfo(projectRoot, inputs.edges.edges);
    const result = buildImpactReport(inputs, seeds, options, {
        kgTableCatalog,
        mapperNamespaceByPath,
        mapperLineCounts,
    });
    const impactPath = writeMapArtifact(projectRoot, artifacts?.reportFilename ?? IMPACT_REPORT_FILENAME, result);
    const items = buildClaimItems(result);
    fillClaimSnippets(projectRoot, items);
    const verify = verifyImpactClaims(projectRoot, items, inputs.gitCommit);
    const verifyPath = writeMapArtifact(projectRoot, artifacts?.verifyFilename ?? IMPACT_VERIFY_FILENAME, verify);
    return { result, verify, impactPath, verifyPath, inputs };
}
//# sourceMappingURL=engine.js.map