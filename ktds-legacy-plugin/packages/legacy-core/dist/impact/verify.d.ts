import { z } from 'zod';
import { type CitationStatus } from '../types.js';
import { type ImpactCitation } from './types.js';
export declare const IMPACT_VERIFY_FILENAME = "impact-verify-report.json";
export declare const VerifiedImpactCitationSchema: z.ZodObject<{
    filePath: z.ZodString;
    line: z.ZodNumber;
    snippet: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        ok: "ok";
        "path-escape": "path-escape";
        "no-file": "no-file";
        "line-out-of-range": "line-out-of-range";
        "text-mismatch": "text-mismatch";
        "trivial-snippet": "trivial-snippet";
    }>;
}, z.core.$strip>;
export declare const ImpactVerifyItemSchema: z.ZodObject<{
    kind: z.ZodString;
    ref: z.ZodString;
    text: z.ZodString;
    citations: z.ZodArray<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            ok: "ok";
            "path-escape": "path-escape";
            "no-file": "no-file";
            "line-out-of-range": "line-out-of-range";
            "text-mismatch": "text-mismatch";
            "trivial-snippet": "trivial-snippet";
        }>;
    }, z.core.$strip>>;
    verdict: z.ZodEnum<{
        GROUNDED: "GROUNDED";
        NEEDS_REVIEW: "NEEDS_REVIEW";
    }>;
}, z.core.$strip>;
export type VerifiedImpactItem = z.infer<typeof ImpactVerifyItemSchema>;
export declare const ImpactVerifyReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        ref: z.ZodString;
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodOptional<z.ZodString>;
            status: z.ZodEnum<{
                ok: "ok";
                "path-escape": "path-escape";
                "no-file": "no-file";
                "line-out-of-range": "line-out-of-range";
                "text-mismatch": "text-mismatch";
                "trivial-snippet": "trivial-snippet";
            }>;
        }, z.core.$strip>>;
        verdict: z.ZodEnum<{
            GROUNDED: "GROUNDED";
            NEEDS_REVIEW: "NEEDS_REVIEW";
        }>;
    }, z.core.$strip>>;
    overall: z.ZodObject<{
        itemTotal: z.ZodNumber;
        itemGrounded: z.ZodNumber;
        citationTotal: z.ZodNumber;
        citationOk: z.ZodNumber;
        groundedPct: z.ZodNumber;
        uncitedClaims: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ImpactVerifyReport = z.infer<typeof ImpactVerifyReportSchema>;
/** 검증 대상 항목. */
export interface ImpactClaimItem {
    kind: string;
    ref: string;
    text: string;
    citations: ImpactCitation[];
}
/** impact 주장들의 인용을 실파일과 대조 → per-doc 근거율 리포트. */
export declare function verifyImpactClaims(projectRoot: string, items: readonly ImpactClaimItem[], gitCommit: string | null): ImpactVerifyReport;
/** 단일 인용 검증(텍스트 일치까지) — 재사용 진입점. */
export declare function verifyOneCitation(projectRoot: string, citation: ImpactCitation): CitationStatus;
/**
 * 앵커 **실존** 검증(supplement A L1) — 경로탈출/파일실존/라인범위만 확인한다.
 * 텍스트 일치/trivial 게이트는 적용하지 않는다: 선례·관례 앵커는 "이 파일의 이
 * 위치가 실재하는가"가 기준이지(생성예측엔 대조할 스니펫이 없다), 특정 라인 텍스트가
 * 아니다(계획서 P5.4 "앵커 실존 검증"). 반환값은 CITATION_STATUS 의 부분집합
 * ('ok'|'path-escape'|'no-file'|'line-out-of-range').
 */
export declare function verifyAnchorExists(projectRoot: string, anchor: {
    filePath: string;
    line: number;
}): CitationStatus;
//# sourceMappingURL=verify.d.ts.map