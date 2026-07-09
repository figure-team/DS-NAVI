/**
 * intake-types — RTM 단계화(절차 A)의 누적 중간산출 `identified.json` 스키마.
 *
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §4.1. 2계층 ID(요청 REQ → 요구사항 SFR…)를 담는
 * 단일 진실원본으로, ① 식별이 골격을 쓰고 ③ 정의서·④ 명세서 단계가 필드를 점진 보강한다.
 * 따라서 ③④ 보강 필드는 default 로 둬 ①-only 산출도 검증을 통과한다(후방호환).
 *
 * 이 파일은 **문서 단계(②③④) 산출의 데이터 소스**다. rtm.json 정식 스키마(types.ts)와 별개이며,
 * ⑤ 단계가 이 산출을 rtm-requirements.json 으로 투영한다(P5). 기존 zod 서브스키마를 재사용한다.
 */
import { z } from 'zod';
/** 요구사항 구분코드(분류) — 목록표 §3 분류 코드. id 접두와 일치해야 한다. */
export declare const RequirementCategorySchema: z.ZodEnum<{
    SFR: "SFR";
    PER: "PER";
    SIR: "SIR";
    DAR: "DAR";
    SER: "SER";
    QUR: "QUR";
    COR: "COR";
}>;
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;
/** 요구사항 유효성 상태 — 유효(ACTIVE) / 폐기(WITHDRAWN, 절차 B). */
export declare const IntakeReqStatusSchema: z.ZodEnum<{
    ACTIVE: "ACTIVE";
    WITHDRAWN: "WITHDRAWN";
}>;
export type IntakeReqStatus = z.infer<typeof IntakeReqStatusSchema>;
/** 고객 요청(요청ID 레벨) — 1건이 N개 요구사항으로 분해된다. */
export declare const IntakeRequestSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    raw: z.ZodString;
    source: z.ZodDefault<z.ZodString>;
    requestedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type IntakeRequest = z.infer<typeof IntakeRequestSchema>;
/** ④ 명세서 상세 — ① 식별엔 비어 있고 ④ 단계에서 채운다. */
export declare const IntakeSpecSchema: z.ZodObject<{
    details: z.ZodDefault<z.ZodArray<z.ZodString>>;
    inputs: z.ZodDefault<z.ZodString>;
    outputs: z.ZodDefault<z.ZodString>;
    flow: z.ZodDefault<z.ZodString>;
    preceding: z.ZodDefault<z.ZodArray<z.ZodString>>;
    exceptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    acceptance: z.ZodDefault<z.ZodArray<z.ZodString>>;
    verify: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type IntakeSpec = z.infer<typeof IntakeSpecSchema>;
/**
 * 개별 요구사항(요구사항ID 레벨). ① 골격(id/category/name/priority/type/AC/changeset) →
 * ③ 보강(definition/scope/origin) → ④ 보강(spec). 전부 TO-BE 라 근거는 [추정].
 */
export declare const IntakeRequirementSchema: z.ZodObject<{
    id: z.ZodString;
    category: z.ZodEnum<{
        SFR: "SFR";
        PER: "PER";
        SIR: "SIR";
        DAR: "DAR";
        SER: "SER";
        QUR: "QUR";
        COR: "COR";
    }>;
    name: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<{
        functional: "functional";
        nonfunctional: "nonfunctional";
    }>>;
    nfrCategory: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        other: "other";
        security: "security";
        performance: "performance";
        availability: "availability";
        scalability: "scalability";
        usability: "usability";
        maintainability: "maintainability";
        compliance: "compliance";
    }>>>;
    priority: z.ZodDefault<z.ZodEnum<{
        HIGH: "HIGH";
        MEDIUM: "MEDIUM";
        LOW: "LOW";
    }>>;
    status: z.ZodDefault<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        WITHDRAWN: "WITHDRAWN";
    }>>;
    derivedFrom: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    definition: z.ZodDefault<z.ZodString>;
    scope: z.ZodDefault<z.ZodString>;
    origin: z.ZodDefault<z.ZodString>;
    spec: z.ZodDefault<z.ZodObject<{
        details: z.ZodDefault<z.ZodArray<z.ZodString>>;
        inputs: z.ZodDefault<z.ZodString>;
        outputs: z.ZodDefault<z.ZodString>;
        flow: z.ZodDefault<z.ZodString>;
        preceding: z.ZodDefault<z.ZodArray<z.ZodString>>;
        exceptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
        acceptance: z.ZodDefault<z.ZodArray<z.ZodString>>;
        verify: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>;
    acceptanceCriteria: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        kind: z.ZodDefault<z.ZodEnum<{
            exception: "exception";
            branch: "branch";
            precondition: "precondition";
            postcondition: "postcondition";
            rule: "rule";
        }>>;
        fnIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        confidence: z.ZodDefault<z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>>;
        tests: z.ZodDefault<z.ZodArray<z.ZodObject<{
            caseId: z.ZodString;
            result: z.ZodDefault<z.ZodEnum<{
                PASS: "PASS";
                FAIL: "FAIL";
                NA: "NA";
                UNTESTED: "UNTESTED";
            }>>;
            defectId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            note: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    changeset: z.ZodDefault<z.ZodObject<{
        added: z.ZodArray<z.ZodString>;
        modified: z.ZodArray<z.ZodString>;
        removed: z.ZodArray<z.ZodString>;
        revived: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type IntakeRequirement = z.infer<typeof IntakeRequirementSchema>;
/** identified.json — 한 요청의 누적 중간산출(2계층). */
export declare const IdentifiedIntakeSchema: z.ZodObject<{
    schemaVersion: z.ZodDefault<z.ZodLiteral<1>>;
    request: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        raw: z.ZodString;
        source: z.ZodDefault<z.ZodString>;
        requestedAt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    requirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            SFR: "SFR";
            PER: "PER";
            SIR: "SIR";
            DAR: "DAR";
            SER: "SER";
            QUR: "QUR";
            COR: "COR";
        }>;
        name: z.ZodString;
        type: z.ZodDefault<z.ZodEnum<{
            functional: "functional";
            nonfunctional: "nonfunctional";
        }>>;
        nfrCategory: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
            other: "other";
            security: "security";
            performance: "performance";
            availability: "availability";
            scalability: "scalability";
            usability: "usability";
            maintainability: "maintainability";
            compliance: "compliance";
        }>>>;
        priority: z.ZodDefault<z.ZodEnum<{
            HIGH: "HIGH";
            MEDIUM: "MEDIUM";
            LOW: "LOW";
        }>>;
        status: z.ZodDefault<z.ZodEnum<{
            ACTIVE: "ACTIVE";
            WITHDRAWN: "WITHDRAWN";
        }>>;
        derivedFrom: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        definition: z.ZodDefault<z.ZodString>;
        scope: z.ZodDefault<z.ZodString>;
        origin: z.ZodDefault<z.ZodString>;
        spec: z.ZodDefault<z.ZodObject<{
            details: z.ZodDefault<z.ZodArray<z.ZodString>>;
            inputs: z.ZodDefault<z.ZodString>;
            outputs: z.ZodDefault<z.ZodString>;
            flow: z.ZodDefault<z.ZodString>;
            preceding: z.ZodDefault<z.ZodArray<z.ZodString>>;
            exceptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
            acceptance: z.ZodDefault<z.ZodArray<z.ZodString>>;
            verify: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>>;
        acceptanceCriteria: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
            kind: z.ZodDefault<z.ZodEnum<{
                exception: "exception";
                branch: "branch";
                precondition: "precondition";
                postcondition: "postcondition";
                rule: "rule";
            }>>;
            fnIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            confidence: z.ZodDefault<z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>>;
            tests: z.ZodDefault<z.ZodArray<z.ZodObject<{
                caseId: z.ZodString;
                result: z.ZodDefault<z.ZodEnum<{
                    PASS: "PASS";
                    FAIL: "FAIL";
                    NA: "NA";
                    UNTESTED: "UNTESTED";
                }>>;
                defectId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                note: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>>;
        changeset: z.ZodDefault<z.ZodObject<{
            added: z.ZodArray<z.ZodString>;
            modified: z.ZodArray<z.ZodString>;
            removed: z.ZodArray<z.ZodString>;
            revived: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    questions: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type IdentifiedIntake = z.infer<typeof IdentifiedIntakeSchema>;
/**
 * identified.json 파싱(검증). 실패하면 사람이 읽을 수 있는 메시지로 throw(조용한 null드롭 방지).
 * default 가 채워진 정규화 객체를 돌려준다.
 */
export declare function parseIdentifiedIntake(data: unknown): IdentifiedIntake;
/**
 * 비치명 일관성 진단(조용한 손실 금지) — 스키마는 통과하지만 의미상 어긋난 것을 표면화한다.
 * 반환 배열이 비면 깨끗. 강제하지 않고 가시화만 한다(critic 규약).
 */
export declare function diagnoseIntake(intake: IdentifiedIntake): string[];
//# sourceMappingURL=intake-types.d.ts.map