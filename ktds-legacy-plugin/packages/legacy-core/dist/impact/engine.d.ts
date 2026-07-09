import { type CensusReport, type ConfirmedPlan, type EdgesReport, type RoutesReport, type SkeletonReport, type SlicesReport } from '../domain-map/types.js';
import { type JpaModel } from '../jpa/types.js';
import { type ImpactClaimItem, type ImpactVerifyReport } from './verify.js';
import { type ImpactOptions, type ImpactResult, type ImpactSeed, type KgTableEntry } from './types.js';
export declare class ImpactInputMissingError extends Error {
    constructor(message: string);
}
export interface ImpactInputs {
    census: CensusReport;
    routes: RoutesReport;
    edges: EdgesReport;
    slices: SlicesReport;
    skeleton: SkeletonReport | null;
    confirmed: ConfirmedPlan | null;
    /** JPA 모델(보완 B) — jpa-model.json 있으면 로드, 없으면 null(MyBatis 전용/미스캔). */
    jpaModel: JpaModel | null;
    gitCommit: string | null;
}
export interface ImpactExtras {
    kgTableCatalog: KgTableEntry[];
    /** relPath → MyBatis namespace(mapper XML). */
    mapperNamespaceByPath: Map<string, string>;
    /** relPath → 라인 수(tableCandidateSlots.endLine). */
    mapperLineCounts: Map<string, number>;
}
export interface AnalyzeImpactResult {
    result: ImpactResult;
    verify: ImpactVerifyReport;
    impactPath: string;
    verifyPath: string;
    /** 로드된 .spec/map 입력 — 호출자가 재사용(재로드 0회). */
    inputs: ImpactInputs;
}
export declare function loadImpactInputs(projectRoot: string): ImpactInputs;
/** KG table 노드 → DDL 근거 카탈로그(없으면 빈 배열). related 엣지는 채택 안 함. */
export declare function loadKgTableCatalog(projectRoot: string): KgTableEntry[];
/** 매퍼 XML(엣지 target)을 읽어 namespace·라인수 인덱스 산출(IO). */
export declare function buildMapperInfo(projectRoot: string, edges: EdgesReport['edges']): {
    mapperNamespaceByPath: Map<string, string>;
    mapperLineCounts: Map<string, number>;
};
export declare function buildImpactReport(inputs: ImpactInputs, seeds: readonly ImpactSeed[], options: ImpactOptions, extras: ImpactExtras): ImpactResult;
export declare function buildClaimItems(result: ImpactResult): ImpactClaimItem[];
/** 인용 라인의 실제 텍스트로 snippet 채움(루트 밖 경로는 건너뜀 → verify 가 path-escape). */
export declare function fillClaimSnippets(projectRoot: string, items: ImpactClaimItem[]): void;
export declare function analyzeImpact(projectRoot: string, seeds: readonly ImpactSeed[], optionsInput?: Partial<ImpactOptions>, 
/** 산출물 파일명 오버라이드 — SR 보관 등에서 사용. */
artifacts?: {
    reportFilename?: string;
    verifyFilename?: string;
}): AnalyzeImpactResult;
//# sourceMappingURL=engine.d.ts.map