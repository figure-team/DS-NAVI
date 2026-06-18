import { describe, it, expect } from 'vitest'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'

const here = dirname(fileURLToPath(import.meta.url))
const RX = join(here, '..', '..', 'fixtures', 'route-extraction')

/**
 * AC-9 grounding regression: source-grounded frameworks must carry a real
 * declaration anchor (filePath + line > 0). FS-routing frameworks (nextjs/jsp)
 * have no declaration site, so line is a documented placeholder and excluded here.
 */
const GROUNDED = ['spring-basic', 'stripes-app', 'webxml-app', 'batch-app']

describe('AC-9 — grounded frameworks carry file:line anchors', () => {
  for (const fixture of GROUNDED) {
    it(`${fixture}: every route has filePath + line>0`, async () => {
      const dir = join(RX, fixture)
      const census = await buildCensus(dir)
      const routes = await extractRoutes(dir, census)
      // at least one of routes/batchEntries should be produced
      expect(routes.routes.length + routes.batchEntries.length).toBeGreaterThan(0)
      for (const r of routes.routes) {
        expect(r.filePath, `${fixture} route ${r.routeId} filePath`).toBeTruthy()
        expect(r.line, `${fixture} route ${r.routeId} line`).toBeGreaterThan(0)
      }
      for (const b of routes.batchEntries) {
        expect(b.filePath, `${fixture} batch ${b.entryId} filePath`).toBeTruthy()
        expect(b.line, `${fixture} batch ${b.entryId} line`).toBeGreaterThan(0)
      }
    })
  }
})
