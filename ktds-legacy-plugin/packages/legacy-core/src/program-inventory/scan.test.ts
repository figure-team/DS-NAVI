/**
 * program-inventory 테스트(W3) — mini 픽스처 골든 등가 + jpetstore 수용 기준 + 결정론.
 *
 * 수용 기준(설계 §6): jpetstore 화면 프로그램의 라우트 수 합 = 22(실측 화면설계서와 일치),
 * ILF = db-schema 테이블 수(13) 일치.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { extractRoutes } from '../domain-map/extract.js'
import { extractEdges } from '../domain-map/edges.js'
import { stableJson } from '../domain-map/persist.js'
import { extractJpaModel } from '../jpa/extract.js'
import { extractDbSchema } from '../db-schema/index.js'
import { extractInterfaces } from '../interface-scan/index.js'
import { buildBatchJobs } from '../batch-scan/report.js'
import { buildProgramInventory, type ProgramInventory } from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '..', '..', 'fixtures', 'program-inventory')
const jpetstoreRoot = join(here, '..', '..', '..', '..', '..', 'examples', 'jpetstore-6')

async function scan(root: string): Promise<ProgramInventory> {
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  return buildProgramInventory(root, {
    census,
    routes,
    edges,
    jpaModel: await extractJpaModel(root, census),
    dbSchema: extractDbSchema(root, census),
    interfaces: await extractInterfaces(root, census),
    batchJobs: buildBatchJobs(root, routes.batchEntries, edges, census),
  })
}

describe('program inventory — golden equivalence + 수용 기준', () => {
  it('mini: programs/fp/stats 오라클 일치(유형 전 분기)', async () => {
    const inv = await scan(join(fixturesRoot, 'mini'))
    const oracle = JSON.parse(readFileSync(join(fixturesRoot, 'mini', 'expected.json'), 'utf8'))
    expect(inv.programs).toEqual(oracle.programs)
    expect(inv.fp).toEqual(oracle.fp)
    expect(inv.stats).toEqual(oracle.stats)
  })

  it('mini: FP 집계 — 간이법 가중치 검산(EI1·EQ2·ILF2·EIF1 = 32.2)', async () => {
    const inv = await scan(join(fixturesRoot, 'mini'))
    const s = inv.fp.summary
    expect([s.ei, s.eo, s.eq, s.ilf, s.eif]).toEqual([1, 0, 2, 2, 1])
    expect(s.unadjustedFp).toBe(1 * 4.0 + 2 * 3.9 + 2 * 7.5 + 1 * 5.4)
  })

  it('mini: 안정 id(PGM-<태그>-<hash8>) + 유일 + LOC > 0', async () => {
    const inv = await scan(join(fixturesRoot, 'mini'))
    for (const p of inv.programs) {
      expect(p.id).toMatch(/^PGM-[A-Z]+-[0-9a-f]{8}$/)
      expect(p.loc).toBeGreaterThan(0)
    }
    expect(new Set(inv.programs.map((p) => p.id)).size).toBe(inv.programs.length)
  })

  it('결정론: 동일 입력 2회 실행 → byte-identical', async () => {
    const a = await scan(join(fixturesRoot, 'mini'))
    const b = await scan(join(fixturesRoot, 'mini'))
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it.skipIf(!existsSync(jpetstoreRoot))(
    '수용 기준(jpetstore 실측): 화면 라우트 22 + ILF 13(db-schema 테이블 수 일치)',
    async () => {
      const inv = await scan(jpetstoreRoot)
      // 화면 유형 프로그램들의 route: 노트 합 = 라우트 22(form 21 + servlet 1) — kind api 없음.
      const screenRouteNotes = inv.programs
        .filter((p) => p.type === 'screen')
        .flatMap((p) => p.notes.filter((n) => n.startsWith('route:')))
      expect(screenRouteNotes.length).toBe(22)
      expect(inv.fp.summary.ilf).toBe(13)
      // jpetstore 는 dblink 없음 → EIF 0.
      expect(inv.fp.summary.eif).toBe(0)
    },
  )
})
