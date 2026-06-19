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
import { SKELETON_BLANK } from './types.js'
import type { SkeletonReport, UaGraphEdge, UaGraphNode } from './types.js'

/** "web-inf" → "Web Inf", "account" → "Account". 도메인 key 표제화(결정론). */
function titleCaseKey(key: string): string {
  return key
    .split(/[-_]/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** 파일 경로 → 확장자 없는 basename. */
function fileStem(p: string): string {
  return (p.split('/').pop() ?? p).replace(/\.[^.]+$/, '')
}

/**
 * 결정론 라벨 — LLM 채움(S8, bundle/emit-with-fill) 전, 공란(SKELETON_BLANK) 노드에
 * 구조 신호로 name/summary 를 채운다. 도메인=key 표제화, 흐름=진입점 경로, 단계=파일명.
 * 이미 채워진(LLM 등) 노드는 건드리지 않으므로, 향후 채움 단계가 이 값을 덮어쓴다.
 * 순수 함수(skeleton 만 입력) → 동일 입력 byte-identical 보장.
 */
export function applyDeterministicLabels(
  nodes: UaGraphNode[],
  edges: UaGraphEdge[],
): UaGraphNode[] {
  const flowCountByDomainId = new Map<string, number>()
  for (const e of edges) {
    if (e.type === 'contains_flow') {
      flowCountByDomainId.set(e.source, (flowCountByDomainId.get(e.source) ?? 0) + 1)
    }
  }
  const nodeCountByKey = new Map<string, number>()
  for (const n of nodes) {
    const key = n.tags[0]
    if (key) nodeCountByKey.set(key, (nodeCountByKey.get(key) ?? 0) + 1)
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

  return nodes.map((node) => {
    if (node.name !== SKELETON_BLANK) return node
    if (node.type === 'domain') {
      const key = node.id.replace(/^domain:/, '')
      const flows = flowCountByDomainId.get(node.id) ?? 0
      const total = nodeCountByKey.get(key) ?? 1
      return { ...node, name: titleCaseKey(key), summary: `진입 흐름 ${flows}개 · 노드 ${total}개` }
    }
    if (node.type === 'flow') {
      const entry = str(node.domainMeta?.entryPoint) ?? node.id.replace(/^flow:/, '')
      const etype = str(node.domainMeta?.entryType)
      return { ...node, name: entry, summary: etype ? `진입 유형: ${etype}` : node.summary }
    }
    if (node.type === 'step') {
      const name = node.filePath ? fileStem(node.filePath) : node.id.replace(/^step:/, '')
      return { ...node, name, summary: node.layer ? `레이어: ${node.layer}` : node.summary }
    }
    return node
  })
}

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
  // 공란 노드에 결정론 라벨 적용(LLM 채움 전 폴백) — 대시보드가 빈 이름 대신 구조명을 표시.
  const nodes = applyDeterministicLabels(skeleton.nodes, skeleton.edges)
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
    nodes,
    edges: skeleton.edges,
    layers: [] as unknown[],
    tour: [] as unknown[],
    // ktds 확장 (U-A 스키마 passthrough) — freshness 대조용.
    ktdsMap: {
      generatedFromCommit: skeleton.gitCommit ?? '',
    },
  }
  writeDomainGraph(projectRoot, graph)
  return { nodes, edges: skeleton.edges }
}
