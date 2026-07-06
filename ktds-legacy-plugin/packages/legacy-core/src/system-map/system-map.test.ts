/**
 * system-map 빌더 단위 테스트 (WORK_MAP P2) — 조인·요약·정직성 규약.
 * 파일 I/O 없는 buildSystemMap 순수 로직만 검증한다(기록은 writeSystemMap → persist 경유).
 */
import { describe, expect, it } from 'vitest'

import { buildSystemMap, SystemMapSchema } from './index.js'
import type { InterfaceReport } from '../interface-scan/types.js'
import type { DbSchemaModel } from '../db-schema/types.js'
import type { BatchJobsReport } from '../batch-scan/report.js'

function emptyInterfaces(overrides: Partial<InterfaceReport> = {}): InterfaceReport {
  return {
    schemaVersion: 1,
    gitCommit: 'abc123',
    items: [],
    stats: { total: 0, unresolvedEndpoints: 0, byProtocol: [], callSiteTotal: 0 },
    suspectSignals: { count: 0, samples: [] },
    ...overrides,
  } as InterfaceReport
}

function emptyDb(overrides: Partial<DbSchemaModel> = {}): DbSchemaModel {
  return {
    schemaVersion: 1,
    gitCommit: 'abc123',
    tier: 'code-only',
    sqlFileCount: 0,
    tables: [],
    liveDbSignals: [],
    unresolved: [],
    ...overrides,
  } as DbSchemaModel
}

function emptyBatch(overrides: Partial<BatchJobsReport> = {}): BatchJobsReport {
  return {
    schemaVersion: 1,
    gitCommit: 'abc123',
    jobs: [],
    stats: { total: 0, byTrigger: [], unresolvedHandlers: 0 },
    suspectSignals: { count: 0, samples: [] },
    ...overrides,
  } as unknown as BatchJobsReport
}

function iface(
  id: string,
  direction: 'outbound' | 'inbound-extra',
  endpoint: string | null,
): InterfaceReport['items'][number] {
  return {
    id,
    direction,
    protocol: 'http',
    clientType: 'RestTemplate',
    endpoint: { raw: endpoint, resolved: endpoint, resolvedFrom: null },
    dataHint: null,
    callSites: [{ file: 'A.java', line: 1, snippet: 'x' }],
    unresolved: endpoint === null,
  } as InterfaceReport['items'][number]
}

describe('buildSystemMap', () => {
  it('jpetstore 프로파일: 인터페이스/배치 0건 + 내장 DB → scanned=true·db 채움 (음성 증거 보존)', () => {
    const sm = buildSystemMap({
      interfaces: emptyInterfaces(),
      dbSchema: emptyDb({
        tier: 'ddl+data',
        sqlFileCount: 3,
        tables: [
          { name: 'product', columns: [], sourceFile: 's.sql', line: 1, rows: [], rowCount: 0 },
          { name: 'account', columns: [], sourceFile: 's.sql', line: 2, rows: [], rowCount: 0 },
        ] as unknown as DbSchemaModel['tables'],
        liveDbSignals: [
          { vendor: 'hsqldb', embedded: true, kind: 'driver', detail: 'org.hsqldb', relPath: 'pom.xml', line: 10 },
          { vendor: 'hsqldb', embedded: true, kind: 'datasource-url', detail: 'jdbc:hsqldb:', relPath: 'p.xml', line: 3 },
        ],
      }),
      batchJobs: emptyBatch(),
    })
    expect(SystemMapSchema.parse(sm)).toEqual(sm)
    expect(sm.interfaces).toMatchObject({ scanned: true, outboundCount: 0, inboundCount: 0, suspectCount: 0 })
    expect(sm.batch).toMatchObject({ scanned: true, jobCount: 0 })
    expect(sm.db).toMatchObject({ vendor: 'hsqldb', embedded: true, tableCount: 2 })
    // 테이블 이름 정렬(결정론)
    expect(sm.db?.tables).toEqual(['account', 'product'])
    expect(sm.generatedFromCommit).toBe('abc123')
  })

  it('DB 정보가 전혀 없으면 db=null (패널은 "없음 — 스캔 완료")', () => {
    const sm = buildSystemMap({ interfaces: emptyInterfaces(), dbSchema: emptyDb(), batchJobs: emptyBatch() })
    expect(sm.db).toBeNull()
  })

  it('방향 분리 + id 정렬 + 엔드포인트 해석(resolved 우선, 미해석은 null 유지)', () => {
    const sm = buildSystemMap({
      interfaces: emptyInterfaces({
        items: [
          iface('IF-HTTP-bb', 'outbound', 'https://pay.example.com'),
          iface('IF-HTTP-aa', 'outbound', null),
          iface('IF-MQ-cc', 'inbound-extra', 'queue://orders'),
        ],
        suspectSignals: { count: 2, samples: [] },
      }),
      dbSchema: emptyDb(),
      batchJobs: emptyBatch(),
    })
    expect(sm.interfaces.outbound.map((i) => i.id)).toEqual(['IF-HTTP-aa', 'IF-HTTP-bb'])
    expect(sm.interfaces.inbound.map((i) => i.id)).toEqual(['IF-MQ-cc'])
    expect(sm.interfaces.outbound[0]).toMatchObject({ endpoint: null, unresolved: true })
    expect(sm.interfaces.suspectCount).toBe(2) // 0건+suspect>0 = "탐지 못함" 가능성 표면화
  })

  it('벤더 복수면 dedup·정렬 병기, 하나라도 비내장이면 embedded=false (대표 창작 금지)', () => {
    const sm = buildSystemMap({
      interfaces: emptyInterfaces(),
      dbSchema: emptyDb({
        liveDbSignals: [
          { vendor: 'oracle', embedded: false, kind: 'driver', detail: 'ojdbc', relPath: 'pom.xml', line: 1 },
          { vendor: 'h2', embedded: true, kind: 'driver', detail: 'h2', relPath: 'pom.xml', line: 2 },
          { vendor: 'oracle', embedded: false, kind: 'datasource-url', detail: 'jdbc:oracle:', relPath: 'a.yml', line: 3 },
        ],
      }),
      batchJobs: emptyBatch(),
    })
    expect(sm.db).toMatchObject({ vendor: 'h2/oracle', embedded: false })
  })

  it('배치 잡 id 정렬 요약', () => {
    const sm = buildSystemMap({
      interfaces: emptyInterfaces(),
      dbSchema: emptyDb(),
      batchJobs: emptyBatch({
        jobs: [
          { id: 'BAT-z', name: 'z', trigger: 'quartz-java' },
          { id: 'BAT-a', name: 'a', trigger: 'crontab' },
        ] as unknown as BatchJobsReport['jobs'],
      }),
    })
    expect(sm.batch.jobs.map((j) => j.id)).toEqual(['BAT-a', 'BAT-z'])
    expect(sm.batch.jobCount).toBe(2)
  })
})
