/**
 * buildRtm(R1) — AS-IS RTM 빌더 결정론·grounding 단위 테스트.
 */
import { describe, it, expect } from 'vitest'
import { buildRtm } from './build-rtm.js'
import type { DocInput } from '../doc-generator/builders/shared.js'
import { RtmModelSchema } from './types.js'

/** 최소 fixture — 결제 도메인 1개 + flow 1개 + dao step 1개 + 라우트/매퍼. */
function fixture(): DocInput {
  const nodes = [
    { id: 'd1', type: 'domain', name: '결제', summary: '', tags: [], complexity: 'simple' },
    {
      id: 'f1',
      type: 'flow',
      name: '결제 처리',
      summary: '',
      tags: [],
      complexity: 'simple',
      filePath: 'src/PayController.java',
      lineRange: [10, 50],
      domainMeta: { entryPoint: 'PayController#pay' },
    },
    {
      id: 's1',
      type: 'step',
      name: 'PayMapper',
      summary: '',
      tags: ['dao'],
      complexity: 'simple',
      layer: 'dao',
      filePath: 'src/PayMapper.java',
    },
  ]
  const edges = [
    { source: 'd1', target: 'f1', type: 'contains_flow' },
    { source: 'f1', target: 's1', type: 'flow_step' },
    { source: 'f1', target: 's1', type: 'calls', description: 'insertPayment' },
  ]
  const routes = {
    schemaVersion: 1,
    gitCommit: null,
    contextPath: null,
    batchEntries: [],
    routes: [
      {
        routeId: 'POST /pay',
        method: 'POST',
        path: '/pay',
        rawPath: '/pay',
        kind: 'form',
        framework: 'spring',
        filePath: 'src/PayController.java',
        line: 10,
        handler: 'PayController#pay',
        notes: [],
      },
    ],
  }
  const mybatisModel = {
    mappers: [
      {
        namespace: 'PayMapper',
        relPath: 'src/PayMapper.xml',
        statements: [{ id: 'insertPayment', crud: 'C', tables: ['PAYMENT'], columns: [], line: 5 }],
      },
    ],
    tables: ['PAYMENT'],
  }
  return { nodes, edges, routes, mybatisModel } as unknown as DocInput
}

describe('buildRtm (R1, AS-IS)', () => {
  it('스키마에 부합하고 도메인별 기능 행을 만든다', () => {
    const model = buildRtm(fixture(), 'abc123')
    expect(() => RtmModelSchema.parse(model)).not.toThrow()
    expect(model.gitCommit).toBe('abc123')
    expect(model.requirements).toEqual([])
    expect(model.domains).toEqual([{ id: 'd1', name: '결제', functionCount: 1 }])
    expect(model.functions).toHaveLength(1)
  })

  it('진입점은 라우트 매칭으로 file:line 근거를 단다([확정])', () => {
    const row = buildRtm(fixture()).functions[0]
    expect(row.featureId).toBe('FN-001')
    expect(row.name).toBe('결제 처리')
    expect(row.entryPoint.value).toBe('POST /pay')
    expect(row.entryPoint.confidence).toBe('CONFIRMED')
    expect(row.entryPoint.evidence).toEqual([{ file: 'src/PayController.java', line: 10 }])
  })

  it('구현은 핸들러+step 파일을, 데이터는 매퍼 SQL 에서 테이블×CRUD 를 근거로 채운다', () => {
    const row = buildRtm(fixture()).functions[0]
    expect(row.implementation.value).toBe('PayController, PayMapper')
    expect(row.implementation.confidence).toBe('CONFIRMED')
    expect(row.data.value).toBe('PAYMENT(C)')
    expect(row.data.confidence).toBe('CONFIRMED')
    expect(row.data.evidence).toEqual([{ file: 'src/PayMapper.xml', line: 5 }])
  })

  it('테스트 셀은 정보 부재로 UNVERIFIED(합성 금지), 상태=IMPLEMENTED', () => {
    const row = buildRtm(fixture()).functions[0]
    expect(row.test).toEqual({ value: '', confidence: 'UNVERIFIED', evidence: [] })
    expect(row.origin).toBe('AS_IS')
    expect(row.state).toBe('IMPLEMENTED')
  })

  it('결정론 — 동일 입력에 byte-identical 산출', () => {
    expect(JSON.stringify(buildRtm(fixture(), 'c'))).toBe(JSON.stringify(buildRtm(fixture(), 'c')))
  })
})

/** 비-MyBatis fixture — 손수 영속화(rawSqlModel) + 테스트 링크(testLinks). */
function kotlinFixture(): DocInput {
  const nodes = [
    { id: 'd1', type: 'domain', name: '정산', summary: '', tags: [], complexity: 'simple' },
    {
      id: 'f1',
      type: 'flow',
      name: '사용내역 인입',
      summary: '',
      tags: [],
      complexity: 'simple',
      filePath: 'src/main/kotlin/Ingestor.kt',
      lineRange: [1, 20],
      domainMeta: { entryPoint: 'Ingestor#ingest' },
    },
    {
      id: 's1',
      type: 'step',
      name: 'UsageStore',
      summary: '',
      tags: [],
      complexity: 'simple',
      layer: 'service', // 손수 영속화는 dao 로 분류 안 됨 — 그래도 매칭돼야 한다
      filePath: 'src/main/kotlin/UsageStore.kt',
    },
  ]
  const edges = [
    { source: 'd1', target: 'f1', type: 'contains_flow' },
    { source: 'f1', target: 's1', type: 'flow_step' },
  ]
  return {
    nodes,
    edges,
    routes: { schemaVersion: 1, gitCommit: null, contextPath: null, batchEntries: [], routes: [] },
    mybatisModel: null,
    rawSqlModel: {
      byFile: {
        'src/main/kotlin/UsageStore.kt': [
          { table: 'usage_staging', crud: 'C', line: 12 },
          { table: 'usage_staging', crud: 'R', line: 30 },
        ],
      },
    },
    testLinks: {
      byProdClass: {
        UsageStore: [
          { testFile: 'src/test/kotlin/UsageStoreTest.kt', testClass: 'UsageStoreTest', prodClass: 'UsageStore', line: 8, convention: true },
        ],
        Ingestor: [
          { testFile: 'src/test/kotlin/BroadIntegrationTest.kt', testClass: 'BroadIntegrationTest', prodClass: 'Ingestor', line: 40, convention: false },
        ],
      },
    },
  } as unknown as DocInput
}

describe('buildRtm — 비-MyBatis 데이터/테스트 축(Kotlin 손수영속)', () => {
  it('데이터 축을 코드 raw SQL 에서 테이블×CRUD 로 채운다(MyBatis 부재)', () => {
    const row = buildRtm(kotlinFixture()).functions[0]
    expect(row.data.value).toBe('usage_staging(CR)')
    expect(row.data.confidence).toBe('CONFIRMED')
    expect(row.data.evidence).toEqual([
      { file: 'src/main/kotlin/UsageStore.kt', line: 12 },
      { file: 'src/main/kotlin/UsageStore.kt', line: 30 },
    ])
  })

  it('테스트 축을 프로덕션 클래스 참조로 링크한다 — 관례(XxxTest) 있으면 그것만·CONFIRMED', () => {
    const row = buildRtm(kotlinFixture()).functions[0]
    // UsageStoreTest(관례)가 있으므로 광역 BroadIntegrationTest(참조-only)는 제외된다.
    expect(row.test.value).toBe('UsageStoreTest')
    expect(row.test.confidence).toBe('CONFIRMED')
    expect(row.test.evidence).toEqual([{ file: 'src/test/kotlin/UsageStoreTest.kt', line: 8 }])
  })

  it('관례 테스트가 없으면 참조 링크 전부·INFERRED', () => {
    const fx = kotlinFixture()
    // 관례 링크 제거 → 참조-only 만 남긴다.
    ;(fx.testLinks as { byProdClass: Record<string, unknown[]> }).byProdClass.UsageStore = []
    const row = buildRtm(fx).functions[0]
    expect(row.test.value).toBe('BroadIntegrationTest')
    expect(row.test.confidence).toBe('INFERRED')
  })

  it('테스트 링크 부재 시 UNVERIFIED 빈 셀(합성 금지)', () => {
    const fx = kotlinFixture()
    fx.testLinks = { byProdClass: {} }
    const row = buildRtm(fx).functions[0]
    expect(row.test).toEqual({ value: '', confidence: 'UNVERIFIED', evidence: [] })
  })

  it('rawSqlModel·mybatis 둘 다 없으면 데이터 축은 빈 INFERRED', () => {
    const fx = kotlinFixture()
    fx.rawSqlModel = { byFile: {} }
    const row = buildRtm(fx).functions[0]
    expect(row.data.value).toBe('')
    expect(row.data.confidence).toBe('INFERRED')
  })
})

/** JPA/Spring Data fixture — MyBatis·raw-SQL 부재, 흐름→리포지토리 호출(methodCallGraph) + jpaModel. */
function jpaFixture(): DocInput {
  const nodes = [
    { id: 'd1', type: 'domain', name: '고객', summary: '', tags: [], complexity: 'simple' },
    {
      id: 'f1',
      type: 'flow',
      name: '고객 저장',
      summary: '',
      tags: [],
      complexity: 'simple',
      filePath: 'src/main/java/OwnerController.java',
      lineRange: [10, 30],
      domainMeta: { entryPoint: 'OwnerController#handle' },
    },
  ]
  const edges = [{ source: 'd1', target: 'f1', type: 'contains_flow' }]
  return {
    nodes,
    edges,
    routes: { schemaVersion: 1, gitCommit: null, contextPath: null, batchEntries: [], routes: [] },
    mybatisModel: null,
    rawSqlModel: { byFile: {} },
    methodCallGraph: {
      schemaVersion: 1,
      gitCommit: null,
      calls: [
        { callerFile: 'src/main/java/OwnerController.java', callerMethod: 'handle', calleeFile: 'src/main/java/OwnerRepository.java', calleeMethod: 'findById', callLine: 42 },
        { callerFile: 'src/main/java/OwnerController.java', callerMethod: 'handle', calleeFile: 'src/main/java/OwnerRepository.java', calleeMethod: 'save', callLine: 50 },
        { callerFile: 'src/main/java/OwnerController.java', callerMethod: 'handle', calleeFile: 'src/main/java/PetTypeRepository.java', calleeMethod: 'findPetTypes', callLine: 55 },
      ],
    },
    jpaModel: {
      schemaVersion: 1,
      gitCommit: null,
      unresolved: [],
      entities: [
        { className: 'Owner', relPath: 'src/main/java/Owner.java', line: 5, tableName: 'owners', tableExplicit: true, tableConfidence: 'CONFIRMED', idField: 'id', columns: [], relations: [] },
        { className: 'PetType', relPath: 'src/main/java/PetType.java', line: 5, tableName: 'types', tableExplicit: true, tableConfidence: 'CONFIRMED', idField: 'id', columns: [], relations: [] },
      ],
      repositories: [
        { className: 'OwnerRepository', relPath: 'src/main/java/OwnerRepository.java', line: 3, entityType: 'Owner', idType: 'Integer', baseInterface: 'JpaRepository', derivedQueries: [{ method: 'findById', columns: ['id'], line: 8, confidence: 'INFERRED' }], queries: [] },
        { className: 'PetTypeRepository', relPath: 'src/main/java/PetTypeRepository.java', line: 3, entityType: 'PetType', idType: 'Integer', baseInterface: 'Repository', derivedQueries: [], queries: [{ method: 'findPetTypes', native: false, query: 'SELECT ptype FROM PetType ptype ORDER BY ptype.name', line: 10, confidence: 'CONFIRMED' }] },
      ],
    },
  } as unknown as DocInput
}

describe('buildRtm — JPA/Spring Data 데이터 축(ORM 폴백)', () => {
  it('MyBatis·raw-SQL 부재 시 흐름→리포지토리→entity→table 로 채운다(호출부 근거)', () => {
    const row = buildRtm(jpaFixture()).functions[0]
    // owners: findById(R) + save(업서트 CU) → CRU. types: @Query SELECT → R. 테이블 ASC 정렬.
    expect(row.data.value).toBe('owners(CRU) · types(R)')
    expect(row.data.confidence).toBe('CONFIRMED')
    // 근거 = 리포 메서드 호출부 file:line(실제 데이터 접근 지점), 파일·라인 정렬.
    expect(row.data.evidence).toEqual([
      { file: 'src/main/java/OwnerController.java', line: 42 },
      { file: 'src/main/java/OwnerController.java', line: 50 },
      { file: 'src/main/java/OwnerController.java', line: 55 },
    ])
  })

  it('save/saveAll 은 업서트라 C+U 로 표기(JPA 수정 흐름이 Create 로 오표기되지 않게)', () => {
    const fx = jpaFixture()
    ;(fx.methodCallGraph as { calls: unknown[] }).calls = [
      { callerFile: 'src/main/java/OwnerController.java', callerMethod: 'handle', calleeFile: 'src/main/java/OwnerRepository.java', calleeMethod: 'save', callLine: 50 },
    ]
    const row = buildRtm(fx).functions[0]
    expect(row.data.value).toBe('owners(CU)')
  })

  it('MyBatis/raw-SQL 이 근거를 내면 JPA 는 폴백하지 않는다(우선순위 보존)', () => {
    const fx = jpaFixture()
    // flow_step 스텝(raw SQL 보유) 추가 → raw SQL 이 primary 로 채운다.
    ;(fx.nodes as unknown[]).push({ id: 's1', type: 'step', name: 'Dao', summary: '', tags: [], complexity: 'simple', layer: 'service', filePath: 'src/main/java/OwnerDao.java' })
    ;(fx.edges as unknown[]).push({ source: 'f1', target: 's1', type: 'flow_step' })
    fx.rawSqlModel = { byFile: { 'src/main/java/OwnerDao.java': [{ table: 'legacy_owners', crud: 'R', line: 7 }] } }
    const row = buildRtm(fx).functions[0]
    expect(row.data.value).toBe('legacy_owners(R)') // JPA(owners/types) 로 폴백하지 않음.
  })

  it('methodCallGraph 부재 시 flow_step 리포지토리 스텝의 incoming 메서드로 폴백 채움', () => {
    const fx = jpaFixture()
    fx.methodCallGraph = null // 호출그래프 없음 → flow_step 폴백 경로.
    fx.nodes = [
      { id: 'd1', type: 'domain', name: '고객', summary: '', tags: [], complexity: 'simple' },
      {
        id: 'f1', type: 'flow', name: '고객 저장', summary: '', tags: [], complexity: 'simple',
        filePath: 'src/main/java/OwnerController.java', lineRange: [10, 30], domainMeta: { entryPoint: 'OwnerController#handle' },
      },
      { id: 's1', type: 'step', name: 'OwnerRepository', summary: '', tags: [], complexity: 'simple', layer: 'dao', filePath: 'src/main/java/OwnerRepository.java', lineRange: [3, 3] },
    ] as unknown as DocInput['nodes']
    fx.edges = [
      { source: 'd1', target: 'f1', type: 'contains_flow' },
      { source: 'f1', target: 's1', type: 'flow_step' },
      { source: 'f1', target: 's1', type: 'calls', description: 'save' }, // 스텝으로 들어오는 호출 메서드.
    ] as unknown as DocInput['edges']
    const row = buildRtm(fx).functions[0]
    expect(row.data.value).toBe('owners(CU)')
    expect(row.data.confidence).toBe('CONFIRMED')
    expect(row.data.evidence).toEqual([{ file: 'src/main/java/OwnerRepository.java', line: 3 }])
  })

  it('JPA 리포지토리 없으면 데이터 축은 빈 INFERRED(합성 금지)', () => {
    const fx = jpaFixture()
    fx.jpaModel = null
    const row = buildRtm(fx).functions[0]
    expect(row.data.value).toBe('')
    expect(row.data.confidence).toBe('INFERRED')
  })

  it('결정론 — 동일 입력 byte-identical', () => {
    expect(JSON.stringify(buildRtm(jpaFixture(), 'x'))).toBe(JSON.stringify(buildRtm(jpaFixture(), 'x')))
  })
})
