/**
 * 선례검색(precedent retrieval) — 보완 A 의 신규 결정론 알고리즘(A-A1).
 *
 * "이 기능을 새로 만들려면 기존 어느 흐름을 본떠야 하나?" 를 결정론으로 답한다.
 * host(LLM)가 자연어 의도에서 신호(도메인 힌트·엔티티·연산)를 뽑아 intent 로 넘기면,
 * 엔진은 confirmed domain-graph + skeleton + KG(similar_to/related)에서 유사 수직
 * 슬라이스(Controller→Service→Repo/Mapper→Entity→XML)를 랭킹해 top-N 후보를 낸다.
 *
 * 랭킹(F1): 도메인/흐름명 매칭 우선(강신호) → 엔티티/토큰 매칭 → KG 퍼지/확장(폴백)
 *           → 구조 완성도. 최고점 자동채택 아님(F2) — host 가 top-N 제시 후 사용자 선택.
 * precondition(F3): confirmed domain-map(skeleton+plan) 필수. 없으면 fail-closed.
 *
 * 결정론: 모든 점수는 고정 정수 가중치, 정렬은 (score DESC, flowId ASC). KG 퍼지
 * 매칭은 fuse.js 가 아니라 토큰 집합 겹침(순서 비의존)으로 재현 가능하게 구현한다.
 */
import type {
  CensusReport,
  ConfirmedPlan,
  RouteEntry,
  SkeletonReport,
} from '../domain-map/types.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadImpactInputs,
  type ImpactInputs,
} from './engine.js'
import { uaDir } from '../domain-map/persist.js'
import { cmp } from '../utils/cmp.js'

/** KG 유사도 그래프 — 선례 확장(similar_to/related)의 최소 입력. */
export interface KgSimilarity {
  /** id → filePath(있는 노드만). */
  fileById: Map<string, string>
  /** similar_to/related 엣지(source,target) — 방향 무관. */
  edges: Array<{ source: string; target: string }>
}

export class PrecedentPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrecedentPreconditionError'
  }
}

/** 역할 — 수직 슬라이스의 계층(명명/패키지 관례 기반). */
export type PrecedentRole = 'controller' | 'service' | 'repository' | 'entity' | 'xml' | 'other'

/** host 가 자연어에서 추출한 의도 신호(엔진은 자연어를 받지 않는다). */
export interface PrecedentIntent {
  /** 도메인/흐름 힌트(예: "로그인", "account", "인증"). */
  domainHints: string[]
  /** 엔티티/명사 힌트(예: "Account", "User", "Kakao"). */
  entityHints?: string[]
  /** 연산 힌트(예: "login", "create") — 토큰 매칭에만 쓰임. */
  operationHints?: string[]
}

/** 한 흐름의 역할별 파일셋. */
export interface FlowSlice {
  flowId: string
  routeId: string | null
  domainKey: string | null
  domainName: string | null
  entryFile: string | null
  entryLine: number | null
  filesByRole: Record<PrecedentRole, string[]>
  /** 슬라이스에 등장하는 모든 파일(정렬). */
  files: string[]
}

export interface PrecedentCandidate extends FlowSlice {
  score: number
  /** 매칭 근거(grounding) — 사람이 왜 후보인지 읽는다. */
  whyMatched: string[]
  /** 강 = 도메인/흐름명 매칭, 부분 = 토큰/구조/KG 만. */
  matchStrength: 'strong' | 'partial'
}

export interface PrecedentsResult {
  intent: PrecedentIntent
  topN: number
  candidates: PrecedentCandidate[]
  /** 후보 0건 — host 는 선례없음 강등(역할 스캐폴드)로 진행(A-A3). */
  empty: boolean
}

export const DEFAULT_PRECEDENT_TOP_N = 5

// ── 점수 가중치(고정·문서화) ─────────────────────────────────────────────────
const W_DOMAIN_NAME_EXACT = 100 // F1 강신호: 도메인/흐름명 정확 매칭
const W_DOMAIN_NAME_FUZZY = 40 // 도메인/흐름명 부분(substring/token) 매칭
const W_ENTITY_TOKEN = 20 // 엔티티 힌트가 슬라이스 파일명에 등장
const W_OPERATION_TOKEN = 8 // 연산 힌트 토큰 매칭
const W_KG_EXPAND = 10 // KG similar_to/related 확장 히트
const W_STRUCTURE_COMPLETE = 5 // controller+service+repo 수직 슬라이스 완성

/** 파일 경로/이름을 역할로 분류(명명·패키지 관례). 결정론. */
export function classifyRole(relPath: string): PrecedentRole {
  const lower = relPath.toLowerCase()
  const base = relPath.split('/').pop() ?? relPath
  if (lower.endsWith('.xml')) return 'xml'
  if (/(controller|servlet|resource|actionbean)\.java$/i.test(base) || /\/(web|controller)\//i.test(lower))
    return 'controller'
  if (/(serviceimpl|service)\.java$/i.test(base) || /\/service\//i.test(lower)) return 'service'
  if (
    /(mapper|repository|dao)\.java$/i.test(base) ||
    /\/(persistence|mapper|repository|dao)\//i.test(lower)
  )
    return 'repository'
  if (/\/(domain|model|entity|vo|dto)\//i.test(lower) || /(entity)\.java$/i.test(base)) return 'entity'
  return 'other'
}

function emptyRoles(): Record<PrecedentRole, string[]> {
  return { controller: [], service: [], repository: [], entity: [], xml: [], other: [] }
}

/** 토큰화 — 영숫자 경계 + camelCase 분해, 소문자, 2자 이상. */
export function tokenize(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9가-힣]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2)
}

/**
 * confirmed domain-map(skeleton + plan + routes + census)에서 흐름별 수직 슬라이스를
 * 결정론으로 조립한다. 흐름 파일 = 그 흐름의 step 들의 stepSources.relPath ∪ 진입 라우트
 * 선언 파일. 역할은 classifyRole 로 그룹핑.
 */
export function buildFlowSlices(
  skeleton: SkeletonReport,
  routes: readonly RouteEntry[],
  confirmed: ConfirmedPlan | null,
  _census: CensusReport,
): FlowSlice[] {
  const FLOW_PREFIX = 'flow:'
  const ROUTE_PREFIX = 'route:'
  const DOMAIN_PREFIX = 'domain:'

  // 인덱스: flow→steps, step→relPath, flow→domain
  const stepsByFlow = new Map<string, string[]>()
  const domainByFlow = new Map<string, string>()
  for (const e of skeleton.edges) {
    if (e.type === 'flow_step') {
      const list = stepsByFlow.get(e.source)
      if (list) list.push(e.target)
      else stepsByFlow.set(e.source, [e.target])
    } else if (e.type === 'contains_flow') {
      domainByFlow.set(e.target, e.source)
    }
  }
  const relByStep = new Map(skeleton.stepSources.map((s) => [s.stepId, s.relPath]))
  const routeByFile = new Map<string, RouteEntry>()
  for (const r of routes) if (!routeByFile.has(r.filePath)) routeByFile.set(r.filePath, r)
  const nameByKey = new Map((confirmed?.domains ?? []).map((d) => [d.key, d.name]))
  // route 선언 파일: routeId(=flow body) → 파일
  const fileByRouteId = new Map(routes.map((r) => [r.routeId, r]))

  const flowIds = [...new Set([...stepsByFlow.keys(), ...domainByFlow.keys()])].sort(cmp)
  const slices: FlowSlice[] = []
  for (const flowId of flowIds) {
    const fileSet = new Set<string>()
    for (const stepId of stepsByFlow.get(flowId) ?? []) {
      const rel = relByStep.get(stepId)
      if (rel) fileSet.add(rel)
    }
    // 진입 라우트 파일: flow:BODY → route:BODY
    let entryFile: string | null = null
    let entryLine: number | null = null
    let routeId: string | null = null
    if (flowId.startsWith(FLOW_PREFIX)) {
      const body = flowId.slice(FLOW_PREFIX.length)
      if (!body.startsWith('batch:')) {
        routeId = ROUTE_PREFIX + body
        const r = fileByRouteId.get(routeId)
        if (r) {
          entryFile = r.filePath
          entryLine = r.line
          fileSet.add(r.filePath)
        }
      }
    }
    const domainId = domainByFlow.get(flowId) ?? null
    const domainKey = domainId ? domainId.slice(DOMAIN_PREFIX.length) : null
    const filesByRole = emptyRoles()
    for (const f of [...fileSet].sort(cmp)) filesByRole[classifyRole(f)].push(f)
    slices.push({
      flowId,
      routeId,
      domainKey,
      domainName: domainKey !== null ? (nameByKey.get(domainKey) ?? null) : null,
      entryFile,
      entryLine,
      filesByRole,
      files: [...fileSet].sort(cmp),
    })
  }
  return slices
}

/** 슬라이스 표시 텍스트(매칭 토큰 풀) — 도메인명/키 + flowId + 파일 basename. */
function sliceTokens(slice: FlowSlice): Set<string> {
  const tokens = new Set<string>()
  const add = (s: string | null) => {
    if (!s) return
    for (const t of tokenize(s)) tokens.add(t)
  }
  add(slice.domainName)
  add(slice.domainKey)
  add(slice.flowId)
  add(slice.routeId)
  for (const f of slice.files) add(f.split('/').pop() ?? f)
  return tokens
}

/** KG 파일→이 파일과 similar_to/related 로 이어진 파일들(양방향). */
function buildKgExpansion(kg: KgSimilarity | null): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  if (!kg) return out
  const link = (a?: string, b?: string) => {
    if (!a || !b) return
    if (!out.has(a)) out.set(a, new Set())
    if (!out.has(b)) out.set(b, new Set())
    out.get(a)!.add(b)
    out.get(b)!.add(a)
  }
  for (const e of kg.edges) link(kg.fileById.get(e.source), kg.fileById.get(e.target))
  return out
}

/**
 * `.understand-anything/knowledge-graph.json` 에서 similar_to/related 유사도 그래프를
 * 읽는다(없거나 깨지면 null — 폴백 신호이므로 fatal 아님).
 */
export function loadKgSimilarity(projectRoot: string): KgSimilarity | null {
  const p = join(uaDir(projectRoot), 'knowledge-graph.json')
  let raw: string
  try {
    raw = readFileSync(p, 'utf8')
  } catch {
    return null
  }
  let g: { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> }
  try {
    g = JSON.parse(raw)
  } catch {
    return null
  }
  const fileById = new Map<string, string>()
  for (const n of g.nodes ?? []) {
    if (typeof n.id === 'string' && typeof n.filePath === 'string') fileById.set(n.id, n.filePath)
  }
  const edges: Array<{ source: string; target: string }> = []
  for (const e of g.edges ?? []) {
    if (e.type !== 'similar_to' && e.type !== 'related') continue
    if (typeof e.source === 'string' && typeof e.target === 'string') {
      edges.push({ source: e.source, target: e.target })
    }
  }
  return { fileById, edges }
}

/**
 * 흐름 슬라이스들을 intent 로 랭킹해 top-N 후보를 낸다(순수). domain/흐름명 매칭이
 * 강신호, 토큰/구조/KG 는 보조. 매칭 0건이면 empty=true(선례없음 강등은 host/A-A3).
 */
export function rankPrecedents(
  slices: readonly FlowSlice[],
  intent: PrecedentIntent,
  kg: KgSimilarity | null,
  topN: number = DEFAULT_PRECEDENT_TOP_N,
): PrecedentsResult {
  const domainHints = (intent.domainHints ?? []).map((h) => h.toLowerCase()).filter(Boolean)
  const entityHints = (intent.entityHints ?? []).map((h) => h.toLowerCase()).filter(Boolean)
  const opHints = (intent.operationHints ?? []).map((h) => h.toLowerCase()).filter(Boolean)
  const kgExpand = buildKgExpansion(kg)

  const scored: PrecedentCandidate[] = []
  for (const slice of slices) {
    const tokens = sliceTokens(slice)
    const why: string[] = []
    let score = 0
    let strong = false

    // a. 도메인/흐름명 매칭(F1)
    const nameText = `${slice.domainName ?? ''} ${slice.domainKey ?? ''} ${slice.flowId}`.toLowerCase()
    for (const h of domainHints) {
      const ht = tokenize(h)
      const exact =
        (slice.domainName && slice.domainName.toLowerCase() === h) ||
        (slice.domainKey && slice.domainKey.toLowerCase() === h) ||
        ht.every((t) => tokens.has(t))
      if (exact && ht.length > 0) {
        score += W_DOMAIN_NAME_EXACT
        strong = true
        why.push(`도메인/흐름명 매칭: "${h}"`)
      } else if (nameText.includes(h) || ht.some((t) => tokens.has(t))) {
        score += W_DOMAIN_NAME_FUZZY
        strong = true
        why.push(`도메인/흐름명 부분 매칭: "${h}"`)
      }
    }

    // b. 엔티티 토큰 매칭
    for (const h of entityHints) {
      if (tokenize(h).some((t) => tokens.has(t))) {
        score += W_ENTITY_TOKEN
        why.push(`엔티티 토큰 매칭: "${h}"`)
      }
    }
    // c. 연산 토큰 매칭
    for (const h of opHints) {
      if (tokenize(h).some((t) => tokens.has(t))) {
        score += W_OPERATION_TOKEN
        why.push(`연산 토큰 매칭: "${h}"`)
      }
    }

    // d. KG similar_to/related 확장 — 슬라이스 파일이 힌트 매칭 파일과 KG 로 이어짐
    let kgHit = false
    for (const f of slice.files) {
      const neighbors = kgExpand.get(f)
      if (!neighbors) continue
      for (const nb of neighbors) {
        const nbTokens = new Set(tokenize(nb.split('/').pop() ?? nb))
        if (
          [...domainHints, ...entityHints].some((h) => tokenize(h).some((t) => nbTokens.has(t)))
        ) {
          kgHit = true
          break
        }
      }
      if (kgHit) break
    }
    if (kgHit) {
      score += W_KG_EXPAND
      why.push('KG similar_to/related 확장 히트')
    }

    // e. 구조 완성도(수직 슬라이스)
    const r = slice.filesByRole
    if (r.controller.length > 0 && r.service.length > 0 && r.repository.length > 0) {
      score += W_STRUCTURE_COMPLETE
      why.push('수직 슬라이스 완성(controller·service·repo)')
    }

    if (score > 0) scored.push({ ...slice, score, whyMatched: why, matchStrength: strong ? 'strong' : 'partial' })
  }

  scored.sort((a, b) => b.score - a.score || cmp(a.flowId, b.flowId))
  const candidates = scored.slice(0, topN)
  return { intent, topN, candidates, empty: candidates.length === 0 }
}

/**
 * 사용자가 top-N 에서 명시 선택(F2)한 flowId 를 PrecedentCandidate 로 만든다.
 * 랭킹을 거치지 않고 그 흐름의 수직 슬라이스를 그대로 후보화한다(사용자 선택 =
 * 실재 선례 → matchStrength 'strong'). 흐름이 없으면 null. whyMatched=사용자 선택.
 */
export function selectPrecedentByFlowId(
  inputs: { skeleton: SkeletonReport | null; routes: { routes: readonly RouteEntry[] }; confirmed: ConfirmedPlan | null; census: CensusReport },
  flowId: string,
): PrecedentCandidate | null {
  if (!inputs.skeleton || !inputs.confirmed) return null
  const slices = buildFlowSlices(inputs.skeleton, inputs.routes.routes, inputs.confirmed, inputs.census)
  const slice = slices.find((s) => s.flowId === flowId)
  if (!slice) return null
  return { ...slice, score: 0, whyMatched: ['사용자 선택(F2)'], matchStrength: 'strong' }
}

/**
 * IO 진입점 — confirmed domain-map 로드 + KG 오버레이 로드 후 랭킹. F3 precondition:
 * skeleton/confirmed 둘 다 있어야(= confirm 완료) 진행. 없으면 PrecedentPreconditionError.
 */
export function findPrecedents(
  projectRoot: string,
  intent: PrecedentIntent,
  options: { topN?: number; inputs?: ImpactInputs } = {},
): PrecedentsResult {
  const inputs = options.inputs ?? loadImpactInputs(projectRoot)
  if (!inputs.skeleton || !inputs.confirmed) {
    throw new PrecedentPreconditionError(
      '선례검색은 confirmed domain-map 이 필요합니다 — 먼저 /understand-map confirm 을 완료하세요(fail-closed).',
    )
  }
  const kg = loadKgSimilarity(projectRoot)
  const slices = buildFlowSlices(inputs.skeleton, inputs.routes.routes, inputs.confirmed, inputs.census)
  return rankPrecedents(slices, intent, kg, options.topN ?? DEFAULT_PRECEDENT_TOP_N)
}
