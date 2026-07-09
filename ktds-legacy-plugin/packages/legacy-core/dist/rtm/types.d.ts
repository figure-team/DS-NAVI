/**
 * RTM(요구사항 추적표) 데이터 모델 — 단일 소스(구조화 산출물 rtm.json).
 *
 * 설계: docs/ktds/RTM_TAB_DESIGN.md. doc-generator 와 동형으로 zod 스키마 + z.infer.
 * confidence 는 ../types.js 의 CONFIDENCE_VALUES 단일 소스에서만 가져온다(중복 정의 금지).
 *
 * v2 확장(9개 빈틈 반영): ①인수조건(AC) 계층 ②비기능요구(NFR) ③검증 스파인(시험결과·결함·고객검수)
 * ④요구사항 lifecycle ⑤요구사항 메타 ⑥커버리지 롤업 ⑦요구사항 의존성 ⑧산출물 연계 ⑨변경관리.
 * 후방호환: 신규 필드는 default/optional 로 둬 기존 산출물·인테이크가 점진 채택한다.
 *
 * 범위: AS-IS(코드 근거)는 buildRtm, 요구사항/AC/상태 재계산은 applyRequirements, 커버리지는
 * computeCoverage. 모든 배열은 결정론 정렬(byte-identical 재실행, Date.now 미사용).
 */
import { z } from 'zod';
/** confidence 등급 — CONFIDENCE_VALUES 단일 소스와 일치. */
export declare const RtmConfidenceSchema: z.ZodEnum<{
    CONFIRMED: "CONFIRMED";
    CONFIRMED_AI: "CONFIRMED_AI";
    INFERRED: "INFERRED";
    UNVERIFIED: "UNVERIFIED";
}>;
/** 추적 셀 — 한 추적 축(진입점/구현/데이터/테스트)의 값 + 근거. */
export declare const RtmTraceCellSchema: z.ZodObject<{
    value: z.ZodString;
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
export type RtmTraceCell = z.infer<typeof RtmTraceCellSchema>;
/** 시험 결과 — 통과/실패/해당없음/미실행. */
export declare const TestResultSchema: z.ZodEnum<{
    PASS: "PASS";
    FAIL: "FAIL";
    NA: "NA";
    UNTESTED: "UNTESTED";
}>;
export type TestResult = z.infer<typeof TestResultSchema>;
/** 테스트 참조 — 케이스 + 결과 + 결함 연계(실패 시). 한 AC/기능의 검증 단위. */
export declare const TestRefSchema: z.ZodObject<{
    caseId: z.ZodString;
    result: z.ZodDefault<z.ZodEnum<{
        PASS: "PASS";
        FAIL: "FAIL";
        NA: "NA";
        UNTESTED: "UNTESTED";
    }>>;
    defectId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TestRef = z.infer<typeof TestRefSchema>;
/** 인수조건 유형 — 분기/선행조건/후행액션/예외/일반규칙. */
export declare const AcKindSchema: z.ZodEnum<{
    exception: "exception";
    branch: "branch";
    precondition: "precondition";
    postcondition: "postcondition";
    rule: "rule";
}>;
export type AcKind = z.infer<typeof AcKindSchema>;
/**
 * 인수조건(Acceptance Criterion) — 검증 가능한 조건 1개. 요구사항과 기능 사이 N:M 다리.
 * fnIds 로 구현 기능을 매핑(changeset 도출의 근거). tests 로 검증(③).
 */
export declare const AcceptanceCriterionSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export declare const RtmOriginSchema: z.ZodEnum<{
    AS_IS: "AS_IS";
    TO_BE: "TO_BE";
}>;
export type RtmOrigin = z.infer<typeof RtmOriginSchema>;
export declare const RtmFunctionStateSchema: z.ZodEnum<{
    IMPLEMENTED: "IMPLEMENTED";
    PARTIAL: "PARTIAL";
    PLANNED: "PLANNED";
    CHANGED: "CHANGED";
    ORPHANED: "ORPHANED";
}>;
export type RtmFunctionState = z.infer<typeof RtmFunctionStateSchema>;
/** 산출물 연계(⑧) — 이 기능/요구가 반영된 SI 문서 항목(docId + 앵커). */
export declare const DeliverableRefSchema: z.ZodObject<{
    docId: z.ZodString;
    anchor: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type DeliverableRef = z.infer<typeof DeliverableRefSchema>;
/** 기능에 걸린 업무규칙 역참조(①) — 현행 요구사항들의 AC 를 이 기능 관점으로 집계. */
export declare const RtmFunctionRuleSchema: z.ZodObject<{
    reqId: z.ZodString;
    acId: z.ZodString;
    text: z.ZodString;
    kind: z.ZodEnum<{
        exception: "exception";
        branch: "branch";
        precondition: "precondition";
        postcondition: "postcondition";
        rule: "rule";
    }>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type RtmFunctionRule = z.infer<typeof RtmFunctionRuleSchema>;
/**
 * 기능 행(RTM 뷰① 한 행) — flow 노드 1개 = 기능 1개. 추적 4축 + 도메인 귀속 + 상태.
 * v2: nfrTags(②) · rules(①, 현행 head 집계) · deliverableRefs(⑧).
 */
export declare const RtmFunctionRowSchema: z.ZodObject<{
    id: z.ZodString;
    featureId: z.ZodString;
    name: z.ZodString;
    domainId: z.ZodString;
    domainName: z.ZodString;
    entryPoint: z.ZodObject<{
        value: z.ZodString;
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
    implementation: z.ZodObject<{
        value: z.ZodString;
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
    data: z.ZodObject<{
        value: z.ZodString;
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
    test: z.ZodObject<{
        value: z.ZodString;
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
    origin: z.ZodEnum<{
        AS_IS: "AS_IS";
        TO_BE: "TO_BE";
    }>;
    state: z.ZodEnum<{
        IMPLEMENTED: "IMPLEMENTED";
        PARTIAL: "PARTIAL";
        PLANNED: "PLANNED";
        CHANGED: "CHANGED";
        ORPHANED: "ORPHANED";
    }>;
    requirementHistory: z.ZodArray<z.ZodString>;
    nfrTags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
        reqId: z.ZodString;
        acId: z.ZodString;
        text: z.ZodString;
        kind: z.ZodEnum<{
            exception: "exception";
            branch: "branch";
            precondition: "precondition";
            postcondition: "postcondition";
            rule: "rule";
        }>;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>>;
    deliverableRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        docId: z.ZodString;
        anchor: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    custom: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strip>;
export type RtmFunctionRow = z.infer<typeof RtmFunctionRowSchema>;
/** 시나리오 종류 — 정상/예외/경계. */
export declare const TestScenarioKindSchema: z.ZodEnum<{
    exception: "exception";
    normal: "normal";
    boundary: "boundary";
}>;
export type TestScenarioKind = z.infer<typeof TestScenarioKindSchema>;
/**
 * 단위테스트 시나리오 초안 — 기능 행별 결정론 템플릿 생성(전부 INFERRED [추정]).
 * 확정은 rtm-overrides.json `_scenarios` 오버레이(확정 시 CONFIRMED 승격 — 기능 셀과
 * 달리 시나리오 확정 = 사람 검토 완료 의미가 명확). AC.tests[](수행 결과)와 별개 축:
 * 시나리오 = 설계 초안, TestRef = 수행 기록(확정 후 caseId 연결은 사람 몫).
 */
export declare const RtmTestScenarioSchema: z.ZodObject<{
    id: z.ZodString;
    fnId: z.ZodString;
    reqId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    acId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    kind: z.ZodEnum<{
        exception: "exception";
        normal: "normal";
        boundary: "boundary";
    }>;
    title: z.ZodString;
    given: z.ZodString;
    when: z.ZodString;
    then: z.ZodString;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type RtmTestScenario = z.infer<typeof RtmTestScenarioSchema>;
/**
 * 사용자 정의 필드 정의 — rtm-overrides.json `_fields` 섹션(id 키 record)이 원본.
 * 행 값은 기능 오버레이 editedCells["custom:<id>"] (기존 record 스키마가 이미 수용).
 * 정의 삭제는 비파괴(값 보존 — 재등록 시 복원).
 */
export declare const RtmCustomFieldSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    scope: z.ZodLiteral<"function">;
    createdBy: z.ZodString;
    at: z.ZodString;
}, z.core.$strip>;
export type RtmCustomField = z.infer<typeof RtmCustomFieldSchema>;
/** 도메인 그룹 헤더. */
export declare const RtmDomainSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    functionCount: z.ZodNumber;
}, z.core.$strip>;
export type RtmDomain = z.infer<typeof RtmDomainSchema>;
/** 변경 묶음(changeset) — 한 요구사항이 기능 집합에 가한 분류(−/~/+/=). */
export declare const RtmChangesetSchema: z.ZodObject<{
    added: z.ZodArray<z.ZodString>;
    modified: z.ZodArray<z.ZodString>;
    removed: z.ZodArray<z.ZodString>;
    revived: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type RtmChangeset = z.infer<typeof RtmChangesetSchema>;
/** 요구사항 유형(②) — 기능 / 비기능. */
export declare const RequirementTypeSchema: z.ZodEnum<{
    functional: "functional";
    nonfunctional: "nonfunctional";
}>;
export type RequirementType = z.infer<typeof RequirementTypeSchema>;
/** 비기능 분류(②) — 성능/보안/가용성/확장성/사용성/유지보수성/규정준수/기타. */
export declare const NfrCategorySchema: z.ZodEnum<{
    other: "other";
    security: "security";
    performance: "performance";
    availability: "availability";
    scalability: "scalability";
    usability: "usability";
    maintainability: "maintainability";
    compliance: "compliance";
}>;
export type NfrCategory = z.infer<typeof NfrCategorySchema>;
/** 요구사항 진행상태(④, lifecycle) — 접수→분석→설계→개발→시험→완료 / 보류 / 반려. */
export declare const RequirementLifecycleSchema: z.ZodEnum<{
    RECEIVED: "RECEIVED";
    ANALYZING: "ANALYZING";
    DESIGNING: "DESIGNING";
    DEVELOPING: "DEVELOPING";
    TESTING: "TESTING";
    DONE: "DONE";
    HOLD: "HOLD";
    REJECTED: "REJECTED";
}>;
export type RequirementLifecycle = z.infer<typeof RequirementLifecycleSchema>;
/** 우선순위(⑤). */
export declare const PrioritySchema: z.ZodEnum<{
    HIGH: "HIGH";
    MEDIUM: "MEDIUM";
    LOW: "LOW";
}>;
export type Priority = z.infer<typeof PrioritySchema>;
/** 요구사항 출처/메타(⑤) — 원문 + 요청자·출처문서·요청일·대상 릴리스. */
export declare const RequirementSourceSchema: z.ZodNullable<z.ZodObject<{
    kind: z.ZodString;
    raw: z.ZodString;
    requester: z.ZodOptional<z.ZodString>;
    doc: z.ZodOptional<z.ZodString>;
    section: z.ZodOptional<z.ZodString>;
    requestedAt: z.ZodOptional<z.ZodString>;
    targetRelease: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
export type RequirementSource = z.infer<typeof RequirementSourceSchema>;
/** 변경관리 메타(⑨) — CR 번호·사유·승인자·영향공수(영향도 엔진 산정 연계). */
export declare const ChangeReqSchema: z.ZodNullable<z.ZodObject<{
    crNo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    approver: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    effort: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>>;
export type ChangeReq = z.infer<typeof ChangeReqSchema>;
/** 고객 검수(③ 2축) — 내부확정과 별개로 고객이 요구 충족을 승인하는 축. */
export declare const SignoffSchema: z.ZodNullable<z.ZodObject<{
    approved: z.ZodBoolean;
    by: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    at: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>>;
export type Signoff = z.infer<typeof SignoffSchema>;
/**
 * 요구사항(RTM 뷰② 한 행) — 고객 요청 1건. v2: 유형(②)·메타(⑤)·lifecycle(④)·의존(⑦)·
 * 변경관리(⑨)·고객검수(③)·인수조건(①). changeset 은 AC fnIds 와 일치(applyRequirements 가 검증/도출).
 */
export declare const RtmRequirementSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
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
    nfrScope: z.ZodDefault<z.ZodArray<z.ZodString>>;
    priority: z.ZodDefault<z.ZodEnum<{
        HIGH: "HIGH";
        MEDIUM: "MEDIUM";
        LOW: "LOW";
    }>>;
    lifecycle: z.ZodDefault<z.ZodEnum<{
        RECEIVED: "RECEIVED";
        ANALYZING: "ANALYZING";
        DESIGNING: "DESIGNING";
        DEVELOPING: "DEVELOPING";
        TESTING: "TESTING";
        DONE: "DONE";
        HOLD: "HOLD";
        REJECTED: "REJECTED";
    }>>;
    status: z.ZodEnum<{
        ACTIVE: "ACTIVE";
        SUPERSEDED: "SUPERSEDED";
        WITHDRAWN: "WITHDRAWN";
    }>;
    supersedes: z.ZodNullable<z.ZodString>;
    supersededBy: z.ZodNullable<z.ZodString>;
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString>>;
    source: z.ZodNullable<z.ZodObject<{
        kind: z.ZodString;
        raw: z.ZodString;
        requester: z.ZodOptional<z.ZodString>;
        doc: z.ZodOptional<z.ZodString>;
        section: z.ZodOptional<z.ZodString>;
        requestedAt: z.ZodOptional<z.ZodString>;
        targetRelease: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    changeReq: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        crNo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        approver: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        effort: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    signoff: z.ZodDefault<z.ZodNullable<z.ZodObject<{
        approved: z.ZodBoolean;
        by: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        at: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
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
    changeset: z.ZodObject<{
        added: z.ZodArray<z.ZodString>;
        modified: z.ZodArray<z.ZodString>;
        removed: z.ZodArray<z.ZodString>;
        revived: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type RtmRequirement = z.infer<typeof RtmRequirementSchema>;
/**
 * 커버리지 리포트(⑥) — 요구사항/기능 단위 구현·검증 집계 + 양방향 갭. computeCoverage 가 산출.
 * RTM 의 핵심 가치(빈칸=위험)를 요약 수치로 드러낸다.
 */
export declare const RtmCoverageSchema: z.ZodObject<{
    requirements: z.ZodObject<{
        total: z.ZodNumber;
        implemented: z.ZodNumber;
        verified: z.ZodNumber;
        signedOff: z.ZodNumber;
        byLifecycle: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, z.core.$strip>;
    functions: z.ZodObject<{
        total: z.ZodNumber;
        implemented: z.ZodNumber;
        planned: z.ZodNumber;
        orphaned: z.ZodNumber;
        confirmed: z.ZodNumber;
    }, z.core.$strip>;
    tests: z.ZodObject<{
        total: z.ZodNumber;
        pass: z.ZodNumber;
        fail: z.ZodNumber;
        untested: z.ZodNumber;
    }, z.core.$strip>;
    scenarios: z.ZodOptional<z.ZodObject<{
        total: z.ZodNumber;
        confirmed: z.ZodNumber;
        byKind: z.ZodObject<{
            normal: z.ZodNumber;
            exception: z.ZodNumber;
            boundary: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    gaps: z.ZodObject<{
        unimplemented: z.ZodArray<z.ZodString>;
        orphanCode: z.ZodArray<z.ZodString>;
        unverified: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    byRequirement: z.ZodRecord<z.ZodString, z.ZodObject<{
        targetsTotal: z.ZodNumber;
        targetsBuilt: z.ZodNumber;
        acsTotal: z.ZodNumber;
        acsPassed: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type RtmCoverage = z.infer<typeof RtmCoverageSchema>;
/**
 * 무결성 진단(critic C1/C2/M4/M5) — LLM 인테이크 산출은 잘못될 수 있으므로 참조 무결성을
 * 강제 대신 **가시화**한다(조용한 손실 금지). error=치명(댕글링/순환/드롭), warn=주의(불일치).
 */
export declare const RtmDiagnosticSchema: z.ZodObject<{
    level: z.ZodEnum<{
        error: "error";
        warn: "warn";
    }>;
    code: z.ZodString;
    message: z.ZodString;
    ref: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type RtmDiagnostic = z.infer<typeof RtmDiagnosticSchema>;
/** 감사 이벤트 — append-only(누가 언제 무엇을). */
export declare const RtmAuditEventSchema: z.ZodObject<{
    event: z.ZodString;
    by: z.ZodString;
    at: z.ZodString;
}, z.core.$strip>;
export type RtmAuditEvent = z.infer<typeof RtmAuditEventSchema>;
/** 기능 행 오버레이(R3) — 셀 교정 + 확정자. on-disk 에서는 fnId 키로 최상위. */
export declare const RtmFunctionOverrideSchema: z.ZodObject<{
    editedCells: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    approver: z.ZodString;
    at: z.ZodString;
    audit: z.ZodDefault<z.ZodArray<z.ZodObject<{
        event: z.ZodString;
        by: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type RtmFunctionOverride = z.infer<typeof RtmFunctionOverrideSchema>;
/** 시험결과 오버레이 — AC 테스트의 PASS/FAIL/NA + 결함(사람 실측 입력, critic ⓐ). */
export declare const RtmTestOverrideSchema: z.ZodObject<{
    result: z.ZodEnum<{
        PASS: "PASS";
        FAIL: "FAIL";
        NA: "NA";
        UNTESTED: "UNTESTED";
    }>;
    defectId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type RtmTestOverride = z.infer<typeof RtmTestOverrideSchema>;
/**
 * 요구사항 오버레이 — lifecycle 전이·고객검수(signoff)·시험결과 기록(검증 스파인 입력 경로).
 * tests 키 = "<acId>::<caseId>". on-disk 에서는 `_requirements` 아래 reqId 키.
 */
export declare const RtmRequirementOverrideSchema: z.ZodObject<{
    lifecycle: z.ZodOptional<z.ZodEnum<{
        RECEIVED: "RECEIVED";
        ANALYZING: "ANALYZING";
        DESIGNING: "DESIGNING";
        DEVELOPING: "DEVELOPING";
        TESTING: "TESTING";
        DONE: "DONE";
        HOLD: "HOLD";
        REJECTED: "REJECTED";
    }>>;
    signoff: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        approved: z.ZodBoolean;
        by: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        at: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    tests: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        result: z.ZodEnum<{
            PASS: "PASS";
            FAIL: "FAIL";
            NA: "NA";
            UNTESTED: "UNTESTED";
        }>;
        defectId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    approver: z.ZodString;
    at: z.ZodString;
    audit: z.ZodDefault<z.ZodArray<z.ZodObject<{
        event: z.ZodString;
        by: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type RtmRequirementOverride = z.infer<typeof RtmRequirementOverrideSchema>;
/**
 * 시나리오 오버레이(W5) — G/W/T·제목 편집 + 확정. on-disk 에서는 `_scenarios` 아래 tsId 키.
 * 적용 시 해당 시나리오 confidence → CONFIRMED. editedCells 키: title/given/when/then.
 */
export declare const RtmScenarioOverrideSchema: z.ZodObject<{
    editedCells: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    approver: z.ZodString;
    at: z.ZodString;
    audit: z.ZodDefault<z.ZodArray<z.ZodObject<{
        event: z.ZodString;
        by: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type RtmScenarioOverride = z.infer<typeof RtmScenarioOverrideSchema>;
/**
 * rtm.json — RTM 구조화 산출물(생성물, 불변). 사람 편집/확정은 rtm-overrides.json 오버레이.
 * coverage 는 computeCoverage 결과(파생). 모든 배열은 정렬되어 byte-identical 재실행을 보장한다.
 */
export declare const RtmModelSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<2>;
    gitCommit: z.ZodNullable<z.ZodString>;
    domains: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        functionCount: z.ZodNumber;
    }, z.core.$strip>>;
    functions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        featureId: z.ZodString;
        name: z.ZodString;
        domainId: z.ZodString;
        domainName: z.ZodString;
        entryPoint: z.ZodObject<{
            value: z.ZodString;
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
        implementation: z.ZodObject<{
            value: z.ZodString;
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
        data: z.ZodObject<{
            value: z.ZodString;
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
        test: z.ZodObject<{
            value: z.ZodString;
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
        origin: z.ZodEnum<{
            AS_IS: "AS_IS";
            TO_BE: "TO_BE";
        }>;
        state: z.ZodEnum<{
            IMPLEMENTED: "IMPLEMENTED";
            PARTIAL: "PARTIAL";
            PLANNED: "PLANNED";
            CHANGED: "CHANGED";
            ORPHANED: "ORPHANED";
        }>;
        requirementHistory: z.ZodArray<z.ZodString>;
        nfrTags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
            reqId: z.ZodString;
            acId: z.ZodString;
            text: z.ZodString;
            kind: z.ZodEnum<{
                exception: "exception";
                branch: "branch";
                precondition: "precondition";
                postcondition: "postcondition";
                rule: "rule";
            }>;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>>;
        deliverableRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
            docId: z.ZodString;
            anchor: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        custom: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strip>>;
    requirements: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
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
        nfrScope: z.ZodDefault<z.ZodArray<z.ZodString>>;
        priority: z.ZodDefault<z.ZodEnum<{
            HIGH: "HIGH";
            MEDIUM: "MEDIUM";
            LOW: "LOW";
        }>>;
        lifecycle: z.ZodDefault<z.ZodEnum<{
            RECEIVED: "RECEIVED";
            ANALYZING: "ANALYZING";
            DESIGNING: "DESIGNING";
            DEVELOPING: "DEVELOPING";
            TESTING: "TESTING";
            DONE: "DONE";
            HOLD: "HOLD";
            REJECTED: "REJECTED";
        }>>;
        status: z.ZodEnum<{
            ACTIVE: "ACTIVE";
            SUPERSEDED: "SUPERSEDED";
            WITHDRAWN: "WITHDRAWN";
        }>;
        supersedes: z.ZodNullable<z.ZodString>;
        supersededBy: z.ZodNullable<z.ZodString>;
        dependsOn: z.ZodDefault<z.ZodArray<z.ZodString>>;
        source: z.ZodNullable<z.ZodObject<{
            kind: z.ZodString;
            raw: z.ZodString;
            requester: z.ZodOptional<z.ZodString>;
            doc: z.ZodOptional<z.ZodString>;
            section: z.ZodOptional<z.ZodString>;
            requestedAt: z.ZodOptional<z.ZodString>;
            targetRelease: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        changeReq: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            crNo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            approver: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            effort: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>>;
        signoff: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            approved: z.ZodBoolean;
            by: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            at: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, z.core.$strip>>>;
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
        changeset: z.ZodObject<{
            added: z.ZodArray<z.ZodString>;
            modified: z.ZodArray<z.ZodString>;
            removed: z.ZodArray<z.ZodString>;
            revived: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    testScenarios: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        fnId: z.ZodString;
        reqId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        acId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        kind: z.ZodEnum<{
            exception: "exception";
            normal: "normal";
            boundary: "boundary";
        }>;
        title: z.ZodString;
        given: z.ZodString;
        when: z.ZodString;
        then: z.ZodString;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        notes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    customFields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        scope: z.ZodLiteral<"function">;
        createdBy: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>>;
    coverage: z.ZodOptional<z.ZodObject<{
        requirements: z.ZodObject<{
            total: z.ZodNumber;
            implemented: z.ZodNumber;
            verified: z.ZodNumber;
            signedOff: z.ZodNumber;
            byLifecycle: z.ZodRecord<z.ZodString, z.ZodNumber>;
        }, z.core.$strip>;
        functions: z.ZodObject<{
            total: z.ZodNumber;
            implemented: z.ZodNumber;
            planned: z.ZodNumber;
            orphaned: z.ZodNumber;
            confirmed: z.ZodNumber;
        }, z.core.$strip>;
        tests: z.ZodObject<{
            total: z.ZodNumber;
            pass: z.ZodNumber;
            fail: z.ZodNumber;
            untested: z.ZodNumber;
        }, z.core.$strip>;
        scenarios: z.ZodOptional<z.ZodObject<{
            total: z.ZodNumber;
            confirmed: z.ZodNumber;
            byKind: z.ZodObject<{
                normal: z.ZodNumber;
                exception: z.ZodNumber;
                boundary: z.ZodNumber;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        gaps: z.ZodObject<{
            unimplemented: z.ZodArray<z.ZodString>;
            orphanCode: z.ZodArray<z.ZodString>;
            unverified: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        byRequirement: z.ZodRecord<z.ZodString, z.ZodObject<{
            targetsTotal: z.ZodNumber;
            targetsBuilt: z.ZodNumber;
            acsTotal: z.ZodNumber;
            acsPassed: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    diagnostics: z.ZodOptional<z.ZodArray<z.ZodObject<{
        level: z.ZodEnum<{
            error: "error";
            warn: "warn";
        }>;
        code: z.ZodString;
        message: z.ZodString;
        ref: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type RtmModel = z.infer<typeof RtmModelSchema>;
//# sourceMappingURL=types.d.ts.map