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
import type { VerifyReport, VerifiedItem } from './verify.js'

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
      return { ...node, name: titleCaseKey(key), summary: `기능 ${flows}개 · 노드 ${total}개` }
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

/** verify-report 의 1자리 반올림 규칙(verify.ts pct 와 동일) — 도메인 레벨 재집계용. */
function pct1(num: number, den: number): number {
  return den === 0 ? 100 : Math.round((num / den) * 1000) / 10
}

/**
 * 검증 결과(citation status + claim verdict)를 노드 domainMeta.ktdsClaims 에 임베드한다 —
 * 대시보드(화면1 도메인 카드)가 domain-graph.json **한 파일**로 근거·검증을 읽게 하는 단일
 * 소스화. 도메인 노드: 도메인 레벨 주장(summary/entity/businessRule/crossDomain)만 ktdsClaims
 * 로 붙이고, **그 부분집합 기준** groundedPct/groundedCount/reviewCount 를 domainMeta 에 둔다
 * (카드가 보여주는 항목과 일치 — flow/step 은 화면2/3 소관이라 카드 근거율에서 제외).
 * flow/step 노드: 자기 ref 의 검증 항목 1개를 붙인다. demoteUnverified 다음에 적용한다.
 */
export function embedVerification(nodes: UaGraphNode[], report: VerifyReport): UaGraphNode[] {
  const domainResultById = new Map(report.domains.map((d) => [d.domainId, d]))
  const itemByRef = new Map<string, VerifiedItem>()
  // P2: step 상세 섹션 검증 항목(kind 'detail:<id>', ref '<stepId>#detail:<id>')을
  // 소유 stepId 로 묶는다 — verify 가 섹션 id 정렬 순서로 넣어 결정론 보존.
  const detailByStep = new Map<string, VerifiedItem[]>()
  for (const d of report.domains)
    for (const it of d.items) {
      itemByRef.set(it.ref, it)
      const sep = it.ref.indexOf('#detail:')
      if (sep > 0) {
        const stepId = it.ref.slice(0, sep)
        let list = detailByStep.get(stepId)
        if (!list) detailByStep.set(stepId, (list = []))
        list.push(it)
      }
    }

  return nodes.map((node) => {
    if (node.type === 'domain') {
      const dr = domainResultById.get(node.id)
      if (!dr) return node
      // 카드 근거율은 도메인 레벨 주장만 — flow/step(화면2/3 소관)과 businessFlow
      // (P4 순서도 노드별 배지 소관)는 제외해 카드 표시 항목과 지표를 일치시킨다.
      const claims = dr.items.filter(
        (it) => it.kind !== 'flow' && it.kind !== 'step' && it.kind !== 'businessFlow',
      )
      // P4/B안: 순서도 노드에 검증 결과 덧입힘 — ref
      // `<domainId>#businessFlow[<fillIndex>][<nodeId>]`(verify 와 동일 키 규약).
      // activity/decision 은 verdict + 검증된 인용(status 포함)으로 교체, start/end
      // (인용 면제·검증 항목 없음)는 원본 유지. 대시보드는 이 verdict 로 [확인 필요]
      // 배지를 그린다(설계 §4-1). fillIndex 는 applyFills 가 병합 시 보존한 fill 내
      // 원본 인덱스 — 중간 프로세스 기각으로 배열이 밀려도 재결합이 어긋나지 않는다.
      const bfs = node.domainMeta?.businessFlows as
        | Array<{ fillIndex?: unknown; nodes?: Array<Record<string, unknown>>; edges?: unknown[] }>
        | undefined
      const decoratedBfs = Array.isArray(bfs)
        ? bfs.map((p) => {
            if (!Array.isArray(p.nodes)) return p
            const idx = typeof p.fillIndex === 'number' ? p.fillIndex : 0
            return {
              ...p,
              nodes: p.nodes.map((n) => {
                const it = itemByRef.get(`${node.id}#businessFlow[${idx}][${String(n.id)}]`)
                return it ? { ...n, verdict: it.verdict, citations: it.citations } : n
              }),
            }
          })
        : undefined
      if (claims.length === 0 && !decoratedBfs) return node
      const grounded = claims.filter((c) => c.verdict === 'GROUNDED').length
      return {
        ...node,
        domainMeta: {
          ...node.domainMeta,
          ...(decoratedBfs ? { businessFlows: decoratedBfs } : {}),
          ...(claims.length > 0
            ? {
                ktdsClaims: claims,
                groundedPct: pct1(grounded, claims.length),
                groundedCount: grounded,
                reviewCount: claims.length - grounded,
              }
            : {}),
        },
      }
    }
    if (node.type === 'flow') {
      const it = itemByRef.get(node.id)
      if (!it) return node
      return { ...node, domainMeta: { ...node.domainMeta, ktdsClaims: [it] } }
    }
    if (node.type === 'step') {
      const it = itemByRef.get(node.id)
      const details = detailByStep.get(node.id) ?? []
      // summary 항목 + 상세 섹션 항목들. 둘 다 없으면 원본 유지.
      if (!it && details.length === 0) return node
      const claims = it ? [it, ...details] : details
      return { ...node, domainMeta: { ...node.domainMeta, ktdsClaims: claims } }
    }
    return node
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
