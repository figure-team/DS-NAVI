/**
 * interface-scan 골든 등가 테스트(W1) — 픽스처 4종 오라클 대조 + 결정론.
 *
 * 오라클(expected.json)은 스캐너 출력을 사람이 검수해 고정한 것(routes.test 관례).
 * 실패 = 회귀(누락/오탐/정렬·id 변화). 오라클 갱신은 반드시 diff 검수 후.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { stableJson } from '../domain-map/persist.js'
import { extractInterfaces } from './index.js'
import type { InterfaceReport } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '..', '..', 'fixtures', 'interface-scan')

interface Oracle {
  description: string
  items: InterfaceReport['items']
  stats: InterfaceReport['stats']
  suspectSignals: InterfaceReport['suspectSignals']
}

function loadOracle(fixture: string): Oracle {
  return JSON.parse(readFileSync(join(fixturesRoot, fixture, 'expected.json'), 'utf8'))
}

async function scan(fixture: string): Promise<InterfaceReport> {
  const root = join(fixturesRoot, fixture)
  return extractInterfaces(root, buildCensus(root))
}

describe('interface scan — golden equivalence', () => {
  it('http-clients: RestTemplate/WebClient/Feign/Apache/HttpURLConnection + 프로퍼티 해석', async () => {
    const report = await scan('http-clients')
    const oracle = loadOracle('http-clients')
    expect(report.items).toEqual(oracle.items)
    expect(report.stats).toEqual(oracle.stats)
  })

  it('http-clients: 동적 URL 은 unresolved=true 로 표면화(침묵 누락 금지)', async () => {
    const report = await scan('http-clients')
    const dynamic = report.items.filter((i) => i.unresolved)
    expect(dynamic).toHaveLength(1)
    expect(dynamic[0].clientType).toBe('RestTemplate')
    expect(report.stats.unresolvedEndpoints).toBe(1)
  })

  it('mq-file: JMS/Kafka produce + 리스너 inbound-extra + SFTP/FTP/Socket', async () => {
    const report = await scan('mq-file')
    const oracle = loadOracle('mq-file')
    expect(report.items).toEqual(oracle.items)
    expect(report.stats).toEqual(oracle.stats)
  })

  it('mq-file: 방향 분리 — 리스너/ServerSocket 은 inbound-extra', async () => {
    const report = await scan('mq-file')
    const inbound = report.items.filter((i) => i.direction === 'inbound-extra')
    expect(inbound.map((i) => i.clientType).sort()).toEqual(['KafkaListener', 'ServerSocket'])
  })

  it('db-link: mapper XML/SQL 의 table@link + DDL, 주석 오탐 0', async () => {
    const report = await scan('db-link')
    const oracle = loadOracle('db-link')
    expect(report.items).toEqual(oracle.items)
    // 주석 속 COMMENT_LINK 는 잡히면 안 된다.
    expect(report.items.some((i) => (i.endpoint.raw ?? '').includes('COMMENT_LINK'))).toBe(false)
  })

  it('negative: 신호 없는 프로젝트 → items:[] + 의심신호 0 (스캔했고 없음의 증거)', async () => {
    const report = await scan('negative')
    expect(report.items).toEqual([])
    expect(report.stats).toEqual({ total: 0, unresolvedEndpoints: 0, byProtocol: [], callSiteTotal: 0 })
    expect(report.suspectSignals).toEqual({ count: 0, samples: [] })
  })

  it('결정론: 동일 입력 2회 실행 → byte-identical(stableJson)', async () => {
    const a = await scan('http-clients')
    const b = await scan('http-clients')
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it('병합: 동일 엔드포인트 다중 호출 → 연계 1건 + callSites 누적(건수 부풀림 방지)', async () => {
    const report = await scan('http-clients')
    const approve = report.items.filter(
      (i) => i.endpoint.resolved === 'https://pay.example.com/v1/approve',
    )
    expect(approve).toHaveLength(1)
    expect(approve[0].callSites.map((c) => c.symbol)).toEqual([
      'PayClient#approve',
      'PayClient#retryApprove',
    ])
    expect(report.stats.callSiteTotal).toBe(report.items.reduce((n, i) => n + i.callSites.length, 0))
  })

  it('안정 id: 내용 파생(IF-<PROTO>-<hash8>) — 재실행에도 동일 연계는 동일 id', async () => {
    const a = await scan('http-clients')
    const b = await scan('http-clients')
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id))
    for (const it of a.items) expect(it.id).toMatch(/^IF-[A-Z]+-[0-9a-f]{8}$/)
    // id 유일성.
    expect(new Set(a.items.map((i) => i.id)).size).toBe(a.items.length)
  })

  it('커스텀 seam: understanding.config.json interfaceScan.clients 로 사내 EAI 래퍼 탐지', async () => {
    const report = await scan('eai-custom')
    const oracle = loadOracle('eai-custom')
    expect(report.items).toEqual(oracle.items)
    expect(report.items).toHaveLength(1)
    expect(report.items[0].clientType).toBe('EAI(사내공통)')
    expect(report.items[0].endpoint.resolved).toBe('EAI.SETTLE.REQ')
    // 미등록 래퍼(LegacyBus)는 잡지 않는다(화이트리스트 원칙).
    expect(report.items.some((i) => i.clientType.includes('LegacyBus'))).toBe(false)
  })

  it('의심신호: 카탈로그 밖 연계(자체 HTTP 유틸/jdbc) → items 0 + suspectSignals 표면화', async () => {
    const report = await scan('suspect')
    expect(report.items).toEqual([])
    expect(report.suspectSignals.count).toBe(2)
    expect(report.suspectSignals.samples.map((s) => s.kind).sort()).toEqual([
      'http-literal',
      'jdbc-url',
    ])
    // 주석 라인의 URL 은 세지 않는다.
    expect(report.suspectSignals.samples.some((s) => s.line === 5)).toBe(false)
  })
})
