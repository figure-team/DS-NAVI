import type { GeneratedDoc } from '../doc-generator/types.js';
import { type ProfileWChangeStory } from '../profile-w/index.js';
import type { CensusReport, ConfirmedPlan, Ownership } from '../domain-map/types.js';
import type { ImpactResult } from './types.js';
import type { ImpactVerifyReport } from './verify.js';
import type { CreationSuggestion } from './supplement-a.js';
export declare const CHANGE_IMPACT_FILENAME = "change-impact-analysis.md";
export declare const CHANGE_IMPACT_DOC_ID = "09_change-impact";
export declare const IMPACT_READONLY_NOTE: string;
export interface ImpactAggregateRow {
    label: string;
    upstream: number;
    downstream: number;
}
export interface ImpactAggregate {
    byDomain: ImpactAggregateRow[] | null;
    byLang: ImpactAggregateRow[];
}
export interface ImpactAggregateInputs {
    census: CensusReport['files'];
    confirmed: ConfirmedPlan | null;
    ownership: readonly Ownership[];
}
export declare function aggregateImpactCounts(result: ImpactResult, inputs: ImpactAggregateInputs): ImpactAggregate;
export interface BuildChangeImpactOptions {
    aggregate?: ImpactAggregateInputs;
    suggestion?: CreationSuggestion;
}
export declare function buildChangeImpact(result: ImpactResult, verify: ImpactVerifyReport, options?: BuildChangeImpactOptions): GeneratedDoc;
/** docs/09_release/change-impact-analysis.md 발행. doc-state 미등록(read-only). 절대 경로 반환. */
export declare function publishChangeImpact(projectRoot: string, doc: GeneratedDoc, meta: {
    sourceCommit: string | null;
}): string;
/**
 * 생성예측 제안 → Profile-W change-story 객체(P4.6 동결 스키마)를 PRODUCE 한다.
 * 결정론: 모든 배열 정렬, task id 는 안정 식별자. ProfileWChangeStorySchema 로 parse 해
 * 손편집/스큐를 조용히 통과시키지 않는다. AIDD 연동은 연기(deferred) — shape 만 생산.
 */
export declare function toProfileWChangeStory(suggestion: CreationSuggestion, result: ImpactResult): ProfileWChangeStory;
//# sourceMappingURL=doc.d.ts.map