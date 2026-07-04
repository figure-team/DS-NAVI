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

  it('negative: 신호 없는 프로젝트 → items:[] (스캔했고 없음의 증거)', async () => {
    const report = await scan('negative')
    expect(report.items).toEqual([])
    expect(report.stats).toEqual({ total: 0, unresolvedEndpoints: 0, byProtocol: [] })
  })

  it('결정론: 동일 입력 2회 실행 → byte-identical(stableJson)', async () => {
    const a = await scan('http-clients')
    const b = await scan('http-clients')
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it('id 는 프로토콜별 연번 — 정렬(protocol, file, line) 후 부여', async () => {
    const report = await scan('mq-file')
    const mqIds = report.items.filter((i) => i.protocol === 'mq').map((i) => i.id)
    expect(mqIds).toEqual(['IF-MQ-001', 'IF-MQ-002', 'IF-MQ-003'])
  })
})
