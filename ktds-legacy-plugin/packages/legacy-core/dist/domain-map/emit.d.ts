import type { ConfirmedGroup, SkeletonReport, UaGraphEdge, UaGraphNode } from './types.js';
import type { VerifyReport } from './verify.js';
/** NEEDS_REVIEW 강등 마커 — 검증 실패 항목 텍스트 앞에 붙인다(삭제 금지). */
export declare const NEEDS_REVIEW_MARKER = "[\uD655\uC778 \uD544\uC694] ";
/**
 * 결정론 라벨 — LLM 채움(S8, bundle/emit-with-fill) 전, 공란(SKELETON_BLANK) 노드에
 * 구조 신호로 name/summary 를 채운다. 도메인=key 표제화, 흐름=진입점 경로, 단계=파일명.
 * 이미 채워진(LLM 등) 노드는 건드리지 않으므로, 향후 채움 단계가 이 값을 덮어쓴다.
 * 순수 함수(skeleton 만 입력) → 동일 입력 byte-identical 보장.
 */
export declare function applyDeterministicLabels(nodes: UaGraphNode[], edges: UaGraphEdge[]): UaGraphNode[];
export interface EmitOptions {
    /** 프로젝트 표시명 — 기본 basename(projectRoot). */
    projectName?: string;
    /** 분석 시각(ISO) — 기본 now. 테스트는 고정값을 주입해 byte-identical 보장. */
    analyzedAt?: string;
    /**
     * 상단도메인 계층(DOMAIN_HIERARCHY) — confirmed plan.groups 를 ktdsMap.groups 로
     * additive 투영한다(노드/엣지 스키마 무접촉). 부재/빈 배열 = 평면 그래프(기존 렌더).
     */
    groups?: ConfirmedGroup[];
}
/**
 * skeleton 으로부터 구조 오버레이를 emit 한다.
 * `.understand-anything/domain-graph.json` 에 U-A KG envelope(version/project/
 * nodes/edges/layers/tour/ktdsMap)를 쓰고 그 nodes/edges 를 반환한다
 * (skeleton 이 이미 정렬했으므로 그대로 패스스루 = 결정론).
 */
export declare function emitDomainGraph(projectRoot: string, skeleton: SkeletonReport, options?: EmitOptions): {
    nodes: UaGraphNode[];
    edges: UaGraphEdge[];
};
/**
 * 검증 리포트를 노드에 반영: NEEDS_REVIEW 항목 텍스트에 마커 부착(삭제 아님).
 * applyFills 가 만든 노드 배열을 입력으로 받아 복사·수정한다.
 * ref 규칙: 도메인 summary=domainId, 배열 항목=`<domainId>#<kind>[i]`,
 * flow/step summary=flowId/stepId (verify.ts 와 동일한 키 체계).
 */
export declare function demoteUnverified(nodes: UaGraphNode[], report: VerifyReport): UaGraphNode[];
/**
 * 검증 결과(citation status + claim verdict)를 노드 domainMeta.ktdsClaims 에 임베드한다 —
 * 대시보드(화면1 도메인 카드)가 domain-graph.json **한 파일**로 근거·검증을 읽게 하는 단일
 * 소스화. 도메인 노드: 도메인 레벨 주장(summary/entity/businessRule/crossDomain)만 ktdsClaims
 * 로 붙이고, **그 부분집합 기준** groundedPct/groundedCount/reviewCount 를 domainMeta 에 둔다
 * (카드가 보여주는 항목과 일치 — flow/step 은 화면2/3 소관이라 카드 근거율에서 제외).
 * flow/step 노드: 자기 ref 의 검증 항목 1개를 붙인다. demoteUnverified 다음에 적용한다.
 */
export declare function embedVerification(nodes: UaGraphNode[], report: VerifyReport): UaGraphNode[];
/**
 * 채움(LLM fill) 경로의 domain-graph.json emit. applyFills→demoteUnverified 를 거친
 * 노드 배열을 받아, **여전히 공란(SKELETON_BLANK)인 노드에는 결정론 라벨 폴백을
 * 적용**한다(하이브리드: 채움 우선, 미채움은 구조 라벨). envelope(version/project/
 * layers/tour/ktdsMap)는 구조 emit 과 동일하다.
 */
export declare function emitFilledDomainGraph(projectRoot: string, skeleton: SkeletonReport, filledNodes: UaGraphNode[], options?: EmitOptions): {
    nodes: UaGraphNode[];
    edges: UaGraphEdge[];
};
//# sourceMappingURL=emit.d.ts.map