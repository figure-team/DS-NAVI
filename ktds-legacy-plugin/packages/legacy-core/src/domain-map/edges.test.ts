import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from './census.js'
import { extractEdges } from './edges.js'
import { stableJson } from './persist.js'
import type { EdgeKind, EdgeRecord } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const syntheticRoot = join(
  here,
  '..',
  '..',
  'fixtures',
  'edge-extraction',
  'synthetic',
)

async function run() {
  const census = buildCensus(syntheticRoot)
  return extractEdges(syntheticRoot, census)
}

/** 특정 kind 의 엣지를 source/target 단순명으로 찾는다. */
function hasEdge(
  edges: EdgeRecord[],
  kind: EdgeKind,
  sourceEndsWith: string,
  targetEndsWith: string,
): boolean {
  return edges.some(
    (e) =>
      e.kind === kind &&
      e.source.endsWith(sourceEndsWith) &&
      e.target.endsWith(targetEndsWith),
  )
}

describe('edge extraction — kind coverage', () => {
  it('produces an import edge (resolved FQN/simple-name)', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'import', 'use/Consumer.java', 'com/ex/Repo.java')).toBe(true)
  })

  it('produces an injection edge for @Autowired field', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'injection', 'com/ex/Svc.java', 'com/ex/Repo.java')).toBe(true)
  })

  it('produces a field-type edge for a plain field', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'field-type', 'com/ex/Svc.java', 'com/ex/Helper.java')).toBe(true)
  })

  it('produces a ctor-param edge', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'ctor-param', 'com/ex/Svc.java', 'com/ex/Audit.java')).toBe(true)
  })

  it('produces an extends edge', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'extends', 'com/ex/Svc.java', 'com/ex/Base.java')).toBe(true)
  })

  it('produces an implements edge', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'implements', 'com/ex/Svc.java', 'com/ex/Greeter.java')).toBe(true)
  })

  it('produces an impl edge (interface -> *Impl)', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'impl', 'com/ex/Greeter.java', 'com/ex/GreeterImpl.java')).toBe(true)
  })

  it('produces a mybatis edge from a SqlSession string call', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'mybatis', 'com/ex/Svc.java', 'com/ex/OrderMapper.java')).toBe(true)
  })

  it('produces a mapper-xml edge from mapper interface to xml', async () => {
    const { edges } = await run()
    expect(hasEdge(edges, 'mapper-xml', 'com/ex/OrderMapper.java', 'com/ex/OrderMapper.xml')).toBe(
      true,
    )
  })

  it('reports unresolved refs (both ambiguous and not-found)', async () => {
    const { unresolved } = await run()
    const reasons = new Set(unresolved.map((u) => u.reason))
    expect(reasons.has('not-found')).toBe(true)
    expect(reasons.has('ambiguous')).toBe(true)
    // ambiguous: Dup 가 두 패키지에 존재하고 import 가 없어 모호.
    expect(unresolved.some((u) => u.ref === 'Dup' && u.reason === 'ambiguous')).toBe(true)
  })

  it('emits all nine edge kinds', async () => {
    const { edges } = await run()
    const kinds = new Set(edges.map((e) => e.kind))
    const expected: EdgeKind[] = [
      'import',
      'injection',
      'field-type',
      'ctor-param',
      'extends',
      'implements',
      'impl',
      'mybatis',
      'mapper-xml',
    ]
    for (const k of expected) expect(kinds.has(k)).toBe(true)
  })

  it('is deterministic — two runs are byte-identical', async () => {
    const a = stableJson(await run())
    const b = stableJson(await run())
    expect(a).toBe(b)
  })

  it('edges are sorted by (source, target, kind, line)', async () => {
    const { edges } = await run()
    const sorted = [...edges].sort((x, y) =>
      x.source < y.source
        ? -1
        : x.source > y.source
          ? 1
          : x.target < y.target
            ? -1
            : x.target > y.target
              ? 1
              : x.kind < y.kind
                ? -1
                : x.kind > y.kind
                  ? 1
                  : (x.line ?? -1) - (y.line ?? -1),
    )
    expect(edges).toEqual(sorted)
  })
})
