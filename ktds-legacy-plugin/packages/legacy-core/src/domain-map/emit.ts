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
import type { VerifyReport } from './verify.js'

/** NEEDS_REVIEW 강등 마커 — 검증 실패 항목 텍스트 앞에 붙인다(삭제 금지). */
export const NEEDS_REVIEW_MARKER = '[확인 필요] '

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

/**
 * 검증 리포트를 노드에 반영: NEEDS_REVIEW 항목 텍스트에 마커 부착(삭제 아님).
 * applyFills 가 만든 노드 배열을 입력으로 받아 복사·수정한다.
 * ref 규칙: 도메인 summary=domainId, 배열 항목=`<domainId>#<kind>[i]`,
 * flow/step summary=flowId/stepId (verify.ts 와 동일한 키 체계).
 */
export function demoteUnverified(nodes: UaGraphNode[], report: VerifyReport): UaGraphNode[] {
  const verdictByRef = new Map<string, 'GROUNDED' | 'NEEDS_REVIEW'>()
  for (const d of report.domains) {
    for (const item of d.items) verdictByRef.set(item.ref, item.verdict)
  }
  const mark = (text: string, ref: string): string =>
    verdictByRef.get(ref) === 'NEEDS_REVIEW' && !text.startsWith(NEEDS_REVIEW_MARKER)
      ? NEEDS_REVIEW_MARKER + text
      : text

  return nodes.map((node) => {
    const out: UaGraphNode = { ...node }
    if (node.type === 'domain') {
      out.summary = mark(node.summary, node.id)
      const meta = { ...node.domainMeta }
      for (const [kind, field] of [
        ['entity', 'entities'],
        ['businessRule', 'businessRules'],
        ['crossDomain', 'crossDomainInteractions'],
      ] as const) {
        const arr = meta[field]
        if (Array.isArray(arr)) {
          meta[field] = arr.map((text, i) =>
            typeof text === 'string' ? mark(text, `${node.id}#${kind}[${i}]`) : text,
          )
        }
      }
      out.domainMeta = meta
    } else {
      out.summary = mark(node.summary, node.id)
    }
    return out
  })
}

/**
 * 채움(LLM fill) 경로의 domain-graph.json emit. applyFills→demoteUnverified 를 거친
 * 노드 배열을 받아, **여전히 공란(SKELETON_BLANK)인 노드에는 결정론 라벨 폴백을
 * 적용**한다(하이브리드: 채움 우선, 미채움은 구조 라벨). envelope(version/project/
 * layers/tour/ktdsMap)는 구조 emit 과 동일하다.
 */
export function emitFilledDomainGraph(
  projectRoot: string,
  skeleton: SkeletonReport,
  filledNodes: UaGraphNode[],
  options: EmitOptions = {},
): { nodes: UaGraphNode[]; edges: UaGraphEdge[] } {
  // 채움이 안 된 노드만 결정론 라벨로 폴백(채워진 노드는 SKELETON_BLANK 가 아니라 보존).
  const nodes = applyDeterministicLabels(filledNodes, skeleton.edges)
  const graph = {
    version: '1.0.0',
    project: {
      name: options.projectName ?? basename(resolve(projectRoot)),
      languages: [] as string[],
      frameworks: [] as string[],
      description: 'ktds /understand-map 결정론 도메인 그래프 (skeleton+LLM fill+기계검증)',
      analyzedAt: options.analyzedAt ?? new Date().toISOString(),
      gitCommitHash: skeleton.gitCommit ?? '',
    },
    nodes,
    edges: skeleton.edges,
    layers: [] as unknown[],
    tour: [] as unknown[],
    ktdsMap: {
      generatedFromCommit: skeleton.gitCommit ?? '',
    },
  }
  writeDomainGraph(projectRoot, graph)
  return { nodes, edges: skeleton.edges }
}
