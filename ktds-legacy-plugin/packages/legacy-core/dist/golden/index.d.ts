/**
 * 채점기 버전 — 지표 의미/검증 규칙이 바뀌면 bump. baseline.json 에 함께 기록돼
 * 옛 기준선이 새 로직으로 조용히 비교되는 것을 막는다(리뷰 C7).
 */
export declare const GOLDEN_SCORER_VERSION = 2;
export interface Citation {
    file: string;
    line: number | null;
    snippet: string | null;
}
/**
 * JSON 재귀로 인용 노드를 수집한다 — `{file|filePath: string, line?: number}` 형태.
 * domain-graph(ktdsClaims[].citations[].filePath)와 rtm(evidence[].file)을 모두 덮는
 * 범용 수집기(새 산출물에도 그대로 적용).
 */
export declare function collectCitations(value: unknown): Citation[];
export interface CitationScore {
    total: number;
    valid: number;
    /** 분모 0(인용 자체가 없음)은 null — "인용 없음"과 "전부 유효"를 구분(정직). */
    rate: number | null;
    /** 무효 사유 샘플(상한 20, 정렬) — 전수는 total-valid. */
    invalidSamples: Array<{
        file: string;
        line: number | null;
        reason: string;
    }>;
}
/** 인용이 projectRoot 에 실존하는지 — 파일·라인 범위·(있으면) 스니펫 근방 일치. */
export declare function scoreCitations(citations: Citation[], projectRoot: string): CitationScore;
export interface StructureUnit {
    /** 안정 키(노드/행 id). */
    key: string;
    /**
     * 채워진 필드 이름(정렬). 일치 판정은 "골든이 채운 필드를 후보도 채웠는가" —
     * 골든 자체가 비운 필드(예: flow 노드의 businessRules)는 요구하지 않는다
     * (자기 채점 100% 보장 + 필드 소실 회귀는 그대로 검출).
     */
    filledFields: string[];
}
export interface KeyItem {
    /** 항목 출처 표기(리포트용, 예: "domain:account businessRule"). */
    kind: string;
    /** 정규화 텍스트 또는 id. */
    text: string;
}
/** 텍스트 정규화 — 공백 연쇄/개행 → 단일 공백, trim. 서식 둔감·의미 민감. */
export declare function normalizeText(s: string): string;
interface DomainGraphLike {
    nodes?: Array<{
        id?: string;
        summary?: string;
        domainMeta?: {
            businessRules?: string[];
            entities?: Array<string | {
                name?: string;
            }>;
            ktdsClaims?: Array<{
                text?: string;
            }>;
        };
    }>;
}
/** domain-graph 구조 단위 — domainMeta 를 가진(=LLM 채움 대상) 노드. */
export declare function extractDomainGraphUnits(g: DomainGraphLike): StructureUnit[];
/** domain-graph 핵심 항목 — 업무규칙 문장 + 엔티티 이름(도메인 노드별). */
export declare function extractDomainGraphKeyItems(g: DomainGraphLike): KeyItem[];
interface RtmLike {
    requirements?: Array<{
        id?: string;
        text?: string;
    }>;
    functions?: Array<{
        id?: string;
        name?: string;
        entryPoint?: unknown;
    }>;
    testScenarios?: Array<{
        id?: string;
    }>;
}
/** rtm 구조 단위 — 요구사항·기능·테스트 시나리오(종류 접두로 키 충돌 방지). */
export declare function extractRtmUnits(r: RtmLike): StructureUnit[];
/** rtm 핵심 항목 — 요구사항 텍스트 + 기능 이름(id 는 구조 지표가 이미 본다). */
export declare function extractRtmKeyItems(r: RtmLike): KeyItem[];
export interface StructureScore {
    total: number;
    matched: number;
    rate: number | null;
    /** 골든에 있는데 후보에 없거나 필수 필드 미충족(상한 20, 정렬). */
    missingSamples: Array<{
        key: string;
        reason: string;
    }>;
    /**
     * 골든에 없는 후보 초과 단위(정밀도 신호, 리뷰 C1) — 날조 추가는 재현율·구조를
     * 못 깎으므로 여기로 노출한다. 정당한 성장일 수도 있어 게이트에선 WARN.
     */
    extras: number;
    extrasSamples: string[];
}
/** 골든 단위별: 후보에 같은 key 존재 + 골든이 채운 필드를 후보도 전부 채웠으면 일치. */
export declare function scoreStructure(golden: StructureUnit[], candidate: StructureUnit[]): StructureScore;
export interface RecallScore {
    total: number;
    found: number;
    rate: number | null;
    missingSamples: Array<{
        kind: string;
        text: string;
    }>;
}
export declare function scoreRecall(goldenItems: KeyItem[], candidate: unknown): RecallScore;
export type GoldenArtifactKind = 'domain-graph' | 'rtm';
export interface ArtifactScore {
    kind: GoldenArtifactKind;
    structure: StructureScore;
    citations: CitationScore;
    recall: RecallScore;
}
/** 산출물 1종 채점 — 구조·재현율은 골든 대비, 근거 유효율은 후보 단독(기계 검증). */
export declare function scoreGoldenArtifact(kind: GoldenArtifactKind, golden: unknown, candidate: unknown, projectRoot: string): ArtifactScore;
export {};
//# sourceMappingURL=index.d.ts.map