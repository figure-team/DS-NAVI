/**
 * 업무흐름/도메인 영향 — 영향 흐름 = seed ∪ upstream 을 포함하는 flow.
 * 정밀 경로는 skeleton 엣지만으로 결정론 역추적:
 *   파일 →(stepSources)→ stepId →(flow_step REVERSE)→ flowId
 *        →(contains_flow REVERSE)→ domainId.
 * flowId↔routeId 는 'flow:'↔'route:' prefix 치환. step 입도가 라우트-선언-파일
 * 단위라 '실 호출'이 아니라 '체인 내 도달' → confidence=INFERRED 고정.
 *
 * graceful 결손: skeleton/confirmed=null(confirm 게이트 전)이면 throw 하지 않고
 * ownership 폴백 + 도메인명 UNVERIFIED. cap 절단 파일은 truncatedSteps 로 결손큐 노출.
 */
import type { ConfirmedPlan, Ownership, RouteEntry, SkeletonReport } from '../domain-map/types.js';
import type { DomainImpact, FlowImpact, NeedsReviewItem } from './types.js';
export interface FlowImpactResult {
    flows: FlowImpact[];
    domains: DomainImpact[];
    needsReview: NeedsReviewItem[];
}
export declare function computeFlowImpact(
/** seed ∪ upstream — 변경되거나 영향받는 파일들. */
flowImpactSet: ReadonlySet<string>, skeleton: SkeletonReport | null, ownership: readonly Ownership[], routes: readonly RouteEntry[], confirmed: ConfirmedPlan | null): FlowImpactResult;
//# sourceMappingURL=flow.d.ts.map