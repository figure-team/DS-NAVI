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
interface Oracle {
  description: string
  routes: OracleRoute[]
  batchEntries: unknown[]
}

function loadOracle(fixture: string): Oracle {
  return JSON.parse(readFileSync(join(fixturesRoot, fixture, 'expected.json'), 'utf8'))
}

const cmpKey = (a: { method: string; path: string }, b: { method: string; path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : a.method > b.method ? 1 : 0

async function actualSemanticRoutes(fixture: string): Promise<OracleRoute[]> {
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
    .sort(cmpKey)
}

function normalizeOracle(oracle: Oracle): OracleRoute[] {
  return oracle.routes
    .map((r) => ({ ...r, notes: [...r.notes].sort() }))
    .sort(cmpKey)
}

describe('route extraction — golden equivalence', () => {
  it('spring-basic: 100% recall + precision against oracle', async () => {
    const actual = await actualSemanticRoutes('spring-basic')
    const expected = normalizeOracle(loadOracle('spring-basic'))
    expect(actual).toEqual(expected)
  })

  it('nextjs-app: 100% recall + precision against oracle', async () => {
    const actual = await actualSemanticRoutes('nextjs-app')
    const expected = normalizeOracle(loadOracle('nextjs-app'))
    expect(actual).toEqual(expected)
  })

  it('spring-basic yields both api and form kinds (kind inference)', async () => {
    const actual = await actualSemanticRoutes('spring-basic')
    const kinds = new Set(actual.map((r) => r.kind))
    expect(kinds.has('api')).toBe(true)
    expect(kinds.has('form')).toBe(true)
  })

  it('nextjs-app yields both page and api kinds (2-stack AC-2 surface differs)', async () => {
    const actual = await actualSemanticRoutes('nextjs-app')
    const kinds = new Set(actual.map((r) => r.kind))
    expect(kinds.has('page')).toBe(true)
    expect(kinds.has('api')).toBe(true)
  })

  it('determinism: two runs over spring-basic are byte-identical', async () => {
    const root = join(fixturesRoot, 'spring-basic')
    const census = buildCensus(root)
    const a = stableJson(await extractRoutes(root, census))
    const b = stableJson(await extractRoutes(root, census))
    expect(a).toBe(b)
  })
})
