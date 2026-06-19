/**
 * EMIT 단계(구조 골격, pre-LLM-fill) — domain-graph.json 오버레이 쓰기.
 *
 * skeleton 의 노드(name 은 아직 SKELETON_BLANK)와 엣지를 U-A KnowledgeGraph 전체
 * 형태(version/project/nodes/edges/layers/tour)로 `.understand-anything/domain-graph.json`
 * 에 쓴다. 이 envelope 덕분에 대시보드가 이 파일을 standalone 그래프로 fetch·검증해
 * 도메인 뷰를 그리고(D2 무수정 재사용), dual-load(orchestrator.loadProjectGraph)도
 * nodes/edges 만 읽어 UA KG 와 병합한다(추가 필드는 무시).
 *
 * 주: LLM 채움(S8)과 인용 검증(S9)이 P4 에서 name/summary 를 enrich 한다.
 * P2 는 구조 골격을 먼저 emit 해 대시보드/dual-load 가 즉시 데이터를 갖게 한다.
 */
import { basename, resolve } from 'node:path'
import { writeDomainGraph } from './persist.js'
import type { SkeletonReport, UaGraphEdge, UaGraphNode } from './types.js'

export interface EmitOptions {
  /** 프로젝트 표시명 — 기본 basename(projectRoot). */
  projectName?: string
  /** 분석 시각(ISO) — 기본 now. 테스트는 고정값을 주입해 byte-identical 보장. */
  analyzedAt?: string
}

/**
 * skeleton 으로부터 구조 오버레이를 emit 한다.
 * `.understand-anything/domain-graph.json` 에 U-A KG envelope(version/project/
 * nodes/edges/layers/tour/ktdsMap)를 쓰고 그 nodes/edges 를 반환한다
 * (skeleton 이 이미 정렬했으므로 그대로 패스스루 = 결정론).
 */
export function emitDomainGraph(
  projectRoot: string,
  skeleton: SkeletonReport,
  options: EmitOptions = {},
): { nodes: UaGraphNode[]; edges: UaGraphEdge[] } {
  const graph = {
    version: '1.0.0',
    project: {
      name: options.projectName ?? basename(resolve(projectRoot)),
      languages: [] as string[],
      frameworks: [] as string[],
      description: 'ktds /understand-map 결정론 도메인 그래프 (skeleton)',
      analyzedAt: options.analyzedAt ?? new Date().toISOString(),
      gitCommitHash: skeleton.gitCommit ?? '',
    },
    nodes: skeleton.nodes,
    edges: skeleton.edges,
    layers: [] as unknown[],
    tour: [] as unknown[],
    // ktds 확장 (U-A 스키마 passthrough) — freshness 대조용.
    ktdsMap: {
      generatedFromCommit: skeleton.gitCommit ?? '',
    },
  }
  writeDomainGraph(projectRoot, graph)
  return { nodes: skeleton.nodes, edges: skeleton.edges }
}
