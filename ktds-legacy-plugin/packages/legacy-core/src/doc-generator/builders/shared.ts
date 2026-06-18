/**
 * 빌더 공유 입력 모델 + 결정론 헬퍼(노드 분류·근거 도출·정렬).
 *
 * grounding 보존(§3.4): 빌더는 노드/엣지 데이터를 재구성할 뿐 새 사실을 지어내지
 * 않는다. filePath+lineRange 가 있는 노드만 CONFIRMED(근거 보유)로 올린다.
 */
import type { UaGraphEdge, UaGraphNode } from '../../domain-map/types.js'
import type { RoutesReport } from '../../domain-map/types.js'
import { claim } from '../claims.js'
import type { Claim, Evidence } from '../types.js'

/**
 * 빌더 정규 입력 — as-built 그래프(노드/엣지) + 선택적 프로젝트 메타·라우트 리포트.
 * nodes 는 UaGraphNode(domain/flow/step). 추가 종류(endpoint/table/module 등)는
 * node.tags 의 종류 태그로 식별한다(UaGraphNode.type 은 domain/flow/step 로 한정).
 */
export interface DocInput {
  project?: {
    languages?: string[]
    frameworks?: string[]
  }
  nodes: UaGraphNode[]
  edges: UaGraphEdge[]
  routes?: RoutesReport
}

/** node.id ASC 안정 정렬(결정론 tie-break). */
export function sortNodes(nodes: UaGraphNode[]): UaGraphNode[] {
  return [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** routeId 자연키 안정 정렬(결정론) — api-spec / si-인터페이스정의서 공용. */
export function sortedRoutes(input: DocInput): RoutesReport['routes'] {
  const routes = input.routes?.routes ?? []
  return [...routes].sort((a, b) => (a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0))
}

/** edges (source, target, type) 자연키 안정 정렬(결정론). */
export function sortEdges(edges: UaGraphEdge[]): UaGraphEdge[] {
  return [...edges].sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1
    if (a.target !== b.target) return a.target < b.target ? -1 : 1
    if (a.type !== b.type) return a.type < b.type ? -1 : 1
    return 0
  })
}

/** type 으로 노드를 거른 뒤 id 정렬. */
export function nodesOfType(nodes: UaGraphNode[], ...types: UaGraphNode['type'][]): UaGraphNode[] {
  const set = new Set(types)
  return sortNodes(nodes.filter((n) => set.has(n.type)))
}

/** tag 로 노드를 거른 뒤 id 정렬(endpoint/table/schema/module 등 비-core 종류 식별). */
export function nodesWithTag(nodes: UaGraphNode[], ...tags: string[]): UaGraphNode[] {
  const set = new Set(tags)
  return sortNodes(nodes.filter((n) => n.tags.some((t) => set.has(t))))
}

/** type 으로 엣지를 거른 뒤 자연키 정렬. */
export function edgesOfType(edges: UaGraphEdge[], ...types: UaGraphEdge['type'][]): UaGraphEdge[] {
  const set = new Set(types)
  return sortEdges(edges.filter((e) => set.has(e.type)))
}

/** 노드의 filePath+lineRange 를 Evidence[] 로 변환(없으면 []). */
export function nodeEvidence(node: UaGraphNode): Evidence[] {
  if (typeof node.filePath !== 'string') return []
  const line = node.lineRange ? node.lineRange[0] : null
  return [{ file: node.filePath, line }]
}

/**
 * 노드 기반 claim — grounded(filePath 보유) -> CONFIRMED + 근거, 아니면 INFERRED.
 * grounding 보존: 근거 없는 노드를 CONFIRMED 로 올리지 않는다.
 */
export function nodeClaim(node: UaGraphNode, text: string): Claim {
  const ev = nodeEvidence(node)
  return ev.length > 0 ? claim(text, 'CONFIRMED', ev) : claim(text, 'INFERRED')
}

/** 구조/관례 추론 claim — 근거 없음, 검토 권장(INFERRED). */
export function inferred(text: string): Claim {
  return claim(text, 'INFERRED')
}

/** 동적/불명 claim — 근거 미확보(UNVERIFIED). */
export function unverified(text: string): Claim {
  return claim(text, 'UNVERIFIED')
}

/** 노드 표시명 — name 이 공란(SKELETON_BLANK)이면 id 로 폴백(빈 텍스트 방지). */
export function displayName(node: UaGraphNode): string {
  return node.name.length > 0 ? node.name : node.id
}

/** summary 가 있으면 " — {summary}" 접미사, 없으면 빈 문자열. */
export function summarySuffix(node: UaGraphNode): string {
  return node.summary.length > 0 ? ` — ${node.summary}` : ''
}

/**
 * domainMeta 의 문자열/문자열배열 필드를 결정론적으로 평탄화(정렬).
 * feature-spec / si-기능명세서 공용 — 배열은 문자열만 골라 정렬, 단일 문자열은 1원소.
 */
export function metaList(meta: Record<string, unknown> | undefined, key: string): string[] {
  const v = meta?.[key]
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string').slice().sort()
  }
  if (typeof v === 'string' && v.length > 0) return [v]
  return []
}
