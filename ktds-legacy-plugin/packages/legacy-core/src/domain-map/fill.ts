/**
 * FILL 단계(S8 채움 계약) — LLM(호스트=Claude) 채움 입력/적용 규칙.
 *
 * 디스패치 자체는 호스트가 SKILL.md 지시로 수행한다: 도메인당 1회 bundle/<key>.json
 * 을 읽고 fill/<key>.json 을 쓴다. 이 모듈은 그 계약의 스키마와 적용 규칙이다:
 *   - 모든 사실 주장(summary/entities/businessRules/crossDomain/flow/step)에
 *     파일:라인 인용 + 인용 라인 스니펫 동봉 의무(스키마 강제, citations min 1).
 *   - 구조 필드는 read-only — 적용은 기존 노드의 의미 필드(name/summary/도메인 메타)
 *     를 채우는 것만 가능하고, 모르는 ID·다른 도메인의 ID 는 항목 단위로 기각(보고).
 *   - 실패 도메인만 재시도 (파일 단위 멱등 — fill/<key>.json 재작성).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { specMapDir } from './persist.js'
import { safeKeyFilename } from './bundle.js'
import { SKELETON_BLANK, type SkeletonReport, type UaGraphNode } from './types.js'
import { cmp } from '../utils/cmp.js'

/** `.spec/map/fill/` 하위 디렉터리 이름. */
export const FILL_DIR = 'fill'

export const CitationSchema = z.object({
  /** 프로젝트 루트 상대 경로. */
  filePath: z.string().min(1),
  /** 1-based 라인. */
  line: z.number().int().positive(),
  /** 인용 라인의 실제 텍스트 (검증기가 실파일과 대조). ") {" 같은 도처 일치
   *  토막을 막기 위해 최소 8자 + 검증기의 식별자성 토큰 검사. */
  snippet: z.string().min(8),
})
export type Citation = z.infer<typeof CitationSchema>

/** 사실 주장 — 텍스트 + 인용 의무(citations min 1). */
export const ClaimSchema = z.object({
  text: z.string().min(1),
  citations: z.array(CitationSchema).min(1),
})
export type Claim = z.infer<typeof ClaimSchema>

/**
 * P4(WORK_MAP §5): 업무 흐름도 노드 — work_flow.png 어휘(시작/종료/활동/판단).
 * activity/decision 은 사실 주장이라 인용 min 1(기존 규약), start/end 는 구조
 * 마커라 면제. flowRef 는 실존 flow id 검증(유령 참조 거부 — applyFills).
 */
export const BusinessFlowNodeSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(['start', 'end', 'activity', 'decision']),
    /** 업무 언어 라벨(코드 심볼이 아니라 사람 말). */
    label: z.string().min(1).max(120),
    /** 선택 — 이 활동이 대응하는 기능(flow) id. 워크스페이스 코드 탭 딥링크 앵커. */
    flowRef: z.string().regex(/^flow:/).optional(),
    citations: z.array(CitationSchema).optional(),
  })
  .superRefine((n, ctx) => {
    if ((n.kind === 'activity' || n.kind === 'decision') && (n.citations?.length ?? 0) < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${n.kind} 노드(${n.id})는 citations 최소 1개가 필요합니다`,
      })
    }
  })
export type BusinessFlowNode = z.infer<typeof BusinessFlowNodeSchema>

export const BusinessFlowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** 판단 분기 라벨(예: "YES"/"NO"/"재고 있음"). */
  label: z.string().min(1).max(40).optional(),
})
export type BusinessFlowEdge = z.infer<typeof BusinessFlowEdgeSchema>

export const BusinessFlowSchema = z.object({
  nodes: z.array(BusinessFlowNodeSchema).min(2),
  edges: z.array(BusinessFlowEdgeSchema).min(1),
})
export type BusinessFlow = z.infer<typeof BusinessFlowSchema>

export const DomainFillSchema = z.object({
  schemaVersion: z.literal(1),
  domainId: z.string().regex(/^domain:/),
  /** 도메인 표시명 — 명명이라 인용 면제. */
  name: z.string().min(1).max(120),
  summary: ClaimSchema,
  entities: z.array(ClaimSchema),
  businessRules: z.array(ClaimSchema),
  crossDomainInteractions: z.array(ClaimSchema),
  /**
   * P4: 도메인 업무 프로세스 순서도(선택 — 없으면 대시보드 결정론 순차 폴백).
   * 그래프 정합·flowRef 실존 검증은 applyFills(validateBusinessFlow)에서 하고,
   * 실패 시 businessFlow 만 기각(도메인 fill 전체 기각 아님 — 부분 수용).
   */
  businessFlow: BusinessFlowSchema.optional(),
  flows: z.array(
    z.object({
      flowId: z.string().regex(/^flow:/),
      name: z.string().min(1).max(120),
      summary: ClaimSchema,
    }),
  ),
  steps: z.array(
    z.object({
      stepId: z.string().regex(/^step:/),
      name: z.string().min(1).max(120),
      summary: ClaimSchema,
      /**
       * P2: 템플릿 섹션별 의미 주장(key = NodeDetailTemplate 섹션 id, 예: 'role').
       * 각 값은 도메인 주장과 동일한 ClaimSchema(text + 인용 ≥1). 선택 — 미채움 섹션은
       * verify/emit 에서 그냥 빠진다(결정론 폴백 없음 — role 은 LLM 전용).
       */
      detail: z.record(z.string(), ClaimSchema).optional(),
    }),
  ),
})
export type DomainFill = z.infer<typeof DomainFillSchema>

export interface RejectedItem {
  domainId: string
  ref: string
  reason: string
  /** 기각 대상 종류 — 문자열 ref 접미 파싱 의존 제거(구조적 필터, 리뷰 C5). */
  kind: 'domain' | 'flow' | 'step' | 'businessFlow'
}

/**
 * P4: businessFlow 그래프 정합 검증(WORK_MAP §5) — 스키마 통과 후의 의미 검증.
 * 반환 = 위반 사유 목록(빈 배열 = 정합). 하나라도 있으면 해당 도메인의 businessFlow
 * 만 기각한다(도메인 fill 전체 기각 아님).
 *
 * 규칙: 중복 노드 id · 엣지 끝점 실존 · 고아 노드(어느 엣지에도 닿지 않음) ·
 * start/end 각 1개 이상 · flowRef 는 이 도메인의 실존 flow id(유령 참조 거부) ·
 * **decision 은 나가는 엣지 2개 이상 + 나가는 엣지 전부 분기 라벨 필수**(분기 없는
 * 판단은 AC-4 "분기 포함 순서도"의 약속 위반 — 리뷰 C1/C7). 사이클(재시도 루프)은
 * 의도적으로 허용한다.
 */
export function validateBusinessFlow(
  bf: BusinessFlow,
  domainFlowIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const n of bf.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate-node-id: ${n.id}`)
    ids.add(n.id)
  }
  const touched = new Set<string>()
  const outgoing = new Map<string, BusinessFlowEdge[]>()
  for (const e of bf.edges) {
    if (!ids.has(e.from)) errors.push(`edge-from-unknown: ${e.from}`)
    if (!ids.has(e.to)) errors.push(`edge-to-unknown: ${e.to}`)
    touched.add(e.from)
    touched.add(e.to)
    const list = outgoing.get(e.from) ?? []
    list.push(e)
    outgoing.set(e.from, list)
  }
  for (const n of bf.nodes) {
    if (!touched.has(n.id)) errors.push(`orphan-node: ${n.id}`)
  }
  const starts = bf.nodes.filter((n) => n.kind === 'start').length
  const ends = bf.nodes.filter((n) => n.kind === 'end').length
  if (starts < 1) errors.push('no-start-node')
  if (ends < 1) errors.push('no-end-node')
  for (const n of bf.nodes) {
    if (n.flowRef && !domainFlowIds.has(n.flowRef)) {
      errors.push(`flowRef-unknown: ${n.id} → ${n.flowRef}`)
    }
    if (n.kind === 'decision') {
      const outs = outgoing.get(n.id) ?? []
      if (outs.length < 2) errors.push(`decision-needs-branches: ${n.id} (outgoing ${outs.length})`)
      if (outs.some((e) => !e.label)) errors.push(`decision-branch-unlabeled: ${n.id}`)
    }
  }
  return errors.sort(cmp)
}

/** `.spec/map/fill/` 디렉터리 경로. */
export function fillDir(projectRoot: string): string {
  return join(specMapDir(projectRoot), FILL_DIR)
}

/** 도메인 key 에 대응하는 fill 파일의 절대 경로. */
export function fillPathFor(projectRoot: string, key: string): string {
  return join(fillDir(projectRoot), `${safeKeyFilename(key)}.json`)
}

/**
 * fill/*.json 읽기 — 파일 없음은 그 도메인만 "pending"(실패 도메인만 재시도, 멱등),
 * 파싱/스키마/domainId 불일치는 "invalid"(재생성 대상)로 남긴다.
 */
export async function readFills(
  projectRoot: string,
  skeleton: SkeletonReport,
): Promise<{
  fills: DomainFill[]
  pending: string[]
  invalid: Array<{ key: string; error: string }>
}> {
  const fills: DomainFill[] = []
  const pending: string[] = []
  const invalid: Array<{ key: string; error: string }> = []
  for (const node of skeleton.nodes) {
    if (node.type !== 'domain') continue
    const key = node.id.slice('domain:'.length)
    let raw: string
    try {
      raw = await readFile(fillPathFor(projectRoot, key), 'utf8')
    } catch {
      pending.push(key)
      continue
    }
    try {
      const fill = DomainFillSchema.parse(JSON.parse(raw))
      if (fill.domainId !== node.id) {
        throw new Error(`domainId 불일치: ${fill.domainId} ≠ ${node.id}`)
      }
      fills.push(fill)
    } catch (err) {
      invalid.push({ key, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return { fills, pending, invalid }
}

/**
 * fill 을 skeleton 노드에 적용 — 구조 read-only.
 * 반환 노드는 복사본이다(skeleton 불변). 모르는 flowId/stepId, 도메인 밖 ID 는
 * 항목 단위 기각으로 보고된다(조용한 누락 금지). 인용은 domainMeta.ktdsClaims
 * (passthrough)로 동봉되어 검증기(S9)와 문서 렌더가 근거를 읽는다 — U-A 스키마의
 * string[] domainMeta 필드(entities 등)에는 텍스트만 남긴다.
 */
export function applyFills(
  skeleton: SkeletonReport,
  fills: DomainFill[],
): { nodes: UaGraphNode[]; rejected: RejectedItem[] } {
  const rejected: RejectedItem[] = []
  const nodes: UaGraphNode[] = skeleton.nodes.map((n) => ({ ...n }))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // 도메인 멤버십: skeleton 태그(tags[0] = 도메인 key)가 닻.
  const domainKeyOf = (n: UaGraphNode): string | null => n.tags[0] ?? null

  for (const fill of [...fills].sort((a, b) => cmp(a.domainId, b.domainId))) {
    const domainNode = byId.get(fill.domainId)
    if (!domainNode || domainNode.type !== 'domain') {
      rejected.push({
        domainId: fill.domainId,
        ref: fill.domainId,
        reason: 'unknown-domain',
        kind: 'domain',
      })
      continue
    }
    const key = fill.domainId.slice('domain:'.length)

    domainNode.name = fill.name
    domainNode.summary = fill.summary.text
    domainNode.domainMeta = {
      ...domainNode.domainMeta,
      entities: fill.entities.map((c) => c.text),
      businessRules: fill.businessRules.map((c) => c.text),
      crossDomainInteractions: fill.crossDomainInteractions.map((c) => c.text),
      // 근거 동봉(passthrough) — 문서 렌더와 S9 검증기의 입력.
      ktdsClaims: [
        { kind: 'summary', text: fill.summary.text, citations: fill.summary.citations },
        ...fill.entities.map((c) => ({ kind: 'entity', ...c })),
        ...fill.businessRules.map((c) => ({ kind: 'businessRule', ...c })),
        ...fill.crossDomainInteractions.map((c) => ({ kind: 'crossDomain', ...c })),
      ],
    }

    // P4: 업무 흐름도 — 그래프 정합·flowRef 실존 검증 통과 시에만 domainMeta 병합.
    // 실패는 businessFlow 만 기각(부분 수용) — 사유를 rejected 로 표면화한다.
    if (fill.businessFlow) {
      const domainFlowIds = new Set(
        nodes.filter((n) => n.type === 'flow' && domainKeyOf(n) === key).map((n) => n.id),
      )
      const errors = validateBusinessFlow(fill.businessFlow, domainFlowIds)
      if (errors.length > 0) {
        const reason = `invalid-business-flow: ${errors.join('; ')}`
        rejected.push({
          domainId: fill.domainId,
          ref: `${fill.domainId}#businessFlow`,
          reason,
          kind: 'businessFlow',
        })
        // 기각 사유를 그래프에도 표면화 — 대시보드가 "미채움"과 "작성했으나 기각"을
        // 구별해 배너를 나눈다(정직성, 리뷰 C2). businessFlow 는 병합하지 않는다.
        domainNode.domainMeta = { ...domainNode.domainMeta, businessFlowRejected: reason }
      } else {
        domainNode.domainMeta = {
          ...domainNode.domainMeta,
          // 인용은 원본 그대로 동봉 — 검증 상태(verdict/status)는 S9 후
          // embedVerification 이 노드 단위로 덧입힌다(단일 소스 = domain-graph.json).
          businessFlow: {
            nodes: fill.businessFlow.nodes.map((n) => ({ ...n })),
            edges: fill.businessFlow.edges.map((e) => ({ ...e })),
          },
        }
      }
    }

    for (const f of fill.flows) {
      const node = byId.get(f.flowId)
      if (!node || node.type !== 'flow' || domainKeyOf(node) !== key) {
        rejected.push({
          domainId: fill.domainId,
          ref: f.flowId,
          reason: !node ? 'unknown-flow' : 'flow-outside-domain',
          kind: 'flow',
        })
        continue
      }
      node.name = f.name
      node.summary = f.summary.text
      node.domainMeta = {
        ...node.domainMeta,
        ktdsClaims: [{ kind: 'summary', text: f.summary.text, citations: f.summary.citations }],
      }
    }
    for (const s of fill.steps) {
      const node = byId.get(s.stepId)
      if (!node || node.type !== 'step' || domainKeyOf(node) !== key) {
        rejected.push({
          domainId: fill.domainId,
          ref: s.stepId,
          reason: !node ? 'unknown-step' : 'step-outside-domain',
          kind: 'step',
        })
        continue
      }
      node.name = s.name
      node.summary = s.summary.text
      node.domainMeta = {
        ...node.domainMeta,
        ktdsClaims: [{ kind: 'summary', text: s.summary.text, citations: s.summary.citations }],
      }
    }
  }

  return { nodes, rejected }
}

/** 채움이 안 된(= 여전히 빈 summary) 노드 id 목록 — 디스패치 진행률 표시용. */
export function unfilledNodes(nodes: UaGraphNode[]): string[] {
  return nodes
    .filter((n) => n.summary === SKELETON_BLANK)
    .map((n) => n.id)
    .sort(cmp)
}
