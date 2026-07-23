import { describe, expect, it } from 'vitest'
import { buildCrudMatrix } from './crud-matrix.js'
import type { DocInput } from './shared.js'
import type { UaGraphNode, UaGraphEdge } from '../../domain-map/types.js'
import type { RawSqlModel } from '../raw-sql.js'

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
