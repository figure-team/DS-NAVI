/**
 * `.spec/map/` 산출물 IO 헬퍼.
 *
 * 결정론(byte-identical) 보장: stableJson 으로 객체 키를 재귀 정렬하고
 * 2칸 들여쓰기 + 후행 개행으로 직렬화한다(배열 순서는 생산자가 이미 정렬).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadConfig } from '../config/index.js';
import { ConfirmedPlanSchema, SkeletonReportSchema } from './types.js';
/** 확정 플랜 파일명(`.spec/map/` 하위) — S7 사람 게이트 결정의 영속 닻. */
export const CONFIRMED_PLAN_FILENAME = 'domain-plan.confirmed.json';
/** `.spec/map/` 정규 산출물 파일명 — 소비자(impact 엔진 등)가 재스캔 0회로 로드. */
export const CENSUS_FILENAME = 'census.json';
export const ROUTES_FILENAME = 'routes.json';
export const EDGES_FILENAME = 'edges.json';
export const SLICES_FILENAME = 'slices.json';
export const SKELETON_FILENAME = 'skeleton.json';
/** `.spec/map/` 디렉터리 경로. */
export function specMapDir(projectRoot) {
    return join(projectRoot, '.spec', 'map');
}
/**
 * 커밋의 커미터 시각(ISO, UTC 정규화) — emit envelope 의 analyzedAt 결정론 소스.
 * 같은 skeleton(=같은 커밋)이면 언제 emit 해도 같은 값(P5 에서 발견한 벽시계
 * 비결정론 교정 — CLI 의 "재실행 byte-diff=0" 주장과 산출물을 일치시킨다).
 */
export function gitCommitDate(projectRoot, hash) {
    try {
        const out = execFileSync('git', ['-C', projectRoot, 'show', '-s', '--format=%cI', hash], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const iso = out.trim();
        return iso.length > 0 ? new Date(iso).toISOString() : null;
    }
    catch {
        return null;
    }
}
/** 현재 git 커밋 해시(HEAD). git 저장소가 아니거나 실패하면 null. */
export function gitCommitHash(projectRoot) {
    try {
        const out = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const hash = out.trim();
        return hash.length > 0 ? hash : null;
    }
    catch {
        return null;
    }
}
/** 객체 키를 재귀 정렬한 사본을 만든다(배열 순서는 유지). */
function sortKeysDeep(value) {
    if (Array.isArray(value)) {
        return value.map((v) => sortKeysDeep(v));
    }
    if (value !== null && typeof value === 'object') {
        const obj = value;
        const out = {};
        for (const key of Object.keys(obj).sort()) {
            out[key] = sortKeysDeep(obj[key]);
        }
        return out;
    }
    return value;
}
/**
 * 안정 JSON 직렬화 — 키 재귀 정렬, 2칸 들여쓰기, 후행 개행.
 * 동일 입력 -> byte-identical 출력.
 */
export function stableJson(value) {
    return JSON.stringify(sortKeysDeep(value), null, 2) + '\n';
}
/** `.spec/map/<fileName>` 에 안정 JSON 을 기록(`.spec/map/` mkdir -p 선행). */
function writeReport(projectRoot, fileName, report) {
    const dir = specMapDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), stableJson(report), 'utf8');
}
/** census.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeCensus(projectRoot, report) {
    writeReport(projectRoot, 'census.json', report);
}
/** routes.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeRoutes(projectRoot, report) {
    writeReport(projectRoot, 'routes.json', report);
}
/** edges.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeEdges(projectRoot, report) {
    writeReport(projectRoot, 'edges.json', report);
}
/** slices.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeSlices(projectRoot, report) {
    writeReport(projectRoot, 'slices.json', report);
}
/** candidates.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeCandidates(projectRoot, report) {
    writeReport(projectRoot, 'candidates.json', report);
}
/**
 * domain-plan.confirmed.json 기록(`.spec/map/` mkdir -p 선행).
 * 기록한 파일의 절대 경로를 반환한다.
 */
export function writeConfirmedPlan(projectRoot, plan) {
    writeReport(projectRoot, CONFIRMED_PLAN_FILENAME, plan);
    return join(specMapDir(projectRoot), CONFIRMED_PLAN_FILENAME);
}
/**
 * domain-plan.confirmed.json 을 읽는다. 파일이 없으면 null.
 * 권한/IO 오류는 던진다(fail-closed: "미확정"으로 오인하지 않음).
 * 스키마 검증으로 손편집/버전 스큐를 조용히 통과시키지 않는다(zod parse).
 */
export function readConfirmedPlan(projectRoot) {
    const file = join(specMapDir(projectRoot), CONFIRMED_PLAN_FILENAME);
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return null;
        throw err;
    }
    return ConfirmedPlanSchema.parse(JSON.parse(raw));
}
/** skeleton.json 기록(`.spec/map/` mkdir -p 선행) — S6 결정론 골격의 영속. */
export function writeSkeleton(projectRoot, report) {
    writeReport(projectRoot, SKELETON_FILENAME, report);
}
/**
 * skeleton.json 을 읽는다(있으면). 파일 없음 -> null(흐름 영향은 ownership 폴백).
 * 권한/IO 오류는 던진다(fail-closed). zod parse 로 손편집/버전 스큐 차단.
 */
export function readSkeleton(projectRoot) {
    const file = join(specMapDir(projectRoot), SKELETON_FILENAME);
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return null;
        throw err;
    }
    return SkeletonReportSchema.parse(JSON.parse(raw));
}
/**
 * `.spec/map/<fileName>` 에 임의 정규 산출물을 안정 JSON 으로 기록하고 절대 경로를
 * 반환한다(impact.json / impact-verify-report.json 등). 파일명 가드: 경로 세그먼트·
 * 숨김 파일·빈 이름은 거부(fail-closed) — `.spec/map` 밖 탈출 방지.
 */
export function writeMapArtifact(projectRoot, fileName, report) {
    if (basename(fileName) !== fileName || fileName.startsWith('.') || fileName.length === 0) {
        throw new Error(`잘못된 산출물 파일명: ${JSON.stringify(fileName)} — 경로 없는 일반 파일명만 허용`);
    }
    writeReport(projectRoot, fileName, report);
    return join(specMapDir(projectRoot), fileName);
}
/**
 * `.spec/map/<fileName>` 의 정규 산출물을 읽어 스키마로 파싱한다. 파일 없음 -> null.
 * 권한/IO 오류는 던진다(fail-closed).
 */
export function readMapArtifact(projectRoot, fileName, schema) {
    const file = join(specMapDir(projectRoot), fileName);
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return null;
        throw err;
    }
    return schema.parse(JSON.parse(raw));
}
/** method-calls.json 기록(`.spec/map/` mkdir -p 선행) — P3 메서드 단위 호출 그래프. */
export function writeMethodCalls(projectRoot, report) {
    writeReport(projectRoot, 'method-calls.json', report);
}
/** domain-map.json 파일명(`.spec/map/` 하위) — AC-3 도메인 맵 요약. */
export const DOMAIN_MAP_SUMMARY_FILENAME = 'domain-map.json';
/** domain-map.json 기록(`.spec/map/` mkdir -p 선행) — AC-3 도메인 맵 요약(E-a/E-b/E-c 결합). */
export function writeDomainMapSummary(projectRoot, report) {
    writeReport(projectRoot, DOMAIN_MAP_SUMMARY_FILENAME, report);
}
/** `.understand-anything/` 디렉터리 경로 — dual-load 오버레이가 사는 곳(`.spec` 아님). */
export function uaDir(projectRoot) {
    return join(projectRoot, '.understand-anything');
}
/** dual-load 오버레이 파일명 — orchestrator(loadProjectGraph)가 fetch 하는 경로. */
export const DOMAIN_GRAPH_FILENAME = 'domain-graph.json';
/**
 * domain-graph.json 기록 — `.understand-anything/`(NOT `.spec`)에 { nodes, edges }
 * 구조 오버레이를 쓴다. dual-load(orchestrator)가 이 파일을 읽어 UA KG 와 병합한다.
 * 기록한 파일의 절대 경로를 반환한다.
 *
 * 주: P2 는 name 이 공란(SKELETON_BLANK)인 구조 골격만 emit 한다. LLM 채움(S8)·
 * 인용 검증(S9)이 P4 에서 name/summary 를 enrich 한다. 대시보드/dual-load 가
 * P2 시점에 데이터를 갖도록 골격을 먼저 emit 하는 것이 목적이다.
 */
export function writeDomainGraph(projectRoot, graph) {
    const dir = uaDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, DOMAIN_GRAPH_FILENAME);
    writeFileSync(filePath, stableJson(graph), 'utf8');
    return filePath;
}
/** 대시보드용 config.json 파일명(`.understand-anything/` 하위) — UA 대시보드가 fetch. */
export const DASHBOARD_CONFIG_FILENAME = 'config.json';
/**
 * `.understand-anything/config.json` 기록 — UA 대시보드가 fetch 해 UI 언어(outputLanguage)를
 * 정하는 파일. UA 코어 persistence 의 기본값은 "en"(불변식 영역이라 무수정)이라, ktds 는
 * 사용자 설정(understanding.config.json, 기본 ko)을 이 경로로 오버레이해 한국어 기본을
 * 보장한다. understanding.config.json 이 없거나 손상이면 ko 로 폴백한다.
 * 기록한 파일의 절대 경로를 반환한다.
 */
export function writeDashboardConfig(projectRoot) {
    let outputLanguage = 'ko';
    let approver;
    try {
        const cfg = loadConfig(projectRoot);
        if (cfg?.outputLanguage)
            outputLanguage = cfg.outputLanguage;
        // P3: approver 핸들(있으면) 을 대시보드로 복사 — 저장 시 기본값(없으면 대시보드 입력).
        if (typeof cfg?.approver === 'string' && cfg.approver.trim())
            approver = cfg.approver.trim();
    }
    catch {
        // 손상된 understanding.config.json → ko 폴백(대시보드 언어 결정은 비치명적).
    }
    const dir = uaDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, DASHBOARD_CONFIG_FILENAME);
    writeFileSync(filePath, stableJson(approver ? { outputLanguage, approver } : { outputLanguage }), 'utf8');
    return filePath;
}
//# sourceMappingURL=persist.js.map