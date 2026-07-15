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
/**
 * ★ 인용(citation) 모양 = `EvidenceSchema`(`{file, line, snippet?}`) 재사용.
 *
 * 후보가 둘이었다(설계: RTM_IMPACT_GATE_DESIGN.md §6.4).
 *  - `doc-generator/types.ts` `EvidenceSchema` `{file, line: nullable, snippet?}`
 *  - `domain-map/fill.ts` `CitationSchema` `{filePath, line: positive, snippet: min(8)}`
 *
 * **EvidenceSchema 를 고른 이유 — RTM 계열의 기존 관례이기 때문이다.**
 *  1) 이 파일이 이미 재사용하는 `types.ts`(rtm.json 정식 스키마)가 셀 근거(`evidence: [{file,line}]`,
 *     types.ts:25)·테스트 시나리오 근거(types.ts:145)를 전부 EvidenceSchema 로 쓴다. ⑤ 단계가
 *     identified.json → rtm-requirements.json 으로 **투영**(P5)하므로 두 쪽 모양이 같아야 변환이
 *     무손실이다. CitationSchema 를 쓰면 투영 지점마다 `filePath`↔`file` 매핑이 생긴다.
 *  2) `line` 이 **nullable** 이어야 한다. 인테이크는 TO-BE 설계라 "이 파일 근처"까지만 아는 근거가
 *     정상이다(동적/불명 → null). CitationSchema 의 `line: positive` 는 이를 표현할 수 없다.
 *  3) CitationSchema 의 `snippet: min(8)` 강제는 **검증기가 실파일과 대조**하는 domain-map fill
 *     파이프라인 전용 계약이다(fill.ts:28-30). 인테이크엔 그 대조기가 없어 지킬 수 없는 약속이 된다.
 *
 * 필드명도 같은 이유로 `citations` 가 아닌 **`evidence`** 다(RTM 계열 어휘 = evidence).
 */
export declare const IntakeEvidenceSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNullable<z.ZodNumber>;
    snippet: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type IntakeEvidence = z.infer<typeof IntakeEvidenceSchema>;
/**
 * 화면 축(P2) — `screens.json` 의 화면/주석을 가리킨다.
 *
 * 실측(examples/jpetstore-6): `screens[].id` = `screen:actions/Account.action__signonForm`,
 * 그 안에 `annotations[]` 16건이 `no`(1-based, 화면 내 안정 키)·`selector`·`bbox`·
 * `handler.evidence[{file,line,snippet}]` 를 갖는다.
 *
 * **참조만 담고 복제하지 않는다.** `selector`·`bbox`·`handler.evidence` 는 screens.json 이 원본이고
 * 재생성마다 바뀐다 — 여기 베끼면 즉시 낡는다. (screenId, annotationNo) 조인 키만 들고,
 * 나머지는 소비처가 screens.json 에서 조회한다(도메인·데이터 축이 id 로만 가리키는 관례와 동일).
 *
 * `annotationNo: null` = 화면 전체 참조(특정 요소 아님). 이 축이 §1.2 의 마지막 결함
 * — AC-1 "로그인 폼에 '카카오로 로그인' 버튼을 노출한다"가 어느 화면인지 못 가리킴 — 을 푼다.
 */
export declare const IntakeScreenRefSchema: z.ZodObject<{
    screenId: z.ZodString;
    annotationNo: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    note: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type IntakeScreenRef = z.infer<typeof IntakeScreenRefSchema>;
/**
 * 정책 축(P2) — `doc-output/policy-*.md` 의 절/규칙 행을 가리킨다.
 *
 * 실측(policy-domain-account.md): §4 의사결정 테이블이 행마다 `정책 ID`(`PL-001`)·`신뢰도`·`근거`
 * (`AccountActionBean.java:163`) 를 갖고, §8 같은 산문 절도 참조 대상이다(설계서 §1.2 가 지목한
 * "SIGNON.PASSWORD 평문" 쟁점이 §8 에 있다).
 *
 * → **절 단위(section) + 행 단위(ruleId) 둘 다** 필요하다. ruleId 가 null 이면 절 전체 참조.
 * 정책 md 는 `.understand-anything/doc-output/` 상대 파일명으로 가리킨다(md 는 파일이 곧 도메인).
 */
export declare const IntakePolicyRefSchema: z.ZodObject<{
    doc: z.ZodString;
    section: z.ZodDefault<z.ZodString>;
    ruleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    note: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type IntakePolicyRef = z.infer<typeof IntakePolicyRefSchema>;
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
 * 인테이크 AC(P2 확장) — rtm.json 정식 AC(`AcceptanceCriterionSchema`)에 인용·화면·정책 축을 얹는다.
 *
 * **`types.ts` 원본을 건드리지 않고 여기서 `.extend()` 하는 이유**: 인테이크는 TO-BE 중간산출이고
 * rtm.json 은 AS-IS 정식 스키마다. 원본에 필드를 더하면 28개 기능 행 전량과 대시보드 소비처가
 * 함께 흔들린다 — P2 범위(identified.json 스키마)를 넘는다. 투영(P5) 시점에 정식 스키마의
 * `evidence`(모양 동일)로 그대로 흘려보낼 수 있다.
 */
export declare const IntakeAcceptanceCriterionSchema: z.ZodObject<{
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
    evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    screenRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        screenId: z.ZodString;
        annotationNo: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        note: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>>;
    policyRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        doc: z.ZodString;
        section: z.ZodDefault<z.ZodString>;
        ruleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        note: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type IntakeAcceptanceCriterion = z.infer<typeof IntakeAcceptanceCriterionSchema>;
/**
 * 인테이크 changeset(P2 확장) — 변경 묶음을 그렇게 가른 근거.
 *
 * 인용은 **묶음 단위 1개**다(항목별이 아니라). `added/modified/removed/revived` 는 문자열 배열이라
 * 항목별 인용을 달려면 배열 원소를 객체로 바꿔야 하는데, 그건 `RtmChangesetSchema` 와 모양이
 * 갈라져 투영(P5)을 깨는 **파괴적 변경**이다. 항목 단위 근거가 필요하면 AC(`fnIds` + `evidence`)가
 * 이미 그 자리다 — AC 가 요구사항↔기능 N:M 다리라는 원설계(types.ts:50)와 일치한다.
 */
export declare const IntakeChangesetSchema: z.ZodObject<{
    added: z.ZodArray<z.ZodString>;
    modified: z.ZodArray<z.ZodString>;
    removed: z.ZodArray<z.ZodString>;
    revived: z.ZodArray<z.ZodString>;
    evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type IntakeChangeset = z.infer<typeof IntakeChangesetSchema>;
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
        evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        screenRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
            screenId: z.ZodString;
            annotationNo: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            note: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>>>;
        policyRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
            doc: z.ZodString;
            section: z.ZodDefault<z.ZodString>;
            ruleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            note: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    changeset: z.ZodDefault<z.ZodObject<{
        added: z.ZodArray<z.ZodString>;
        modified: z.ZodArray<z.ZodString>;
        removed: z.ZodArray<z.ZodString>;
        revived: z.ZodArray<z.ZodString>;
        evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    screenRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        screenId: z.ZodString;
        annotationNo: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        note: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>>;
    policyRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        doc: z.ZodString;
        section: z.ZodDefault<z.ZodString>;
        ruleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        note: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>>;
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
            evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNullable<z.ZodNumber>;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            screenRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
                screenId: z.ZodString;
                annotationNo: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
                note: z.ZodDefault<z.ZodString>;
            }, z.core.$strip>>>;
            policyRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
                doc: z.ZodString;
                section: z.ZodDefault<z.ZodString>;
                ruleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                note: z.ZodDefault<z.ZodString>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>>;
        changeset: z.ZodDefault<z.ZodObject<{
            added: z.ZodArray<z.ZodString>;
            modified: z.ZodArray<z.ZodString>;
            removed: z.ZodArray<z.ZodString>;
            revived: z.ZodArray<z.ZodString>;
            evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNullable<z.ZodNumber>;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        screenRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
            screenId: z.ZodString;
            annotationNo: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            note: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>>>;
        policyRefs: z.ZodDefault<z.ZodArray<z.ZodObject<{
            doc: z.ZodString;
            section: z.ZodDefault<z.ZodString>;
            ruleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            note: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>>>;
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
 * ① 실재 대조 게이트(P1)의 인벤토리 — **분석 산출물에서 읽은 "실재하는 것"의 목록**.
 *
 * 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.1-4 ("실재 대조: changeset fnId ⊂ rtm.json /
 * 테이블 ⊂ db-schema … 결정론, fail-closed ← OAUTH_ACCOUNT 발명 차단").
 *
 * 이 파일은 순수 함수 관례다 — 파일을 읽지 않는다. 호출자(IO 경계 = `scripts/rtm-intake.mjs`)가
 * rtm.json·db-schema.json 에서 읽어 **주입**한다. 각 축은 optional 이고, 미주입(undefined)이면
 * 그 축의 대조를 **생략**한다(하위호환 — 인벤토리를 모르는 기존 호출자의 동작 불변).
 *
 * 축 추가(P4 화면 ⊂ screens.json 등)는 필드 additive 로 확장한다.
 */
export interface IntakeInventory {
    /** rtm.json `functions[].id` — 실존(또는 이미 계획 확정된) 기능 id 전량. */
    fnIds?: string[];
    /** db-schema.json `tables[].name` — 실존 테이블명 전량. */
    tables?: string[];
}
/**
 * 실재 대조 소견 1건. kind 는 축 추가 시 확장한다.
 *
 * `level` 이 등급을 가른다(P1b 교정 — 초판은 전건 차단이라 정당한 신규 제안까지 오차단했다):
 *  - `error`: fail-closed 차단(호출자 exit 2). 명백한 오류 — 실재하지 않는 기존 기능을 바꾼다고
 *    하거나(`unknown-fn`), 신규 테이블을 `[확정]` 으로 단언(`unknown-table` + CONFIRMED).
 *  - `info`: 차단하지 않고 표면화만. 신규 테이블 제안 자체는 **정당하다**(카카오 로그인에
 *    OAUTH_ACCOUNT 를 제안하는 건 죄가 아니다 — OAuth 연동 정보는 어딘가 저장해야 한다).
 *    "db-schema 를 안 보고 제안했다"는 게이트로 검출 불가 — P3 근거 번들·P2/P5 인용 요구가 푼다.
 */
export interface IntakeGroundingViolation {
    /**
     * `uncited-confirmed`(P2) 는 앞의 둘과 결이 다르다 — **인벤토리가 필요 없다**(항목 자신의
     * 인용 유무만 본다). 그래서 인벤토리 미주입 호출에서도 검사된다.
     */
    kind: 'unknown-fn' | 'unknown-table' | 'uncited-confirmed';
    /**
     * 등급 — `error` 만 차단(exit 2). `info` 는 표면화 후 통과.
     * additive 필드다(P1b). 등급을 모르는 기존 소비처는 전건을 그대로 보므로 동작이 안 깨진다.
     */
    level: 'error' | 'info';
    /** 위반이 속한 요구사항 id. */
    reqId: string;
    /** 위반이 나온 자리(예: `changeset.modified`, `spec.flow`). */
    field: string;
    /** 실재하지 않는 값(fnId 또는 테이블명). */
    value: string;
    /** 사람이 읽는 메시지. */
    message: string;
}
export declare function extractTableRefs(text: string): string[];
/**
 * ★ 실재 대조(P1, P1b 교정) — 인테이크의 기능·테이블 참조를 분석 산출물과 결정론 대조한다.
 *
 * - **fnId**(전건 `error`): `changeset.modified/removed/revived` 는 이미 존재해야 한다(바꾸려면
 *   있어야 하니까 — 없는 걸 modified 라 하는 건 명백한 오류). `added` 는 신규라 `to-be:` 접두
 *   항목을 **면제**한다. 접두 없는 `added` 는 "기존 것을 추가한다"는 모순이므로 대조 대상이다.
 * - **테이블**(등급 분기): 자유텍스트의 `이름(CRUD)` 표기만(`extractTableRefs` 의 좁은 계약).
 *   db-schema 에 없으면 **신규 제안**이다 — 그 자체는 정당하므로 `info`. 단 `[확정]`/CONFIRMED 로
 *   **단언**하면 `error`(L1 `checkCreationL1` 의 "net-new CONFIRMED 금지"와 동일 판정).
 *
 * - **근거↔신뢰도**(P2, 전건 `error`): 인용이 **명시적으로 비었는데**(`evidence: []`) `[확정]`/
 *   CONFIRMED 로 단언하면 위반이다. 저장소 핵심 불변식("CONFIRMED 는 근거 0이면 안 된다",
 *   `doc-generator/types.ts:33`)의 인테이크판이고, 위 테이블 규칙과 같은 뿌리다.
 *   인용 필드 **부재(undefined)는 생략**한다 — 하위호환, `CitationField` 주석 참조.
 *
 * 인벤토리 미주입 축은 생략한다(근거↔신뢰도는 인벤토리와 무관하므로 항상 검사한다).
 * 호출자는 **`level === 'error'` 인 건이 있을 때만 차단**하고, `info` 는 표면화만 한다.
 */
export declare function checkIntakeGrounding(intake: IdentifiedIntake, inventory?: IntakeInventory): IntakeGroundingViolation[];
/**
 * 비치명 일관성 진단(조용한 손실 금지) — 스키마는 통과하지만 의미상 어긋난 것을 표면화한다.
 * 반환 배열이 비면 깨끗. 강제하지 않고 가시화만 한다(critic 규약).
 *
 * ⚠ 여기 담기는 건 **경고**다. 실재 대조(차단)는 `checkIntakeGrounding` 이 따로 맡는다 —
 * 치명/비치명을 한 배열에 섞으면 호출자가 exit 코드를 못 가른다.
 */
export declare function diagnoseIntake(intake: IdentifiedIntake): string[];
//# sourceMappingURL=intake-types.d.ts.map