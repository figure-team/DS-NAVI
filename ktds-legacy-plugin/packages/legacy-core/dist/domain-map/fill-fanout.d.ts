import { z } from 'zod';
/** `.spec/map/fill-prep/` — 청크(팬아웃 입력) 디렉터리 이름. */
export declare const FILL_PREP_DIR = "fill-prep";
/** `.spec/map/fill-frag/` — 조각(팬아웃 출력) 디렉터리 이름. */
export declare const FILL_FRAG_DIR = "fill-frag";
/** 청크 색인 파일명(`fill-prep/` 하위). */
export declare const FILL_PREP_INDEX_FILENAME = "index.json";
/** 청크당 흐름 수 기본값 — egov 실증값(93청크/1,255흐름). */
export declare const DEFAULT_CHUNK_FLOWS = 20;
/** 청크당 소스 슬라이스 문자 예산 — 에이전트 1회 컨텍스트 유계. */
export declare const DEFAULT_CHUNK_CHAR_CAP = 60000;
/** 팬아웃 에이전트 1명이 읽는 자립 청크 — bundle 의 부분집합 + pre-cite. */
export declare const FillChunkSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    chunkId: z.ZodString;
    domainId: z.ZodString;
    key: z.ZodString;
    domainName: z.ZodString;
    isHeaderChunk: z.ZodBoolean;
    flows: z.ZodArray<z.ZodObject<{
        flowId: z.ZodString;
        entryPoint: z.ZodString;
        entryType: z.ZodString;
        filePath: z.ZodString;
        line: z.ZodNumber;
        stepIds: z.ZodArray<z.ZodString>;
        preCite: z.ZodNullable<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
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
        preCite: z.ZodNullable<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
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
    header: z.ZodNullable<z.ZodObject<{
        flowIndex: z.ZodArray<z.ZodObject<{
            flowId: z.ZodString;
            entryPoint: z.ZodString;
            entryType: z.ZodString;
            filePath: z.ZodString;
            line: z.ZodNumber;
            preCite: z.ZodNullable<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
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
export type FillChunk = z.infer<typeof FillChunkSchema>;
export declare const FillChunkIndexSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    chunkFlows: z.ZodNumber;
    chunks: z.ZodArray<z.ZodObject<{
        chunkId: z.ZodString;
        domainId: z.ZodString;
        key: z.ZodString;
        isHeaderChunk: z.ZodBoolean;
        flowCount: z.ZodNumber;
        stepCount: z.ZodNumber;
        preCiteMissing: z.ZodNumber;
    }, z.core.$strip>>;
    totals: z.ZodObject<{
        domains: z.ZodNumber;
        chunks: z.ZodNumber;
        flows: z.ZodNumber;
        steps: z.ZodNumber;
        preCiteMissing: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type FillChunkIndex = z.infer<typeof FillChunkIndexSchema>;
/** 팬아웃 에이전트가 쓰는 조각 — DomainFill 의 청크 단위 부분집합. */
export declare const FillFragmentSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    chunkId: z.ZodString;
    domainId: z.ZodString;
    header: z.ZodNullable<z.ZodObject<{
        name: z.ZodString;
        summary: z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        entities: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        businessRules: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        crossDomainInteractions: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        businessFlows: z.ZodOptional<z.ZodArray<z.ZodObject<{
            nodes: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                kind: z.ZodEnum<{
                    start: "start";
                    end: "end";
                    activity: "activity";
                    decision: "decision";
                }>;
                label: z.ZodString;
                flowRef: z.ZodOptional<z.ZodString>;
                citations: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    filePath: z.ZodString;
                    line: z.ZodNumber;
                    snippet: z.ZodString;
                }, z.core.$strip>>>;
            }, z.core.$strip>>;
            edges: z.ZodArray<z.ZodObject<{
                from: z.ZodString;
                to: z.ZodString;
                label: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            title: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    flows: z.ZodArray<z.ZodObject<{
        flowId: z.ZodString;
        name: z.ZodString;
        summary: z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    steps: z.ZodArray<z.ZodObject<{
        stepId: z.ZodString;
        name: z.ZodString;
        summary: z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            text: z.ZodString;
            citations: z.ZodArray<z.ZodObject<{
                filePath: z.ZodString;
                line: z.ZodNumber;
                snippet: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FillFragment = z.infer<typeof FillFragmentSchema>;
/** `.spec/map/fill-prep/` 디렉터리 경로. */
export declare function fillPrepDir(projectRoot: string): string;
/** `.spec/map/fill-frag/` 디렉터리 경로. */
export declare function fillFragDir(projectRoot: string): string;
/** 청크 색인을 읽는다 — 없으면 안내와 함께 던진다(fail-closed). */
export declare function readFillChunkIndex(projectRoot: string): Promise<FillChunkIndex>;
export interface PrepFillChunksOptions {
    /** 청크당 흐름 수(기본 DEFAULT_CHUNK_FLOWS). */
    chunkFlows?: number;
    /** 청크당 소스 슬라이스 문자 예산(기본 DEFAULT_CHUNK_CHAR_CAP). */
    charCap?: number;
}
/**
 * 번들을 팬아웃 청크로 분해해 `.spec/map/fill-prep/` 에 영속한다.
 * 각 도메인의 흐름을 chunkFlows 개 단위로 자르고(첫 청크 = 헤더 청크), 흐름·단계
 * 마다 pre-cite 를 실파일에서 추출해 동봉한다. 번들에서 슬라이스가 생략된 파일
 * (sliceOmitted)은 청크 예산 안에서 재슬라이스를 시도한다(청크가 도메인보다 작아
 * 예산이 남는다 — egov 506개 생략 커버 실증). 기존 fill-prep/*.json 은 전부 지우고
 * 다시 쓴다(청크 수 변경 시 낡은 청크 잔존 방지 — fill-frag/ 는 재개 자산이라 보존).
 */
export declare function prepFillChunks(projectRoot: string, options?: PrepFillChunksOptions): Promise<{
    index: FillChunkIndex;
    paths: string[];
}>;
export interface FragmentAudit {
    complete: string[];
    incomplete: Array<{
        chunkId: string;
        reason: string;
    }>;
}
/**
 * 조각 완결성 감사 — 존재 ∧ JSON ∧ 스키마 ∧ chunkId/domainId 정합 ∧ 헤더 존재
 * (헤더 청크) ∧ 커버리지(조각 flow/step id ⊇ 청크 선언 id). 완료의 진실은 이
 * 감사가 결정한다(에이전트 ack 아님). `only` 로 청크 부분 감사(스킵 가드용).
 */
export declare function auditFillFragments(projectRoot: string, only?: string[]): Promise<FragmentAudit>;
export interface MergeFillResult {
    /** fill/<key>.json 으로 병합된 도메인. */
    written: Array<{
        key: string;
        path: string;
        flows: number;
        steps: number;
        /** 이 도메인에서 감사 미통과로 빠진 청크(부분 병합 — emit 폴백이 메운다). */
        missingChunks: string[];
    }>;
    /** 헤더 청크 미완결로 병합 자체를 못 한 도메인(fill 미기록 → emit pending). */
    skippedDomains: Array<{
        key: string;
        reason: string;
    }>;
    /** 조각이 청크 선언 밖 id 를 내 버린 항목 수(도메인 밖/유령 id — 병합서 제외). */
    droppedItems: number;
}
/**
 * 조각을 도메인별 DomainFill 로 병합해 `.spec/map/fill/<key>.json` 에 쓴다.
 * 헤더(도메인 수준 필드)는 헤더 청크 조각에서, flows/steps 는 청크 순서로 이어
 * 붙이되 id dedupe(첫 등장 우선) + 청크 선언 밖 id 는 버리고 집계 보고한다.
 * 헤더 청크가 미완결인 도메인은 기록하지 않는다(pending 유지 — 도메인 단위 멱등).
 */
export declare function mergeFillFragments(projectRoot: string): Promise<MergeFillResult>;
//# sourceMappingURL=fill-fanout.d.ts.map