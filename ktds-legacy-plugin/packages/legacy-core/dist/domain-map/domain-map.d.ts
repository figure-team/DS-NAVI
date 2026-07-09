import type { CandidatesReport, CrossDomainGraph, DomainMapSummary, DomainPriority, EdgesReport, NameSuggestionContext, SkeletonReport } from './types.js';
/** 도메인명 표본 앵커 상한 — 초과분은 정렬 후 앞에서 N개만 취한다(조용한 누락 아님: 정렬 결정론). */
export declare const DEFAULT_SAMPLE_ANCHOR_CAP = 5;
/** 도메인명 컨텍스트의 표본 파일 상한 — 대표 멤버 파일을 정렬 후 앞에서 N개만 취한다. */
export declare const DEFAULT_SAMPLE_FILE_CAP = 8;
/**
 * 우선순위 가중치(E-b, AC-32) — 고정 정수. 의도:
 *   복잡도(W_COMPLEXITY)를 가장 무겁게 둔다 — 이해 난이도가 온보딩 비용의 주동인.
 *   결합도(W_COUPLING)를 다음으로 — 교차 도메인 의존이 많을수록 먼저 봐야 영향 파악.
 *   크기(W_SIZE)를 가장 가볍게 — 큰 도메인도 단순하면 후순위일 수 있다.
 * priorityScore = complexityScore*3 + couplingScore*2 + sizeScore*1.
 */
export declare const W_COMPLEXITY = 3;
export declare const W_COUPLING = 2;
export declare const W_SIZE = 1;
/**
 * E-c 교차 도메인 의존 그래프(AC-33).
 *
 * 각 파일 의존 엣지(edges.edges)에 대해 source 파일과 target 파일의 도메인을
 * skeleton 으로 사상한다. 두 도메인이 서로 다르면 (from,to) 교차 도메인 엣지로
 * 집계하되, 근거(evidence)는 실제 파일 엣지를 GROUNDED 하게 보존한다(합성 금지).
 * self-domain 엣지와 도메인 미배정 파일이 낀 엣지는 제외한다.
 *
 * weight = 근거 엣지 수. (from,to) 정렬, evidence 는 (source,target,kind) 정렬.
 */
export declare function buildCrossDomainGraph(skeleton: SkeletonReport, edges: EdgesReport): CrossDomainGraph;
/**
 * E-b 온보딩 우선순위(AC-32) — "여기부터 보세요" 결정론 랭킹.
 *
 * 도메인별 결정론 구성요소:
 *   sizeScore       = 멤버 노드 수(flow + step).
 *   complexityScore = 멤버 노드 complexity 가중합(simple=1/moderate=2/complex=3).
 *   couplingScore   = 도메인에 닿는 교차 도메인 엣지 수(in + out).
 * priorityScore = complexityScore*W_COMPLEXITY + couplingScore*W_COUPLING + sizeScore*W_SIZE.
 * 정렬: priorityScore DESC, 동점이면 key ASC. rank 는 1-based 위치(결정론 tie-break).
 */
export declare function scoreDomains(skeleton: SkeletonReport, crossDomain: CrossDomainGraph): DomainPriority[];
/**
 * AC-3 도메인 맵 요약 — 확정 플랜 + skeleton + 교차도메인 + 우선순위의 결합.
 *
 * projectRoot 에서 buildMap(census→…→skeleton, 확정 플랜 필요)을 돌리고
 * 교차 도메인 그래프와 우선순위를 계산해 도메인별 요약 행을 만든다.
 * grounded = 도메인의 모든 flow/step 노드가 filePath + lineRange 앵커를 가질 때 true(AC-9).
 * sampleAnchors = 도메인 flow 노드의 대표 file:line(정렬 후 앞에서 N개).
 *
 * 확정 플랜이 없으면 throw(자동 확정 금지 — /understand-map confirm 선행).
 */
export declare function buildDomainMapSummary(projectRoot: string, options?: {
    sampleAnchorCap?: number;
}): Promise<DomainMapSummary>;
/**
 * E-a LLM 도메인명 제안 CONTEXT(AC-31).
 *
 * 도메인별 { key, currentName, sampleFiles, tokens } 를 만들어 HOST LLM 이 한국어
 * 이름을 제안하도록 한다. 엔진은 LLM 을 호출하지 않는다(컨텍스트 생산만).
 * 적용은 confirm.renameDomain(plan,key,name) 으로 — key 는 불변(AC-31).
 *
 * sampleFiles = 도메인 대표 멤버 파일(roots + files, 정렬 후 앞에서 N개).
 * tokens      = 멤버 파일 basename 에서 추출한 distinct 토큰(정렬).
 * currentName = candidates 에는 표시명이 없으므로 key(개명 전).
 */
export declare function buildNameSuggestionContext(candidates: CandidatesReport, options?: {
    sampleFileCap?: number;
}): NameSuggestionContext;
//# sourceMappingURL=domain-map.d.ts.map