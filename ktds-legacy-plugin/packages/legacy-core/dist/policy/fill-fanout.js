/**
 * POLICY FILL FAN-OUT(정책서 LLM 보강 대규모 채움 팬아웃) — 청크 준비·조각 감사·병합.
 *
 * 정책서 채움(각 표 행의 규범 진술·신뢰도 태깅)은 원래 "메인 세션이 각 행의 앵커
 * file:line 을 직접 열어 policy-*.md 를 직접 수정"하는 경로였다. 행 수가 커지면(카테고리
 * 정책서 4종 + 도메인 정책서 N종, 도메인은 §4 의사결정 테이블 분기마다 1행) 메인 세션
 * 컨텍스트가 폭발한다. 이 모듈은 domain-map / screen-capture fill-fanout 의 실증
 * 방법론을 정책서에 이식한다:
 *
 *   prep : policy-signals.json(카테고리 모드) 또는 assembleDomainPolicies(도메인 모드)
 *          → 문서(docId)별 자립 청크(policy-fill-prep/<chunkId>.json + index.json). 각 행에
 *          앵커 pre-cite(±40라인 verbatim, 검증 통과 보장)와 채움 계약(3단 신뢰도 규칙)을 동봉.
 *   (팬아웃: 에이전트가 policy-fill-frag/<chunkId>.json 작성 — SKILL.md / workflow 지시)
 *   audit: 조각 완결성 감사(존재 ∧ 스키마 ∧ 커버리지 ∧ [확정]⇒인용≥1) — 재디스패치 근거
 *   merge: 조각을 policy-*.md 에 **덧붙임 산문 섹션**으로 렌더 병합. 기존 결정론 앵커 표는
 *          불변("앵커 보존—보강은 덧붙이기"). 병합 전 [확정] 인용을 verifyCitation 으로 실파일
 *          대조 — 불일치는 제거하고 근거 0 이 된 [확정]은 [추정]으로 강등(fail-closed).
 *
 * 정책 신뢰도 3단(SKILL 규약): [확정](file:line 근거 필수) / [추정] / [확인 필요].
 * 완료의 진실은 디스크에 있다(audit) — 에이전트 ack 가 아니라. 중단 후 재실행하면 완료
 * 청크는 건너뛴다(멱등 재개). 병합은 센티넬(<!-- policy-fill:start/end -->) 사이만
 * 재생성하므로 같은 조각을 재병합해도 중복 덧붙임이 없다(멱등). 결정론: 산출물 전부
 * stableJson + 자연키 정렬.
 */
import { readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { cmp } from '../utils/cmp.js';
import { specMapDir, stableJson } from '../domain-map/persist.js';
import { normalizeCitationText, isTrivialSnippet, verifyCitation } from '../domain-map/verify.js';
import { CitationSchema } from '../domain-map/fill.js';
import { BundleFileSchema, sliceFile, DEFAULT_SLICE_LINES } from '../domain-map/bundle.js';
import { DEFAULT_CHUNK_CHAR_CAP } from '../domain-map/fill-fanout.js';
import { PolicySignalSetSchema, POLICY_SIGNALS_FILENAME } from './types.js';
import { assembleDomainPolicies } from '../domain-policy/assemble.js';
/** `.spec/map/policy-fill-prep/` — 청크(팬아웃 입력) 디렉터리 이름. */
export const POLICY_FILL_PREP_DIR = 'policy-fill-prep';
/** `.spec/map/policy-fill-frag/` — 조각(팬아웃 출력) 디렉터리 이름. */
export const POLICY_FILL_FRAG_DIR = 'policy-fill-frag';
/** 청크 색인 파일명(`policy-fill-prep/` 하위). */
export const POLICY_FILL_PREP_INDEX_FILENAME = 'index.json';
/** 청크당 행 수 기본 상한 — 청크 1개가 에이전트 1회 컨텍스트에 들어가는 유계. */
export const DEFAULT_MAX_FILL_ROWS = 40;
/** pre-cite 후보 탐색 창 — 앵커 라인에서 위/아래로 훑는 최대 라인 수. */
const PRECITE_SCAN_LINES = 40;
/** pre-cite 스니펫 길이 상한(정규화 substring 일치라 잘라도 안전). */
const PRECITE_SNIPPET_MAX = 200;
/** 정책 신뢰도 3단(SKILL 규약) — 조각/렌더 공통. */
export const POLICY_FILL_TAGS = ['확정', '추정', '확인 필요'];
/** fail-closed 태그 — 이 등급 진술은 인용(file:line) ≥ 1 필수. */
const CONFIRMED_TAG = '확정';
/** 채움 섹션 센티넬 — 병합이 이 사이만 재생성(멱등·앵커 보존). */
export const FILL_SECTION_START = '<!-- policy-fill:start -->';
export const FILL_SECTION_END = '<!-- policy-fill:end -->';
/** 채움 모드 — 카테고리 정책서 / 도메인 정책서. */
export const PolicyFillModeSchema = z.enum(['category', 'domain']);
// ──────────────────────────────────────────────────────────────────────────
// 스키마
// ──────────────────────────────────────────────────────────────────────────
/** 앵커 — file:line(line 미상이면 null, pre-cite 면제). */
const AnchorSchema = z.object({ file: z.string(), line: z.number().int().nullable() });
/** 청크가 실어 나르는 채움 행 골격 — 결정론 사실(불변) + pre-cite. */
export const PolicyFillRowSchema = z.object({
    /** 조각/병합 정합 키(불변, 앵커 기반). */
    rowKey: z.string(),
    /** 소속 문서(policy-<category> | policy-domain-<key>). */
    docId: z.string(),
    /** 표시 대상(용어/필드/조건식 — 사람이 읽는 행 식별자). */
    subject: z.string(),
    /** 결정론 원문(주석/제약식/조건식·처리 — 합성 금지). */
    detail: z.string(),
    /** 카테고리(카테고리 모드), 없으면 null. */
    category: z.string().nullable(),
    /** 신호 종류(있으면). */
    kind: z.string().nullable(),
    anchor: AnchorSchema.nullable(),
    /** 앵커 ±40라인에서 결정론 추출한 검증 통과 인용(없으면 null — 정직 보고). */
    preCite: CitationSchema.nullable(),
});
/** 팬아웃 에이전트 1명이 읽는 자립 청크 — 한 문서의 행 부분집합 + pre-cite + 소스 슬라이스. */
export const PolicyFillChunkSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    chunkId: z.string(),
    mode: PolicyFillModeSchema,
    docId: z.string(),
    /** 문서 표시명(문맥용). */
    title: z.string(),
    rows: z.array(PolicyFillRowSchema),
    /** 이 청크 앵커들의 소스 슬라이스(도메인 번들과 동일 형식). */
    files: z.array(BundleFileSchema),
    /** 청크 charCap 으로 슬라이스가 생략된 파일(조용한 누락 금지). */
    sliceOmitted: z.array(z.string()),
});
const ChunkIndexEntrySchema = z.object({
    chunkId: z.string(),
    mode: PolicyFillModeSchema,
    docId: z.string(),
    rowKeys: z.array(z.string()),
    rowCount: z.number().int().nonnegative(),
    /** pre-cite 미확보 행 수 — 근거 공백의 정직 보고. */
    preCiteMissing: z.number().int().nonnegative(),
});
export const PolicyFillChunkIndexSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    mode: PolicyFillModeSchema,
    maxRows: z.number().int().positive(),
    chunks: z.array(ChunkIndexEntrySchema),
    /** md 미존재로 채움 대상에서 제외된 문서(정직 보고 — 1단계 생성 선행 필요). */
    skippedDocs: z.array(z.object({ docId: z.string(), reason: z.string() })),
    totals: z.object({
        docs: z.number().int().nonnegative(),
        chunks: z.number().int().nonnegative(),
        rows: z.number().int().nonnegative(),
        preCiteMissing: z.number().int().nonnegative(),
    }),
});
/** 조각 채움 행 — 규범 진술 + 3단 신뢰도 + 근거 인용(불변 사실은 담지 않는다). */
export const PolicyFillFragmentRowSchema = z.object({
    /** 청크 선언 rowKey 와 정합(불변). */
    rowKey: z.string(),
    /** 규범 진술(업무 언어). */
    statement: z.string(),
    /** 신뢰도 3단. */
    confidence: z.enum(POLICY_FILL_TAGS),
    /** 근거 인용(file:line + snippet). [확정]은 ≥1 필수. */
    citations: z.array(CitationSchema),
});
/** 팬아웃 에이전트가 쓰는 조각 — 청크 행들의 채움 집합. */
export const PolicyFillFragmentSchema = z.object({
    schemaVersion: z.literal(1),
    chunkId: z.string(),
    rows: z.array(PolicyFillFragmentRowSchema),
});
// ──────────────────────────────────────────────────────────────────────────
// 경로 헬퍼
// ──────────────────────────────────────────────────────────────────────────
/** `.spec/map/policy-fill-prep/` 디렉터리 경로. */
export function policyFillPrepDir(projectRoot) {
    return join(specMapDir(projectRoot), POLICY_FILL_PREP_DIR);
}
/** `.spec/map/policy-fill-frag/` 디렉터리 경로. */
export function policyFillFragDir(projectRoot) {
    return join(specMapDir(projectRoot), POLICY_FILL_FRAG_DIR);
}
function chunkPath(projectRoot, chunkId) {
    return join(policyFillPrepDir(projectRoot), `${chunkId}.json`);
}
function fragPath(projectRoot, chunkId) {
    return join(policyFillFragDir(projectRoot), `${chunkId}.json`);
}
/** doc-output/<docId>.md 절대 경로(병합 대상 본체). */
function docPath(projectRoot, docId) {
    return join(projectRoot, '.understand-anything', 'doc-output', `${docId}.md`);
}
/** 청크 색인을 읽는다 — 없으면 안내와 함께 던진다(fail-closed). */
export async function readPolicyFillChunkIndex(projectRoot) {
    let raw;
    try {
        raw = await readFile(join(policyFillPrepDir(projectRoot), POLICY_FILL_PREP_INDEX_FILENAME), 'utf8');
    }
    catch {
        throw new Error('policy-fill-prep/index.json 없음 — 먼저 fill-prep 을 실행하세요');
    }
    return PolicyFillChunkIndexSchema.parse(JSON.parse(raw));
}
// ──────────────────────────────────────────────────────────────────────────
// pre-cite 추출(domain-map / screen-capture fill-fanout 과 동일 규칙)
// ──────────────────────────────────────────────────────────────────────────
/**
 * 실파일에서 검증 통과가 보장된 인용 1건을 결정론으로 추출한다.
 * 후보 순서: 앵커 라인 → 아래로 PRECITE_SCAN_LINES → 위로 PRECITE_SCAN_LINES.
 * verify.ts 와 동일 규칙(normalizeCitationText/isTrivialSnippet)을 공유하고,
 * CitationSchema 의 snippet min 8 도 함께 보장한다. 실패는 null(정직 보고).
 */
async function extractPreCite(projectRoot, relPath, anchorLine, cache) {
    let lines = cache.get(relPath);
    if (lines === undefined) {
        try {
            lines = (await readFile(join(projectRoot, relPath), 'utf8')).split('\n');
        }
        catch {
            lines = null;
        }
        cache.set(relPath, lines);
    }
    if (!lines)
        return null;
    const anchor = Math.min(Math.max(1, anchorLine), lines.length);
    const candidates = [anchor];
    for (let d = 1; d <= PRECITE_SCAN_LINES; d++) {
        if (anchor + d <= lines.length)
            candidates.push(anchor + d);
    }
    for (let d = 1; d <= PRECITE_SCAN_LINES; d++) {
        if (anchor - d >= 1)
            candidates.push(anchor - d);
    }
    for (const line of candidates) {
        const snippet = lines[line - 1].trim().slice(0, PRECITE_SNIPPET_MAX);
        if (snippet.length < 8)
            continue;
        const normalized = normalizeCitationText(snippet);
        if (normalized.length === 0 || isTrivialSnippet(normalized))
            continue;
        return { filePath: relPath, line, snippet };
    }
    return null;
}
/** 문자열 정규화 — 표 셀/조건식에 섞인 개행·연속 공백 제거(원문 의미 보존). */
function oneLine(s) {
    return s.replace(/\s+/g, ' ').trim();
}
/** policy-signals.json 을 읽어 검증한다 — 없으면 안내와 함께 던진다(fail-closed). */
async function readPolicySignalSet(projectRoot) {
    let raw;
    try {
        raw = await readFile(join(specMapDir(projectRoot), POLICY_SIGNALS_FILENAME), 'utf8');
    }
    catch {
        throw new Error('policy-signals.json 없음 — 먼저 understand-policy.mjs(1단계 생성)를 실행하세요');
    }
    return PolicySignalSetSchema.parse(JSON.parse(raw));
}
/** 카테고리 모드 fill unit — 각 PolicySignal 1건 = policy-<category>.md 의 표 행 1개. */
async function categoryFillUnits(projectRoot) {
    const set = await readPolicySignalSet(projectRoot);
    const titleOf = {
        glossary: '용어/도메인 사전',
        data: '데이터 정책',
        validation: '업무 규칙(Validation) 정책',
        authz: '권한 정책',
    };
    return set.signals.map((s) => ({
        docId: `policy-${s.category}`,
        title: titleOf[s.category] ?? `정책서(${s.category})`,
        category: s.category,
        kind: s.kind,
        subject: oneLine(s.subject),
        detail: oneLine(s.detail),
        anchor: { file: s.anchor.file, line: s.anchor.line },
    }));
}
/** 도메인 모드 fill unit — 각 BranchSignal 1건 = policy-domain-<key>.md §4 의사결정 테이블 행 1개. */
function domainFillUnits(inputs) {
    const units = [];
    for (const d of inputs) {
        const docId = `policy-domain-${d.key}`;
        const title = d.name;
        for (const b of d.branches) {
            const subject = oneLine(b.condition).slice(0, 120) || `${b.kind} @${b.relPath}:${b.line}`;
            const detail = `IF ${oneLine(b.condition)}${b.then ? ` → THEN ${oneLine(b.then)}` : ''}`;
            units.push({
                docId,
                title,
                category: null,
                kind: b.kind,
                subject,
                detail,
                anchor: { file: b.relPath, line: b.line },
            });
        }
    }
    return units;
}
/** rowKey 부여 — 앵커 기반 안정 키(동일 앵커 중복 시 ordinal 로 명확화). 결정론. */
function assignRowKeys(units) {
    const seen = new Map();
    return units.map((u) => {
        const a = u.anchor;
        const base = `${u.docId}::${a ? `${a.file}:${a.line ?? '?'}` : 'no-anchor'}:${u.kind ?? ''}:${u.subject}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return { ...u, rowKey: n === 0 ? base : `${base}#${n + 1}` };
    });
}
/**
 * 채움 단위(카테고리 신호 또는 도메인 분기)를 문서별 팬아웃 청크로 분해해
 * `.spec/map/policy-fill-prep/` 에 영속한다. 분해 축: 문서(docId) 우선, 문서 내 행이
 * maxRows 를 넘으면 행 수로 분할(pol-000, pol-001, …). 각 행에 앵커 pre-cite(±40라인
 * verbatim)를 결정론 추출해 동봉하고, 앵커 파일들의 소스 슬라이스를 charCap 안에서 싣는다.
 * **병합 대상 md 가 없는 문서는 제외**(1단계 생성 선행 필요 — skippedDocs 에 정직 보고).
 * 기존 prep/*.json 은 전부 지우고 다시 쓴다(청크 수 변경 시 낡은 청크 잔존 방지 — frag/ 는 보존).
 */
export async function prepPolicyFill(projectRoot, options = {}) {
    const mode = options.mode ?? 'category';
    const maxRows = options.maxRows ?? DEFAULT_MAX_FILL_ROWS;
    const charCap = options.charCap ?? DEFAULT_CHUNK_CHAR_CAP;
    const rawUnits = mode === 'category'
        ? await categoryFillUnits(projectRoot)
        : domainFillUnits(await assembleDomainPolicies(projectRoot));
    const units = assignRowKeys(rawUnits);
    const gitCommit = await currentGitCommit(projectRoot, mode);
    const prep = policyFillPrepDir(projectRoot);
    await mkdir(prep, { recursive: true });
    for (const name of (await readdir(prep).catch(() => [])).filter((n) => n.endsWith('.json'))) {
        await rm(join(prep, name));
    }
    // 문서(docId) 우선 그룹핑(docId 정렬 → 그룹 내 앵커·subject 정렬).
    const byDoc = new Map();
    for (const u of units) {
        const list = byDoc.get(u.docId);
        if (list)
            list.push(u);
        else
            byDoc.set(u.docId, [u]);
    }
    const rowCmp = (a, b) => cmp(a.anchor?.file ?? '', b.anchor?.file ?? '') ||
        (a.anchor?.line ?? 0) - (b.anchor?.line ?? 0) ||
        cmp(a.subject, b.subject) ||
        cmp(a.rowKey, b.rowKey);
    const fileCache = new Map();
    const entries = [];
    const skippedDocs = [];
    const paths = [];
    const docSet = new Set();
    let totalRows = 0;
    let totalMissing = 0;
    let chunkOrdinal = 0;
    for (const docId of [...byDoc.keys()].sort(cmp)) {
        // 병합 대상 md 가 없으면 채울 곳이 없다 — 제외하고 정직 보고(1단계 생성 선행 필요).
        if (!existsSync(docPath(projectRoot, docId))) {
            skippedDocs.push({ docId, reason: 'doc-output md 없음(1단계 생성 선행 필요)' });
            continue;
        }
        docSet.add(docId);
        const docUnits = byDoc.get(docId).slice().sort(rowCmp);
        const title = docUnits[0]?.title ?? docId;
        for (let i = 0; i < docUnits.length; i += maxRows) {
            const group = docUnits.slice(i, i + maxRows);
            const chunkId = `pol-${String(chunkOrdinal++).padStart(3, '0')}`;
            // 행별 pre-cite(±40라인) + 앵커 파일 수집.
            const rows = [];
            const anchorByRel = new Map();
            let preCiteMissing = 0;
            for (const u of group) {
                let preCite = null;
                if (u.anchor && u.anchor.line !== null) {
                    preCite = await extractPreCite(projectRoot, u.anchor.file, u.anchor.line, fileCache);
                    const cur = anchorByRel.get(u.anchor.file);
                    if (cur === undefined || u.anchor.line < cur)
                        anchorByRel.set(u.anchor.file, u.anchor.line);
                }
                if (preCite === null)
                    preCiteMissing++;
                rows.push({
                    rowKey: u.rowKey,
                    docId,
                    subject: u.subject,
                    detail: u.detail,
                    category: u.category,
                    kind: u.kind,
                    anchor: u.anchor,
                    preCite,
                });
            }
            // 소스 슬라이스: 앵커 파일들을 relPath 정렬 순서로 charCap 까지.
            const relPaths = [...anchorByRel.keys()].sort(cmp);
            const files = [];
            const sliceOmitted = [];
            let used = 0;
            for (const relPath of relPaths) {
                const anchorLine = anchorByRel.get(relPath) ?? 1;
                let slice = await sliceFile(projectRoot, relPath, anchorLine, DEFAULT_SLICE_LINES);
                if (slice && used + slice.text.length > charCap) {
                    slice = null;
                    sliceOmitted.push(relPath);
                }
                if (slice)
                    used += slice.text.length;
                files.push({ relPath, className: null, line: anchorLine, slice, kgHint: null });
            }
            const chunk = {
                schemaVersion: 1,
                gitCommit,
                chunkId,
                mode,
                docId,
                title,
                rows,
                files,
                sliceOmitted,
            };
            const filePath = chunkPath(projectRoot, chunkId);
            await writeFile(filePath, stableJson(PolicyFillChunkSchema.parse(chunk)), 'utf8');
            paths.push(filePath);
            entries.push({
                chunkId,
                mode,
                docId,
                rowKeys: group.map((u) => u.rowKey),
                rowCount: group.length,
                preCiteMissing,
            });
            totalRows += group.length;
            totalMissing += preCiteMissing;
        }
    }
    const index = {
        schemaVersion: 1,
        gitCommit,
        mode,
        maxRows,
        chunks: entries,
        skippedDocs,
        totals: { docs: docSet.size, chunks: entries.length, rows: totalRows, preCiteMissing: totalMissing },
    };
    await writeFile(join(prep, POLICY_FILL_PREP_INDEX_FILENAME), stableJson(PolicyFillChunkIndexSchema.parse(index)), 'utf8');
    return { index, paths };
}
/** gitCommit — 신호/분기 산출물의 커밋을 재사용(결정론). 없으면 null. */
async function currentGitCommit(projectRoot, mode) {
    try {
        if (mode === 'category') {
            const raw = await readFile(join(specMapDir(projectRoot), POLICY_SIGNALS_FILENAME), 'utf8');
            return PolicySignalSetSchema.parse(JSON.parse(raw)).gitCommit;
        }
    }
    catch {
        // fall through to null
    }
    return null;
}
/**
 * 조각 완결성 감사 — 존재 ∧ JSON ∧ 스키마 ∧ chunkId 정합 ∧ 커버리지(청크 선언 rowKey
 * 전수) ∧ 신뢰도([확정] ⇒ 인용 ≥ 1). 완료의 진실은 이 감사가 결정한다(에이전트 ack 아님).
 * `only` 로 부분 감사(스킵 가드용).
 */
export async function auditPolicyFillFragments(projectRoot, only) {
    const index = await readPolicyFillChunkIndex(projectRoot);
    const onlySet = only && only.length > 0 ? new Set(only) : null;
    const complete = [];
    const incomplete = [];
    for (const entry of index.chunks) {
        if (onlySet && !onlySet.has(entry.chunkId))
            continue;
        const fail = (reason) => incomplete.push({ chunkId: entry.chunkId, reason });
        let raw;
        try {
            raw = await readFile(fragPath(projectRoot, entry.chunkId), 'utf8');
        }
        catch {
            fail('missing');
            continue;
        }
        let frag;
        try {
            frag = PolicyFillFragmentSchema.parse(JSON.parse(raw));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            fail(`schema: ${msg.slice(0, 300)}`);
            continue;
        }
        if (frag.chunkId !== entry.chunkId) {
            fail(`chunkId-mismatch: ${frag.chunkId}`);
            continue;
        }
        // 커버리지: 청크 선언 rowKey 전수(누락 금지). 신뢰도: [확정] ⇒ 인용 ≥ 1.
        const fragByKey = new Map(frag.rows.map((r) => [r.rowKey, r]));
        const declared = new Set(entry.rowKeys);
        let coverageFail = null;
        for (const key of entry.rowKeys) {
            if (!fragByKey.has(key)) {
                coverageFail = `행 누락: ${key}`;
                break;
            }
        }
        if (coverageFail) {
            fail(`coverage: ${coverageFail}`);
            continue;
        }
        let evidenceFail = null;
        for (const r of frag.rows) {
            if (!declared.has(r.rowKey))
                continue; // 선언 밖 행은 병합에서 드랍(감사는 통과).
            if (r.confidence === CONFIRMED_TAG && r.citations.length === 0) {
                evidenceFail = `${r.rowKey}: [확정]인데 인용 비어 있음`;
                break;
            }
        }
        if (evidenceFail) {
            fail(`evidence: ${evidenceFail}`);
            continue;
        }
        complete.push(entry.chunkId);
    }
    complete.sort(cmp);
    incomplete.sort((a, b) => cmp(a.chunkId, b.chunkId));
    return { complete, incomplete };
}
/** md 셀 안전화 — 파이프/개행 이스케이프(GFM 표 깨짐 방지). */
function mdCell(s) {
    return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}
/** 기존 채움 섹션(센티넬 사이)을 제거한다 — 멱등 재생성 기반(앵커 보존). */
function stripFillSection(md) {
    const re = new RegExp(`\\n*${escapeRe(FILL_SECTION_START)}[\\s\\S]*?${escapeRe(FILL_SECTION_END)}\\n*`, 'g');
    return md.replace(re, '\n');
}
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** 채움 섹션 마크다운 — 앵커 표(위)는 불변, 이 섹션만 덧붙인다(멱등 재생성). */
function renderFillSection(rows) {
    const header = `\n${FILL_SECTION_START}\n` +
        `## 규범 진술 (LLM 보강)\n\n` +
        `> 위 앵커 표는 결정론 근거([확정]). 아래는 각 대상의 규범 진술 보강 — [확정] 인용은 기계 검증기가 실파일과 대조한다(불일치 시 인용 제거·[추정] 강등).\n\n` +
        `| 대상 | 규범 진술 | 신뢰도 | 근거 |\n| --- | --- | --- | --- |\n`;
    const body = rows
        .map((r) => {
        const cites = r.citations.length > 0
            ? r.citations.map((c) => `\`${c.filePath}:${c.line}\``).join(' · ')
            : '—';
        return `| ${mdCell(r.subject)} | ${mdCell(r.statement)} | [${r.confidence}] | ${cites} |`;
    })
        .join('\n');
    return `${header}${body}\n${FILL_SECTION_END}\n`;
}
/**
 * 조각이 가져온 인용의 진위를 실파일과 대조한다(map fill / screens verify 와 동형).
 * 실파일 불일치는 제거하고, 검증 통과분만 남긴다. [확정]인데 살아남은 인용이 0 이면
 * [추정]으로 강등한다(fail-closed — 날조 인용으로 확정 등급을 못 얻게). [추정]/[확인 필요]의
 * 인용도 대조해 불일치는 제거하되 강등은 없다. snippet 은 CitationSchema.min(8)이 이미
 * 강제하므로 부재 검사는 불필요(verifyCitation 의 trivial/mismatch 로 걸러진다).
 */
async function verifyFragmentRow(projectRoot, row, cache) {
    const kept = [];
    let removed = 0;
    for (const c of row.citations) {
        const status = await verifyCitation(projectRoot, c, cache);
        if (status === 'ok')
            kept.push(c);
        else
            removed++;
    }
    let confidence = row.confidence;
    let demoted = false;
    if (confidence === CONFIRMED_TAG && kept.length === 0) {
        confidence = '추정';
        demoted = true;
    }
    return { citations: kept, confidence, removed, demoted };
}
/**
 * 조각을 policy-*.md 에 **덧붙임 산문 섹션**으로 병합한다. 기존 결정론 앵커 표(본체)는
 * 건드리지 않고(앵커 보존), 센티넬 사이 채움 섹션만 재생성한다(멱등 — 같은 조각 재병합 시
 * 중복 덧붙임 없음). 완결 조각만 반영하고, 미완결 문서의 rowKey 는 missingRows 로 보고한다
 * (부분 병합). 조각의 청크 선언 밖 rowKey 는 버리고 집계 보고한다. 병합 전 인용을 실파일과
 * 대조해 불일치는 제거하고, 근거 0 이 된 [확정]은 [추정]으로 강등한다(fail-closed).
 */
export async function mergePolicyFillFragments(projectRoot) {
    const index = await readPolicyFillChunkIndex(projectRoot);
    const audit = await auditPolicyFillFragments(projectRoot);
    const completeSet = new Set(audit.complete);
    // docId → 행 사실(청크) + 채움(완결 조각). 미완결 청크의 rowKey 는 missing 으로.
    const factByKey = new Map();
    const rowsByDoc = new Map();
    const missingRows = [];
    const fileCache = new Map();
    let rowsFilled = 0;
    let droppedItems = 0;
    let citationsRemoved = 0;
    let tagsDemoted = 0;
    // 먼저 완결 청크 사실을 인덱싱(선언 rowKey → 사실 행).
    for (const entry of index.chunks) {
        if (!completeSet.has(entry.chunkId)) {
            for (const key of entry.rowKeys)
                missingRows.push(key);
            continue;
        }
        const chunk = PolicyFillChunkSchema.parse(JSON.parse(await readFile(chunkPath(projectRoot, entry.chunkId), 'utf8')));
        for (const r of chunk.rows)
            factByKey.set(r.rowKey, r);
    }
    // 완결 조각의 채움을 검증·수집(선언 밖 rowKey 드랍).
    for (const entry of index.chunks) {
        if (!completeSet.has(entry.chunkId))
            continue;
        const frag = PolicyFillFragmentSchema.parse(JSON.parse(await readFile(fragPath(projectRoot, entry.chunkId), 'utf8')));
        const declared = new Set(entry.rowKeys);
        for (const fr of frag.rows) {
            if (!declared.has(fr.rowKey)) {
                droppedItems++;
                continue;
            }
            const fact = factByKey.get(fr.rowKey);
            if (!fact) {
                droppedItems++;
                continue;
            }
            const v = await verifyFragmentRow(projectRoot, fr, fileCache);
            citationsRemoved += v.removed;
            if (v.demoted)
                tagsDemoted++;
            const list = rowsByDoc.get(fact.docId) ?? [];
            list.push({
                subject: fact.subject,
                statement: fr.statement,
                confidence: v.confidence,
                citations: v.citations,
                anchorFile: fact.anchor?.file ?? '',
                anchorLine: fact.anchor?.line ?? null,
            });
            rowsByDoc.set(fact.docId, list);
            rowsFilled++;
        }
    }
    // 문서별 md 갱신 — 이 fill 런에 등장한 전 docId(완결+미완결 합집합)를 순회한다.
    // 채울 행이 있으면 채움 섹션을 재생성하고, 커버리지를 전부 잃은 문서는 낡은 섹션을
    // strip 한다(빈 섹션을 새로 붙이지 않는다 — 낡은 채움 잔존 방지). 대상 md 없으면 보고·건너뜀.
    const allDocIds = [...new Set(index.chunks.map((c) => c.docId))].sort(cmp);
    const docPaths = [];
    const missingDocs = [];
    let staleSectionsCleared = 0;
    for (const docId of allDocIds) {
        const path = docPath(projectRoot, docId);
        const rows = rowsByDoc.get(docId);
        if (!existsSync(path)) {
            // 채울 행이 있는데 md 가 없을 때만 결손 보고(행 없으면 정리할 것도 없음).
            if (rows && rows.length > 0)
                missingDocs.push(docId);
            continue;
        }
        const original = await readFile(path, 'utf8');
        if (rows && rows.length > 0) {
            const sorted = rows.slice().sort((a, b) => cmp(a.anchorFile, b.anchorFile) || (a.anchorLine ?? 0) - (b.anchorLine ?? 0) || cmp(a.subject, b.subject));
            const body = stripFillSection(original).replace(/\s+$/, '\n');
            await writeFile(path, `${body}${renderFillSection(sorted)}`, 'utf8');
            docPaths.push(path);
        }
        else if (original.includes(FILL_SECTION_START)) {
            // 커버리지 소실 → 낡은 채움 섹션 제거(빈 섹션 미부착).
            await writeFile(path, stripFillSection(original).replace(/\s+$/, '\n'), 'utf8');
            staleSectionsCleared++;
        }
    }
    missingRows.sort(cmp);
    missingDocs.sort(cmp);
    return { docPaths, rowsFilled, missingRows, droppedItems, citationsRemoved, tagsDemoted, missingDocs, staleSectionsCleared };
}
//# sourceMappingURL=fill-fanout.js.map