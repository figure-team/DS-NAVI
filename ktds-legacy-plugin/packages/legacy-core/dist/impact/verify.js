/**
 * 인용 검증(citation verifier) — impact citation shape 전용 재구현.
 *
 * 계획서 P5.4: domain-map citation 검증의 4종 체크(path-escape/file-exist/line-range/
 * text-match) + trivial-snippet 게이트를 **impact citation shape 에 맞춰 재구현**한다.
 * 상태 공간(union)만 `../types.js` 의 CITATION_STATUS 단일 소스에서 공유한다 —
 * 두 검증기가 "같은 상태로 말한다"는 계약. (domain-map 측 검증기는 본 fork 에
 * 아직 없고, 있더라도 DomainFill 강결합이라 import 하지 않는다.)
 *
 * impact 인용은 snippet 이 비어 있을 수 있다(엔진이 못 읽은 파일) → normalize("")
 * = "" → isTrivialSnippet 참 → trivial-snippet 으로 자연 강등.
 *
 * 동기 IO — 본 레포의 persist/엔진 규약과 일치(결정론에 영향 없음).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { CITATION_STATUS } from '../types.js';
import { ImpactCitationSchema } from './types.js';
import { cmp } from '../utils/cmp.js';
/** 공백 정규화 — 들여쓰기/연속 공백 차이는 일치로 본다. */
function normalize(s) {
    return s.replace(/\s+/g, ' ').trim();
}
/** 스니펫 효력 기준: 정규화 8자 이상(한글 가중 2) + 식별자성 토큰 1개 이상. */
function isTrivialSnippet(normalized) {
    let effective = 0;
    for (const ch of normalized)
        effective += /[가-힣]/.test(ch) ? 2 : 1;
    if (effective < 8)
        return true;
    return !/[A-Za-z_$][\w$]{2,}|[가-힣]{2,}/.test(normalized);
}
/** 경로탈출/실존/라인/텍스트/trivial 검증 — domain-map 4체크 동형(impact shape). */
function verifyCitation(projectRoot, citation, cache) {
    const snippet = normalize(citation.snippet ?? '');
    if (isTrivialSnippet(snippet))
        return 'trivial-snippet';
    const abs = resolve(projectRoot, citation.filePath);
    const rootAbs = resolve(projectRoot);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + sep))
        return 'path-escape';
    let entry = cache.get(abs);
    if (!entry) {
        try {
            const real = realpathSync(abs);
            const realRoot = realpathSync(rootAbs);
            if (real !== realRoot && !real.startsWith(realRoot + sep)) {
                entry = { lines: null, escaped: true };
            }
            else {
                entry = { lines: readFileSync(real, 'utf8').split('\n') };
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
// ── impact 항목 검증 + 근거율 리포트 ─────────────────────────────────────────
export const IMPACT_VERIFY_FILENAME = 'impact-verify-report.json';
export const VerifiedImpactCitationSchema = ImpactCitationSchema.extend({
    status: z.enum(CITATION_STATUS),
});
export const ImpactVerifyItemSchema = z.object({
    /** 항목 분류: 'upstream'|'downstream'|'api'|'mapper'|'sql'|'flow'|'domain'|'precedent'|'create'. */
    kind: z.string(),
    /** 항목 식별자(relPath/routeId/flowId 등). */
    ref: z.string(),
    text: z.string(),
    citations: z.array(VerifiedImpactCitationSchema),
    /** ok 인용 ≥1 → GROUNDED, 아니면 NEEDS_REVIEW(삭제 금지, 강등만). */
    verdict: z.enum(['GROUNDED', 'NEEDS_REVIEW']),
});
export const ImpactVerifyReportSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    items: z.array(ImpactVerifyItemSchema),
    overall: z.object({
        itemTotal: z.number().int().nonnegative(),
        itemGrounded: z.number().int().nonnegative(),
        citationTotal: z.number().int().nonnegative(),
        citationOk: z.number().int().nonnegative(),
        /** 근거율 = GROUNDED / 인용 보유 항목(인용 없는 항목은 분모 제외). */
        groundedPct: z.number(),
        /** 인용이 0개인 항목 수(흐름/도메인 등) — groundedPct 분모 투명화. */
        uncitedClaims: z.number().int().nonnegative(),
    }),
});
function pct(num, den) {
    return den === 0 ? 100 : Math.round((num / den) * 1000) / 10;
}
/** impact 주장들의 인용을 실파일과 대조 → per-doc 근거율 리포트. */
export function verifyImpactClaims(projectRoot, items, gitCommit) {
    const cache = new Map();
    const verified = [];
    for (const item of [...items].sort((a, b) => cmp(a.kind, b.kind) || cmp(a.ref, b.ref))) {
        const citations = item.citations.map((c) => ({
            ...c,
            status: verifyCitation(projectRoot, c, cache),
        }));
        verified.push({
            kind: item.kind,
            ref: item.ref,
            text: item.text,
            citations,
            verdict: citations.some((c) => c.status === 'ok') ? 'GROUNDED' : 'NEEDS_REVIEW',
        });
    }
    const citationTotal = verified.reduce((n, i) => n + i.citations.length, 0);
    const citationOk = verified.reduce((n, i) => n + i.citations.filter((c) => c.status === 'ok').length, 0);
    const itemGrounded = verified.filter((i) => i.verdict === 'GROUNDED').length;
    const citedCount = verified.filter((i) => i.citations.length > 0).length;
    return {
        schemaVersion: 1,
        gitCommit,
        items: verified,
        overall: {
            itemTotal: verified.length,
            itemGrounded,
            citationTotal,
            citationOk,
            groundedPct: pct(itemGrounded, citedCount),
            uncitedClaims: verified.length - citedCount,
        },
    };
}
/** 단일 인용 검증(텍스트 일치까지) — 재사용 진입점. */
export function verifyOneCitation(projectRoot, citation) {
    return verifyCitation(projectRoot, citation, new Map());
}
/**
 * 앵커 **실존** 검증(supplement A L1) — 경로탈출/파일실존/라인범위만 확인한다.
 * 텍스트 일치/trivial 게이트는 적용하지 않는다: 선례·관례 앵커는 "이 파일의 이
 * 위치가 실재하는가"가 기준이지(생성예측엔 대조할 스니펫이 없다), 특정 라인 텍스트가
 * 아니다(계획서 P5.4 "앵커 실존 검증"). 반환값은 CITATION_STATUS 의 부분집합
 * ('ok'|'path-escape'|'no-file'|'line-out-of-range').
 */
export function verifyAnchorExists(projectRoot, anchor) {
    const abs = resolve(projectRoot, anchor.filePath);
    const rootAbs = resolve(projectRoot);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + sep))
        return 'path-escape';
    let lines;
    try {
        const real = realpathSync(abs);
        const realRoot = realpathSync(rootAbs);
        if (real !== realRoot && !real.startsWith(realRoot + sep))
            return 'path-escape';
        lines = readFileSync(real, 'utf8').split('\n');
    }
    catch {
        return 'no-file';
    }
    // 전부 공백인 파일은 닻을 걸 실체가 없다 — 빈 파일에 line 1 'ok' 로 위양성 grounding 방지.
    if (lines.every((l) => l.trim() === ''))
        return 'no-file';
    if (anchor.line < 1 || anchor.line > lines.length)
        return 'line-out-of-range';
    return 'ok';
}
//# sourceMappingURL=verify.js.map