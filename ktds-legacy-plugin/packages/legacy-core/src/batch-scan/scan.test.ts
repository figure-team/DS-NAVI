/**
 * batch-scan 골든 등가 테스트(W2) — 픽스처 4종 오라클 대조 + 도달성 회귀 + 결정론.
 *
 * 오라클(expected.json)은 스캐너 출력을 사람이 검수해 고정한 것(interface-scan 관례).
 * 핵심 회귀: quartz XML 잡 클래스가 도달성에서 unreached(데드코드)로 오판되지 않음.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { extractRoutes } from '../domain-map/extract.js'
import { extractEdges } from '../domain-map/edges.js'
import { buildSlices } from '../domain-map/slices.js'
import { stableJson } from '../domain-map/persist.js'
import { buildBatchJobs, type BatchJobsReport } from './report.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '..', '..', 'fixtures', 'batch-scan')

interface Oracle {
  description: string
  jobs: BatchJobsReport['jobs']
  stats: BatchJobsReport['stats']
  suspectSignals: BatchJobsReport['suspectSignals']
}

function loadOracle(fixture: string): Oracle {
  return JSON.parse(readFileSync(join(fixturesRoot, fixture, 'expected.json'), 'utf8'))
}

async function scan(fixture: string) {
  const root = join(fixturesRoot, fixture)
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  return { census, routes, edges, report: buildBatchJobs(routes.batchEntries, edges, census) }
}

describe('batch scan — golden equivalence', () => {
  for (const fx of ['quartz-xml', 'spring-batch-xml', 'programmatic', 'shell-cron']) {
    it(`${fx}: jobs/stats/suspects 오라클 일치`, async () => {
      const { report } = await scan(fx)
      const oracle = loadOracle(fx)
      expect(report.jobs).toEqual(oracle.jobs)
      expect(report.stats).toEqual(oracle.stats)
      expect(report.suspectSignals).toEqual(oracle.suspectSignals)
    })
  }

  it('도달성 회귀(핵심): quartz XML 잡 클래스·하위 의존이 unreached 로 오판되지 않음', async () => {
    const { census, routes, edges } = await scan('quartz-xml')
    const slices = buildSlices(census, routes, edges)
    const status = new Map(slices.ownership.map((o) => [o.relPath, o.status]))
    // 핸들러 해석 전에는 셋 다 unreached(XML 파일엔 엣지가 없음)였다.
    expect(status.get('src/main/java/demo/batch/OrderSyncJob.java')).not.toBe('unreached')
    expect(status.get('src/main/java/demo/batch/ReportJob.java')).not.toBe('unreached')
    expect(status.get('src/main/java/demo/batch/OrderDao.java')).not.toBe('unreached')
  })

  it('핸들러 해석 3방식 + 미해석 [미확인] 표면화', async () => {
    const { routes } = await scan('quartz-xml')
    const byHandler = new Map(routes.batchEntries.map((b) => [b.handler, b.handlerFile]))
    // MethodInvokingJobDetailFactoryBean → targetObject 빈 class.
    expect(byHandler.get('orderSyncJobDetail')).toBe('src/main/java/demo/batch/OrderSyncJob.java')
    // JobDetailFactoryBean → jobClass property.
    expect(byHandler.get('reportJobDetail')).toBe('src/main/java/demo/batch/ReportJob.java')
    // task:scheduled ref → 빈 class.
    expect(byHandler.get('orderSyncJob#cleanup')).toBe('src/main/java/demo/batch/OrderSyncJob.java')
    // 존재하지 않는 빈 ref → null(침묵 누락 금지).
    expect(byHandler.get('missingJobDetail')).toBeNull()
  })

  it('quartz-java: newJob(X.class) → 잡 클래스 파일 해석 + cronSchedule 스케줄', async () => {
    const { report } = await scan('programmatic')
    const qj = report.jobs.find((j) => j.trigger === 'quartz-java')!
    expect(qj.name).toBe('SettleJob')
    expect(qj.handlerFile).toBe('src/main/java/demo/batch/SettleJob.java')
    expect(qj.schedule).toBe('cron=0 0 2 * * ?')
    // 잡 클래스가 엔트리에 물렸으므로 의심신호(job-named-class)가 아니다.
    expect(report.suspectSignals.count).toBe(0)
  })

  it('shell/crontab: 주석·환경변수 라인 미추출, cron 5필드 스케줄 파싱', async () => {
    const { report } = await scan('shell-cron')
    expect(report.jobs.some((j) => (j.handler ?? '').includes('fake.jar'))).toBe(false)
    const cron = report.jobs.filter((j) => j.trigger === 'crontab')
    expect(cron.map((j) => j.schedule)).toEqual(['cron=30 5 * * 1-5', 'cron=0 4 * * *'])
    expect(cron.some((j) => (j.handler ?? '').startsWith('SHELL='))).toBe(false)
  })

  it('spring-batch: 잡 id 가 name, tasklet ref 해석·bean class 파일 부재는 [미확인]', async () => {
    const { report } = await scan('spring-batch-xml')
    const names = report.jobs.map((j) => j.name).sort()
    expect(names).toEqual(['orderAggJob', 'settleJob'])
    const settle = report.jobs.find((j) => j.name === 'settleJob')!
    expect(settle.handlerFile).toBe('src/main/java/demo/sb/SettleTasklet.java')
    const agg = report.jobs.find((j) => j.name === 'orderAggJob')!
    expect(agg.unresolvedHandler).toBe(true)
  })

  it('안정 id: BAT-<hash8> 형식 + 유일 + 재실행 동일', async () => {
    const a = await scan('quartz-xml')
    const b = await scan('quartz-xml')
    expect(stableJson(a.report)).toBe(stableJson(b.report))
    for (const j of a.report.jobs) expect(j.id).toMatch(/^BAT-[0-9a-f]{8}$/)
    expect(new Set(a.report.jobs.map((j) => j.id)).size).toBe(a.report.jobs.length)
  })
})
