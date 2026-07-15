import type { RtmFunctionRow } from '../rtm/types.js';
import type { ImpactSeed } from './types.js';
/** 신규(TO-BE) 기능 id 접두 — 아직 파일이 없으므로 시드가 될 수 없다(§9 P6). */
export declare const TO_BE_FN_PREFIX = "to-be:";
export interface FlowSeedResolution {
    /** relPath ASC · 중복 제거. `analyzeImpact` 에 그대로 넘긴다. */
    seeds: ImpactSeed[];
    /** fnId → 그 flow 가 기여한 relPath(보고·감사용). fnId ASC. */
    bySource: Array<{
        fnId: string;
        relPaths: string[];
    }>;
    /** `to-be:` 라 제외 — 파일이 아직 없다. */
    skippedToBe: string[];
    /** rtm.json 에 없는 fnId. validate 의 실재 대조(P1)가 이미 막지만 순수 함수도 자기방어한다. */
    unknownFnIds: string[];
    /** 실재하나 entryPoint 근거가 0건 — **조용히 떨구지 않고 보고**한다(§6.2 "정직한 생략"). */
    ungroundedFnIds: string[];
}
/**
 * `fnIds`(= `changeset.modified`) → 시드 파일 집합. 순수 함수 — IO·정렬 불안정성 없음.
 * 동일 입력이면 동일 출력(결정론): 전 배열이 명시 키 정렬, Date/랜덤 미사용.
 */
export declare function resolveFlowSeeds(functions: readonly RtmFunctionRow[], fnIds: readonly string[]): FlowSeedResolution;
//# sourceMappingURL=rtm-seeds.d.ts.map