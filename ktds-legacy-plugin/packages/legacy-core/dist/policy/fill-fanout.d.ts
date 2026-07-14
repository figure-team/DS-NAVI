import { z } from 'zod';
/** `.spec/map/policy-fill-prep/` — 청크(팬아웃 입력) 디렉터리 이름. */
export declare const POLICY_FILL_PREP_DIR = "policy-fill-prep";
/** `.spec/map/policy-fill-frag/` — 조각(팬아웃 출력) 디렉터리 이름. */
export declare const POLICY_FILL_FRAG_DIR = "policy-fill-frag";
/** 청크 색인 파일명(`policy-fill-prep/` 하위). */
export declare const POLICY_FILL_PREP_INDEX_FILENAME = "index.json";
/** 청크당 행 수 기본 상한 — 청크 1개가 에이전트 1회 컨텍스트에 들어가는 유계. */
export declare const DEFAULT_MAX_FILL_ROWS = 40;
/** 정책 신뢰도 3단(SKILL 규약) — 조각/렌더 공통. */
export declare const POLICY_FILL_TAGS: readonly ["확정", "추정", "확인 필요"];
export type PolicyFillTag = (typeof POLICY_FILL_TAGS)[number];
/** 채움 섹션 센티넬 — 병합이 이 사이만 재생성(멱등·앵커 보존). */
export declare const FILL_SECTION_START = "<!-- policy-fill:start -->";
export declare const FILL_SECTION_END = "<!-- policy-fill:end -->";
/** 채움 모드 — 카테고리 정책서 / 도메인 정책서. */
export declare const PolicyFillModeSchema: z.ZodEnum<{
    domain: "domain";
    category: "category";
}>;
export type PolicyFillMode = z.infer<typeof PolicyFillModeSchema>;
/** 청크가 실어 나르는 채움 행 골격 — 결정론 사실(불변) + pre-cite. */
export declare const PolicyFillRowSchema: z.ZodObject<{
    rowKey: z.ZodString;
    docId: z.ZodString;
    subject: z.ZodString;
    detail: z.ZodString;
    category: z.ZodNullable<z.ZodString>;
    kind: z.ZodNullable<z.ZodString>;
    anchor: z.ZodNullable<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>>;
    preCite: z.ZodNullable<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PolicyFillRow = z.infer<typeof PolicyFillRowSchema>;
/** 팬아웃 에이전트 1명이 읽는 자립 청크 — 한 문서의 행 부분집합 + pre-cite + 소스 슬라이스. */
export declare const PolicyFillChunkSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    chunkId: z.ZodString;
    mode: z.ZodEnum<{
        domain: "domain";
        category: "category";
    }>;
    docId: z.ZodString;
    title: z.ZodString;
    rows: z.ZodArray<z.ZodObject<{
        rowKey: z.ZodString;
        docId: z.ZodString;
        subject: z.ZodString;
        detail: z.ZodString;
        category: z.ZodNullable<z.ZodString>;
        kind: z.ZodNullable<z.ZodString>;
        anchor: z.ZodNullable<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>>;
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
}, z.core.$strip>;
export type PolicyFillChunk = z.infer<typeof PolicyFillChunkSchema>;
export declare const PolicyFillChunkIndexSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    mode: z.ZodEnum<{
        domain: "domain";
        category: "category";
    }>;
    maxRows: z.ZodNumber;
    chunks: z.ZodArray<z.ZodObject<{
        chunkId: z.ZodString;
        mode: z.ZodEnum<{
            domain: "domain";
            category: "category";
        }>;
        docId: z.ZodString;
        rowKeys: z.ZodArray<z.ZodString>;
        rowCount: z.ZodNumber;
        preCiteMissing: z.ZodNumber;
    }, z.core.$strip>>;
    skippedDocs: z.ZodArray<z.ZodObject<{
        docId: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strip>>;
    totals: z.ZodObject<{
        docs: z.ZodNumber;
        chunks: z.ZodNumber;
        rows: z.ZodNumber;
        preCiteMissing: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PolicyFillChunkIndex = z.infer<typeof PolicyFillChunkIndexSchema>;
/** 조각 채움 행 — 규범 진술 + 3단 신뢰도 + 근거 인용(불변 사실은 담지 않는다). */
export declare const PolicyFillFragmentRowSchema: z.ZodObject<{
    rowKey: z.ZodString;
    statement: z.ZodString;
    confidence: z.ZodEnum<{
        확정: "확정";
        추정: "추정";
        "\uD655\uC778 \uD544\uC694": "확인 필요";
    }>;
    citations: z.ZodArray<z.ZodObject<{
        filePath: z.ZodString;
        line: z.ZodNumber;
        snippet: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PolicyFillFragmentRow = z.infer<typeof PolicyFillFragmentRowSchema>;
/** 팬아웃 에이전트가 쓰는 조각 — 청크 행들의 채움 집합. */
export declare const PolicyFillFragmentSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    chunkId: z.ZodString;
    rows: z.ZodArray<z.ZodObject<{
        rowKey: z.ZodString;
        statement: z.ZodString;
        confidence: z.ZodEnum<{
            확정: "확정";
            추정: "추정";
            "\uD655\uC778 \uD544\uC694": "확인 필요";
        }>;
        citations: z.ZodArray<z.ZodObject<{
            filePath: z.ZodString;
            line: z.ZodNumber;
            snippet: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PolicyFillFragment = z.infer<typeof PolicyFillFragmentSchema>;
/** `.spec/map/policy-fill-prep/` 디렉터리 경로. */
export declare function policyFillPrepDir(projectRoot: string): string;
/** `.spec/map/policy-fill-frag/` 디렉터리 경로. */
export declare function policyFillFragDir(projectRoot: string): string;
/** 청크 색인을 읽는다 — 없으면 안내와 함께 던진다(fail-closed). */
export declare function readPolicyFillChunkIndex(projectRoot: string): Promise<PolicyFillChunkIndex>;
export interface PrepPolicyFillOptions {
    /** 채움 모드(기본 category). */
    mode?: PolicyFillMode;
    /** 청크당 행 수 상한(기본 DEFAULT_MAX_FILL_ROWS). */
    maxRows?: number;
    /** 청크당 소스 슬라이스 문자 예산(기본 DEFAULT_CHUNK_CHAR_CAP). */
    charCap?: number;
}
/**
 * 채움 단위(카테고리 신호 또는 도메인 분기)를 문서별 팬아웃 청크로 분해해
 * `.spec/map/policy-fill-prep/` 에 영속한다. 분해 축: 문서(docId) 우선, 문서 내 행이
 * maxRows 를 넘으면 행 수로 분할(pol-000, pol-001, …). 각 행에 앵커 pre-cite(±40라인
 * verbatim)를 결정론 추출해 동봉하고, 앵커 파일들의 소스 슬라이스를 charCap 안에서 싣는다.
 * **병합 대상 md 가 없는 문서는 제외**(1단계 생성 선행 필요 — skippedDocs 에 정직 보고).
 * 기존 prep/*.json 은 전부 지우고 다시 쓴다(청크 수 변경 시 낡은 청크 잔존 방지 — frag/ 는 보존).
 */
export declare function prepPolicyFill(projectRoot: string, options?: PrepPolicyFillOptions): Promise<{
    index: PolicyFillChunkIndex;
    paths: string[];
}>;
export interface PolicyFragmentAudit {
    complete: string[];
    incomplete: Array<{
        chunkId: string;
        reason: string;
    }>;
}
/**
 * 조각 완결성 감사 — 존재 ∧ JSON ∧ 스키마 ∧ chunkId 정합 ∧ 커버리지(청크 선언 rowKey
 * 전수) ∧ 신뢰도([확정] ⇒ 인용 ≥ 1). 완료의 진실은 이 감사가 결정한다(에이전트 ack 아님).
 * `only` 로 부분 감사(스킵 가드용).
 */
export declare function auditPolicyFillFragments(projectRoot: string, only?: string[]): Promise<PolicyFragmentAudit>;
export interface MergePolicyFillResult {
    /** 채움 섹션이 갱신된 md 경로. */
    docPaths: string[];
    /** 완결 조각으로 채움 반영된 행 수. */
    rowsFilled: number;
    /** 청크 선언됐으나 완결 조각이 없어 미반영된 rowKey(부분 병합). */
    missingRows: string[];
    /** 조각이 청크 선언 밖 rowKey 를 내 버린 항목 수(유령 키 — 병합서 제외). */
    droppedItems: number;
    /** 인용 진위 검증에서 실파일과 불일치해 제거된 인용 수. */
    citationsRemoved: number;
    /** 인용 제거로 근거가 0 이 되어 [확정]→[추정] 강등된 행 수(fail-closed). */
    tagsDemoted: number;
    /** 병합 대상 md 가 없어 건너뛴 문서(정직 보고). */
    missingDocs: string[];
    /** 커버리지를 전부 잃어 낡은 채움 섹션을 제거한 문서 수(빈 섹션 미부착). */
    staleSectionsCleared: number;
}
/**
 * 조각을 policy-*.md 에 **덧붙임 산문 섹션**으로 병합한다. 기존 결정론 앵커 표(본체)는
 * 건드리지 않고(앵커 보존), 센티넬 사이 채움 섹션만 재생성한다(멱등 — 같은 조각 재병합 시
 * 중복 덧붙임 없음). 완결 조각만 반영하고, 미완결 문서의 rowKey 는 missingRows 로 보고한다
 * (부분 병합). 조각의 청크 선언 밖 rowKey 는 버리고 집계 보고한다. 병합 전 인용을 실파일과
 * 대조해 불일치는 제거하고, 근거 0 이 된 [확정]은 [추정]으로 강등한다(fail-closed).
 */
export declare function mergePolicyFillFragments(projectRoot: string): Promise<MergePolicyFillResult>;
//# sourceMappingURL=fill-fanout.d.ts.map