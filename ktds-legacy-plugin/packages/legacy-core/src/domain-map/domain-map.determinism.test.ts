import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractRoutes } from './extract.js'
import { extractEdges } from './edges.js'
import { buildSlices } from './slices.js'
import { stableJson } from './persist.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')

/**
 * scanDomainMap 의 네 산출물을 파일 쓰기 없이 재현(테스트 격리).
 * dist/.spec 부수효과를 피하려 동일 파이프라인을 in-memory 로 두 번 돌린다.
 */
async function fourReports() {
  const census = buildCensus(shopMini)
  const routes = await extractRoutes(shopMini, census)
  const edges = await extractEdges(shopMini, census)
  const slices = buildSlices(census, routes, edges)
  return { census, routes, edges, slices }
}

describe('domain-map determinism — shop-mini', () => {
  it('two runs yield byte-identical stableJson for all four reports', async () => {
    const a = await fourReports()
    const b = await fourReports()
    expect(stableJson(a.census)).toBe(stableJson(b.census))
    expect(stableJson(a.routes)).toBe(stableJson(b.routes))
    expect(stableJson(a.edges)).toBe(stableJson(b.edges))
    expect(stableJson(a.slices)).toBe(stableJson(b.slices))
  })
})
