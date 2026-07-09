import { z } from 'zod';
import type { NodeDetailTemplate } from './node-template.js';
import type { SkeletonReport } from './types.js';
/** `.spec/map/bundle/` 하위 디렉터리 이름. */
export declare const BUNDLE_DIR = "bundle";
/** step 파일당 소스 슬라이스 라인 수 상한. */
export declare const DEFAULT_SLICE_LINES = 80;
/** 번들 전체 소스 슬라이스 문자 수 상한 — LLM 컨텍스트 예산. */
export declare const DEFAULT_BUNDLE_CHAR_CAP = 120000;
export declare const SourceSliceSchema: z.ZodObject<{
    startLine: z.ZodNumber;
    endLine: z.ZodNumber;
    text: z.ZodString;
    truncated: z.ZodBoolean;
}, z.core.$strip>;
export type SourceSlice = z.infer<typeof SourceSliceSchema>;
export declare const BundleFileSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type BundleFile = z.infer<typeof BundleFileSchema>;
export declare const DomainBundleSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    domainId: z.ZodString;
    key: z.ZodString;
    name: z.ZodString;
    flows: z.ZodArray<z.ZodObject<{
        flowId: z.ZodString;
        entryPoint: z.ZodString;
        entryType: z.ZodString;
        filePath: z.ZodString;
        line: z.ZodNumber;
        stepIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodObject<{
        stepId: z.ZodString;
        relPath: z.ZodString;
        layer: z.ZodOptional<z.ZodEnum<{
            unknown: "unknown";
            api: "api";
            service: "service";
            dao: "dao";
            db: "db";
        }>>;
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
    nodeDetailTemplate: z.ZodObject<{
        version: z.ZodLiteral<2>;
        byLayer: z.ZodObject<{
            api: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                promptHint: z.ZodString;
            }, z.core.$strip>>>;
            service: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                promptHint: z.ZodString;
            }, z.core.$strip>>>;
            dao: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                promptHint: z.ZodString;
            }, z.core.$strip>>>;
            db: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                promptHint: z.ZodString;
            }, z.core.$strip>>>;
            unknown: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                promptHint: z.ZodString;
            }, z.core.$strip>>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type DomainBundle = z.infer<typeof DomainBundleSchema>;
export interface BuildBundlesOptions {
    sliceLines?: number;
    charCap?: number;
    /**
     * P4: step 상세 채움 템플릿. 보통 .mjs 가 templates/node-detail-sections.md 를
     * 읽어 파싱해 주입한다(사람 편집 권위). 미지정이면 내장 기본(DEFAULT)으로 폴백.
     */
    nodeDetailTemplate?: NodeDetailTemplate;
}
/**
 * 도메인 key → 파일명. 경로 구분자/특수문자를 `_` 로 치환하고, 경로 세그먼트·
 * 숨김·빈 이름은 거부(fail-closed) — `.spec/map/bundle` 밖 탈출 차단.
 */
export declare function safeKeyFilename(key: string): string;
/** `.spec/map/bundle/` 디렉터리 경로. */
export declare function bundleDir(projectRoot: string): string;
/**
 * skeleton 의 도메인별 번들을 조립해 `.spec/map/bundle/<safeKey>.json` 으로 영속한다.
 * 파일 슬라이스는 relPath 정렬 순서로 charCap 까지 채우고, 초과분은 slice=null +
 * sliceOmitted 에 보고한다. 반환값의 paths 는 기록한 파일들의 절대 경로다.
 */
export declare function buildBundles(projectRoot: string, skeleton: SkeletonReport, options?: BuildBundlesOptions): Promise<{
    bundles: DomainBundle[];
    paths: string[];
}>;
//# sourceMappingURL=bundle.d.ts.map