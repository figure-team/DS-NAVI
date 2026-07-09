import { type CandidatesReport, type CensusReport, type ConfirmedPlan, type EdgesReport, type MethodCallGraph, type RoutesReport, type SkeletonReport, type SlicesReport } from './types.js';
export { DEFAULT_STEP_CAP } from './types.js';
interface BuildSkeletonInput {
    census: CensusReport;
    routes: RoutesReport;
    edges: EdgesReport;
    slices: SlicesReport;
    candidates: CandidatesReport;
    /** 확정 플랜 — 없으면 throw(자동 확정 금지, 사람 게이트 필수). */
    plan: ConfirmedPlan;
    /**
     * 선택적 메서드 단위 호출 그래프(P3 refinement). 주어지면 flow 의 step 을
     * 핸들러 메서드에서 실제 호출을 따라가(reachableFlowFiles) 메서드 정밀로 도출한다.
     * 핸들러 호출이 어떤 프로젝트 파일로도 해소되지 않으면(람다/외부) 기존 slices
     * 파일 단위 폴백을 그대로 쓴다. 미제공 시 동작은 P2 와 동일(파일 단위).
     */
    methodCallGraph?: MethodCallGraph;
}
/**
 * confirmed plan + 스캔 산출물로 결정론 skeleton 을 만든다(파일 기록 없음).
 * plan 이 누락되면 명확한 오류로 사람 게이트(confirm)를 요구한다.
 */
export declare function buildSkeleton(projectRoot: string, input: BuildSkeletonInput, options?: {
    stepCap?: number;
}): Promise<SkeletonReport>;
//# sourceMappingURL=skeleton.d.ts.map