/**
 * VERIFY 단계(S9 기계 검증) — 인용 실존/라인범위/텍스트 일치 대조.
 *
 * "validateGraph 에 파일시스템 접근 0줄"이라는 구조적 결함을 정확히 메우는 모듈:
 * 인용 경로 실존 → 라인 범위 → 스니펫↔실파일 텍스트 일치(정규화 후). 실패 항목은
 * 삭제가 아니라 NEEDS_REVIEW 강등 — 텍스트는 보존되고 근거 없음이 표시된다.
 * per-domain 근거율 리포트(groundedPct)가 "인용 실존율" 의 측정기다.
 */
import { realpath, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { writeMapArtifact } from './persist.js';
import { cmp } from '../utils/cmp.js';
import { normalizedBusinessFlows } from './fill.js';
/** 검증 리포트 파일명(`.spec/map/` 하위). */
export const VERIFY_REPORT_FILENAME = 'verify-report.json';
export const CITATION_STATUS = [
    'ok',
    /** 경로가 프로젝트 밖을 가리킴 (탈출 시도/환각/심볼릭 링크 우회). */
    'path-escape',
    'no-file',
    'line-out-of-range',
    'text-mismatch',
    /** 스니펫이 너무 사소해 어디에나 일치 — 근거 효력 없음 (게이밍 차단). */
    'trivial-snippet',
];
export const VerifiedCitationSchema = z.object({
    filePath: z.string(),
    line: z.number().int().positive(),
    snippet: z.string(),
    status: z.enum(CITATION_STATUS),
});
export const VerifiedItemSchema = z.object({
    /**
     * 주장 종류. 도메인/흐름/단계 기본 항목 + step 상세 섹션은 'detail:<sectionId>'
     * (예: 'detail:role') — NodeDetailTemplate 섹션 id 를 접미로 단다.
     */
    kind: z.union([
        z.enum(['summary', 'entity', 'businessRule', 'crossDomain', 'flow', 'step', 'businessFlow']),
        z.string().regex(/^detail:/),
    ]),
    /** 항목 식별자: domainId/flowId/stepId, "<domainId>#<kind>[i]", "<stepId>#detail:<sectionId>". */
    ref: z.string(),
    text: z.string(),
    citations: z.array(VerifiedCitationSchema),
    /** ok 인용 ≥1 → "GROUNDED", 아니면 "NEEDS_REVIEW" (삭제 금지). */
    verdict: z.enum(['GROUNDED', 'NEEDS_REVIEW']),
});
export const DomainVerifyResultSchema = z.object({
    domainId: z.string(),
    items: z.array(VerifiedItemSchema),
    citationTotal: z.number().int().nonnegative(),
    citationOk: z.number().int().nonnegative(),
    /** GROUNDED 항목 비율 (%) — per-doc 근거율의 도메인 분해. */
    groundedPct: z.number(),
});
export const VerifyReportSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    domains: z.array(DomainVerifyResultSchema),
    overall: z.object({
        itemTotal: z.number().int().nonnegative(),
        itemGrounded: z.number().int().nonnegative(),
        citationTotal: z.number().int().nonnegative(),
        citationOk: z.number().int().nonnegative(),
        groundedPct: z.number(),
    }),
});
/** 공백 정규화 — 들여쓰기/연속 공백 차이는 일치로 본다(텍스트 자체가 기준). */
function normalize(s) {
    return s.replace(/\s+/g, ' ').trim();
}
/**
 * 스니펫 효력 기준: ") {", "return" 같은 도처 일치 토막은 실재해도 근거가 못 된다
 * (날조 인용만이 아니라 공허 인용도 막아야 한다). 정규화 유효 길이 8 이상 +
 * 식별자성 토큰(라틴 3자+ 또는 한글 2자+) 1개 이상.
 */
function isTrivialSnippet(normalized) {
    // 유효 길이: 한글은 글자당 정보량이 높아 2로 센다.
    let effective = 0;
    for (const ch of normalized)
        effective += /[가-힣]/.test(ch) ? 2 : 1;
    if (effective < 8)
        return true;
    return !/[A-Za-z_$][\w$]{2,}|[가-힣]{2,}/.test(normalized);
}
async function verifyCitation(projectRoot, citation, cache) {
    const snippet = normalize(citation.snippet);
    if (isTrivialSnippet(snippet))
        return 'trivial-snippet';
    const abs = resolve(projectRoot, citation.filePath);
    const rootAbs = resolve(projectRoot);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + sep))
        return 'path-escape';
    let entry = cache.get(abs);
    if (!entry) {
        try {
            // 심볼릭 링크가 루트 밖을 가리키는 우회 차단: 실경로로 다시 격리 검사한다.
            // realpath 는 존재하는 파일에만 성공 — 실패는 no-file.
            const real = await realpath(abs);
            const realRoot = await realpath(rootAbs);
            if (real !== realRoot && !real.startsWith(realRoot + sep)) {
                entry = { lines: null, escaped: true };
            }
            else {
                entry = { lines: (await readFile(real, 'utf8')).split('\n') };
            }
        }
        catch {
            entry = { lines: null };
        }
        cache.set(abs, entry);
    }
    if (entry.escaped)
        return 'path-escape';
    if (entry.lines === null)
        return 'no-file';
    if (citation.line > entry.lines.length)
        return 'line-out-of-range';
    const fileLine = normalize(entry.lines[citation.line - 1]);
    if (fileLine.length === 0 || !fileLine.includes(snippet))
        return 'text-mismatch';
    return 'ok';
}
async function verifyClaim(projectRoot, kind, ref, claim, cache) {
    const citations = [];
    for (const c of claim.citations) {
        citations.push({ ...c, status: await verifyCitation(projectRoot, c, cache) });
    }
    return {
        kind,
        ref,
        text: claim.text,
        citations,
        verdict: citations.some((c) => c.status === 'ok') ? 'GROUNDED' : 'NEEDS_REVIEW',
    };
}
/**
 * fill 전체를 실파일과 대조 — 결과 구조를 반환한다(쓰기는 writeVerifyReport).
 * `rejectedBusinessFlows` = applyFills 가 그래프 정합 실패로 기각한 프로세스 ref
 * (`<domainId>#businessFlows[<i>]`) 집합 — 기각된 순서도의 인용은 그래프에 실리지
 * 않으므로 검증·집계에서도 제외한다(리포트 citation 수와 실림 상태의 정합).
 */
export async function verifyFills(projectRoot, fills, gitCommit, rejectedBusinessFlows = new Set()) {
    const cache = new Map();
    const domains = [];
    for (const fill of [...fills].sort((a, b) => cmp(a.domainId, b.domainId))) {
        const items = [];
        items.push(await verifyClaim(projectRoot, 'summary', fill.domainId, fill.summary, cache));
        for (const [kind, claims] of [
            ['entity', fill.entities],
            ['businessRule', fill.businessRules],
            ['crossDomain', fill.crossDomainInteractions],
        ]) {
            for (let i = 0; i < claims.length; i++) {
                items.push(await verifyClaim(projectRoot, kind, `${fill.domainId}#${kind}[${i}]`, claims[i], cache));
            }
        }
        // P4/B안: 업무 흐름도 노드 주장 검증 — **인용을 가진 모든 노드**(kind 무관).
        // ref = `<domainId>#businessFlow[<fill 인덱스>][<nodeId>]` — embedVerification 이
        // 이 키(fillIndex 재결합)로 domainMeta.businessFlows 노드에 verdict/인용 상태를
        // 덧입힌다. start/end 는 인용이 면제라 보통 항목이 없지만, 인용을 달면 그것도
        // 검증된다(리뷰 C8 정정). 기각된 프로세스는 인덱스 단위로 건너뛴다(부분 수용).
        const bfList = normalizedBusinessFlows(fill);
        for (let i = 0; i < bfList.length; i++) {
            if (rejectedBusinessFlows.has(`${fill.domainId}#businessFlows[${i}]`))
                continue;
            for (const n of bfList[i].nodes) {
                if (!n.citations || n.citations.length === 0)
                    continue;
                items.push(await verifyClaim(projectRoot, 'businessFlow', `${fill.domainId}#businessFlow[${i}][${n.id}]`, { text: n.label, citations: n.citations }, cache));
            }
        }
        for (const f of fill.flows) {
            items.push(await verifyClaim(projectRoot, 'flow', f.flowId, f.summary, cache));
        }
        for (const s of fill.steps) {
            items.push(await verifyClaim(projectRoot, 'step', s.stepId, s.summary, cache));
            // P2: step 상세 섹션 주장도 동일 인용 검증. 섹션 id 정렬로 결정론(저자 키 순서 무관).
            if (s.detail) {
                for (const sectionId of Object.keys(s.detail).sort(cmp)) {
                    items.push(await verifyClaim(projectRoot, `detail:${sectionId}`, `${s.stepId}#detail:${sectionId}`, s.detail[sectionId], cache));
                }
            }
        }
        const citationTotal = items.reduce((n, i) => n + i.citations.length, 0);
        const citationOk = items.reduce((n, i) => n + i.citations.filter((c) => c.status === 'ok').length, 0);
        const grounded = items.filter((i) => i.verdict === 'GROUNDED').length;
        domains.push({
            domainId: fill.domainId,
            items,
            citationTotal,
            citationOk,
            groundedPct: pct(grounded, items.length),
        });
    }
    const itemTotal = domains.reduce((n, d) => n + d.items.length, 0);
    const itemGrounded = domains.reduce((n, d) => n + d.items.filter((i) => i.verdict === 'GROUNDED').length, 0);
    return {
        schemaVersion: 1,
        gitCommit,
        domains,
        overall: {
            itemTotal,
            itemGrounded,
            citationTotal: domains.reduce((n, d) => n + d.citationTotal, 0),
            citationOk: domains.reduce((n, d) => n + d.citationOk, 0),
            groundedPct: pct(itemGrounded, itemTotal),
        },
    };
}
/** verify-report.json 기록 — 기록한 파일의 절대 경로를 반환한다. */
export function writeVerifyReport(projectRoot, report) {
    return writeMapArtifact(projectRoot, VERIFY_REPORT_FILENAME, VerifyReportSchema.parse(report));
}
function pct(num, den) {
    return den === 0 ? 100 : Math.round((num / den) * 1000) / 10;
}
//# sourceMappingURL=verify.js.map