import { describe, it, expect } from 'vitest'
import { ImpactResultSchema } from './types.js'
import { buildKgNodeIndex, buildImpactOverlay } from './overlay.js'

// jpetstore-6 실측에서 관측한 노드 id 규칙(.java→file:, mapper .xml→config:)을
// 합성 KG 로 재현 — 매핑 규칙을 하드코딩하지 않고 인덱스 조회로 reproduce 함을 고정.
const KG_NODES = [
  { id: 'file:src/Order.java', type: 'file', filePath: 'src/Order.java' },
  { id: 'function:src/Order.java:getId', type: 'function', filePath: 'src/Order.java' },
  { id: 'file:src/OrderService.java', type: 'file', filePath: 'src/OrderService.java' },
  { id: 'file:src/Item.java', type: 'file', filePath: 'src/Item.java' },
  { id: 'config:res/OrderMapper.xml', type: 'config', filePath: 'res/OrderMapper.xml' },
  { id: 'config:res/ItemMapper.xml', type: 'config', filePath: 'res/ItemMapper.xml' },
]

/** 최소 유효 ImpactResult 빌더 — seeds + 도달성만 채우고 나머지는 빈 값. */
function makeResult(over: {
  seeds: string[]
  upstream?: string[]
  downstream?: string[]
  mappers?: string[]
}) {
  return ImpactResultSchema.parse({
    schemaVersion: 1,
    gitCommit: 'abc123',
    depthCap: 12,
    edgeKinds: [],
    fanInThreshold: 24,
    seeds: over.seeds.map((relPath) => ({ relPath, origin: 'path', confidence: 'CONFIRMED' })),
    upstream: {
      files: (over.upstream ?? []).map((relPath) => ({ relPath, viaKinds: [], minDepth: 1, citation: null })),
      api: [],
      persistence: {
        mappers: (over.mappers ?? []).map((relPath) => ({ relPath, namespace: null, owners: [], citation: null })),
        sqlFiles: [],
        tableCandidateSlots: [],
        kgTableCatalog: [],
        jpaTables: [],
        note: 'x',
      },
      flows: [],
      domains: [],
    },
    downstream: {
      files: (over.downstream ?? []).map((relPath) => ({ relPath, viaKinds: [], minDepth: 1, citation: null })),
    },
    overEdges: { hubNodes: [], importOnlyCount: 0, crossCheckDiff: [] },
    needsReview: [],
  })
}

describe('buildKgNodeIndex', () => {
  it('파일성 노드만 인덱싱하고 function 등 하위 심볼은 배제', () => {
    const idx = buildKgNodeIndex(KG_NODES)
    expect(idx.get('src/Order.java')).toBe('file:src/Order.java') // function 노드가 아닌 file 노드
    expect(idx.get('res/OrderMapper.xml')).toBe('config:res/OrderMapper.xml')
    expect(idx.size).toBe(5) // Order/OrderService/Item.java + 2 xml (function 제외)
  })

  it('잘못된 노드(필드 누락)는 건너뜀', () => {
    const idx = buildKgNodeIndex([
      { id: 'file:a.java', type: 'file', filePath: 'a.java' },
      { id: 123, type: 'file', filePath: 'b.java' }, // id 비문자열
      { type: 'file', filePath: 'c.java' }, // id 없음
    ])
    expect(idx.size).toBe(1)
  })
})

describe('buildImpactOverlay', () => {
  const idx = buildKgNodeIndex(KG_NODES)

  it('시드→changed, 하류/매퍼→affected 로 매핑(시드는 affected 제외)', () => {
    const result = makeResult({
      seeds: ['src/Order.java', 'res/OrderMapper.xml'],
      downstream: ['src/Item.java', 'res/ItemMapper.xml'],
    })
    const o = buildImpactOverlay(result, idx)
    expect(o.changedNodeIds).toEqual(['config:res/OrderMapper.xml', 'file:src/Order.java'])
    expect(o.affectedNodeIds).toEqual(['config:res/ItemMapper.xml', 'file:src/Item.java'])
    expect(o.unresolved).toEqual([])
  })

  it('changed 와 겹치는 affected 는 제외(이중 색칠 방지)', () => {
    const result = makeResult({
      seeds: ['src/Order.java'],
      downstream: ['src/Order.java', 'src/Item.java'], // Order 는 시드이기도
    })
    const o = buildImpactOverlay(result, idx)
    expect(o.changedNodeIds).toEqual(['file:src/Order.java'])
    expect(o.affectedNodeIds).toEqual(['file:src/Item.java']) // Order 제외
  })

  it('KG 인덱스에 없는 relPath 는 unresolved 로 노출(조용한 누락 방지)', () => {
    const result = makeResult({
      seeds: ['src/Order.java', 'src/Ghost.java'],
      downstream: ['src/Missing.java'],
    })
    const o = buildImpactOverlay(result, idx)
    expect(o.changedNodeIds).toEqual(['file:src/Order.java'])
    expect(o.affectedNodeIds).toEqual([])
    expect(o.unresolved).toEqual(['src/Ghost.java', 'src/Missing.java'])
  })

  it('결정론: 동일 입력은 byte-identical 직렬화', () => {
    const result = makeResult({ seeds: ['src/OrderService.java'], downstream: ['src/Item.java'] })
    const a = JSON.stringify(buildImpactOverlay(result, idx))
    const b = JSON.stringify(buildImpactOverlay(result, idx))
    expect(a).toBe(b)
  })

  it('ktdsImpact 메타에 규모/commit 반영', () => {
    const result = makeResult({ seeds: ['src/Order.java'], upstream: ['src/OrderService.java'], downstream: ['src/Item.java'] })
    const o = buildImpactOverlay(result, idx)
    expect(o.ktdsImpact).toEqual({ gitCommit: 'abc123', seedCount: 1, upstreamFileCount: 1, downstreamFileCount: 1 })
  })
})
