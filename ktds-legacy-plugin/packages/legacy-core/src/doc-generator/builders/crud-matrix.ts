/**
 * 07_crud-matrix.md — CRUD 매트릭스 빌더(D2).
 *
 * 행=기능(flow), 열=기능 + 접근 DAO(매퍼) 파일(동적 생성, matrix 섹션). 셀=C/R/U/D.
 * flow→flow_step→step(layer=dao) 로 접근 DAO 를 도출(접근 자체는 [확정] 사실)하고,
 * 그 DAO 로 들어가는 calls 의 메서드명에서 C/R/U/D 를 추론한다([추정] — 이름 규칙 휴리스틱).
 * 메서드 단서가 없으면 접근표시 '○'. 테이블 단위(기능×테이블)는 MyBatis Mapper XML SQL
 * 테이블 추출 보강 후 확장(현재 그래프에 테이블 노드 없음) — 정직성.
 *
 * 결정론: 열=DAO basename asc, 행=flow id asc. 행 신뢰도=INFERRED(CRUD 추론).
 */
import type { GeneratedDoc, TableRow } from '../types.js'
import { type DocInput, nodesOfType } from './shared.js'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 메서드명 → CRUD 글자(접두 규칙). 미상이면 null. */
function crudOf(method: string): 'C' | 'R' | 'U' | 'D' | null {
  const m = method.toLowerCase()
  if (/^(insert|save|add|create|regist|new|persist)/.test(m)) return 'C'
  if (/^(update|modify|edit|set|merge|change)/.test(m)) return 'U'
  if (/^(delete|remove|drop|destroy|purge)/.test(m)) return 'D'
  if (/^(select|get|find|list|search|query|count|read|load|exist|fetch|view|retrieve)/.test(m)) return 'R'
  return null
}

/** calls 엣지 description("caller → callee")에서 callee 쪽 식별자들. */
function calleeMethods(desc: string | undefined): string[] {
  if (!desc) return []
  const seg = desc.includes('→') ? desc.slice(desc.lastIndexOf('→') + 1) : desc
  return seg.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
}

/** 파일 경로 → basename(확장자 제거) — DAO 열 라벨. */
function baseName(filePath: string): string {
  return (filePath.split('/').pop() ?? filePath).replace(/\.[^.]+$/, '')
}

/** CRUD 글자 집합 → 'CRUD' 정준 순서 문자열. 비었으면 접근표시. */
function crudCell(letters: Set<string>): string {
  if (letters.size === 0) return '○'
  return ['C', 'R', 'U', 'D'].filter((l) => letters.has(l)).join('')
}

export function buildCrudMatrix(input: DocInput): GeneratedDoc {
  const stepById = new Map(input.nodes.filter((n) => n.type === 'step').map((n) => [n.id, n]))
  // flow id → (dao 파일 → CRUD 글자 집합).
  const flowDao = new Map<string, Map<string, Set<string>>>()
  // dao 스텝 id → 그 스텝으로 들어오는 calls 의 callee 메서드들.
  const incomingMethods = new Map<string, string[]>()
  for (const e of input.edges) {
    if (e.type !== 'calls') continue
    const prev = incomingMethods.get(e.target) ?? []
    incomingMethods.set(e.target, [...prev, ...calleeMethods(e.description)])
  }

  const flows = nodesOfType(input.nodes, 'flow')
  const daoFilesSet = new Set<string>()
  for (const flow of flows) {
    const perDao = new Map<string, Set<string>>()
    for (const e of input.edges) {
      if (e.type !== 'flow_step' || e.source !== flow.id) continue
      const step = stepById.get(e.target)
      if (!step || step.layer !== 'dao' || typeof step.filePath !== 'string') continue
      const dao = baseName(step.filePath)
      daoFilesSet.add(dao)
      const letters = perDao.get(dao) ?? new Set<string>()
      for (const meth of incomingMethods.get(step.id) ?? []) {
        const c = crudOf(meth)
        if (c) letters.add(c)
      }
      perDao.set(dao, letters)
    }
    flowDao.set(flow.id, perDao)
  }

  const daoCols = [...daoFilesSet].sort(cmp)
  const columns = ['기능', ...daoCols]
  const rows: TableRow[] = flows.map((flow): TableRow => {
    const perDao = flowDao.get(flow.id)!
    const cells = [
      flow.name.length > 0 ? flow.name : flow.id,
      ...daoCols.map((dao) => (perDao.has(dao) ? crudCell(perDao.get(dao)!) : '')),
    ]
    return {
      cells,
      confidence: 'INFERRED',
      evidence: typeof flow.filePath === 'string'
        ? [{ file: flow.filePath, line: flow.lineRange ? flow.lineRange[0] : null }]
        : [],
    }
  })

  return {
    docId: '07_crud-matrix',
    title: 'CRUD 매트릭스',
    methodology: 'as-built',
    sections: [{ heading: 'CRUD 매트릭스', key: 'crud-matrix', claims: [], table: { columns, rows } }],
  }
}
