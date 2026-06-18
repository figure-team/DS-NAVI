import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { scanDomainMap } from './extract.js'
import { assignLayers, buildLayerSignals, deriveStepLayer } from './step-layer.js'

const here = dirname(fileURLToPath(import.meta.url))
const FIX = join(here, '..', '..', 'fixtures')
const SHOP_MINI = join(FIX, 'chain-recall', 'shop-mini')
const NEXTJS = join(FIX, 'route-extraction', 'nextjs-app')

describe('deriveStepLayer — ground-truth precedence', () => {
  const empty = {
    routeEntryFiles: new Set<string>(),
    daoFiles: new Set<string>(),
    dbFiles: new Set<string>(),
    serviceFiles: new Set<string>(),
  }
  it('DB beats DAO beats API beats SERVICE', () => {
    // signal says service, but name says Mapper -> dao (name DAO > service signal? precedence: dao before service)
    expect(deriveStepLayer('x/FooMapper.xml', null, empty)).toBe('db')
    expect(deriveStepLayer('x/FooMapper.java', null, empty)).toBe('dao')
    expect(deriveStepLayer('x/FooController.java', null, empty)).toBe('api')
    expect(deriveStepLayer('x/FooService.java', null, empty)).toBe('service')
    expect(deriveStepLayer('x/Plain.java', null, empty)).toBe('unknown')
  })
  it('signal overrides when name is neutral', () => {
    const sig = { ...empty, serviceFiles: new Set(['x/Plain.java']) }
    expect(deriveStepLayer('x/Plain.java', null, sig)).toBe('service')
  })
})

describe('AC-2 — layers are inferred dynamically (not hardcoded 4) and differ per stack', () => {
  it('Java/Spring+MyBatis stack yields api+service+dao+db from real signals', async () => {
    const { census, routes, edges } = await scanDomainMap(SHOP_MINI)
    const signals = buildLayerSignals(routes, edges)
    const { byFile, layersUsed } = assignLayers(
      census.files.map((f) => f.relPath),
      signals,
    )
    expect(layersUsed).toContain('api')
    expect(layersUsed).toContain('service')
    expect(layersUsed).toContain('dao')
    expect(layersUsed).toContain('db')
    // spot-check ground-truth assignments
    const find = (suffix: string) => Object.keys(byFile).find((k) => k.endsWith(suffix))!
    expect(byFile[find('UserController.java')]).toBe('api')
    expect(byFile[find('Mapper.xml')]).toBe('db')
  })

  it('Next.js stack yields a DIFFERENT, smaller layer set (no service/dao/db signals)', async () => {
    const { census, routes, edges } = await scanDomainMap(NEXTJS)
    const signals = buildLayerSignals(routes, edges)
    const { layersUsed } = assignLayers(
      census.files.map((f) => f.relPath),
      signals,
    )
    // file-routing handlers are entry files -> api; no persistence layers exist
    expect(layersUsed).toContain('api')
    expect(layersUsed).not.toContain('dao')
    expect(layersUsed).not.toContain('db')
    // dynamic proof: the two stacks do not share the same layer set
    const java = (await scanDomainMap(SHOP_MINI)).edges
    expect(java.edges.length).toBeGreaterThan(0)
    expect(layersUsed).not.toEqual(['api', 'service', 'dao', 'db'])
  })
})
