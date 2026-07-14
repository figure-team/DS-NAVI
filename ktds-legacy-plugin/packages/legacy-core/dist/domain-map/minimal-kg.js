/**
 * 최소 결정론 KG emit(STRUCTURE_FROM_MAP §6, 트랙 B) — /understand 은퇴 이후에도
 * 남는 KG 소비처(코드뷰어 allowlist·검색·홈 통계·screens JSP 전수 대조·임팩트
 * table 카탈로그·orchestrator loadProjectGraph)를 census+db-schema 만으로 충족한다.
 *
 * 대상 파일은 `.understand-anything/knowledge-graph.json` **그 자체**(domain-graph.json
 * 오버레이가 아니다) — screens/impact/orchestrator 소비 함수가 전부 이 경로를 직접
 * 읽기 때문이다(emit.ts 의 domain-graph.json 은 도메인/흐름/단계 오버레이로 별개).
 *
 * file/config/schema/document 노드만 만들고(클래스·함수·의존 엣지는 없음 — 구조 뷰가
 * KG 렌더를 은퇴했으므로 불필요), table 노드는 DDL 파일에서 defines_schema 엣지 하나로
 * 잇는다. complexity="low" 는 상수다: UA core 의 COMPLEXITY_ALIASES 가 sanitizeGraph→
 * autoFixGraph 단계에서 "low"→"simple" 로 치환하므로(understand-anything-plugin/
 * packages/core/src/schema.ts) validateGraph 를 그대로 통과한다 — 이 파일에 새 상수를
 * 들이는 게 아니라 이미 있는 별칭 경로에 올라타는 것.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { cmp } from '../utils/cmp.js';
import { RoutesReportSchema } from './types.js';
import { CENSUS_FILENAME, ROUTES_FILENAME, gitCommitDate, gitCommitHash, readMapArtifact, stableJson, uaDir, } from './persist.js';
import { CensusReportSchema } from './types.js';
import { readDbSchema } from '../db-schema/index.js';
/** `.understand-anything/` 하위 UA 네이티브 KG 파일명 — domain-graph.json(오버레이)과 다르다. */
export const KNOWLEDGE_GRAPH_FILENAME = 'knowledge-graph.json';
/** census lang → 노드 종류. census.classifyLang 의 결정론 문자열을 그대로 신뢰한다. */
const CONFIG_LANGS = new Set(['xml', 'yaml', 'properties']);
const SCHEMA_LANGS = new Set(['sql']);
const DOCUMENT_LANGS = new Set(['md']);
function nodeTypeForLang(lang) {
    if (CONFIG_LANGS.has(lang))
        return 'config';
    if (SCHEMA_LANGS.has(lang))
        return 'schema';
    if (DOCUMENT_LANGS.has(lang))
        return 'document';
    return 'file';
}
/**
 * 하드 시크릿 캐리어 확장자 — 최소 KG 는 이 확장자 파일을 노드화하지 않는다(적대 리뷰
 * C2). 코드뷰어 allowlist 는 KG 노드의 filePath 로 결정되므로, 노드를 아예 안 만들면
 * allowlist 에서 자동 제외된다(census 가 census 전 파일을 열거해도 이 파일들만큼은
 * 노출 표면에 오르지 않음). `.properties`/`.yml` 은 레거시 분석의 중심 파일이자 기존
 * LLM KG 의 config 노드 관례와 패리티라 **유지**한다 — STRUCTURE_FROM_MAP_DESIGN.md §6
 * 사용자 사인오프 사항. pfx/ppk/der/gpg 는 적대 리뷰 C2 마감 라운드에서 동일 위협군으로
 * 추가(각각 PKCS#12 번들·PuTTY 개인키·바이너리 인증서·PGP 개인키).
 */
export const SECRET_CARRIER_EXTENSIONS = ['env', 'pem', 'key', 'jks', 'p12', 'pfx', 'ppk', 'der', 'gpg'];
/**
 * 확장자와 무관하게 파일명 패턴으로 제외 — keystore 류(확장자 무관 명명 관례).
 * ssh 개인키(id_rsa 류)는 별도 SSH_PRIVATE_KEY_PREFIX_RE 로 처리(공개키 예외 로직이
 * 붙어있어 이 배열에 넣으면 표현이 어긋난다).
 */
export const SECRET_CARRIER_NAME_PATTERNS = [/keystore/i];
/**
 * ssh 개인키 파일명 관례(id_rsa 류) — **프리픽스 매칭**(적대 리뷰 C2 마감 라운드).
 * 앵커드 완전일치(`^id_rsa$`)는 `id_rsa.bak`/`id_rsa.txt` 같은 백업·사본이 확장자만
 * 붙었다는 이유로 빠져나가는 우회를 허용했다 — 프리픽스 + 단어 경계(`\b`)로 막는다.
 * 공개키(`.pub` 로 끝남)는 비밀이 아니므로 유일한 예외. **확장자 무관 최우선** —
 * 아래 템플릿 예외·최종 확장자 지배 규칙보다 먼저 검사되어 그 규칙들의 영향을 받지
 * 않는다(id_rsa.txt 는 계속 제외).
 */
const SSH_PRIVATE_KEY_PREFIX_RE = /^id_(rsa|dsa|ecdsa|ed25519)\b/i;
/**
 * 템플릿/샘플 접미사(적대 리뷰 C2 3차 라운드, 오탐 방지) — 파일명의 **최종** dot-세그먼트가
 * 이 값이면 공유 안전 템플릿(.env.example, .env.sample 등 — 실제 값이 아니라 안내용 사본)
 * 으로 보고 제외하지 않는다. ssh 개인키 프리픽스 룰보다는 후순위(위 주석 참조).
 */
export const TEMPLATE_SUFFIXES = ['example', 'sample', 'template', 'dist'];
/**
 * 최종 확장자 지배 규칙(적대 리뷰 C2 3차 라운드) — 파일명의 **마지막** 확장자가 이
 * 목록에 있으면 그 파일은 소스/문서로 확정하고 시크릿 세그먼트 스캔·keystore 명명
 * 패턴 검사를 전부 건너뛴다. `server.key.bak` 류 우회를 막으려고 중간 세그먼트까지
 * 보게 만들었더니 `api.key.md`·`render.der.js`·`messages.key.json`·`keyStore.java`
 * 처럼 실제로는 평범한 소스/문서인 파일까지 과대 제외(오탐)하는 부작용이 생겼다 —
 * 레거시 소스가 조용히 KG 에서 누락되는 것은 이 제품의 정직성 원칙 위반이므로, "파일이
 * 실제로 무엇으로 취급되는가"는 항상 **마지막** 확장자가 결정한다는 원칙으로 되돌린다.
 * `txt` 는 의도적으로 제외했다 — 넣으면 `server.key.txt` 같은 위장 사본이 다시 통과한다
 * (id_rsa.txt 는 위 ssh 프리픽스 룰이 확장자 무관으로 먼저 잡으므로 영향 없음).
 */
export const SOURCE_DOC_EXTENSIONS = [
    'java', 'js', 'jsx', 'ts', 'tsx', 'jsp', 'md',
    'json', 'html', 'htm', 'xml', 'sql', 'yml', 'yaml', 'properties', 'kt', 'py',
];
const SECRET_CARRIER_EXT_SET = new Set(SECRET_CARRIER_EXTENSIONS);
const TEMPLATE_SUFFIX_SET = new Set(TEMPLATE_SUFFIXES);
const SOURCE_DOC_EXT_SET = new Set(SOURCE_DOC_EXTENSIONS);
/** relPath 가 하드 시크릿 캐리어 패턴에 해당하면 true(최소 KG 노드화 제외 대상). */
export function isSecretCarrierPath(relPath) {
    const base = relPath.slice(relPath.lastIndexOf('/') + 1);
    // 최우선 — ssh 개인키 프리픽스는 확장자 무관(위 주석 참조).
    if (SSH_PRIVATE_KEY_PREFIX_RE.test(base))
        return !/\.pub$/i.test(base);
    const segments = base.split('.');
    const lastExt = segments.length > 1 ? segments[segments.length - 1].toLowerCase() : '';
    // 템플릿/샘플 접미사 — 공유 안전 사본은 제외 대상에서 뺀다.
    if (TEMPLATE_SUFFIX_SET.has(lastExt))
        return false;
    // 최종 확장자 지배 — 소스/문서로 확정되면 이 아래(세그먼트 스캔·keystore 패턴)는
    // 전부 건너뛴다(오탐 방지, 위 주석 참조).
    if (SOURCE_DOC_EXT_SET.has(lastExt))
        return false;
    if (SECRET_CARRIER_NAME_PATTERNS.some((re) => re.test(base)))
        return true;
    // 확장자는 "마지막 . 뒤"만 보지 않는다 — server.key.bak 처럼 진짜 확장자(key)가
    // 중간 세그먼트에 있고 마지막이 위장용 백업 확장자(bak)인 우회를 막기 위해
    // dot 으로 나눈 모든 세그먼트(첫 세그먼트=파일명 앞부분 제외)를 확인한다. 단,
    // 위에서 이미 마지막 확장자가 소스/문서로 확정된 경우는 여기 도달하지 않는다.
    for (let i = 1; i < segments.length; i++) {
        if (SECRET_CARRIER_EXT_SET.has(segments[i].toLowerCase()))
            return true;
    }
    return false;
}
/** 경로 세그먼트에 "test" 가 있으면 tags=["test"](최소 결정론 신호), 아니면 []. */
function tagsForPath(relPath) {
    return relPath.split('/').includes('test') ? ['test'] : [];
}
function fileNodeFor(f) {
    return {
        id: `file:${f.relPath}`,
        type: nodeTypeForLang(f.lang),
        name: f.relPath.slice(f.relPath.lastIndexOf('/') + 1),
        filePath: f.relPath,
        summary: `${f.relPath} — ${f.lang} 파일`,
        tags: tagsForPath(f.relPath),
        complexity: 'low',
    };
}
/** 테이블의 DDL 라인 범위 — CREATE TABLE 라인부터 컬럼/제약/인덱스 중 최댓값까지. */
function tableLineRange(t) {
    let end = t.line;
    for (const c of t.columns)
        if (c.line > end)
            end = c.line;
    for (const fk of t.foreignKeys)
        if (fk.line > end)
            end = fk.line;
    for (const c of t.checks)
        if (c.line > end)
            end = c.line;
    for (const ix of t.indexes)
        if (ix.line > end)
            end = ix.line;
    return [t.line, end];
}
function tableNodeFor(t) {
    return {
        id: `table:${t.name}`,
        type: 'table',
        name: t.name,
        filePath: t.relPath,
        lineRange: tableLineRange(t),
        summary: `${t.relPath} — 테이블 ${t.name}`,
        tags: [],
        complexity: 'low',
    };
}
/** 배열을 빈도 내림차순(동률은 사전식 오름차순)으로 유니크 집계 — languages/frameworks 공용. */
function rankByFrequency(values) {
    const counts = new Map();
    for (const v of values)
        counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.keys()].sort((a, b) => (counts.get(b) - counts.get(a)) || cmp(a, b));
}
/**
 * census+db-schema(+routes)로부터 최소 UA KG 호환 객체를 조립한다(순수 함수 — 동일
 * 입력 byte-identical). 파일 노드(census 전 파일) + 테이블 노드(db-schema 전 테이블) +
 * schema 파일→table 의 defines_schema 엣지만 만든다.
 */
export function buildMinimalKg(inputs) {
    // 하드 시크릿 캐리어(.env/.pem/.key/.jks/.p12/keystore/id_rsa 류)는 노드화하지 않는다
    // (적대 리뷰 C2) — 코드뷰어 allowlist·검색 노출 표면에서 원천 제외.
    const fileNodes = inputs.census.files
        .filter((f) => !isSecretCarrierPath(f.relPath))
        .map(fileNodeFor);
    const fileNodeIds = new Set(fileNodes.map((n) => n.id));
    // 같은 이름의 테이블이 여러 DDL 파일에 있으면(드묾) (name, relPath) 정렬 후 첫 항목만
    // 채택 — id 충돌(table:<name>) 방지, 결정론 tie-break.
    const tablesSorted = [...inputs.dbSchema.tables].sort((a, b) => cmp(a.name, b.name) || cmp(a.relPath, b.relPath));
    const seenTableNames = new Set();
    const tableNodes = [];
    const edges = [];
    for (const t of tablesSorted) {
        if (seenTableNames.has(t.name))
            continue;
        seenTableNames.add(t.name);
        tableNodes.push(tableNodeFor(t));
        const schemaFileId = `file:${t.relPath}`;
        if (fileNodeIds.has(schemaFileId)) {
            edges.push({
                source: schemaFileId,
                target: `table:${t.name}`,
                type: 'defines_schema',
                direction: 'forward',
                weight: 1,
            });
        }
    }
    const nodes = [...fileNodes, ...tableNodes].sort((a, b) => cmp(a.id, b.id));
    edges.sort((a, b) => cmp(a.source, b.source) || cmp(a.target, b.target) || cmp(a.type, b.type));
    const languages = rankByFrequency(inputs.census.files.map((f) => f.lang));
    const frameworks = inputs.routes ? rankByFrequency(inputs.routes.routes.map((r) => r.framework)) : [];
    return {
        version: '1.0.0',
        project: {
            name: inputs.projectName ?? basename(resolve(inputs.projectRoot)),
            languages,
            frameworks,
            description: 'ktds /understand-map 최소 구조 그래프(트랙 B)',
            analyzedAt: inputs.analyzedAt,
            gitCommitHash: inputs.gitCommit ?? '',
        },
        nodes,
        edges,
        layers: [],
        tour: [],
        ktdsStructure: { generatedFromCommit: inputs.gitCommit ?? '', minimal: true },
    };
}
export class MinimalKgInputMissingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MinimalKgInputMissingError';
    }
}
/**
 * `.spec/map/{census,db-schema,routes}.json` + git 커밋 정보를 로드한다(재스캔 0회).
 * census/db-schema 는 scan 의 필수 산출물이라 없으면 던진다(fail-closed, impact 엔진의
 * readRequired 와 동일 관례). routes 는 없으면 null(frameworks=[] 폴백, 치명적이지 않음).
 */
export function loadMinimalKgInputs(projectRoot) {
    const census = readMapArtifact(projectRoot, CENSUS_FILENAME, CensusReportSchema);
    if (census === null) {
        throw new MinimalKgInputMissingError(`${CENSUS_FILENAME} 없음 — 먼저 /understand-map scan을 실행하세요(.spec/map/ 산출물 필요)`);
    }
    const dbSchema = readDbSchema(projectRoot);
    if (dbSchema === null) {
        throw new MinimalKgInputMissingError('db-schema.json 없음 — 먼저 /understand-map scan을 실행하세요(.spec/map/ 산출물 필요)');
    }
    const routes = readMapArtifact(projectRoot, ROUTES_FILENAME, RoutesReportSchema);
    const gitCommit = census.gitCommit ?? gitCommitHash(projectRoot);
    return { projectRoot, census, dbSchema, routes, gitCommit };
}
/**
 * analyzedAt 결정론 센티널 — gitCommit 이 없거나(비-git 프로젝트) gitCommitDate 가 null 을
 * 주면(P1: 커밋이 히스토리에서 사라짐 등) now() 대신 이 상수로 떨어진다. now() 폴백은
 * 동일 입력 재실행마다 byte-diff 를 내므로(적대 리뷰 C1) 전면 금지 — 두 경우 모두 이미
 * "커밋 시각을 모른다"는 사실 자체가 결정론적이니 그 사실을 고정값으로 표현한다.
 */
export const ANALYZED_AT_SENTINEL = '1970-01-01T00:00:00.000Z';
/** analyzedAt 결정론 해석 — gitCommit 있으면 커밋 시각, 없으면(또는 조회 실패) 센티널. */
function resolveAnalyzedAt(projectRoot, gitCommit) {
    if (gitCommit) {
        const fromCommit = gitCommitDate(projectRoot, gitCommit);
        if (fromCommit)
            return fromCommit;
    }
    return ANALYZED_AT_SENTINEL;
}
/** knowledge-graph.json 을 원본 텍스트 그대로 읽어 ktdsStructure 마커 존재 여부만 본다. */
function hasKtdsStructureMarker(filePath) {
    let raw;
    try {
        raw = JSON.parse(readFileSync(filePath, 'utf8'));
    }
    catch {
        return false;
    }
    return typeof raw === 'object' && raw !== null && 'ktdsStructure' in raw;
}
/**
 * 최소 KG 를 `.understand-anything/knowledge-graph.json` 에 기록한다 — 단, 기존 파일이
 * 있고 ktdsStructure 마커가 없으면(=/understand 의 LLM 산출로 추정) **덮어쓰지 않고
 * 경고만 반환**한다(조용한 파괴 금지, policy 폴스루 사고와 동일 계열 방어). 마커가
 * 있거나(우리가 이전에 쓴 최소 KG) 파일이 아예 없으면 기록한다. overwriteKg=true 는
 * 마커 유무와 무관하게 강제 기록(사용자 명시 의사).
 */
export function writeMinimalKg(projectRoot, kg, options = {}) {
    const dir = uaDir(projectRoot);
    const filePath = join(dir, KNOWLEDGE_GRAPH_FILENAME);
    // P2: 대상이 디렉터리면(누군가 실수로 만든 경우 등) 기록을 시도하지 않는다 — writeFileSync
    // 가 EISDIR 로 크래시하는 대신 크래시 없이 표면화한다. overwriteKg 여부와 무관(디렉터리는
    // 애초에 유효한 KG 파일 위치가 아니므로 강제 옵션으로도 구제 불가).
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        return {
            action: 'skipped-invalid-target',
            path: filePath,
            message: `${filePath} 가 디렉터리입니다 — 최소 KG 를 기록할 수 없습니다(경로를 정리한 뒤 재실행하세요).`,
        };
    }
    if (existsSync(filePath) && !options.overwriteKg && !hasKtdsStructureMarker(filePath)) {
        return {
            action: 'skipped-existing-llm-kg',
            path: filePath,
            message: '기존 knowledge-graph.json 을 보존합니다(/understand 산출로 보이며 ktdsStructure 마커가 없음). ' +
                '최소 KG 로 교체하려면 --overwrite-kg 를 지정하세요.',
        };
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, stableJson(kg), 'utf8');
    return {
        action: 'written',
        path: filePath,
        message: `최소 KG 기록 — 노드 ${kg.nodes.length}개(파일 ${kg.nodes.filter((n) => n.type !== 'table').length}·테이블 ${kg.nodes.filter((n) => n.type === 'table').length}) · 엣지 ${kg.edges.length}개`,
        nodeCount: kg.nodes.length,
        edgeCount: kg.edges.length,
    };
}
/**
 * loadMinimalKgInputs → buildMinimalKg → writeMinimalKg(가드 포함) 를 한 번에 수행한다.
 * CLI(`emit-kg`, `map`)의 공통 진입점.
 */
export function emitMinimalKg(projectRoot, options = {}) {
    const inputs = loadMinimalKgInputs(projectRoot);
    const analyzedAt = options.analyzedAt ?? resolveAnalyzedAt(projectRoot, inputs.gitCommit);
    const kg = buildMinimalKg({ ...inputs, analyzedAt, projectName: options.projectName });
    return writeMinimalKg(projectRoot, kg, { overwriteKg: options.overwriteKg });
}
//# sourceMappingURL=minimal-kg.js.map