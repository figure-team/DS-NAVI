import { describe, expect, it } from 'vitest'
import { buildCrudMatrix, jpaCrud } from './crud-matrix.js'
import type { DocInput } from './shared.js'
import type { UaGraphNode, UaGraphEdge, MethodCallGraph } from '../../domain-map/types.js'
import type { RawSqlModel } from '../raw-sql.js'
import type { JpaModel, JpaRepository } from '../../jpa/types.js'

// ── 픽스처 헬퍼 ─────────────────────────────────────────────────────────────

function flow(id: string, name: string): UaGraphNode {
  return { id, type: 'flow', name, summary: '', tags: [], complexity: 'simple' }
}
function step(id: string, filePath: string, layer: UaGraphNode['layer'] = 'service'): UaGraphNode {
  return { id, type: 'step', name: id, filePath, summary: '', tags: [], complexity: 'simple', layer }
}
function flowStep(source: string, target: string): UaGraphEdge {
  return { id: `${source}->${target}`, type: 'flow_step', source, target, direction: 'forward' }
}
/** entryPoint(Class#method)+filePath 를 단 흐름 — JPA/MyBatis 정밀 귀속(핸들러 도달) 픽스처. */
function jpaFlow(id: string, name: string, filePath: string, entryPoint: string): UaGraphNode {
  return { id, type: 'flow', name, filePath, summary: '', tags: [], complexity: 'simple', domainMeta: { entryPoint } }
}

describe('buildCrudMatrix — raw SQL 폴백(비-MyBatis)', () => {
  const rawSqlModel: RawSqlModel = {
    byFile: {
      'persistence/ContractStore.kt': [
        { table: 'contract', crud: 'C', line: 10 },
        { table: 'contract', crud: 'R', line: 20 },
      ],
      'persistence/LedgerStore.kt': [{ table: 'correction_ledger', crud: 'U', line: 5 }],
    },
  }

  const input: DocInput = {
    nodes: [
      flow('flow:register', '계약 등록'),
      flow('flow:correct', '정산 정정'),
      step('step:cstore', 'persistence/ContractStore.kt'),
      step('step:lstore', 'persistence/LedgerStore.kt'),
    ],
    edges: [
      flowStep('flow:register', 'step:cstore'),
      flowStep('flow:correct', 'step:lstore'),
    ],
    mybatisModel: null,
    rawSqlModel,
  }

  it('MyBatis 부재 + rawSqlModel 있으면 기능×테이블 축을 세운다(layer 무관 filePath 매칭)', () => {
    const doc = buildCrudMatrix(input)
    const sec = doc.sections.find((s) => s.table)!
    expect(sec.table!.columns).toEqual(['기능', 'contract', 'correction_ledger'])
    // 계약 등록: contract 에 C+R → 'CR'; correction_ledger 없음.
    const register = sec.table!.rows.find((r) => r.cells[0] === '계약 등록')!
    expect(register.cells).toEqual(['계약 등록', 'CR', ''])
    expect(register.confidence).toBe('CONFIRMED')
    expect(register.evidence).toEqual([
      { file: 'persistence/ContractStore.kt', line: 10 },
      { file: 'persistence/ContractStore.kt', line: 20 },
    ])
    // 정산 정정: correction_ledger 에 U.
    const correct = sec.table!.rows.find((r) => r.cells[0] === '정산 정정')!
    expect(correct.cells).toEqual(['정산 정정', '', 'U'])
  })

  it('영속화 파일이 service 로 오분류돼도(layer!=dao) 매칭된다', () => {
    // step 의 layer 는 service — dao 폴백(buildByDao)이라면 열이 없었을 것.
    const doc = buildCrudMatrix(input)
    const sec = doc.sections.find((s) => s.table)!
    expect(sec.table!.columns.length).toBeGreaterThan(1)
  })

  it('rawSqlModel 이 비면 buildByDao 폴백(열=기능만, dao step 없음)', () => {
    const doc = buildCrudMatrix({ ...input, rawSqlModel: { byFile: {} } })
    const sec = doc.sections.find((s) => s.table)!
    expect(sec.table!.columns).toEqual(['기능'])
  })

  it('MyBatis 모델이 있으면 rawSql 보다 MyBatis 경로가 우선한다', () => {
    // mappers 비어있지 않으면 buildByTable 경로 — 여기선 매퍼 statements 가 없어 테이블축은
    // 비지만, rawSql 폴백으로 내려가지 않는다(디스패치 우선순위 검증).
    const doc = buildCrudMatrix({
      ...input,
      mybatisModel: { mappers: [{ namespace: 'x.Y', relPath: 'x.xml', statements: [] }] } as never,
    })
    const sec = doc.sections.find((s) => s.table)!
    // MyBatis 경로: rawSql 의 contract/correction_ledger 가 열에 안 뜬다.
    expect(sec.table!.columns).toEqual(['기능'])
  })
})

// ── JPA/Spring Data 경로(DEF-8: 자바 지배 ORM 축 공백 해소) ──────────────────

describe('buildCrudMatrix — JPA/Spring Data 폴백(비-MyBatis·비-raw-SQL)', () => {
  const ownerRepo: JpaRepository = {
    className: 'OwnerRepository',
    relPath: 'owner/OwnerRepository.java',
    line: 20,
    entityType: 'Owner',
    idType: 'Integer',
    baseInterface: 'JpaRepository',
    derivedQueries: [{ method: 'findByLastNameStartingWith', columns: ['last_name'], line: 40, confidence: 'INFERRED' }],
    queries: [],
  }
  const jpaModel: JpaModel = {
    schemaVersion: 1,
    gitCommit: null,
    entities: [
      { className: 'Owner', relPath: 'owner/Owner.java', line: 47, tableName: 'owners', tableExplicit: false, tableConfidence: 'INFERRED', idField: 'id', columns: [], relations: [] },
    ],
    repositories: [ownerRepo],
    unresolved: [],
  }
  // 핸들러가 리포지토리를 직접 호출 — 조회(findBy…) + 등록(save).
  const methodCallGraph = {
    schemaVersion: 1,
    calls: [
      { callerFile: 'owner/OwnerController.java', callerMethod: 'processFind', callLine: 133, calleeMethod: 'findByLastNameStartingWith', calleeFile: 'owner/OwnerRepository.java', calleeClass: 'OwnerRepository' },
      { callerFile: 'owner/OwnerController.java', callerMethod: 'processCreate', callLine: 84, calleeMethod: 'save', calleeFile: 'owner/OwnerRepository.java', calleeClass: 'OwnerRepository' },
    ],
  } as unknown as MethodCallGraph

  const baseInput: DocInput = {
    nodes: [
      jpaFlow('flow:find', '고객 검색', 'owner/OwnerController.java', 'OwnerController#processFind'),
      jpaFlow('flow:create', '고객 등록', 'owner/OwnerController.java', 'OwnerController#processCreate'),
    ],
    edges: [],
    mybatisModel: null,
    rawSqlModel: { byFile: {} },
    jpaModel,
    methodCallGraph,
  }

  it('열=테이블(리포 basename 아님) + 도달 리포 호출을 CONFIRMED(호출부 근거)로 채운다', () => {
    const doc = buildCrudMatrix(baseInput)
    const sec = doc.sections.find((s) => s.table)!
    // ★핵심: 열은 테이블명 owners — 리포 basename OwnerRepository 가 아니다(버그 재발 가드).
    expect(sec.table!.columns).toEqual(['기능', 'owners'])
    const find = sec.table!.rows.find((r) => r.cells[0] === '고객 검색')!
    expect(find.cells).toEqual(['고객 검색', 'R'])
    expect(find.confidence).toBe('CONFIRMED')
    expect(find.evidence).toEqual([{ file: 'owner/OwnerController.java', line: 133 }])
  })

  it('save 는 업서트라 C+U 로 판정한다(crudOf 의 save→C 오표기 방지)', () => {
    const doc = buildCrudMatrix(baseInput)
    const sec = doc.sections.find((s) => s.table)!
    const create = sec.table!.rows.find((r) => r.cells[0] === '고객 등록')!
    expect(create.cells).toEqual(['고객 등록', 'CU'])
    expect(create.confidence).toBe('CONFIRMED')
    expect(create.evidence).toEqual([{ file: 'owner/OwnerController.java', line: 84 }])
  })

  it('methodCallGraph 부재 시 flow_step 폴백 — 리포 step + 들어오는 calls 메서드로 채운다', () => {
    const input: DocInput = {
      nodes: [
        flow('flow:find', '고객 검색'),
        { ...step('step:repo', 'owner/OwnerRepository.java', 'dao'), lineRange: [55, 60] },
      ],
      edges: [
        flowStep('flow:find', 'step:repo'),
        { id: 'c1', type: 'calls', source: 'svc', target: 'step:repo', direction: 'forward', description: 'findByLastNameStartingWith' },
      ],
      mybatisModel: null,
      rawSqlModel: { byFile: {} },
      jpaModel,
      methodCallGraph: null,
    }
    const doc = buildCrudMatrix(input)
    const sec = doc.sections.find((s) => s.table)!
    expect(sec.table!.columns).toEqual(['기능', 'owners'])
    const find = sec.table!.rows.find((r) => r.cells[0] === '고객 검색')!
    expect(find.cells).toEqual(['고객 검색', 'R'])
    expect(find.confidence).toBe('CONFIRMED')
    expect(find.evidence).toEqual([{ file: 'owner/OwnerRepository.java', line: 55 }])
  })

  it('디스패치 우선순위: rawSqlModel 이 비어있지 않으면 JPA 보다 raw-SQL 이 이긴다', () => {
    const doc = buildCrudMatrix({
      ...baseInput,
      rawSqlModel: { byFile: { 'p/Store.java': [{ table: 'audit_log', crud: 'C', line: 3 }] } },
      nodes: [...baseInput.nodes, step('step:store', 'p/Store.java')],
      edges: [flowStep('flow:find', 'step:store')],
    })
    const sec = doc.sections.find((s) => s.table)!
    // raw-SQL 축(audit_log)이 뜨고, JPA 의 owners 는 안 뜬다.
    expect(sec.table!.columns).toContain('audit_log')
    expect(sec.table!.columns).not.toContain('owners')
  })

  it('리포는 있으나 entityType 미해소면 열=기능만(퇴화 정직 — 리포명을 테이블로 위장하지 않음)', () => {
    const unresolved: JpaModel = {
      ...jpaModel,
      entities: [],
      repositories: [{ ...ownerRepo, entityType: null }],
    }
    const doc = buildCrudMatrix({ ...baseInput, jpaModel: unresolved })
    const sec = doc.sections.find((s) => s.table)!
    expect(sec.table!.columns).toEqual(['기능'])
  })
})

describe('jpaCrud — 공유 CRUD 판정(build-rtm 데이터 축과 단일 소스)', () => {
  const repo = (over: Partial<JpaRepository>): JpaRepository => ({
    className: 'R', relPath: 'R.java', line: 1, entityType: 'E', idType: 'Long', baseInterface: 'JpaRepository', derivedQueries: [], queries: [], ...over,
  })
  it('@Query 선두 동사 우선', () => {
    expect(jpaCrud('bulkDelete', repo({ queries: [{ method: 'bulkDelete', native: false, query: 'delete from E', line: 5, confidence: 'CONFIRMED' }] }))).toBe('D')
  })
  it('파생쿼리 findByX 는 R', () => {
    expect(jpaCrud('findByName', repo({ derivedQueries: [{ method: 'findByName', columns: ['name'], line: 5, confidence: 'INFERRED' }] }))).toBe('R')
  })
  it('save/persist 는 업서트 CU', () => {
    expect(jpaCrud('save', repo({}))).toBe('CU')
    expect(jpaCrud('persist', repo({}))).toBe('CU')
  })
  it('상속 delete/count 는 이름 규칙(crudOf)', () => {
    expect(jpaCrud('deleteById', repo({}))).toBe('D')
    expect(jpaCrud('count', repo({}))).toBe('R')
  })
})
