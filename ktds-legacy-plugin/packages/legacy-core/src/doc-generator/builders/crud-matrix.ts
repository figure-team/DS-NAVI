/**
 * 07_crud-matrix.md — CRUD 매트릭스 빌더(D2 + Tier B).
 *
 * mybatisModel 이 있으면 **기능×테이블**: flow→dao step(매퍼)→사용 메서드→매퍼 문(statement)
 * 으로 테이블과 CRUD 를 SQL 문 종류에서 직접 판정([확정], 근거=Mapper XML file:line).
 * 없으면 폴백 **기능×DAO(매퍼)**: 메서드명 접두 규칙으로 CRUD 추론([추정]).
 *
 * 결정론: 열=테이블/DAO basename asc, 행=flow id asc.
 */
import type { GeneratedDoc, Evidence, TableRow } from '../types.js'
import { type DocInput, nodesOfType } from './shared.js'
import { namespaceBaseName } from '../../mybatis/index.js'
import type { MyBatisModel } from '../../mybatis/types.js'
import { isRawSqlModelEmpty, type RawSqlModel } from '../raw-sql.js'
import { reachableMethods } from '../../domain-map/method-calls.js'
import type { MethodCallGraph } from '../../domain-map/types.js'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 메서드명 → CRUD 글자(접두 규칙, 폴백 경로). 미상이면 null. */
function crudOf(method: string): string | null {
  const m = method.toLowerCase()
  if (/^(insert|save|add|create|regist|new|persist)/.test(m)) return 'C'
  if (/^(update|modify|edit|set|merge|change)/.test(m)) return 'U'
  if (/^(delete|remove|drop|destroy|purge)/.test(m)) return 'D'
  if (/^(select|get|find|list|search|query|count|read|load|exist|fetch|view|retrieve)/.test(m)) return 'R'
  return null
}

/**
 * calls 엣지 description 의 사용 메서드들. description 은 "m1 → m2 → m3 …" 형태로 caller 가
 * callee(매퍼) 에서 호출 순서대로 쓰는 **메서드 전부**를 나열한다(skeleton P1). 모든 토큰을
 * 추출한다(매퍼 메서드명 = MyBatis statement id).
 */
function calleeMethods(desc: string | undefined): string[] {
  if (!desc) return []
  return desc.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
}

function baseName(filePath: string): string {
  return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '')
}

/** CRUD 글자 집합 → 'CRUD' 정준 순서 문자열. 비었으면 접근표시 '○'. */
function crudCell(letters: Set<string>): string {
  if (letters.size === 0) return '○'
  return ['C', 'R', 'U', 'D'].filter((l) => letters.has(l)).join('')
}

function doc(columns: string[], rows: TableRow[], prose?: string): GeneratedDoc {
  return {
    docId: '07_crud-matrix',
    title: 'CRUD 매트릭스',
    methodology: 'as-built',
    sections: [{ heading: 'CRUD 매트릭스', key: 'crud-matrix', claims: [], ...(prose ? { prose } : {}), table: { columns, rows } }],
  }
}

/** 정밀도 caveat — calls 엣지의 사용 메서드 라벨이 파일 단위라, 같은 매퍼를 쓰는 흐름들은
 *  그 매퍼의 CRUD 전체가 귀속될 수 있다(기능별 핸들러 정밀 추적은 후속). */
const TABLE_PROSE =
  'CRUD 는 기능이 도달하는 매퍼가 해당 테이블에 수행하는 SQL 문 종류(select=R/insert=C/update=U/delete=D)에서 판정한다. ' +
  '사용 메서드 라벨이 파일 단위이므로 같은 매퍼를 공유하는 기능들은 그 매퍼의 CRUD 전체가 귀속될 수 있다(핸들러 단위 정밀 추적은 후속). 근거=Mapper XML file:line.'

/** 정밀 경로 prose — methodCallGraph 로 핸들러가 실제 호출하는 매퍼 메서드만 귀속. */
const PRECISE_PROSE =
  'CRUD 는 기능 핸들러가 실제 호출하는 매퍼 메서드의 SQL 문 종류(select=R/insert=C/update=U/delete=D)에서 판정한다(메서드 호출그래프 정밀 귀속). 근거=Mapper XML file:line.'

/** 흐름 핸들러 메서드 — entryPoint "Class#method" → "method"(없으면 null). */
function bareHandler(entryPoint: unknown): string | null {
  if (typeof entryPoint !== 'string') return null
  return entryPoint.includes('#') ? entryPoint.slice(entryPoint.lastIndexOf('#') + 1) : null
}

/** 기능×테이블 (mybatisModel 기반, SQL 문에서 CRUD 판정 → [확정]). */
function buildByTable(input: DocInput, model: MyBatisModel): GeneratedDoc {
  const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]))
  // 매퍼 basename → {namespace 문맵, relPath}.
  const mapperByBase = new Map<string, { stmts: Map<string, { crud: string; tables: string[]; line: number }>; relPath: string }>()
  for (const m of model.mappers) {
    const stmts = new Map(m.statements.map((s) => [s.id, { crud: s.crud, tables: s.tables, line: s.line }]))
    mapperByBase.set(namespaceBaseName(m.namespace), { stmts, relPath: m.relPath })
  }
  // dao 스텝 id → 사용 메서드(들어오는 calls 의 callee).
  const incoming = new Map<string, string[]>()
  for (const e of input.edges) {
    if (e.type !== 'calls') continue
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)])
  }

  const flows = nodesOfType(input.nodes, 'flow')
  const tablesSet = new Set<string>()
  const perFlow = new Map<string, { byTable: Map<string, Set<string>>; ev: Evidence[] }>()
  for (const flow of flows) {
    const byTable = new Map<string, Set<string>>()
    const ev: Evidence[] = []
    const evSeen = new Set<string>()
    for (const e of input.edges) {
      if (e.type !== 'flow_step' || e.source !== flow.id) continue
      const step = stepById.get(e.target)
      if (!step || step.layer !== 'dao' || typeof step.filePath !== 'string') continue
      const mapper = mapperByBase.get(baseName(step.filePath))
      if (!mapper) continue
      for (const method of incoming.get(step.id) ?? []) {
        const stmt = mapper.stmts.get(method)
        if (!stmt) continue
        for (const t of stmt.tables) {
          tablesSet.add(t)
          const set = byTable.get(t) ?? new Set<string>()
          set.add(stmt.crud)
          byTable.set(t, set)
        }
        const key = `${mapper.relPath}:${stmt.line}`
        if (!evSeen.has(key)) {
          evSeen.add(key)
          ev.push({ file: mapper.relPath, line: stmt.line })
        }
      }
    }
    perFlow.set(flow.id, { byTable, ev })
  }

  const tableCols = [...tablesSet].sort(cmp)
  const columns = ['기능', ...tableCols]
  const rows: TableRow[] = flows.map((flow): TableRow => {
    const { byTable, ev } = perFlow.get(flow.id)!
    const cells = [
      flow.name.length > 0 ? flow.name : flow.id,
      ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)!) : '')),
    ]
    // 테이블 접근(근거 보유)이 있으면 CONFIRMED(SQL 문 근거), 없으면 INFERRED(접근 없음).
    return ev.length > 0
      ? { cells, confidence: 'CONFIRMED', evidence: ev }
      : { cells, confidence: 'INFERRED', evidence: [] }
  })
  return doc(columns, rows, TABLE_PROSE)
}

/** 기능×DAO(매퍼) 폴백 — 메서드명 CRUD 추론([추정]). */
function buildByDao(input: DocInput): GeneratedDoc {
  const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]))
  const incoming = new Map<string, string[]>()
  for (const e of input.edges) {
    if (e.type !== 'calls') continue
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), ...calleeMethods(e.description)])
  }
  const flows = nodesOfType(input.nodes, 'flow')
  const daoSet = new Set<string>()
  const perFlow = new Map<string, Map<string, Set<string>>>()
  for (const flow of flows) {
    const perDao = new Map<string, Set<string>>()
    for (const e of input.edges) {
      if (e.type !== 'flow_step' || e.source !== flow.id) continue
      const step = stepById.get(e.target)
      if (!step || step.layer !== 'dao' || typeof step.filePath !== 'string') continue
      const dao = baseName(step.filePath)
      daoSet.add(dao)
      const letters = perDao.get(dao) ?? new Set<string>()
      for (const meth of incoming.get(step.id) ?? []) {
        const c = crudOf(meth)
        if (c) letters.add(c)
      }
      perDao.set(dao, letters)
    }
    perFlow.set(flow.id, perDao)
  }
  const daoCols = [...daoSet].sort(cmp)
  const columns = ['기능', ...daoCols]
  const rows: TableRow[] = flows.map((flow): TableRow => {
    const perDao = perFlow.get(flow.id)!
    const cells = [
      flow.name.length > 0 ? flow.name : flow.id,
      ...daoCols.map((d) => (perDao.has(d) ? crudCell(perDao.get(d)!) : '')),
    ]
    return {
      cells,
      confidence: 'INFERRED',
      evidence: typeof flow.filePath === 'string' ? [{ file: flow.filePath, line: flow.lineRange ? flow.lineRange[0] : null }] : [],
    }
  })
  return doc(columns, rows)
}

/** 기능×테이블 (정밀) — 흐름 핸들러에서 methodCallGraph 로 실제 도달하는 매퍼 메서드만 귀속. */
function buildByTablePrecise(input: DocInput, model: MyBatisModel, graph: MethodCallGraph): GeneratedDoc {
  const mapperByBase = new Map<string, { stmts: Map<string, { crud: string; tables: string[]; line: number }>; relPath: string }>()
  for (const m of model.mappers) {
    mapperByBase.set(namespaceBaseName(m.namespace), {
      stmts: new Map(m.statements.map((s) => [s.id, { crud: s.crud, tables: s.tables, line: s.line }])),
      relPath: m.relPath,
    })
  }
  const flows = nodesOfType(input.nodes, 'flow')
  const tablesSet = new Set<string>()
  const perFlow = new Map<string, { byTable: Map<string, Set<string>>; ev: Evidence[] }>()
  for (const flow of flows) {
    const byTable = new Map<string, Set<string>>()
    const ev: Evidence[] = []
    const evSeen = new Set<string>()
    const handler = bareHandler((flow.domainMeta as Record<string, unknown> | undefined)?.entryPoint)
    if (handler && typeof flow.filePath === 'string') {
      for (const { file, method } of reachableMethods(graph, flow.filePath, handler)) {
        const mapper = mapperByBase.get(baseName(file))
        if (!mapper) continue
        const stmt = mapper.stmts.get(method)
        if (!stmt) continue
        for (const t of stmt.tables) {
          tablesSet.add(t)
          const set = byTable.get(t) ?? new Set<string>()
          set.add(stmt.crud)
          byTable.set(t, set)
        }
        const key = `${mapper.relPath}:${stmt.line}`
        if (!evSeen.has(key)) {
          evSeen.add(key)
          ev.push({ file: mapper.relPath, line: stmt.line })
        }
      }
    }
    perFlow.set(flow.id, { byTable, ev })
  }
  const tableCols = [...tablesSet].sort(cmp)
  const columns = ['기능', ...tableCols]
  const rows: TableRow[] = flows.map((flow): TableRow => {
    const { byTable, ev } = perFlow.get(flow.id)!
    const cells = [
      flow.name.length > 0 ? flow.name : flow.id,
      ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)!) : '')),
    ]
    return ev.length > 0
      ? { cells, confidence: 'CONFIRMED', evidence: ev }
      : { cells, confidence: 'INFERRED', evidence: [] }
  })
  return doc(columns, rows, PRECISE_PROSE)
}

/** 코드 raw SQL prose — 비-MyBatis 영속화의 SQL 문자열에서 CRUD 판정. */
const RAW_SQL_PROSE =
  'MyBatis 매퍼가 없어(손수 짠 JDBC/영속화) 코드 내 SQL 문자열에서 테이블·CRUD 를 판정한다 ' +
  '(select/join=R, insert=C, update=U, delete=D). 테이블은 DB 스키마(db-schema)에 실재하는 것만 ' +
  '축으로 세운다. 귀속은 흐름이 도달하는 영속화 파일 단위다(핸들러 단위 정밀 추적은 후속). 근거=소스 file:line.'

/**
 * 기능×테이블 (raw SQL 폴백) — MyBatis·JPA 신호가 없는 손수 짠 영속화 프로젝트용.
 * 흐름이 도달하는 step 의 파일 SQL(rawSqlModel)에서 테이블×CRUD 를 귀속한다.
 * layer 에 의존하지 않는다(영속화 파일이 service 로 오분류돼도 filePath 로 매칭).
 */
function buildByRawSql(input: DocInput, model: RawSqlModel): GeneratedDoc {
  const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]))
  const flows = nodesOfType(input.nodes, 'flow')
  const tablesSet = new Set<string>()
  const perFlow = new Map<string, { byTable: Map<string, Set<string>>; ev: Evidence[] }>()
  for (const flow of flows) {
    const byTable = new Map<string, Set<string>>()
    const ev: Evidence[] = []
    const evSeen = new Set<string>()
    for (const e of input.edges) {
      if (e.type !== 'flow_step' || e.source !== flow.id) continue
      const step = stepById.get(e.target)
      if (!step || typeof step.filePath !== 'string') continue
      const accesses = model.byFile[step.filePath]
      if (!accesses) continue
      for (const a of accesses) {
        tablesSet.add(a.table)
        const set = byTable.get(a.table) ?? new Set<string>()
        set.add(a.crud)
        byTable.set(a.table, set)
        const key = `${step.filePath}:${a.line}`
        if (!evSeen.has(key)) {
          evSeen.add(key)
          ev.push({ file: step.filePath, line: a.line })
        }
      }
    }
    perFlow.set(flow.id, { byTable, ev })
  }
  const tableCols = [...tablesSet].sort(cmp)
  const columns = ['기능', ...tableCols]
  const rows: TableRow[] = flows.map((flow): TableRow => {
    const { byTable, ev } = perFlow.get(flow.id)!
    const cells = [
      flow.name.length > 0 ? flow.name : flow.id,
      ...tableCols.map((t) => (byTable.has(t) ? crudCell(byTable.get(t)!) : '')),
    ]
    return ev.length > 0
      ? { cells, confidence: 'CONFIRMED', evidence: ev }
      : { cells, confidence: 'INFERRED', evidence: [] }
  })
  return doc(columns, rows, RAW_SQL_PROSE)
}

export function buildCrudMatrix(input: DocInput): GeneratedDoc {
  const model = input.mybatisModel
  if (model && model.mappers.length > 0) {
    // 정밀(methodCallGraph): 흐름 핸들러가 실제 호출하는 매퍼 메서드만 귀속(과다귀속 해소).
    if (input.methodCallGraph) return buildByTablePrecise(input, model, input.methodCallGraph)
    // 폴백: 파일 단위 사용메서드 라벨(과다귀속 가능, caveat).
    return buildByTable(input, model)
  }
  // 비-MyBatis: 코드 raw SQL 로 기능×테이블(db-schema 필터). 신호 없으면 기능×DAO 폴백.
  if (!isRawSqlModelEmpty(input.rawSqlModel)) return buildByRawSql(input, input.rawSqlModel!)
  return buildByDao(input)
}
