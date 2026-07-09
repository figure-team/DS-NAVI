/**
 * doc-generator 데이터 모델 (P4.1) — 결정론 산출물 문서의 단일 소스.
 *
 * doc-templates.md(§0 공통 계약)가 권위(AUTHORITY)다. confidence 는
 * `../types.js` 의 CONFIDENCE_VALUES 단일 소스에서만 가져온다(중복 정의 금지).
 *
 * zod 스키마 + z.infer 타입으로 정의해 손편집/버전 스큐를 조용히 통과시키지 않는다.
 */
import { z } from 'zod';
/** 방법론 — as-built(현행 추출) / si-standard(SI 서식) / policy(카테고리 정책서) / domain-policy(도메인 정책서). */
export declare const MethodologySchema: z.ZodEnum<{
    "as-built": "as-built";
    "si-standard": "si-standard";
    policy: "policy";
    "domain-policy": "domain-policy";
}>;
export type Methodology = z.infer<typeof MethodologySchema>;
/** 문서 상태(doc-state) — 사람 확정은 confidence 가 아니라 이 status 로 기록(§0). */
export declare const DocStatusSchema: z.ZodEnum<{
    DRAFT: "DRAFT";
    UNDER_REVIEW: "UNDER_REVIEW";
    APPROVED: "APPROVED";
    RETURNED: "RETURNED";
}>;
export type DocStatus = z.infer<typeof DocStatusSchema>;
/** confidence 등급 — CONFIDENCE_VALUES 단일 소스와 일치(중복 정의 금지). */
export declare const ConfidenceSchema: z.ZodEnum<{
    CONFIRMED: "CONFIRMED";
    CONFIRMED_AI: "CONFIRMED_AI";
    INFERRED: "INFERRED";
    UNVERIFIED: "UNVERIFIED";
}>;
/** 근거 앵커 — file:line(+선택 snippet). line 미상이면 null(동적/불명). */
export declare const EvidenceSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNullable<z.ZodNumber>;
    snippet: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Evidence = z.infer<typeof EvidenceSchema>;
/**
 * 단일 주장(claim) — 텍스트 + 신뢰도 + 근거 + 사람 검토 필요 플래그.
 * CONFIRMED 는 근거 0이면 안 된다(§0 evidence enforcement) — claim() 헬퍼가 강제.
 */
export declare const ClaimSchema: z.ZodObject<{
    text: z.ZodString;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
    evidence: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    requiresHumanReview: z.ZodBoolean;
}, z.core.$strip>;
export type Claim = z.infer<typeof ClaimSchema>;
/**
 * 표 행(table row) — SI표준 정형 문서(§2)용. 각 행 = 1 claim(§3.2)이므로
 * cells(셀 값) + confidence(신뢰도) + evidence(근거)를 동반한다. 신뢰도/근거는
 * 전용 열로 렌더되며(template §2), CONFIRMED 강제는 claim() 과 동일하게 적용한다.
 */
export declare const TableRowSchema: z.ZodObject<{
    cells: z.ZodArray<z.ZodString>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
    evidence: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TableRow = z.infer<typeof TableRowSchema>;
/**
 * 표 모델(table) — SI표준 정형 문서(§2)의 표 중심 양식. columns 는 신뢰도/근거를
 * 제외한 도메인 열만(렌더러가 신뢰도/근거 열을 자동 부가). rows 의 cells.length 는
 * columns.length 와 일치해야 한다(결정론 렌더 보장).
 */
export declare const TableSchema: z.ZodObject<{
    columns: z.ZodArray<z.ZodString>;
    rows: z.ZodArray<z.ZodObject<{
        cells: z.ZodArray<z.ZodString>;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
        evidence: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Table = z.infer<typeof TableSchema>;
/**
 * 문서 섹션 — 헤딩 + 선택적 산문(prose, 골든 비대상) + claim 목록.
 * table 은 선택(SI표준 정형 문서 §2 표 중심 섹션). as-built 섹션은 claims 만 쓴다.
 */
export declare const SectionSchema: z.ZodObject<{
    heading: z.ZodString;
    key: z.ZodOptional<z.ZodString>;
    prose: z.ZodOptional<z.ZodString>;
    claims: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
        evidence: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        requiresHumanReview: z.ZodBoolean;
    }, z.core.$strip>>;
    table: z.ZodOptional<z.ZodObject<{
        columns: z.ZodArray<z.ZodString>;
        rows: z.ZodArray<z.ZodObject<{
            cells: z.ZodArray<z.ZodString>;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
            evidence: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNullable<z.ZodNumber>;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Section = z.infer<typeof SectionSchema>;
/** 생성 문서 모델 — docId/title/methodology + 섹션 목록(§0 데이터 모델). */
export declare const GeneratedDocSchema: z.ZodObject<{
    docId: z.ZodString;
    title: z.ZodString;
    methodology: z.ZodEnum<{
        "as-built": "as-built";
        "si-standard": "si-standard";
        policy: "policy";
        "domain-policy": "domain-policy";
    }>;
    sections: z.ZodArray<z.ZodObject<{
        heading: z.ZodString;
        key: z.ZodOptional<z.ZodString>;
        prose: z.ZodOptional<z.ZodString>;
        claims: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
            evidence: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNullable<z.ZodNumber>;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            requiresHumanReview: z.ZodBoolean;
        }, z.core.$strip>>;
        table: z.ZodOptional<z.ZodObject<{
            columns: z.ZodArray<z.ZodString>;
            rows: z.ZodArray<z.ZodObject<{
                cells: z.ZodArray<z.ZodString>;
                confidence: z.ZodEnum<{
                    CONFIRMED: "CONFIRMED";
                    CONFIRMED_AI: "CONFIRMED_AI";
                    INFERRED: "INFERRED";
                    UNVERIFIED: "UNVERIFIED";
                }>;
                evidence: z.ZodArray<z.ZodObject<{
                    file: z.ZodString;
                    line: z.ZodNullable<z.ZodNumber>;
                    snippet: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GeneratedDoc = z.infer<typeof GeneratedDocSchema>;
/**
 * 프런트매터(DocMeta) — §0 YAML 헤더의 단일 소스.
 * sourceCommit/evidenceRate 는 호출자가 주입(결정론: Date.now() 미사용).
 */
export declare const DocMetaSchema: z.ZodObject<{
    docId: z.ZodString;
    title: z.ZodString;
    methodology: z.ZodEnum<{
        "as-built": "as-built";
        "si-standard": "si-standard";
        policy: "policy";
        "domain-policy": "domain-policy";
    }>;
    status: z.ZodEnum<{
        DRAFT: "DRAFT";
        UNDER_REVIEW: "UNDER_REVIEW";
        APPROVED: "APPROVED";
        RETURNED: "RETURNED";
    }>;
    sourceCommit: z.ZodNullable<z.ZodString>;
    evidenceRate: z.ZodNumber;
}, z.core.$strip>;
export type DocMeta = z.infer<typeof DocMetaSchema>;
//# sourceMappingURL=types.d.ts.map