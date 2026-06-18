import { describe, it, expect } from 'vitest'
import type {
  CensusReport,
  ConfirmedPlan,
  EdgeRecord,
  RouteEntry,
  SkeletonReport,
  SlicesReport,
} from '../domain-map/types.js'
import { stableJson } from '../domain-map/persist.js'
import { ImpactOptionsSchema } from './types.js'
import { buildImpactReport, buildClaimItems, type ImpactInputs, type ImpactExtras } from './engine.js'

const SEED = 'service/impl/AccountServiceImpl.java'

function route(id: string, filePath: string, line: number): RouteEntry {
  return {
    routeId: id,
    method: 'GET',
    path: '/x',
    rawPath: '/x',
    kind: 'api',
    framework: 'spring',
    filePath,
    line,
    handler: 'login',
    notes: [],
  }
}

function makeInputs(): ImpactInputs {
  const files = [
    'web/AccountController.java',
    'service/AccountService.java',
    'service/impl/AccountServiceImpl.java',
    'persistence/AccountMapper.java',
    'resources/AccountMapper.xml',
    'domain/Account.java',
    'common/StringUtils.java',
    'hub/H1.java',
    'hub/H2.java',
    'hub/H3.java',
    'misc/Importer.java',
  ].map((relPath) => ({ relPath, lang: relPath.endsWith('.xml') ? 'xml' : 'java' }))

  const census: CensusReport = { schemaVersion: 1, gitCommit: 'c0ffee', fileCount: files.length, files }

  const edges: EdgeRecord[] = [
    { source: 'web/AccountController.java', target: 'service/AccountService.java', kind: 'injection', line: 14 },
    { source: 'service/AccountService.java', target: SEED, kind: 'impl', line: 1 },
    { source: SEED, target: 'service/AccountService.java', kind: 'implements', line: 8 },
    { source: SEED, target: 'persistence/AccountMapper.java', kind: 'field-type', line: 11 },
    { source: SEED, target: 'domain/Account.java', kind: 'field-type', line: 12 },
    { source: SEED, target: 'common/StringUtils.java', kind: 'field-type', line: 13 },
    { source: 'persistence/AccountMapper.java', target: 'resources/AccountMapper.xml', kind: 'mapper-xml', line: 1 },
    // StringUtils hub: 3 추가 의존 → fanIn=4
    { source: 'hub/H1.java', target: 'common/StringUtils.java', kind: 'field-type', line: 2 },
    { source: 'hub/H2.java', target: 'common/StringUtils.java', kind: 'field-type', line: 2 },
    { source: 'hub/H3.java', target: 'common/StringUtils.java', kind: 'field-type', line: 2 },
    // import-only(약신호): Importer 가 seed 에 import 의존 — 강신호 필터엔 안 보임
    { source: 'misc/Importer.java', target: SEED, kind: 'import', line: 3 },
  ]

  const ownership: SlicesReport['ownership'] = [
    { relPath: SEED, status: 'sole', owners: ['web/AccountController.java'] },
    { relPath: 'resources/AccountMapper.xml', status: 'sole', owners: ['web/AccountController.java'] },
  ]
  const slices: SlicesReport = {
    schemaVersion: 1,
    gitCommit: 'c0ffee',
    depthCap: 12,
    slices: [],
    ownership,
  }

  const routes = [route('route:GET:/account/login', 'web/AccountController.java', 14)]

  const skeleton: SkeletonReport = {
    schemaVersion: 1,
    gitCommit: 'c0ffee',
    stepCap: 8,
    nodes: [],
    edges: [
      { source: 'domain:account', target: 'flow:GET:/account/login', type: 'contains_flow' },
      { source: 'flow:GET:/account/login', target: 'step:account:1', type: 'flow_step' },
    ],
    stepSources: [{ stepId: 'step:account:1', relPath: SEED, line: 10, className: 'AccountServiceImpl' }],
    truncatedSteps: [],
  }

  const confirmed: ConfirmedPlan = {
    schemaVersion: 1,
    gitCommit: 'c0ffee',
    decidedBy: 'test',
    domains: [{ key: 'account', name: '계정', roots: ['web/AccountController.java'], aliasKeys: [] }],
    excludedKeys: [],
  }

  return {
    census,
    routes: { schemaVersion: 1, gitCommit: 'c0ffee', contextPath: null, routes, batchEntries: [] },
    edges: { schemaVersion: 1, gitCommit: 'c0ffee', edges, unresolved: [] },
    slices,
    skeleton,
    confirmed,
    gitCommit: 'c0ffee',
  }
}

const extras: ImpactExtras = {
  kgTableCatalog: [{ name: 'account', filePath: 'db/schema.sql', startLine: 1, endLine: 4 }],
  mapperNamespaceByPath: new Map([['resources/AccountMapper.xml', 'com.petstore.AccountMapper']]),
  mapperLineCounts: new Map([['resources/AccountMapper.xml', 30]]),
}

const opts = ImpactOptionsSchema.parse({ fanInThreshold: 2 })
const seeds = [{ relPath: SEED, origin: 'path' as const, confidence: 'CONFIRMED' as const }]

describe('buildImpactReport — 통합 조립', () => {
  const result = buildImpactReport(makeInputs(), seeds, opts, extras)

  it('upstream(역방향): AccountService + AccountController', () => {
    expect(result.upstream.files.map((f) => f.relPath)).toEqual([
      'service/AccountService.java',
      'web/AccountController.java',
    ])
  })

  it('downstream(정방향): 협력자 — AccountService(seed가 implements)도 포함', () => {
    // seed --implements--> AccountService 이므로 인터페이스는 상류이자 하류(협력자)다.
    expect(result.downstream.files.map((f) => f.relPath)).toEqual([
      'common/StringUtils.java',
      'domain/Account.java',
      'persistence/AccountMapper.java',
      'resources/AccountMapper.xml',
      'service/AccountService.java',
    ])
  })

  it('API: 로그인 라우트 both → CONFIRMED_AI', () => {
    expect(result.upstream.api).toHaveLength(1)
    expect(result.upstream.api[0].via).toBe('both')
    expect(result.upstream.api[0].confidence).toBe('CONFIRMED_AI')
  })

  it('persistence: AccountMapper.xml 매퍼 + namespace + 슬롯', () => {
    expect(result.upstream.persistence.mappers.map((m) => m.relPath)).toEqual(['resources/AccountMapper.xml'])
    expect(result.upstream.persistence.mappers[0].namespace).toBe('com.petstore.AccountMapper')
    expect(result.upstream.persistence.tableCandidateSlots).toHaveLength(1)
    expect(result.upstream.persistence.kgTableCatalog.map((t) => t.name)).toEqual(['account'])
  })

  it('flow/domain: 계정 흐름 INFERRED', () => {
    expect(result.upstream.flows.map((f) => f.flowId)).toContain('flow:GET:/account/login')
    expect(result.upstream.domains.map((d) => d.key)).toEqual(['account'])
    expect(result.upstream.domains[0].confidence).toBe('INFERRED')
  })

  it('overEdges: StringUtils hub(fanIn 4>2) + importOnlyCount>0', () => {
    expect(result.overEdges.hubNodes.map((h) => h.relPath)).toContain('common/StringUtils.java')
    expect(result.overEdges.importOnlyCount).toBeGreaterThan(0) // misc/Importer.java
  })

  it('needsReview: hub 경유 항목 포함, dedup+정렬', () => {
    expect(result.needsReview.some((n) => n.ref === 'common/StringUtils.java')).toBe(true)
    const refs = result.needsReview.map((n) => `${n.ref} ${n.reason}`)
    expect(refs).toEqual([...refs].sort())
    expect(new Set(refs).size).toBe(refs.length) // dedup
  })

  it('결정론: 동일 입력 → byte-identical', () => {
    const a = buildImpactReport(makeInputs(), seeds, opts, extras)
    const b = buildImpactReport(makeInputs(), seeds, opts, extras)
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it('citation 사본 — buildClaimItems 가 result.citation 을 변이하지 않음', () => {
    const items = buildClaimItems(result)
    const up = items.find((i) => i.kind === 'upstream' && i.citations.length > 0)
    expect(up).toBeDefined()
    // 사본이므로 result 의 citation 객체와 다른 참조여야 한다
    const resultCite = result.upstream.files.find((f) => f.citation)!.citation!
    expect(up!.citations[0]).not.toBe(resultCite)
  })
})
