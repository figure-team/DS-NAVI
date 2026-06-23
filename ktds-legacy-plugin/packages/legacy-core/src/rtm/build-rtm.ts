/**
 * buildRtm — AS-IS RTM 모델 빌더(R1). docs/ktds/RTM_TAB_DESIGN.md §4.1.
 *
 * "기능 = flow 노드". 각 flow 를 행으로, 4개 추적 축을 코드 근거에서 채운다:
 *   - 진입점: domainMeta.entryPoint 핸들러 ↔ routes 매칭(매칭 시 file:line [확정]).
 *   - 구현:   flow 핸들러 파일 + flow_step step 파일(file:line [확정]).
 *   - 데이터: 기능→매퍼 SQL 문에서 테이블×CRUD 판정(crud-matrix 와 동일 규약, [확정]).
 *   - 테스트: 현 그래프 모델에 테스트 정보 없음 → UNVERIFIED(빈 셀, 합성 금지).
 *
 * grounding 보존(§3.4): 근거 없는 셀을 CONFIRMED 로 올리지 않는다. 새 사실을 지어내지 않는다.
 * 결정론: 도메인 id ASC → flow id ASC 로 FN-### 부여, 모든 배열 정렬(Date.now/난수 없음).
 *
 * R1 범위: requirements=[] (요구사항 귀속/이력은 R4/R5). origin 전부 AS_IS.
 */
import type { UaGraphNode } from '../domain-map/types.js'
import type { DocInput } from '../doc-generator/builders/shared.js'
import { nodeEvidence } from '../doc-generator/builders/shared.js'
import type { Confidence } from '../types.js'
import type { Evidence } from '../doc-generator/types.js'
import { namespaceBaseName } from '../mybatis/index.js'
import { reachableMethods } from '../domain-map/method-calls.js'
import type {
  RtmDomain,
  RtmFunctionRow,
  RtmModel,
  RtmTraceCell,
} from './types.js'
import { computeCoverage } from './coverage.js'
import { computeDiagnostics } from './validate.js'

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** flow id 가 미귀속(어느 도메인 contains_flow 에도 없음)일 때의 가상 도메인. */
const UNASSIGNED_ID = '__unassigned__'
const UNASSIGNED_NAME = '미분류'

function baseName(filePath: string): string {
  return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '')
}

/** "Class#method" → "method"(없으면 null). crud-matrix.bareHandler 와 동일 규약. */
function bareHandler(entryPoint: unknown): string | null {
  if (typeof entryPoint !== 'string') return null
  return entryPoint.includes('#') ? entryPoint.slice(entryPoint.lastIndexOf('#') + 1) : null
}

/** calls 엣지 description("m1 → m2 …")의 메서드 토큰 전부(매퍼 메서드명 = MyBatis statement id). */
function calleeMethods(desc: string | undefined): string[] {
  if (!desc) return []
  return desc.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
}

/** CRUD 글자 집합 → 'CRUD' 정준 순서 문자열(비었으면 ''). */
function crudOrder(letters: Set<string>): string {
  return ['C', 'R', 'U', 'D'].filter((l) => letters.has(l)).join('')
}

function displayName(node: UaGraphNode): string {
  return node.name.length > 0 ? node.name : node.id
}

/** 빈/미상 셀(근거 없음). */
function inferredCell(value = ''): RtmTraceCell {
  return { value, confidence: 'INFERRED', evidence: [] }
}

/** 근거 보유 시 CONFIRMED, 아니면 INFERRED(grounding 보존). */
function cellOf(value: string, evidence: Evidence[]): RtmTraceCell {
  const confidence: Confidence = evidence.length > 0 ? 'CONFIRMED' : 'INFERRED'
  return { value, confidence, evidence }
}

/** 매퍼 basename → {문맵, relPath}. crud-matrix 와 동일 인덱스. */
function indexMappers(input: DocInput): Map<
  string,
  { stmts: Map<string, { crud: string; tables: string[]; line: number }>; relPath: string }
> {
  const out = new Map<string, { stmts: Map<string, { crud: string; tables: string[]; line: number }>; relPath: string }>()
  const model = input.mybatisModel
  if (!model) return out
  for (const m of model.mappers) {
    out.set(namespaceBaseName(m.namespace), {
      stmts: new Map(m.statements.map((s) => [s.id, { crud: s.crud, tables: s.tables, line: s.line }])),
      relPath: m.relPath,
    })
  }
  return out
}

/**
 * 한 flow 의 데이터 셀(테이블×CRUD + 근거). methodCallGraph 가 있으면 핸들러가 실제 호출하는
 * 매퍼 메서드만 귀속(정밀), 없으면 flow_step dao 스텝의 사용 메서드로 폴백(파일 단위).
 * 합성 금지: 근거 없으면 빈 INFERRED.
 */
function dataCell(
  flow: UaGraphNode,
  input: DocInput,
  mapperByBase: ReturnType<typeof indexMappers>,
  stepById: Map<string, UaGraphNode>,
  incoming: Map<string, string[]>,
): RtmTraceCell {
  if (mapperByBase.size === 0) return inferredCell()
  const byTable = new Map<string, Set<string>>()
  const ev: Evidence[] = []
  const evSeen = new Set<string>()
  const addStmt = (stmt: { crud: string; tables: string[]; line: number }, relPath: string): void => {
    for (const t of stmt.tables) {
      const set = byTable.get(t) ?? new Set<string>()
      set.add(stmt.crud)
      byTable.set(t, set)
    }
    const key = `${relPath}:${stmt.line}`
    if (!evSeen.has(key)) {
      evSeen.add(key)
      ev.push({ file: relPath, line: stmt.line })
    }
  }

  const handler = bareHandler((flow.domainMeta as Record<string, unknown> | undefined)?.entryPoint)
  if (input.methodCallGraph && handler && typeof flow.filePath === 'string') {
    // 정밀: 핸들러에서 도달하는 (파일, 메서드) → 매퍼 문.
    for (const { file, method } of reachableMethods(input.methodCallGraph, flow.filePath, handler)) {
      const mapper = mapperByBase.get(baseName(file))
      const stmt = mapper?.stmts.get(method)
      if (mapper && stmt) addStmt(stmt, mapper.relPath)
    }
  } else {
    // 폴백: flow_step dao 스텝이 들어오는 calls 로 쓰는 메서드.
    for (const e of input.edges) {
      if (e.type !== 'flow_step' || e.source !== flow.id) continue
      const step = stepById.get(e.target)
      if (!step || step.layer !== 'dao' || typeof step.filePath !== 'string') continue
      const mapper = mapperByBase.get(baseName(step.filePath))
      if (!mapper) continue
      for (const method of incoming.get(step.id) ?? []) {
        const stmt = mapper.stmts.get(method)
        if (stmt) addStmt(stmt, mapper.relPath)
      }
    }
  }

  if (byTable.size === 0) return inferredCell()
  const value = [...byTable.keys()]
    .sort(cmp)
    .map((t) => `${t}(${crudOrder(byTable.get(t)!)})`)
    .join(' · ')
  return { value, confidence: 'CONFIRMED', evidence: ev }
}

/** 한 flow 의 진입점 셀 — entryPoint 핸들러 ↔ routes 핸들러 매칭(매칭 시 라우트 file:line). */
function entryPointCell(flow: UaGraphNode, routeByHandler: Map<string, { method: string; path: string; file: string; line: number }>): RtmTraceCell {
  const entry = (flow.domainMeta as Record<string, unknown> | undefined)?.entryPoint
  const entryStr = typeof entry === 'string' && entry.length > 0 ? entry : null
  if (entryStr) {
    const route = routeByHandler.get(entryStr)
    if (route) {
      return { value: `${route.method} ${route.path}`, confidence: 'CONFIRMED', evidence: [{ file: route.file, line: route.line }] }
    }
    // 라우트 미매칭 — 핸들러 문자열 유지, 근거는 flow 노드(핸들러 위치).
    return cellOf(entryStr, nodeEvidence(flow))
  }
  // entryPoint 메타 없음 — 근거 없음.
  return inferredCell()
}

/** 한 flow 의 구현 셀 — 핸들러 파일 + flow_step step 파일(클래스 basename, file:line 근거). */
function implementationCell(flow: UaGraphNode, input: DocInput, stepById: Map<string, UaGraphNode>): RtmTraceCell {
  const files = new Map<string, Evidence>() // relPath → 첫 근거
  const add = (node: UaGraphNode): void => {
    if (typeof node.filePath !== 'string') return
    if (!files.has(node.filePath)) files.set(node.filePath, { file: node.filePath, line: node.lineRange ? node.lineRange[0] : null })
  }
  add(flow)
  for (const e of input.edges) {
    if (e.type !== 'flow_step' || e.source !== flow.id) continue
    const step = stepById.get(e.target)
    if (step) add(step)
  }
  const evidence = [...files.values()].sort((a, b) => cmp(a.file, b.file))
  const value = [...new Set(evidence.map((e) => baseName(e.file)))].sort(cmp).join(', ')
  return cellOf(value, evidence)
}

/**
 * AS-IS RTM 모델 빌더. flow 노드를 도메인별로 묶어 기능 행을 만들고 4축을 근거로 채운다.
 * gitCommit 은 호출자가 주입(결정론). requirements=[] (R1).
 */
export function buildRtm(input: DocInput, gitCommit: string | null = null): RtmModel {
  const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]))

  // dao 스텝 id → 사용 메서드(폴백 데이터 셀용).
  const incoming = new Map<string, string[]>()
  for (const e of input.edges) {
    if (e.type !== 'calls') continue
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)])
  }

  // routes 핸들러 → 라우트(진입점 매칭용). 첫 출현 우선(routeId 정렬).
  const routeByHandler = new Map<string, { method: string; path: string; file: string; line: number }>()
  for (const r of [...(input.routes?.routes ?? [])].sort((a, b) => cmp(a.routeId, b.routeId))) {
    if (typeof r.handler === 'string' && r.handler.length > 0 && !routeByHandler.has(r.handler)) {
      routeByHandler.set(r.handler, { method: r.method, path: r.path, file: r.filePath, line: r.line })
    }
  }

  const mapperByBase = indexMappers(input)

  // 도메인 노드 인덱스 + flow→도메인 귀속(contains_flow).
  const domainById = new Map(input.nodes.filter((n) => n.type === 'domain').map((n) => [n.id, n]))
  const domainOfFlow = new Map<string, string>()
  for (const e of input.edges) {
    if (e.type === 'contains_flow') domainOfFlow.set(e.target, e.source)
  }

  const flows = input.nodes.filter((n) => n.type === 'flow').sort((a, b) => cmp(a.id, b.id))

  // 도메인 그룹 키 정렬: 도메인 id ASC, 미귀속은 마지막.
  const groupKeys = [...new Set(flows.map((f) => domainOfFlow.get(f.id) ?? UNASSIGNED_ID))].sort((a, b) => {
    if (a === UNASSIGNED_ID) return 1
    if (b === UNASSIGNED_ID) return -1
    return cmp(a, b)
  })

  const functions: RtmFunctionRow[] = []
  const domainCounts = new Map<string, number>()
  let seq = 0
  for (const gk of groupKeys) {
    const groupFlows = flows.filter((f) => (domainOfFlow.get(f.id) ?? UNASSIGNED_ID) === gk)
    const domainNode = domainById.get(gk)
    const domainName = gk === UNASSIGNED_ID ? UNASSIGNED_NAME : domainNode ? displayName(domainNode) : gk
    domainCounts.set(gk, groupFlows.length)
    for (const flow of groupFlows) {
      seq += 1
      const impl = implementationCell(flow, input, stepById)
      functions.push({
        id: flow.id,
        featureId: `FN-${String(seq).padStart(3, '0')}`,
        name: displayName(flow),
        domainId: gk,
        domainName,
        entryPoint: entryPointCell(flow, routeByHandler),
        implementation: impl,
        data: dataCell(flow, input, mapperByBase, stepById, incoming),
        test: { value: '', confidence: 'UNVERIFIED', evidence: [] },
        origin: 'AS_IS',
        state: impl.evidence.length > 0 ? 'IMPLEMENTED' : 'PLANNED',
        requirementHistory: [],
        nfrTags: [],
        rules: [],
        deliverableRefs: [],
      })
    }
  }

  const domains: RtmDomain[] = groupKeys.map((gk) => ({
    id: gk,
    name: gk === UNASSIGNED_ID ? UNASSIGNED_NAME : domainById.get(gk) ? displayName(domainById.get(gk)!) : gk,
    functionCount: domainCounts.get(gk) ?? 0,
  }))

  const model: RtmModel = { schemaVersion: 2, gitCommit, domains, functions, requirements: [] }
  const withCov: RtmModel = { ...model, coverage: computeCoverage(model) }
  return { ...withCov, diagnostics: computeDiagnostics(withCov) }
}
