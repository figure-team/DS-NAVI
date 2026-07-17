import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { extractRoutes } from '../domain-map/extract.js'
import { extractEdges } from '../domain-map/edges.js'
import { buildSlices } from '../domain-map/slices.js'
import { buildCandidates } from '../domain-map/classify.js'
import { buildAutoPlan } from '../domain-map/confirm.js'
import { buildSkeleton } from '../domain-map/skeleton.js'
import { emitDomainGraph } from '../domain-map/emit.js'
import { exportCrudMatrix } from './crud-export.js'

const here = dirname(fileURLToPath(import.meta.url))
const shopMini = join(here, '..', '..', 'fixtures', 'chain-recall', 'shop-mini')

/** shop-mini 픽스처 → 실제 skeleton → root 에 domain-graph.json emit. */
async function emitGraphInto(root: string): Promise<void> {
  const census = buildCensus(shopMini)
  const routes = await extractRoutes(shopMini, census)
  const edges = await extractEdges(shopMini, census)
  const slices = buildSlices(census, routes, edges)
  const candidates = buildCandidates(census, routes, slices)
  const plan = buildAutoPlan(candidates)
  const skeleton = await buildSkeleton(shopMini, { census, routes, edges, slices, candidates, plan })
  emitDomainGraph(root, skeleton)
}

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ktds-crud-export-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('exportCrudMatrix — .spec/map/crud-matrix.json', () => {
  it('도메인 그래프가 없으면 null(조용한 빈 산출 금지)', () => {
    expect(exportCrudMatrix(root)).toBeNull()
    expect(existsSync(join(root, '.spec', 'map', 'crud-matrix.json'))).toBe(false)
  })

  it('그래프가 있으면 열/행을 가진 구조화 표를 쓴다', async () => {
    await emitGraphInto(root)
    const result = exportCrudMatrix(root)

    expect(result).not.toBeNull()
    expect(result!.columns).toBeGreaterThan(0)
    expect(result!.rows).toBeGreaterThan(0)

    const parsed = JSON.parse(await readFile(result!.outPath, 'utf8')) as {
      schemaVersion: number
      gitCommit: string | null
      columns: unknown[]
      rows: Array<{ cells: string[] }>
    }
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.columns.length).toBe(result!.columns)
    expect(parsed.rows.length).toBe(result!.rows)
    // 첫 열은 기능명 — 모든 행이 이름을 갖는다(빈 표 금지).
    expect(parsed.rows.every((r) => r.cells[0].length > 0)).toBe(true)
  })

  it('스탬프는 상류 그래프의 생성 커밋을 승계한다(HEAD 가 아니라)', async () => {
    await emitGraphInto(root)
    const graphPath = join(root, '.understand-anything', 'domain-graph.json')
    const graph = JSON.parse(await readFile(graphPath, 'utf8'))
    graph.ktdsMap = { generatedFromCommit: 'deadbeef' }
    await writeFile(graphPath, JSON.stringify(graph), 'utf8')

    exportCrudMatrix(root)
    const parsed = JSON.parse(await readFile(join(root, '.spec', 'map', 'crud-matrix.json'), 'utf8'))
    expect(parsed.gitCommit).toBe('deadbeef')
  })

  it('결정론 — 두 번 실행하면 byte-identical', async () => {
    await emitGraphInto(root)
    exportCrudMatrix(root)
    const first = await readFile(join(root, '.spec', 'map', 'crud-matrix.json'), 'utf8')
    exportCrudMatrix(root)
    const second = await readFile(join(root, '.spec', 'map', 'crud-matrix.json'), 'utf8')
    expect(second).toBe(first)
  })

  it('산출물 백업 디렉터리의 mapper XML 을 긁지 않는다(census 와 동일 skip 규약)', async () => {
    await emitGraphInto(root)
    // `.spec.bak-*` 안에 그럴듯한 mapper XML 을 심는다 — 정확일치 SKIP 이던 시절엔 걸어 들어갔다.
    const bak = join(root, '.spec.bak-1784231904', 'map')
    await mkdir(bak, { recursive: true })
    await writeFile(
      join(bak, 'GhostMapper.xml'),
      '<?xml version="1.0"?><!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">' +
        '<mapper namespace="ghost.GhostMapper"><select id="selectGhost">SELECT * FROM GHOST_TABLE</select></mapper>',
      'utf8',
    )

    exportCrudMatrix(root)
    const raw = await readFile(join(root, '.spec', 'map', 'crud-matrix.json'), 'utf8')
    expect(raw).not.toContain('GHOST_TABLE')
    expect(raw).not.toContain('ghost')
  })
})
