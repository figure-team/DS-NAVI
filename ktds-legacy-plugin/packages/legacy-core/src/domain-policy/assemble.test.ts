import { describe, it, expect } from 'vitest'
import { buildDomainPolicyInputs, deriveStatusCodes, deriveTerms, splitByTopic, type DomainGraphLite } from './assemble.js'
import type { CandidatesReport } from '../domain-map/types.js'
import type { DbSchemaModel } from '../db-schema/types.js'
import type { BranchSignal, DomainPolicyInput } from './types.js'

const candidates: CandidatesReport = {
  schemaVersion: 1,
  gitCommit: null,
  directoryDegenerate: null,
  candidates: [
    {
      key: 'order',
      roots: [],
      entryCount: 1,
      files: [
        { relPath: 'web/OrderActionBean.java', via: 'reachability' },
        { relPath: 'web/order-mapper.xml', via: 'directory' },
      ],
    },
    { key: 'account', roots: [], entryCount: 1, files: [{ relPath: 'web/AccountActionBean.java', via: 'reachability' }] },
  ],
  common: [],
  ambiguous: [],
  unresolved: [],
}

const domainGraph: DomainGraphLite = {
  nodes: [
    { id: 'domain:order', type: 'domain', name: '주문', summary: '', tags: [], complexity: 'simple' },
    { id: 'flow:checkout', type: 'flow', name: '체크아웃', filePath: 'web/OrderActionBean.java', lineRange: [142, 160], summary: '', tags: [], complexity: 'simple' },
  ],
  edges: [{ source: 'domain:order', target: 'flow:checkout', type: 'contains_flow' }],
}

const branchesByKey = new Map<string, BranchSignal[]>([
  ['order', [{ relPath: 'web/OrderActionBean.java', line: 125, className: 'OrderActionBean', methodName: 'newOrderForm', kind: 'if', condition: '!auth', then: 'return "deny";' }]],
])

describe('도메인 정책 입력 조립 (PD3)', () => {
  it('candidates → 도메인별 입력(key 정렬, .java 만 클래스, xml 제외)', () => {
    const inputs = buildDomainPolicyInputs(candidates, domainGraph, branchesByKey)
    expect(inputs.map((i) => i.key)).toEqual(['account', 'order']) // key 정렬
    const order = inputs.find((i) => i.key === 'order')!
    expect(order.name).toBe('주문') // domain-graph 표시명
    expect(order.classes).toEqual([{ className: 'OrderActionBean', relPath: 'web/OrderActionBean.java' }])
    expect(order.flows).toEqual([{ name: '체크아웃', entry: { file: 'web/OrderActionBean.java', line: 142 } }])
    expect(order.branches.length).toBe(1)
  })

  it('domainGraph 없으면 흐름 빈배열·표시명=key (우아한 degrade)', () => {
    const inputs = buildDomainPolicyInputs(candidates, null, new Map())
    const order = inputs.find((i) => i.key === 'order')!
    expect(order.name).toBe('order')
    expect(order.flows).toEqual([])
    expect(order.branches).toEqual([])
    expect(order.terms).toEqual([])
    expect(order.statusCodes).toEqual([])
  })
})

const DB_SCHEMA: DbSchemaModel = {
  schemaVersion: 1,
  gitCommit: null,
  tier: 'ddl+data',
  sqlFileCount: 1,
  liveDbSignals: [],
  unresolved: [],
  tables: [
    {
      name: 'CATEGORY',
      relPath: 'db/data.sql',
      line: 1,
      comment: '상품 분류',
      columns: [
        { name: 'catid', type: 'varchar', nullable: false, primaryKey: true, unique: false, default: null, comment: '분류 코드', line: 2 },
        { name: 'name', type: 'varchar', nullable: true, primaryKey: false, unique: false, default: null, comment: null, line: 3 },
        { name: 'descn', type: 'varchar', nullable: true, primaryKey: false, unique: false, default: null, comment: null, line: 4 },
      ],
      primaryKey: ['catid'],
      uniques: [],
      foreignKeys: [],
      checks: [],
      indexes: [],
      isCodeTable: true,
      rows: [
        { values: { catid: 'FISH', name: 'Fish', descn: '<font size="5">물고기</font>' }, line: 10 },
        { values: { catid: 'DOGS', name: 'Dogs', descn: '개' }, line: 11 },
        { values: { catid: 'FISH', name: 'Fish', descn: '<font size="5">물고기</font>' }, line: 99 }, // 다른 .sql 중복 INSERT
      ],
      rowCount: 3,
    },
  ],
}

describe('§3 상태값 / §2 용어 자동 채움 (db-schema)', () => {
  it('참조되는 코드 테이블의 dataload 행 → 상태값(중복 제거·HTML 정리·행 근거)', () => {
    const codes = deriveStatusCodes(DB_SCHEMA, 'catalogService.getProductListByCategory(id)')
    expect(codes.map((c) => c.code)).toEqual(['FISH', 'DOGS']) // 중복 FISH 제거
    expect(codes[0]).toEqual({ group: 'CATEGORY', code: 'FISH', name: 'Fish', desc: '물고기', evidence: { file: 'db/data.sql', line: 10 } }) // HTML 제거
  })

  it('참조 안 되는 테이블은 제외(내용 참조 scoping)', () => {
    expect(deriveStatusCodes(DB_SCHEMA, 'orderService.insertOrder(o)')).toEqual([])
  })

  it('DB 주석 → 용어(테이블/컬럼 주석, 근거 동반)', () => {
    const terms = deriveTerms(DB_SCHEMA, 'getCategory()')
    expect(terms).toContainEqual({ term: 'CATEGORY', definition: '상품 분류', note: 'DB 테이블 주석', evidence: { file: 'db/data.sql', line: 1 } })
    expect(terms).toContainEqual({ term: 'CATEGORY.catid', definition: '분류 코드', note: 'DB 컬럼 주석', evidence: { file: 'db/data.sql', line: 2 } })
  })

  it('db-schema 없으면 빈 배열', () => {
    expect(deriveStatusCodes(null, 'x')).toEqual([])
    expect(deriveTerms(null, 'x')).toEqual([])
  })
})

describe('정책 토픽 자동 분리 (splitByTopic)', () => {
  const br = (line: number, condition: string, then = ''): BranchSignal => ({
    relPath: 'web/OrderBean.java', line, className: 'OrderBean', methodName: 'm', kind: 'if', condition, then,
  })
  const base: DomainPolicyInput = {
    key: 'order',
    name: '주문',
    classes: [],
    flows: [],
    statusCodes: [
      { group: 'SHIP_TYPE', code: '01', name: '무료', desc: '', evidence: null },
      { group: 'SHIP_TYPE', code: '02', name: '유료', desc: '', evidence: null },
    ],
    terms: [],
    branches: [
      br(10, 'shipType == SHIP_TYPE_FREE'), // 그룹명 SHIP_TYPE 참조 → 토픽
      br(20, 'cart.isEmpty()'), // 미참조 → 잔여
    ],
  }

  it('상태값 그룹 참조 분기 → 그룹 토픽 + 잔여 토픽 분리', () => {
    const out = splitByTopic(base)
    expect(out.map((d) => d.key)).toEqual(['order-ship_type', 'order'])
    const topic = out.find((d) => d.key === 'order-ship_type')!
    expect(topic.name).toBe('주문 — SHIP_TYPE 정책')
    expect(topic.branches.map((b) => b.line)).toEqual([10])
    expect(topic.statusCodes!.every((s) => s.group === 'SHIP_TYPE')).toBe(true)
    const residual = out.find((d) => d.key === 'order')!
    expect(residual.name).toBe('주문 처리 정책')
    expect(residual.branches.map((b) => b.line)).toEqual([20])
  })

  it('그룹 참조 분기 없으면 단일 유지(보수적, 오분리 방지)', () => {
    const out = splitByTopic({ ...base, branches: [br(20, 'cart.isEmpty()')] })
    expect(out.length).toBe(1)
    expect(out[0].key).toBe('order')
  })

  it('상태값 없으면 단일 유지', () => {
    const out = splitByTopic({ ...base, statusCodes: [] })
    expect(out.length).toBe(1)
  })
})
