/**
 * risk-report 테스트(W4) — mini 픽스처 골든 등가 + 정규화/합산 검산 + 결정론(설계 §7).
 * churn 은 고정 주입(픽스처가 본 레포 이력에 오염되면 비결정 — 수집기는 churn.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCensus } from '../domain-map/census.js'
import { extractRoutes } from '../domain-map/extract.js'
import { extractEdges } from '../domain-map/edges.js'
import { buildSlices } from '../domain-map/slices.js'
import { buildCandidates } from '../domain-map/classify.js'
import { stableJson } from '../domain-map/persist.js'
import { buildProgramInventory } from '../program-inventory/index.js'
import { buildRiskReport, collectGitChurn, type RiskReport, type ChurnMap } from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, '..', '..', 'fixtures', 'risk-report')
const jpetstoreRoot = join(here, '..', '..', '..', '..', '..', 'examples', 'jpetstore-6')

/** mini 고정 churn — service 가 최다 변경(위험 1위 시나리오), orphan 은 이력 없음(0). */
const MINI_CHURN: ChurnMap = new Map([
  ['src/main/java/demo/service/OrderService.java', { commits: 10, linesChanged: 500 }],
  ['src/main/java/demo/web/OrderController.java', { commits: 3, linesChanged: 40 }],
  ['src/main/java/demo/dao/OrderDao.java', { commits: 1, linesChanged: 5 }],
  ['src/main/webapp/order/list.jsp', { commits: 2, linesChanged: 12 }],
])

async function scan(root: string, churn: ChurnMap | null): Promise<RiskReport> {
  const census = buildCensus(root)
  const routes = await extractRoutes(root, census)
  const edges = await extractEdges(root, census)
  const slices = buildSlices(census, routes, edges)
  const programInventory = buildProgramInventory(root, {
    census,
    routes,
    edges,
    candidates: buildCandidates(census, routes, slices),
  })
  return buildRiskReport(root, { census, edges, slices, programInventory, churn })
}

describe('risk report — 골든 등가 + 검산', () => {
  it('mini: 오라클 일치(items/stats/meta)', async () => {
    const rr = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    const oracle = JSON.parse(readFileSync(join(fixturesRoot, 'mini', 'expected.json'), 'utf8'))
    expect(rr.items).toEqual(oracle.items)
    expect(rr.stats).toEqual(oracle.stats)
    expect(rr.meta).toEqual(oracle.meta)
  })

  it('mini: 복잡도 실측 — service 12(결정포인트 10+메서드 2), controller 3, orphan 1', async () => {
    const rr = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    const byName = new Map(rr.items.map((it) => [it.name, it]))
    expect(byName.get('OrderService')?.metrics.complexity).toBe(12)
    expect(byName.get('OrderController')?.metrics.complexity).toBe(3)
    expect(byName.get('OrphanHelper')?.metrics.complexity).toBe(1)
    // jsp 는 미측정 — null + [미확인] 노트(침묵 누락 금지).
    const jsp = byName.get('list')
    expect(jsp?.metrics.complexity).toBeNull()
    expect(jsp?.notes.some((n) => n.includes('[미확인] 복잡도 미측정'))).toBe(true)
  })

  it('mini: 문서 코드 예제 xml(xdoc)은 매퍼 오분류 없이 랭킹에서 제외(W4 오탐 회귀)', async () => {
    const rr = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    expect(rr.items.some((it) => it.filePath.startsWith('src/site/'))).toBe(false)
  })

  it('mini: 최다 변경+최고 복잡도인 service 가 1위, 미도달 orphan 은 unreached 플래그', async () => {
    const rr = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    expect(rr.items[0].name).toBe('OrderService')
    const orphan = rr.items.find((it) => it.name === 'OrphanHelper')
    expect(orphan?.metrics.unreached).toBe(true)
    expect(rr.stats.unreached).toBeGreaterThanOrEqual(1)
  })

  it('mini: score = 측정 지표 가중합/가중치합(재정규화) — 전 항목 검산', async () => {
    const rr = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    for (const it of rr.items) {
      const entries: Array<[keyof typeof rr.meta.weights, number]> = [
        ['loc', it.normalized.loc],
        ['fanIn', it.normalized.fanIn],
        ['fanOut', it.normalized.fanOut],
        ['unreached', it.normalized.unreached],
      ]
      if (it.normalized.complexity !== null) entries.push(['complexity', it.normalized.complexity])
      if (it.normalized.churn !== null) entries.push(['churn', it.normalized.churn])
      const wSum = entries.reduce((s, [k]) => s + rr.meta.weights[k], 0)
      const expected = entries.reduce((s, [k, v]) => s + rr.meta.weights[k] * v, 0) / wSum
      expect(Math.abs(it.score - expected)).toBeLessThan(0.0001)
      expect(it.score).toBeGreaterThanOrEqual(0)
      expect(it.score).toBeLessThanOrEqual(1)
    }
  })

  it('mini: churn=null(git 불가) → churnAvailable=false + 전 항목 [미확인]', async () => {
    const rr = await scan(join(fixturesRoot, 'mini'), null)
    expect(rr.meta.churnAvailable).toBe(false)
    expect(rr.stats.measured.churn).toBe(0)
    for (const it of rr.items) {
      expect(it.metrics.churnCommits).toBeNull()
      expect(it.normalized.churn).toBeNull()
      expect(it.notes.some((n) => n.includes('git 이력 없음'))).toBe(true)
    }
  })

  it('결정론: 동일 입력 2회 실행 → byte-identical', async () => {
    const a = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    const b = await scan(join(fixturesRoot, 'mini'), MINI_CHURN)
    expect(stableJson(a)).toBe(stableJson(b))
  })

  it.skipIf(!existsSync(jpetstoreRoot))(
    '수용 기준(jpetstore 실측): 랭킹 산출 + 복잡도/churn 측정 + 동일 커밋 결정론',
    async () => {
      const churn = collectGitChurn(jpetstoreRoot)
      const rr = await scan(jpetstoreRoot, churn)
      expect(rr.stats.programs).toBeGreaterThan(0)
      expect(rr.stats.measured.complexity).toBeGreaterThan(0)
      // vendored 경로는 본 레포 이력 — churn 이 실측된다(HEAD 앵커 결정론).
      expect(rr.meta.churnAvailable).toBe(true)
      expect(rr.items.some((it) => (it.metrics.churnCommits ?? 0) > 0)).toBe(true)
      // 정렬 결정론: score desc, filePath asc.
      for (let i = 1; i < rr.items.length; i++) {
        const prev = rr.items[i - 1]
        const cur = rr.items[i]
        expect(
          prev.score > cur.score || (prev.score === cur.score && prev.filePath < cur.filePath),
        ).toBe(true)
      }
      const again = await scan(jpetstoreRoot, collectGitChurn(jpetstoreRoot))
      expect(stableJson(again)).toBe(stableJson(rr))
    },
  )
})
