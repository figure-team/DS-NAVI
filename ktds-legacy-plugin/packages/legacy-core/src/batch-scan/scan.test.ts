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
import { extractXmlBatchEntries } from '../domain-map/routes/batch.js'
import { collectBeans, type BeanIndex } from './bean-index.js'
import { resolveBatchHandlers } from './resolve.js'
import { extractSpringBatchXmlJobs } from './extract.js'
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
  return { census, routes, edges, report: buildBatchJobs(root, routes.batchEntries, edges, census) }
}

describe('batch scan — golden equivalence', () => {
  for (const fx of ['quartz-xml', 'spring-batch-xml', 'programmatic', 'shell-cron', 'structure-suspect']) {
    it(`${fx}: jobs/stats/suspects 오라클 일치`, async () => {
      const { report } = await scan(fx)
      const oracle = loadOracle(fx)
      expect(report.jobs).toEqual(oracle.jobs)
      expect(report.stats).toEqual(oracle.stats)
      expect(report.suspectSignals).toEqual(oracle.suspectSignals)
    })
  }

  it('도달성 회귀(핵심): quartz XML 잡 클래스·DI 주입 하위 의존이 unreached 로 오판되지 않음', async () => {
    const { census, routes, edges } = await scan('quartz-xml')
    const slices = buildSlices(census, routes, edges)
    const status = new Map(slices.ownership.map((o) => [o.relPath, o.status]))
    // 핸들러 해석 전에는 셋 다 unreached(XML 파일엔 엣지가 없음)였다.
    expect(status.get('src/main/java/demo/batch/OrderSyncJob.java')).not.toBe('unreached')
    expect(status.get('src/main/java/demo/batch/ReportJob.java')).not.toBe('unreached')
    // OrderDao 는 @Autowired 주입(injection 엣지)으로 도달 — "DI 절단" 반박 회귀.
    expect(status.get('src/main/java/demo/batch/OrderDao.java')).not.toBe('unreached')
  })

  it('의심신호: 구조 신호(1급)·명명 신호(2급)·ignoreSuspects 억제(위양성 잠재우기)', async () => {
    const { report } = await scan('structure-suspect')
    expect(report.jobs).toEqual([]) // 어떤 트리거에도 배선 안 됨
    const byFile = new Map(report.suspectSignals.samples.map((s) => [s.file, s.kind]))
    // 명명 관례 없어도 구조 신호로 걸린다(위음성 방지).
    expect(byFile.get('src/main/java/demo/SettlementDaily.java')).toBe('job-structure')
    // *Job 명명이어도 구조 신호가 1급.
    expect(byFile.get('src/main/java/demo/UnwiredQuartzJob.java')).toBe('job-structure')
    // 확인된 위양성(DeptJob=직무)은 config 로 억제 — 늑대소년 방지.
    expect(byFile.has('src/main/java/demo/DeptJob.java')).toBe(false)
    expect(report.suspectSignals.count).toBe(2)
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

  it('안정 id: BAT-<트리거태그>-<hash8> 형식 + 유일 + 재실행 동일', async () => {
    const a = await scan('quartz-xml')
    const b = await scan('quartz-xml')
    expect(stableJson(a.report)).toBe(stableJson(b.report))
    for (const j of a.report.jobs) expect(j.id).toMatch(/^BAT-[A-Z]+-[0-9a-f]{8}$/)
    expect(new Set(a.report.jobs.map((j) => j.id)).size).toBe(a.report.jobs.length)
  })

  // ── 적대적 코드리뷰 회귀 프로브(인라인 XML) ─────────────────────────────

  it('리뷰1: <job-repository>/<job-listener> 태그는 spring-batch 잡으로 오탐하지 않음', () => {
    const xml = `<beans xmlns:batch="http://www.springframework.org/schema/batch">
<batch:job-repository id="jobRepo" />
<job-repository id="jobRepo2" xmlns="http://www.springframework.org/schema/batch"/>
<batch:job id="realJob"><batch:step id="s"><batch:tasklet ref="t"/></batch:step></batch:job>
</beans>`
    expect(extractSpringBatchXmlJobs(xml, 'a.xml').map((e) => e.entryId)).toEqual([
      'batch:a.xml#realJob',
    ])
  })

  it('리뷰2: 중첩 빈 — 외부 속성 보존 + 중첩 속성 오귀속 차단(틀린 확정값 방지)', () => {
    const xml = `<beans>
<bean id="outerDetail" class="org.springframework.scheduling.quartz.JobDetailFactoryBean">
  <property name="jobDataAsMap">
    <bean class="demo.Whatever"><property name="jobClass" value="demo.WrongJob"/></bean>
  </property>
  <property name="jobClass" value="demo.RightJob"/>
</bean>
</beans>`
    const idx: BeanIndex = new Map()
    collectBeans(xml, 'b.xml', idx)
    // 첫 </bean> 근사였다면 jobClass=WrongJob(오귀속) + RightJob 유실이었다.
    expect(idx.get('outerDetail')!.properties.get('jobClass')).toEqual({
      value: 'demo.RightJob',
      ref: null,
    })
  })

  it('리뷰3: 인라인 jobDetail 관용구 — 중첩 MethodInvoking 의 targetObject#method 해석 + cron 보존', () => {
    const xml = `<beans>
<bean id="syncJob" class="demo.SyncJob"/>
<bean id="trig" class="org.springframework.scheduling.quartz.CronTriggerFactoryBean">
  <property name="jobDetail">
    <bean class="org.springframework.scheduling.quartz.MethodInvokingJobDetailFactoryBean">
      <property name="targetObject" ref="syncJob"/><property name="targetMethod" value="run"/>
    </bean>
  </property>
  <property name="cronExpression" value="0 0 1 * * ?"/>
</bean>
</beans>`
    const entries = extractXmlBatchEntries(xml, 'c.xml')
    const idx: BeanIndex = new Map()
    collectBeans(xml, 'c.xml', idx)
    const census = {
      schemaVersion: 1 as const,
      gitCommit: null,
      fileCount: 1,
      files: [{ relPath: 'src/demo/SyncJob.java', lang: 'java' }],
    }
    const resolved = resolveBatchHandlers(entries, idx, census)
    expect(resolved.map((e) => [e.handler, e.schedule, e.handlerFile])).toEqual([
      // 첫 </bean> 근사였다면 handler=null·schedule=null(cron 유실)이었다.
      ['syncJob#run', 'cron=0 0 1 * * ?', 'src/demo/SyncJob.java'],
    ])
  })

  it('sliceRoot: slices.json 의 slice.root 와 조인 가능(P3 입력 계약)', async () => {
    const { census, routes, edges, report } = await scan('quartz-xml')
    const slices = buildSlices(census, routes, edges)
    const sliceRoots = new Set(slices.slices.map((s) => s.root))
    for (const j of report.jobs) expect(sliceRoots.has(j.sliceRoot)).toBe(true)
  })
})
