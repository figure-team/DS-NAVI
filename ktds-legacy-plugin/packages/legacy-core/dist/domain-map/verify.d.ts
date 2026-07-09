import { z } from 'zod';
import { type DomainFill } from './fill.js';
/** 검증 리포트 파일명(`.spec/map/` 하위). */
export declare const VERIFY_REPORT_FILENAME = "verify-report.json";
export declare const CITATION_STATUS: readonly ["ok", "path-escape", "no-file", "line-out-of-range", "text-mismatch", "trivial-snippet"];
export type CitationStatus = (typeof CITATION_STATUS)[number];
export declare const VerifiedCitationSchema: z.ZodObject<{
    filePath: z.ZodString;
    line: z.ZodNumber;
    snippet: z.ZodString;
    status: z.ZodEnum<{
        ok: "ok";
        "path-escape": "path-escape";
        "no-file": "no-file";
        "line-out-of-range": "line-out-of-range";
        "text-mismatch": "text-mismatch";
        "trivial-snippet": "trivial-snippet";
    }>;
}, z.core.$strip>;
export type VerifiedCitation = z.infer<typeof VerifiedCitationSchema>;
export declare const VerifiedItemSchema: z.ZodObject<{
    kind: z.ZodUnion<readonly [z.ZodEnum<{
        flow: "flow";
        step: "step";
        summary: "summary";
        crossDomain: "crossDomain";
        entity: "entity";
        businessFlow: "businessFlow";
        businessRule: "businessRule";
    }>, z.ZodString]>;
    ref: z.ZodString;
    text: z.ZodString;
    citations: z.ZodArray<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodString;
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
export type VerifiedItem = z.infer<typeof VerifiedItemSchema>;
export declare const DomainVerifyResultSchema: z.ZodObject<{
    domainId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        kind: z.ZodUnion<readonly [z.ZodEnum<{
            flow: "flow";
            step: "step";
            summary: "summary";
            crossDomain: "crossDomain";
            entity: "entity";
            businessFlow: "businessFlow";
            businessRule: "businessRule";
        }>, z.ZodString]>;
        ref: z.ZodString;
        text: z.ZodString;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
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
    citationTotal: z.ZodNumber;
    citationOk: z.ZodNumber;
    groundedPct: z.ZodNumber;
}, z.core.$strip>;
export type DomainVerifyResult = z.infer<typeof DomainVerifyResultSchema>;
export declare const VerifyReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    domains: z.ZodArray<z.ZodObject<{
        domainId: z.ZodString;
        items: z.ZodArray<z.ZodObject<{
            kind: z.ZodUnion<readonly [z.ZodEnum<{
                flow: "flow";
                step: "step";
                summary: "summary";
                crossDomain: "crossDomain";
                entity: "entity";
                businessFlow: "businessFlow";
                businessRule: "businessRule";
            }>, z.ZodString]>;
            ref: z.ZodString;
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
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
        citationTotal: z.ZodNumber;
        citationOk: z.ZodNumber;
        groundedPct: z.ZodNumber;
    }, z.core.$strip>>;
    overall: z.ZodObject<{
        itemTotal: z.ZodNumber;
        itemGrounded: z.ZodNumber;
        citationTotal: z.ZodNumber;
        citationOk: z.ZodNumber;
        groundedPct: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type VerifyReport = z.infer<typeof VerifyReportSchema>;
/**
 * fill 전체를 실파일과 대조 — 결과 구조를 반환한다(쓰기는 writeVerifyReport).
 * `rejectedBusinessFlows` = applyFills 가 그래프 정합 실패로 기각한 프로세스 ref
 * (`<domainId>#businessFlows[<i>]`) 집합 — 기각된 순서도의 인용은 그래프에 실리지
 * 않으므로 검증·집계에서도 제외한다(리포트 citation 수와 실림 상태의 정합).
 */
export declare function verifyFills(projectRoot: string, fills: DomainFill[], gitCommit: string | null, rejectedBusinessFlows?: ReadonlySet<string>): Promise<VerifyReport>;
/** verify-report.json 기록 — 기록한 파일의 절대 경로를 반환한다. */
export declare function writeVerifyReport(projectRoot: string, report: VerifyReport): string;
//# sourceMappingURL=verify.d.ts.map