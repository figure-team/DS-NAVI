import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { discoverLiveDbSignals } from './discover.js'
import { extractDbSchema } from './extract.js'

const here = dirname(fileURLToPath(import.meta.url))
const liveDir = join(here, '..', '..', 'fixtures', 'db-schema-live')
const sqlDir = join(here, '..', '..', 'fixtures', 'db-schema')

describe('라이브 DB 신호 정적 탐지 (PA1)', () => {
  const census = buildCensus(liveDir)
  const signals = discoverLiveDbSignals(liveDir, census)
  const has = (vendor: string, kind: string) => signals.some((s) => s.vendor === vendor && s.kind === kind)

  it('pom.xml JDBC 드라이버 → driver 신호(외부/내장 구분)', () => {
    expect(has('postgresql', 'driver')).toBe(true)
    expect(has('h2', 'driver')).toBe(true)
    const h2 = signals.find((s) => s.vendor === 'h2')!
    expect(h2.embedded).toBe(true) // 내장형
    const pg = signals.find((s) => s.vendor === 'postgresql' && s.kind === 'driver')!
    expect(pg.embedded).toBe(false) // 외부
  })

  it('application.yml/properties 의 jdbc URL → datasource-url 신호', () => {
    expect(has('postgresql', 'datasource-url')).toBe(true) // application.yml
    expect(has('oracle', 'datasource-url')).toBe(true) // application-prod.properties
  })

  it('모든 신호는 file:line 근거 동반', () => {
    expect(signals.length).toBeGreaterThan(0)
    for (const s of signals) {
      expect(s.relPath.length).toBeGreaterThan(0)
      expect(s.line).toBeGreaterThan(0)
      expect(s.detail.length).toBeGreaterThan(0)
    }
  })

  it('결정론 — 동일 입력 동일 출력', () => {
    expect(discoverLiveDbSignals(liveDir, census)).toEqual(signals)
  })

  it('연결 신호 없는 프로젝트 → liveDbSignals 빈 배열', () => {
    // db-schema fixture 는 .sql 만 있고 pom/yml 없음 → 신호 0.
    const model = extractDbSchema(sqlDir, buildCensus(sqlDir))
    expect(model.liveDbSignals).toEqual([])
  })
})
