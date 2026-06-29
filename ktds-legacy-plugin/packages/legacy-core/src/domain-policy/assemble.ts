/**
 * 도메인 정책서 입력 조립(PD3) — map 산출물을 DomainPolicyInput[] 로 묶는다.
 *
 * 가용 산출물(scan/confirm/emit 이후):
 *   - .spec/map/candidates.json     도메인 경계 + 멤버 파일(files[].relPath)
 *   - .understand-anything/domain-graph.json  emit 된 흐름(flow)·도메인 표시명(있으면)
 *   - 분기: 도메인 멤버 .java 를 PD1 scanBranches 로 경계 한정 스캔
 *
 * 순수(buildDomainPolicyInputs)와 IO(assembleDomainPolicies)를 분리해 테스트 가능하게 한다.
 * 결정론: 도메인 key 정렬, flow/branch 는 생산자 정렬 보존.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { specMapDir } from '../domain-map/persist.js'
import { CandidatesReportSchema } from '../domain-map/types.js'
import type { CandidatesReport, UaGraphEdge, UaGraphNode } from '../domain-map/types.js'
import { extractBranches } from './branch-scanner.js'
import { readDbSchema } from '../db-schema/index.js'
import type { DbSchemaModel } from '../db-schema/index.js'
import type { BranchSignal, DomainPolicyInput } from './types.js'

type Term = NonNullable<DomainPolicyInput['terms']>[number]
type StatusCode = NonNullable<DomainPolicyInput['statusCodes']>[number]

/** emit 된 도메인 그래프(부분) — 흐름/도메인 표시명 출처. */
export interface DomainGraphLite {
  nodes: UaGraphNode[]
  edges: UaGraphEdge[]
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 테이블이 도메인 소스에서 참조되는가 — 테이블명이 도메인 파일 텍스트에 등장(내용 참조 scoping). */
function referencedIn(text: string, tableName: string): boolean {
  return tableName.length >= 4 && text.toLowerCase().includes(tableName.toLowerCase())
}

/** 셀 값 정리 — HTML 태그 제거·공백 1칸·트림(dataload 에 UI 마크업이 섞이는 경우 대비). */
function cleanVal(v: string | undefined): string {
  return (v ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * §3 상태값 — 도메인이 참조하는 코드/룩업 테이블의 dataload 행을 코드값으로(결정론).
 * group=테이블 · code=첫 컬럼값 · 명칭=둘째 · 설명=셋째. 근거=행 file:line.
 * (group,code) 중복 제거(여러 .sql 의 동일 INSERT 대비), 값은 HTML 제거.
 */
export function deriveStatusCodes(dbSchema: DbSchemaModel | null, text: string): StatusCode[] {
  if (!dbSchema) return []
  const out: StatusCode[] = []
  const seen = new Set<string>()
  for (const t of dbSchema.tables) {
    if (!t.isCodeTable || t.rows.length === 0 || !referencedIn(text, t.name)) continue
    const cols = t.columns.map((c) => c.name)
    for (const r of t.rows) {
      const code = cleanVal(r.values[cols[0]])
      const dedup = `${t.name}::${code}`
      if (seen.has(dedup)) continue
      seen.add(dedup)
      out.push({
        group: t.name,
        code,
        name: cols[1] ? cleanVal(r.values[cols[1]]) : '',
        desc: cols[2] ? cleanVal(r.values[cols[2]]) : '',
        evidence: { file: t.relPath, line: r.line },
      })
    }
  }
  return out
}

/** §2 용어 — 도메인이 참조하는 테이블/컬럼의 DB 주석(있을 때). 합성 아님 — 주석 원문. */
export function deriveTerms(dbSchema: DbSchemaModel | null, text: string): Term[] {
  if (!dbSchema) return []
  const out: Term[] = []
  for (const t of dbSchema.tables) {
    if (!referencedIn(text, t.name)) continue
    if (t.comment) out.push({ term: t.name, definition: t.comment, note: 'DB 테이블 주석', evidence: { file: t.relPath, line: t.line } })
    for (const c of t.columns) {
      if (c.comment) out.push({ term: `${t.name}.${c.name}`, definition: c.comment, note: 'DB 컬럼 주석', evidence: { file: t.relPath, line: c.line } })
    }
  }
  return out
}

/** relPath → 클래스명(파일 basename, 확장자 제거). */
function classNameOf(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** 정책 대상 Java? — 운영 소스만(테스트 제외). 정책은 운영 코드 기준. */
function isPolicyJava(relPath: string): boolean {
  return relPath.endsWith('.java') && !relPath.includes('/test/')
}

/**
 * 순수 조립 — candidates(경계/파일) + domain-graph(흐름/표시명) + 도메인별 분기 → 입력[].
 * domainGraph 없으면 흐름 빈 배열·표시명=key 로 우아하게 degrade.
 */
export function buildDomainPolicyInputs(
  candidates: CandidatesReport,
  domainGraph: DomainGraphLite | null,
  branchesByKey: Map<string, BranchSignal[]>,
  termsByKey: Map<string, Term[]> = new Map(),
  statusByKey: Map<string, StatusCode[]> = new Map(),
): DomainPolicyInput[] {
  // domain:<key> 노드 표시명 + contains_flow 흐름 인덱스.
  const nameByKey = new Map<string, string>()
  const flowsByKey = new Map<string, Array<{ name: string; entry: { file: string; line: number } | null }>>()
  if (domainGraph) {
    const nodeById = new Map(domainGraph.nodes.map((n) => [n.id, n]))
    for (const n of domainGraph.nodes) {
      if (n.type === 'domain' && n.id.startsWith('domain:')) {
        nameByKey.set(n.id.slice('domain:'.length), n.name)
      }
    }
    for (const e of domainGraph.edges) {
      if (e.type !== 'contains_flow' || !e.source.startsWith('domain:')) continue
      const key = e.source.slice('domain:'.length)
      const flow = nodeById.get(e.target)
      if (!flow) continue
      const entry =
        typeof flow.filePath === 'string' && flow.lineRange
          ? { file: flow.filePath, line: flow.lineRange[0] }
          : null
      const list = flowsByKey.get(key) ?? []
      list.push({ name: flow.name.length > 0 ? flow.name : flow.id, entry })
      flowsByKey.set(key, list)
    }
  }

  const sorted = [...candidates.candidates].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return sorted.map((c) => ({
    key: c.key,
    name: nameByKey.get(c.key) ?? c.key,
    classes: c.files
      .filter((f) => isPolicyJava(f.relPath))
      .map((f) => ({ className: classNameOf(f.relPath), relPath: f.relPath })),
    flows: flowsByKey.get(c.key) ?? [],
    branches: branchesByKey.get(c.key) ?? [],
    terms: termsByKey.get(c.key) ?? [],
    statusCodes: statusByKey.get(c.key) ?? [],
  }))
}

/** .spec/map/candidates.json 로드(zod 검증). 없으면 null. */
function readCandidates(projectRoot: string): CandidatesReport | null {
  const path = join(specMapDir(projectRoot), 'candidates.json')
  if (!existsSync(path)) return null
  try {
    return CandidatesReportSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

/** emit 된 domain-graph.json 로드(부분). 없거나 형식 오류면 null(흐름 degrade). */
function readDomainGraph(projectRoot: string): DomainGraphLite | null {
  const path = join(projectRoot, '.understand-anything', 'domain-graph.json')
  if (!existsSync(path)) return null
  try {
    const g = JSON.parse(readFileSync(path, 'utf8'))
    if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return null
    return { nodes: g.nodes, edges: g.edges }
  } catch {
    return null
  }
}

/**
 * IO 조립 — map 산출물 로드 + 도메인 멤버 .java 분기 스캔(경계 한정) → DomainPolicyInput[].
 * candidates.json 이 없으면 throw(먼저 understand-map scan 필요).
 */
export async function assembleDomainPolicies(projectRoot: string): Promise<DomainPolicyInput[]> {
  const candidates = readCandidates(projectRoot)
  if (!candidates) {
    throw new Error('candidates.json 없음 — 먼저 understand-map scan 을 실행하세요(.spec/map/candidates.json).')
  }
  const domainGraph = readDomainGraph(projectRoot)

  // flow 진입점 파일을 도메인 key 로 인덱싱 — 액션빈(진입점)은 보통 후보 멤버에 안 잡히지만
  // 업무 분기가 가장 밀집한 곳이라, 분기 스캔 대상에 합친다(흐름과 분기 커버리지 일치).
  const entryFilesByKey = new Map<string, Set<string>>()
  if (domainGraph) {
    const nodeById = new Map(domainGraph.nodes.map((n) => [n.id, n]))
    for (const e of domainGraph.edges) {
      if (e.type !== 'contains_flow' || !e.source.startsWith('domain:')) continue
      const flow = nodeById.get(e.target)
      if (!flow || typeof flow.filePath !== 'string') continue
      const key = e.source.slice('domain:'.length)
      const set = entryFilesByKey.get(key) ?? new Set<string>()
      set.add(flow.filePath)
      entryFilesByKey.set(key, set)
    }
  }

  const dbSchema = readDbSchema(projectRoot)
  const branchesByKey = new Map<string, BranchSignal[]>()
  const termsByKey = new Map<string, Term[]>()
  const statusByKey = new Map<string, StatusCode[]>()
  for (const c of candidates.candidates) {
    // 후보 멤버 .java ∪ flow 진입점 .java (둘 다 운영 소스만). 도메인 경계 한정.
    const files = new Set(c.files.filter((f) => isPolicyJava(f.relPath)).map((f) => f.relPath))
    for (const ef of entryFilesByKey.get(c.key) ?? []) {
      if (isPolicyJava(ef)) files.add(ef)
    }
    // 파일 1회 읽어 분기 추출 + 텍스트 누적(테이블 참조 scoping 용).
    const signals: BranchSignal[] = []
    let domainText = ''
    for (const rel of [...files].sort(cmp)) {
      let src: string
      try {
        src = readFileSync(join(projectRoot, rel), 'utf8')
      } catch {
        continue
      }
      domainText += `\n${src}`
      signals.push(...(await extractBranches(rel, src)))
    }
    signals.sort(
      (a, b) => cmp(a.relPath, b.relPath) || a.line - b.line || cmp(a.kind, b.kind) || cmp(a.condition, b.condition),
    )
    branchesByKey.set(c.key, signals)
    termsByKey.set(c.key, deriveTerms(dbSchema, domainText))
    statusByKey.set(c.key, deriveStatusCodes(dbSchema, domainText))
  }
  return buildDomainPolicyInputs(candidates, domainGraph, branchesByKey, termsByKey, statusByKey)
}
