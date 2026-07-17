/**
 * 정책 신호 데이터 계약(정책서 P1) — zod 스키마 + z.infer 타입.
 *
 * 정책 신호(PolicySignal)는 코드/DB 에서 결정론으로 추출한 "정책의 앵커"다. 규범 진술·
 * 역할 표현식 같은 값/의미는 후속(P3)에서 LLM 이 앵커 소스를 읽어 보강하고 [추정] 표기한다.
 * 따라서 신호의 confidence 는 "앵커 존재"의 신뢰도(어노테이션/DDL 명시 = CONFIRMED)이며,
 * 해석의 신뢰도가 아니다.
 *
 * 결정론: 신호는 생산자에서 (category, file, line, kind, subject) 로 정렬. Evidence/Confidence
 * 는 기존 단일 소스(doc-generator EvidenceSchema, types CONFIDENCE_VALUES)를 재사용.
 */
import { z } from 'zod';
/** `.spec/map/` 정규 산출물 파일명. */
export declare const POLICY_SIGNALS_FILENAME = "policy-signals.json";
export declare const POLICY_RECONCILE_FILENAME = "policy-reconcile.json";
/** 정책 카테고리(사용자 정의 9종). PoC: glossary/data/validation/authz. */
export declare const PolicyCategorySchema: z.ZodEnum<{
    status: "status";
    validation: "validation";
    glossary: "glossary";
    authz: "authz";
    account: "account";
    billing: "billing";
    data: "data";
    integration: "integration";
    security: "security";
}>;
export type PolicyCategory = z.infer<typeof PolicyCategorySchema>;
/** 정책 신호 1건 — 카테고리 + 신호종류 + 대상 + 근거 앵커. */
export declare const PolicySignalSchema: z.ZodObject<{
    category: z.ZodEnum<{
        status: "status";
        validation: "validation";
        glossary: "glossary";
        authz: "authz";
        account: "account";
        billing: "billing";
        data: "data";
        integration: "integration";
        security: "security";
    }>;
    kind: z.ZodString;
    subject: z.ZodString;
    detail: z.ZodString;
    anchor: z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type PolicySignal = z.infer<typeof PolicySignalSchema>;
/** 정책 신호 집합 — .spec/map/policy-signals.json 의 단일 소스. */
export declare const PolicySignalSetSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    signals: z.ZodArray<z.ZodObject<{
        category: z.ZodEnum<{
            status: "status";
            validation: "validation";
            glossary: "glossary";
            authz: "authz";
            account: "account";
            billing: "billing";
            data: "data";
            integration: "integration";
            security: "security";
        }>;
        kind: z.ZodString;
        subject: z.ZodString;
        detail: z.ZodString;
        anchor: z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
    unresolved: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PolicySignalSet = z.infer<typeof PolicySignalSetSchema>;
/**
 * 대조 상태(policyStatus).
 *  - 준수: 문서 정책 ↔ 코드/DB 신호 모두 존재(주제 매칭).
 *  - 위반: 문서가 코드/DB 와 모순(값 비교). 신호에 인자값이 없어 결정론 비교 불가 →
 *          LLM 보강(SKILL)이 앵커 소스를 읽어 판정한다(결정론 reconcile 은 부여하지 않음).
 *  - 미정의: 코드/DB 엔 있으나 문서에 없음(코드에만 — 문서 누락).
 *  - 문서에만: 문서엔 있으나 코드/DB 신호 없음(미구현 후보).
 */
export declare const PolicyStatusSchema: z.ZodEnum<{
    준수: "준수";
    위반: "위반";
    미정의: "미정의";
    문서에만: "문서에만";
}>;
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;
/** 기존 정책서에서 파싱한 정책 항목 1건(정규화). */
export declare const PolicyItemSchema: z.ZodObject<{
    category: z.ZodEnum<{
        status: "status";
        validation: "validation";
        glossary: "glossary";
        authz: "authz";
        account: "account";
        billing: "billing";
        data: "data";
        integration: "integration";
        security: "security";
    }>;
    subject: z.ZodString;
    statement: z.ZodString;
    sourceLine: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type PolicyItem = z.infer<typeof PolicyItemSchema>;
/** 대조 결과 1건 — 문서 항목과 코드/DB 신호의 매칭 판정. */
export declare const ReconcileEntrySchema: z.ZodObject<{
    category: z.ZodEnum<{
        status: "status";
        validation: "validation";
        glossary: "glossary";
        authz: "authz";
        account: "account";
        billing: "billing";
        data: "data";
        integration: "integration";
        security: "security";
    }>;
    subject: z.ZodString;
    status: z.ZodEnum<{
        준수: "준수";
        위반: "위반";
        미정의: "미정의";
        문서에만: "문서에만";
    }>;
    docStatement: z.ZodNullable<z.ZodString>;
    signalDetail: z.ZodNullable<z.ZodString>;
    anchor: z.ZodNullable<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    note: z.ZodString;
}, z.core.$strip>;
export type ReconcileEntry = z.infer<typeof ReconcileEntrySchema>;
/** 대조 결과 — .spec/map/policy-reconcile.json 의 단일 소스. */
export declare const ReconcileResultSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    entries: z.ZodArray<z.ZodObject<{
        category: z.ZodEnum<{
            status: "status";
            validation: "validation";
            glossary: "glossary";
            authz: "authz";
            account: "account";
            billing: "billing";
            data: "data";
            integration: "integration";
            security: "security";
        }>;
        subject: z.ZodString;
        status: z.ZodEnum<{
            준수: "준수";
            위반: "위반";
            미정의: "미정의";
            문서에만: "문서에만";
        }>;
        docStatement: z.ZodNullable<z.ZodString>;
        signalDetail: z.ZodNullable<z.ZodString>;
        anchor: z.ZodNullable<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        note: z.ZodString;
    }, z.core.$strip>>;
    summary: z.ZodObject<{
        준수: z.ZodNumber;
        위반: z.ZodNumber;
        미정의: z.ZodNumber;
        문서에만: z.ZodNumber;
    }, z.core.$strip>;
    unresolved: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ReconcileResult = z.infer<typeof ReconcileResultSchema>;
//# sourceMappingURL=types.d.ts.map