import { z } from 'zod';
import { validateScreensFile } from './assemble.js';
/** `.spec/map/screens-fill-prep/` — 청크(팬아웃 입력) 디렉터리 이름. */
export declare const SCREEN_FILL_PREP_DIR = "screens-fill-prep";
/** `.spec/map/screens-fill-frag/` — 조각(팬아웃 출력) 디렉터리 이름. */
export declare const SCREEN_FILL_FRAG_DIR = "screens-fill-frag";
/** 청크 색인 파일명(`screens-fill-prep/` 하위). */
export declare const SCREEN_FILL_PREP_INDEX_FILENAME = "index.json";
/** 청크당 화면 수 기본값 — 청크 1개가 에이전트 1회 컨텍스트에 들어가는 유계. */
export declare const DEFAULT_CHUNK_SCREENS = 6;
/** 팬아웃 에이전트 1명이 읽는 자립 청크 — screens.json 의 부분집합 + pre-cite. */
export declare const ScreenFillChunkSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    chunkId: z.ZodString;
    domain: z.ZodNullable<z.ZodString>;
    screens: z.ZodArray<z.ZodObject<{
        screenId: z.ZodString;
        title: z.ZodString;
        url: z.ZodString;
        domain: z.ZodNullable<z.ZodString>;
        jspFile: z.ZodNullable<z.ZodString>;
        graphNodeId: z.ZodNullable<z.ZodString>;
        contentSignature: z.ZodNullable<z.ZodString>;
        openedFrom: z.ZodNullable<z.ZodString>;
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
            key: z.ZodString;
            kind: z.ZodString;
            label: z.ZodString;
            eventType: z.ZodString;
            target: z.ZodNullable<z.ZodString>;
            confidence: z.ZodNullable<z.ZodString>;
            description: z.ZodNullable<z.ZodString>;
            note: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    handlerDict: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        routeEvidence: z.ZodNullable<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
        chainCandidates: z.ZodArray<z.ZodObject<{
            caller: z.ZodString;
            callee: z.ZodString;
            preCite: z.ZodNullable<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    files: z.ZodArray<z.ZodObject<{
        relPath: z.ZodString;
        className: z.ZodNullable<z.ZodString>;
        line: z.ZodNumber;
        slice: z.ZodNullable<z.ZodObject<{
            startLine: z.ZodNumber;
            endLine: z.ZodNumber;
            text: z.ZodString;
            truncated: z.ZodBoolean;
        }, z.core.$strip>>;
        kgHint: z.ZodNullable<z.ZodObject<{
            summary: z.ZodString;
            tags: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    sliceOmitted: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ScreenFillChunk = z.infer<typeof ScreenFillChunkSchema>;
export declare const ScreenFillChunkIndexSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    chunkScreens: z.ZodNumber;
    chunks: z.ZodArray<z.ZodObject<{
        chunkId: z.ZodString;
        domain: z.ZodNullable<z.ZodString>;
        screenIds: z.ZodArray<z.ZodString>;
        annotationCount: z.ZodNumber;
        handlerPreCiteMissing: z.ZodNumber;
    }, z.core.$strip>>;
    totals: z.ZodObject<{
        screens: z.ZodNumber;
        chunks: z.ZodNumber;
        annotations: z.ZodNumber;
        handlerPreCiteMissing: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ScreenFillChunkIndex = z.infer<typeof ScreenFillChunkIndexSchema>;
/** 팬아웃 에이전트가 쓰는 조각 — 청크 화면들의 채움 필드 집합. */
export declare const ScreenFillFragmentSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    chunkId: z.ZodString;
    screens: z.ZodArray<z.ZodObject<{
        screenId: z.ZodString;
        jspFile: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        graphNodeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        title: z.ZodOptional<z.ZodString>;
        summary: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            text: z.ZodString;
            confidence: z.ZodEnum<{
                CONFIRMED: "CONFIRMED";
                CONFIRMED_AI: "CONFIRMED_AI";
                INFERRED: "INFERRED";
                UNVERIFIED: "UNVERIFIED";
            }>;
        }, z.core.$strip>>>;
        annotations: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            handler: z.ZodOptional<z.ZodNullable<z.ZodObject<{
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
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ScreenFillFragment = z.infer<typeof ScreenFillFragmentSchema>;
/** `.spec/map/screens-fill-prep/` 디렉터리 경로. */
export declare function screenFillPrepDir(projectRoot: string): string;
/** `.spec/map/screens-fill-frag/` 디렉터리 경로. */
export declare function screenFillFragDir(projectRoot: string): string;
/** 청크 색인을 읽는다 — 없으면 안내와 함께 던진다(fail-closed). */
export declare function readScreenFillChunkIndex(projectRoot: string): Promise<ScreenFillChunkIndex>;
export interface PrepScreenFillOptions {
    /** 청크당 화면 수(기본 DEFAULT_CHUNK_SCREENS). */
    chunkScreens?: number;
    /** 청크당 소스 슬라이스 문자 예산(기본 DEFAULT_CHUNK_CHAR_CAP). */
    charCap?: number;
}
/**
 * screens.json 을 팬아웃 청크로 분해해 `.spec/map/screens-fill-prep/` 에 영속한다.
 * 화면을 도메인(JSP 폴더 파생) 우선으로 그룹핑하고, 각 그룹을 chunkScreens 개
 * 단위로 자른다(주석을 화면에서 분리하지 않는다 — 화면 단위로만 자름). 각 청크에
 * 핸들러 사전(routes/method-calls 결정론 조인의 pre-cite)과 컨트롤러/서비스 소스
 * 슬라이스를 charCap 안에서 동봉한다. 기존 prep/*.json 은 전부 지우고 다시 쓴다
 * (청크 수 변경 시 낡은 청크 잔존 방지 — frag/ 는 재개 자산이라 보존).
 */
export declare function prepScreenFill(projectRoot: string, options?: PrepScreenFillOptions): Promise<{
    index: ScreenFillChunkIndex;
    paths: string[];
}>;
export interface ScreenFragmentAudit {
    complete: string[];
    incomplete: Array<{
        chunkId: string;
        reason: string;
    }>;
}
/**
 * 조각 완결성 감사 — 존재 ∧ JSON ∧ 스키마 ∧ chunkId 정합 ∧ 커버리지(선언 화면 id +
 * 화면별 선언 주석 key 전수) ∧ 신뢰도(CONFIRMED/CONFIRMED_AI ⇒ evidence ≥ 1).
 * 완료의 진실은 이 감사가 결정한다(에이전트 ack 아님). `only` 로 부분 감사(스킵 가드용).
 */
export declare function auditScreenFillFragments(projectRoot: string, only?: string[]): Promise<ScreenFragmentAudit>;
export interface MergeScreenFillResult {
    screensPath: string;
    /** 완결 조각으로 채움 반영된 화면 수. */
    screensFilled: number;
    /** 청크 선언됐으나 완결 조각이 없어 미반영된 화면 id(부분 병합). */
    missingScreens: string[];
    /** 조각이 청크 선언 밖 화면/주석 key 를 내 버린 항목 수(유령 id — 병합서 제외). */
    droppedItems: number;
    /** 인용 진위 검증에서 실파일과 불일치해 제거된 조각 신규 evidence 수. */
    citationsRemoved: number;
    /** 인용 제거로 evidence 가 0 이 되어 CONFIRMED→INFERRED 강등된 handler 수(fail-closed). */
    handlersDemoted: number;
    /** 병합 후 재계산한 unmatchedJsps(KG 있을 때). */
    unmatchedJsps: string[];
    /** 병합 후 validate 게이트 결과. */
    validation: ReturnType<typeof validateScreensFile>;
}
/**
 * 조각의 **채움 필드만** screens.json 본체에 병합한다. 불변 봉인 필드
 * (no/kind/selector/bbox/eventType/mechanical)는 본체 값을 유지하고, 조각이 담은
 * 채움 필드(screen: jspFile/graphNodeId/title/summary, annotation: description/note/
 * handler)만 반영한다. 청크 선언 밖 화면/주석 key 는 버리고 집계 보고한다. 완결
 * 조각이 없는 화면은 본체 그대로 둔다(부분 병합 — 재개 시 나머지 청크가 메운다).
 * 병합 후 unmatchedJsps 재계산(KG) + mechanicalHash 재산출(불변이라 동일) +
 * validateScreensFile 게이트로 최종 검증한다.
 */
export declare function mergeScreenFillFragments(projectRoot: string): Promise<MergeScreenFillResult>;
//# sourceMappingURL=fill-fanout.d.ts.map