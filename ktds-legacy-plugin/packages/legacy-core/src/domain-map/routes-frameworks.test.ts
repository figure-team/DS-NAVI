/**
 * 프레임워크 폭(P1.2) 라우트/배치 추출 골든 등가 테스트.
 *
 * Stripes / web.xml(servlet) / JSP / Batch(Quartz XML + @Scheduled/task:scheduled)
 * 각 픽스처에 대해 extractRoutes 산출을 oracle 의미필드(ids/filePath/line 제외)로
 * 투영해 정렬 후 정확히 일치하는지(100% recall+precision) 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { stableJson } from './persist.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '..', '..', 'fixtures', 'route-extraction')

interface OracleRoute {
  method: string
  path: string
  kind: string
  framework: string
  handler: string | null
  notes: string[]
}
interface OracleBatch {
  trigger: string
  schedule: string | null
  handler: string | null
  filePath: string
  notes: string[]
}
interface Oracle {
  description: string
  routes: OracleRoute[]
  batchEntries: OracleBatch[]
}

function loadOracle(fixture: string): Oracle {
  return JSON.parse(readFileSync(join(fixturesRoot, fixture, 'expected.json'), 'utf8'))
}

const cmpRoute = (a: { method: string; path: string }, b: { method: string; path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : a.method > b.method ? 1 : 0

const cmpBatch = (a: OracleBatch, b: OracleBatch) =>
  a.filePath < b.filePath
    ? -1
    : a.filePath > b.filePath
      ? 1
      : a.handler! < b.handler!
        ? -1
        : a.handler! > b.handler!
          ? 1
          : (a.schedule ?? '') < (b.schedule ?? '')
            ? -1
            : (a.schedule ?? '') > (b.schedule ?? '')
              ? 1
              : 0

async function actualRoutes(fixture: string): Promise<OracleRoute[]> {
  const root = join(fixturesRoot, fixture)
  const census = buildCensus(root)
  const report = await extractRoutes(root, census)
  return report.routes
    .map((r) => ({
      method: r.method,
      path: r.path,
      kind: r.kind,
      framework: r.framework,
      handler: r.handler,
      notes: [...r.notes].sort(),
    }))
    .sort(cmpRoute)
}

async function actualBatch(fixture: string): Promise<OracleBatch[]> {
  const root = join(fixturesRoot, fixture)
  const census = buildCensus(root)
  const report = await extractRoutes(root, census)
  return report.batchEntries
    .map((b) => ({
      trigger: b.trigger,
      schedule: b.schedule,
      handler: b.handler,
      filePath: b.filePath,
      notes: [...b.notes].sort(),
    }))
    .sort(cmpBatch)
}

function normalizeRoutes(oracle: Oracle): OracleRoute[] {
  return oracle.routes.map((r) => ({ ...r, notes: [...r.notes].sort() })).sort(cmpRoute)
}

function normalizeBatch(oracle: Oracle): OracleBatch[] {
  return oracle.batchEntries.map((b) => ({ ...b, notes: [...b.notes].sort() })).sort(cmpBatch)
}

describe('framework breadth — route/batch golden equivalence', () => {
  it('stripes-app: 100% recall + precision against oracle', async () => {
    expect(await actualRoutes('stripes-app')).toEqual(normalizeRoutes(loadOracle('stripes-app')))
  })

  it('webxml-app: servlet routes + addressable JSP match oracle', async () => {
    expect(await actualRoutes('webxml-app')).toEqual(normalizeRoutes(loadOracle('webxml-app')))
  })

  it('jsp-app: page routes match oracle (WEB-INF excluded)', async () => {
    expect(await actualRoutes('jsp-app')).toEqual(normalizeRoutes(loadOracle('jsp-app')))
  })

  it('batch-app: batch entries match oracle (no routes)', async () => {
    expect(await actualRoutes('batch-app')).toEqual(normalizeRoutes(loadOracle('batch-app')))
    expect(await actualBatch('batch-app')).toEqual(normalizeBatch(loadOracle('batch-app')))
  })

  it('stripes-app yields stripes framework + form kind', async () => {
    const routes = await actualRoutes('stripes-app')
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((r) => r.framework === 'stripes' && r.kind === 'form')).toBe(true)
  })

  it('webxml-app yields both webxml servlet and jsp page frameworks', async () => {
    const frameworks = new Set((await actualRoutes('webxml-app')).map((r) => r.framework))
    expect(frameworks.has('webxml')).toBe(true)
    expect(frameworks.has('jsp')).toBe(true)
  })

  it('batch-app yields all batch trigger kinds', async () => {
    const triggers = new Set((await actualBatch('batch-app')).map((b) => b.trigger))
    expect(triggers.has('main')).toBe(true)
    expect(triggers.has('scheduled')).toBe(true)
    expect(triggers.has('quartz')).toBe(true)
    expect(triggers.has('task-xml')).toBe(true)
  })

  it('batch-testsrc: 테스트 소스 main 은 배치 잡에서 제외(프로덕션 main 만)', async () => {
    const batch = await actualBatch('batch-testsrc')
    // 프로덕션 진입점 1건만 — src/test/** 의 main 런처는 배치 잡이 아니다.
    expect(batch.map((b) => b.handler)).toEqual(['AppMain#main'])
    expect(batch.every((b) => !b.filePath.split('/').includes('test'))).toBe(true)
  })

  it('determinism: two runs over batch-app are byte-identical', async () => {
    const root = join(fixturesRoot, 'batch-app')
    const census = buildCensus(root)
    const a = stableJson(await extractRoutes(root, census))
    const b = stableJson(await extractRoutes(root, census))
    expect(a).toBe(b)
  })

  it('determinism: two runs over webxml-app are byte-identical', async () => {
    const root = join(fixturesRoot, 'webxml-app')
    const census = buildCensus(root)
    const a = stableJson(await extractRoutes(root, census))
    const b = stableJson(await extractRoutes(root, census))
    expect(a).toBe(b)
  })
})
