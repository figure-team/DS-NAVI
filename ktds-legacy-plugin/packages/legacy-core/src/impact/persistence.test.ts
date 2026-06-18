import { describe, it, expect } from 'vitest'
import type { CensusReport, EdgeRecord, Ownership } from '../domain-map/types.js'
import type { KgTableEntry } from './types.js'
import { computePersistenceImpact, PERSISTENCE_NOTE } from './persistence.js'

const edges: EdgeRecord[] = [
  // 매퍼 인터페이스 → 매퍼 XML (mapper-xml). target=XML.
  { source: 'persistence/AccountMapper.java', target: 'resources/AccountMapper.xml', kind: 'mapper-xml', line: 1 },
  { source: 'persistence/ProductMapper.java', target: 'resources/ProductMapper.xml', kind: 'mapper-xml', line: 1 },
  // 비-매퍼 엣지(무시 대상)
  { source: 'A.java', target: 'B.java', kind: 'injection', line: 2 },
]
const census: CensusReport['files'] = [
  { relPath: 'persistence/AccountMapper.java', lang: 'java' },
  { relPath: 'resources/AccountMapper.xml', lang: 'xml' },
  { relPath: 'db/schema.sql', lang: 'sql' },
]
const ownership: Ownership[] = [
  { relPath: 'resources/AccountMapper.xml', status: 'sole', owners: ['web/AccountController.java'] },
]

describe('computePersistenceImpact', () => {
  it('dataImpactSet 에 든 매퍼 XML 만 산출(account O, product X)', () => {
    const dataSet = new Set(['resources/AccountMapper.xml'])
    const out = computePersistenceImpact(dataSet, edges, census, { ownership })
    expect(out.mappers.map((m) => m.relPath)).toEqual(['resources/AccountMapper.xml'])
    expect(out.note).toBe(PERSISTENCE_NOTE)
  })

  it('namespace + owners + citation(간선 source:line) 채움', () => {
    const dataSet = new Set(['resources/AccountMapper.xml'])
    const ns = new Map([['resources/AccountMapper.xml', 'com.petstore.AccountMapper']])
    const lc = new Map([['resources/AccountMapper.xml', 40]])
    const out = computePersistenceImpact(dataSet, edges, census, {
      ownership,
      mapperNamespaceByPath: ns,
      mapperLineCounts: lc,
    })
    const m = out.mappers[0]
    expect(m.namespace).toBe('com.petstore.AccountMapper')
    expect(m.owners).toEqual(['web/AccountController.java'])
    expect(m.citation).toEqual({ filePath: 'persistence/AccountMapper.java', line: 1 })
    // 라인 수 있으면 tableCandidateSlots 생성
    expect(out.tableCandidateSlots).toEqual([
      { mapperRelPath: 'resources/AccountMapper.xml', sqlSlice: { filePath: 'resources/AccountMapper.xml', startLine: 1, endLine: 40 } },
    ])
  })

  it('라인 수 미상 매퍼는 슬롯 생략(가짜 [1,1] 닻 금지)', () => {
    const dataSet = new Set(['resources/AccountMapper.xml'])
    const out = computePersistenceImpact(dataSet, edges, census, { ownership })
    expect(out.tableCandidateSlots).toEqual([])
  })

  it('SQL 파일 = census lang=sql ∩ dataImpactSet', () => {
    const dataSet = new Set(['db/schema.sql'])
    const out = computePersistenceImpact(dataSet, edges, census, {})
    expect(out.sqlFiles).toEqual([{ relPath: 'db/schema.sql', lang: 'sql' }])
  })

  it('kgTableCatalog 는 name 정렬', () => {
    const cat: KgTableEntry[] = [
      { name: 'product', filePath: 'db/schema.sql', startLine: 5, endLine: 9 },
      { name: 'account', filePath: 'db/schema.sql', startLine: 1, endLine: 4 },
    ]
    const out = computePersistenceImpact(new Set(), edges, census, { kgTableCatalog: cat })
    expect(out.kgTableCatalog.map((t) => t.name)).toEqual(['account', 'product'])
  })
})
