/**
 * EMIT 단계(구조 골격, pre-LLM-fill) — domain-graph.json 오버레이 쓰기.
 *
 * skeleton 의 노드(name 은 아직 SKELETON_BLANK)와 엣지를 그대로
 * `.understand-anything/domain-graph.json` 에 { nodes, edges } 로 쓴다. 이 파일이
 * dual-load(orchestrator.loadProjectGraph)가 fetch 해 UA KG 와 병합하는 오버레이다.
 *
 * 주: LLM 채움(S8)과 인용 검증(S9)이 P4 에서 name/summary 를 enrich 한다.
 * P2 는 구조 골격을 먼저 emit 해 대시보드/dual-load 가 즉시 데이터를 갖게 한다.
 */
import { writeDomainGraph } from './persist.js'
import type { SkeletonReport, UaGraphEdge, UaGraphNode } from './types.js'

/**
 * skeleton 으로부터 구조 오버레이를 emit 한다.
 * `.understand-anything/domain-graph.json` 에 { nodes, edges } 를 쓰고
 * 그 노드/엣지를 반환한다(skeleton 이 이미 정렬했으므로 그대로 패스스루 = 결정론).
 */
export function emitDomainGraph(
  projectRoot: string,
  skeleton: SkeletonReport,
): { nodes: UaGraphNode[]; edges: UaGraphEdge[] } {
  const graph = { nodes: skeleton.nodes, edges: skeleton.edges }
  writeDomainGraph(projectRoot, graph)
  return graph
}
