/**
 * ktds legacy-core — 화면설계서(screen-capture) 스키마.
 *
 * `screens.json`(생성물)과 `screen-overrides.json`(사람 편집 오버레이)의 단일 스키마 지점.
 * 생성물 불변 원칙: Stage A(결정론 캡처)가 기록한 mechanical 사실은 Stage B(LLM 채움)가
 * 수정할 수 없다 — `mechanicalHash` 로 기계 검증한다(assemble.ts).
 */
import { z } from 'zod';
/** screens.json 파일명 — `.understand-anything/` 아래 기록. */
export declare const SCREENS_FILENAME = "screens.json";
/** screen-overrides.json 파일명 — 사람 편집 오버레이(rtm-overrides 동형). */
export declare const SCREEN_OVERRIDES_FILENAME = "screen-overrides.json";
/** 캡처 PNG 디렉터리명 — `.understand-anything/screens/`. */
export declare const SCREENS_DIRNAME = "screens";
/** 문서 좌표(px) 경계 상자 — fullPage 스크린샷과 동일 좌표계(deviceScaleFactor=1). */
export declare const BBoxSchema: z.ZodObject<{
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
}, z.core.$strip>;
export type BBox = z.infer<typeof BBoxSchema>;
/**
 * 주석 종류.
 * - field: 입력 요소(input/select/textarea) — ①②③ 배지.
 * - action: 이벤트 유발 요소(submit/button/onclick) — ⓐⓑⓒ 배지.
 * - link: 내비게이션 링크(a[href]) — action 과 같은 ⓐⓑⓒ 카운터 공유.
 * - region: 영역 묶음(후속 확장용, Stage A 는 생성하지 않음) — ①②③ 카운터 공유.
 */
export declare const AnnotationKindSchema: z.ZodEnum<{
    field: "field";
    action: "action";
    link: "link";
    region: "region";
}>;
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>;
export declare const EventTypeSchema: z.ZodEnum<{
    click: "click";
    link: "link";
    none: "none";
    submit: "submit";
    change: "change";
}>;
export type EventType = z.infer<typeof EventTypeSchema>;
/** Stage A 기계 사실 — Stage B 수정 금지 대상(mechanicalHash 에 포함). */
export declare const MechanicalSchema: z.ZodObject<{
    tag: z.ZodString;
    inputType: z.ZodNullable<z.ZodString>;
    name: z.ZodNullable<z.ZodString>;
    href: z.ZodNullable<z.ZodString>;
    formAction: z.ZodNullable<z.ZodString>;
    formMethod: z.ZodNullable<z.ZodString>;
    onclick: z.ZodNullable<z.ZodString>;
    required: z.ZodBoolean;
}, z.core.$strip>;
export type Mechanical = z.infer<typeof MechanicalSchema>;
export declare const HandlerEvidenceSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    snippet: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type HandlerEvidence = z.infer<typeof HandlerEvidenceSchema>;
/**
 * 이벤트 → 핸들러 유추 결과.
 * Stage A 가 routes.json 결정론 조인으로 CONFIRMED 를 선기입하고,
 * Stage B 가 chain(ActionBean→Service→Mapper 심화)과 미조인 건을 채운다.
 * CONFIRMED 주장은 evidence(file:line) ≥ 1 필수 — fail-closed(validate 게이트).
 */
export declare const HandlerSchema: z.ZodObject<{
    target: z.ZodNullable<z.ZodString>;
    chain: z.ZodArray<z.ZodString>;
    evidence: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    confidence: z.ZodEnum<{
        CONFIRMED: "CONFIRMED";
        CONFIRMED_AI: "CONFIRMED_AI";
        INFERRED: "INFERRED";
        UNVERIFIED: "UNVERIFIED";
    }>;
}, z.core.$strip>;
export type Handler = z.infer<typeof HandlerSchema>;
export declare const AnnotationSchema: z.ZodObject<{
    no: z.ZodNumber;
    kind: z.ZodEnum<{
        field: "field";
        action: "action";
        link: "link";
        region: "region";
    }>;
    selector: z.ZodString;
    bbox: z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    label: z.ZodString;
    eventType: z.ZodEnum<{
        click: "click";
        link: "link";
        none: "none";
        submit: "submit";
        change: "change";
    }>;
    mechanical: z.ZodObject<{
        tag: z.ZodString;
        inputType: z.ZodNullable<z.ZodString>;
        name: z.ZodNullable<z.ZodString>;
        href: z.ZodNullable<z.ZodString>;
        formAction: z.ZodNullable<z.ZodString>;
        formMethod: z.ZodNullable<z.ZodString>;
        onclick: z.ZodNullable<z.ZodString>;
        required: z.ZodBoolean;
    }, z.core.$strip>;
    handler: z.ZodNullable<z.ZodObject<{
        target: z.ZodNullable<z.ZodString>;
        chain: z.ZodArray<z.ZodString>;
        evidence: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
    description: z.ZodNullable<z.ZodString>;
    note: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export declare const ScreenCaptureInfoSchema: z.ZodObject<{
    path: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
    capturedAt: z.ZodString;
    contentHash: z.ZodString;
}, z.core.$strip>;
export type ScreenCaptureInfo = z.infer<typeof ScreenCaptureInfoSchema>;
export declare const ScreenSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    url: z.ZodString;
    jspFile: z.ZodNullable<z.ZodString>;
    graphNodeId: z.ZodNullable<z.ZodString>;
    domain: z.ZodNullable<z.ZodString>;
    scenario: z.ZodNullable<z.ZodString>;
    openedFrom: z.ZodNullable<z.ZodString>;
    contentSignature: z.ZodNullable<z.ZodString>;
    capture: z.ZodObject<{
        path: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
        capturedAt: z.ZodString;
        contentHash: z.ZodString;
    }, z.core.$strip>;
    summary: z.ZodNullable<z.ZodObject<{
        text: z.ZodString;
        confidence: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            CONFIRMED_AI: "CONFIRMED_AI";
            INFERRED: "INFERRED";
            UNVERIFIED: "UNVERIFIED";
        }>;
    }, z.core.$strip>>;
    annotations: z.ZodArray<z.ZodObject<{
        no: z.ZodNumber;
        kind: z.ZodEnum<{
            field: "field";
            action: "action";
            link: "link";
            region: "region";
        }>;
        selector: z.ZodString;
        bbox: z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
        }, z.core.$strip>;
        label: z.ZodString;
        eventType: z.ZodEnum<{
            click: "click";
            link: "link";
            none: "none";
            submit: "submit";
            change: "change";
        }>;
        mechanical: z.ZodObject<{
            tag: z.ZodString;
            inputType: z.ZodNullable<z.ZodString>;
            name: z.ZodNullable<z.ZodString>;
            href: z.ZodNullable<z.ZodString>;
            formAction: z.ZodNullable<z.ZodString>;
            formMethod: z.ZodNullable<z.ZodString>;
            onclick: z.ZodNullable<z.ZodString>;
            required: z.ZodBoolean;
        }, z.core.$strip>;
        handler: z.ZodNullable<z.ZodObject<{
            target: z.ZodNullable<z.ZodString>;
            chain: z.ZodArray<z.ZodString>;
            evidence: z.ZodArray<z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
        description: z.ZodNullable<z.ZodString>;
        note: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Screen = z.infer<typeof ScreenSchema>;
/** 도달 실패 화면의 정직 보고(조용한 스킵 금지). */
export declare const MissingScreenSchema: z.ZodObject<{
    url: z.ZodString;
    reason: z.ZodString;
}, z.core.$strip>;
export type MissingScreen = z.infer<typeof MissingScreenSchema>;
export declare const ScreensFileSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    generatedAt: z.ZodString;
    gitCommit: z.ZodNullable<z.ZodString>;
    baseUrl: z.ZodString;
    viewport: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
    }, z.core.$strip>;
    screens: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        url: z.ZodString;
        jspFile: z.ZodNullable<z.ZodString>;
        graphNodeId: z.ZodNullable<z.ZodString>;
        domain: z.ZodNullable<z.ZodString>;
        scenario: z.ZodNullable<z.ZodString>;
        openedFrom: z.ZodNullable<z.ZodString>;
        contentSignature: z.ZodNullable<z.ZodString>;
        capture: z.ZodObject<{
            path: z.ZodString;
            width: z.ZodNumber;
            height: z.ZodNumber;
            capturedAt: z.ZodString;
            contentHash: z.ZodString;
        }, z.core.$strip>;
        summary: z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>;
        annotations: z.ZodArray<z.ZodObject<{
            no: z.ZodNumber;
            kind: z.ZodEnum<{
                field: "field";
                action: "action";
                link: "link";
                region: "region";
            }>;
            selector: z.ZodString;
            bbox: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
                width: z.ZodNumber;
                height: z.ZodNumber;
            }, z.core.$strip>;
            label: z.ZodString;
            eventType: z.ZodEnum<{
                click: "click";
                link: "link";
                none: "none";
                submit: "submit";
                change: "change";
            }>;
            mechanical: z.ZodObject<{
                tag: z.ZodString;
                inputType: z.ZodNullable<z.ZodString>;
                name: z.ZodNullable<z.ZodString>;
                href: z.ZodNullable<z.ZodString>;
                formAction: z.ZodNullable<z.ZodString>;
                formMethod: z.ZodNullable<z.ZodString>;
                onclick: z.ZodNullable<z.ZodString>;
                required: z.ZodBoolean;
            }, z.core.$strip>;
            handler: z.ZodNullable<z.ZodObject<{
                target: z.ZodNullable<z.ZodString>;
                chain: z.ZodArray<z.ZodString>;
                evidence: z.ZodArray<z.ZodObject<{
                    file: z.ZodString;
                    line: z.ZodNumber;
                    snippet: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                confidence: z.ZodEnum<{
                    CONFIRMED: "CONFIRMED";
                    CONFIRMED_AI: "CONFIRMED_AI";
                    INFERRED: "INFERRED";
                    UNVERIFIED: "UNVERIFIED";
                }>;
            }, z.core.$strip>>;
            description: z.ZodNullable<z.ZodString>;
            note: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    unmatchedJsps: z.ZodArray<z.ZodString>;
    fragments: z.ZodArray<z.ZodString>;
    missing: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
    mechanicalHash: z.ZodString;
}, z.core.$strip>;
export type ScreensFile = z.infer<typeof ScreensFileSchema>;
/** 오버라이드 annotation 키 — `<kind>:<no>`. */
export declare const ANNOTATION_KEY_RE: RegExp;
export declare const ScreenAnnotationOverrideSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
    hidden: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ScreenOverrideEntrySchema: z.ZodObject<{
    approver: z.ZodString;
    at: z.ZodString;
    titleOverride: z.ZodOptional<z.ZodString>;
    annotations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        description: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        note: z.ZodOptional<z.ZodString>;
        hidden: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    confirmed: z.ZodBoolean;
    audit: z.ZodArray<z.ZodObject<{
        event: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            EDITED: "EDITED";
        }>;
        by: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ScreenOverrideEntry = z.infer<typeof ScreenOverrideEntrySchema>;
/** screen-overrides.json — screenId → 오버라이드 레코드. */
export declare const ScreenOverridesSchema: z.ZodRecord<z.ZodString, z.ZodObject<{
    approver: z.ZodString;
    at: z.ZodString;
    titleOverride: z.ZodOptional<z.ZodString>;
    annotations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        description: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        note: z.ZodOptional<z.ZodString>;
        hidden: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    confirmed: z.ZodBoolean;
    audit: z.ZodArray<z.ZodObject<{
        event: z.ZodEnum<{
            CONFIRMED: "CONFIRMED";
            EDITED: "EDITED";
        }>;
        by: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>>;
export type ScreenOverrides = z.infer<typeof ScreenOverridesSchema>;
/**
 * 캡처 러너(playwright, scripts/*.mjs)가 page.$$eval 로 추출해 넘기는 원시 요소 사실.
 * 러너는 관측만 하고 분류/번호는 순수 함수(classify.ts)가 담당한다.
 */
export interface RawElement {
    tag: string;
    inputType: string | null;
    name: string | null;
    domId: string | null;
    text: string | null;
    value: string | null;
    alt: string | null;
    placeholder: string | null;
    href: string | null;
    onclick: string | null;
    formAction: string | null;
    formMethod: string | null;
    required: boolean;
    disabled: boolean;
    visible: boolean;
    bbox: BBox;
    selector: string;
}
//# sourceMappingURL=types.d.ts.map