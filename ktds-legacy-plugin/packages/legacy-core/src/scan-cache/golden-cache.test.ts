import { describe, it, expect } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanDomainMap } from '../domain-map/extract.js'
import { SCAN_CACHE_FILENAME } from './index.js'

/**
 * W8 골든 캐시 크로스버전 회귀(비평 C1) — salt 수동 bump 규약의 테스트 강제 장치.
 *
 * 커밋된 골든 캐시(과거 코드가 기록한 scan-facts.json)를 깔고 스캔한 산출물이,
 * 캐시 없이 스캔한 산출물과 byte-diff=0 이어야 한다.
 *
 *  - 추출기 팩트의 형태/의미를 바꾸고 **salt 를 bump 하지 않으면**: 골든의 낡은 팩트가
 *    재사용되어 여기서 깨진다(현장에서만 터질 침묵 stale 을 CI 로 끌어옴).
 *  - salt 를 정당하게 bump 하면: 골든 섹션이 통째로 폐기(미스)되어 자동 통과한다.
 *    이후 골든을 현행화하려면: W8_REGEN_GOLDEN=1 vitest run src/scan-cache/golden-cache.test.ts
 *    (아래 재생성 케이스가 fixtures/w8-golden/scan-facts.json 을 다시 쓴다 — 커밋할 것.)
 */
const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(here, '..', '..', 'fixtures', 'w8-golden')
const GOLDEN_PROJECT = join(FIXTURE_DIR, 'project')
const GOLDEN_CACHE = join(FIXTURE_DIR, 'scan-facts.json')

function snapshotMap(root: string): Record<string, string> {
  const dir = join(root, '.spec', 'map')
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir).sort()) {
    try {
      out[name] = readFileSync(join(dir, name), 'utf8')
    } catch {
      /* 하위 디렉터리 제외 */
    }
  }
  return out
}

/** 픽스처 프로젝트를 tmp 로 복사(원본 불변·격리). */
function stageProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'w8-golden-'))
  cpSync(GOLDEN_PROJECT, root, { recursive: true })
  return root
}

describe('W8 골든 캐시 — salt bump 없는 팩트 스키마 변경을 CI 에서 잡는다', () => {
  it('골든 캐시 재생(과거 기록 × 현재 코드) == 캐시 없는 full, byte-diff=0', async () => {
    if (process.env.W8_REGEN_GOLDEN) {
      // 재생성 모드: 현재 코드로 골든 캐시를 다시 굽는다(정당한 salt bump 후 1회).
      const root = stageProject()
      try {
        await scanDomainMap(root)
        cpSync(join(root, '.spec', 'cache', SCAN_CACHE_FILENAME), GOLDEN_CACHE)
        console.log(`[w8-golden] 골든 캐시 재생성 완료 — ${GOLDEN_CACHE} 커밋하세요.`)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
      return
    }

    expect(existsSync(GOLDEN_CACHE), 'fixtures/w8-golden/scan-facts.json 부재 — W8_REGEN_GOLDEN=1 로 생성').toBe(true)

    // (a) 골든 캐시를 깔고 스캔.
    const withCache = stageProject()
    // (b) 캐시 없이 스캔.
    const noCache = stageProject()
    try {
      mkdirSync(join(withCache, '.spec', 'cache'), { recursive: true })
      cpSync(GOLDEN_CACHE, join(withCache, '.spec', 'cache', SCAN_CACHE_FILENAME))
      const cached = await scanDomainMap(withCache)
      await scanDomainMap(noCache)

      expect(snapshotMap(withCache)).toEqual(snapshotMap(noCache))
      // 골든이 실제로 소비됐는지(전건 미스면 이 테스트는 아무것도 검증 못 한다) —
      // salt 를 정당하게 bump 한 직후라면 여기가 깨지므로 골든 재생성 신호가 된다.
      expect(cached.scanCache.statsSummary().reused, 'salt bump 후 골든 미재생성? W8_REGEN_GOLDEN=1 로 현행화').toBeGreaterThan(0)
    } finally {
      rmSync(withCache, { recursive: true, force: true })
      rmSync(noCache, { recursive: true, force: true })
    }
  })

  it('캐시 팩트 JSON 왕복 무손실 — 세션 간(JSON) vs 세션 내(structuredClone) 동형(리뷰 R4)', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_CACHE, 'utf8'))
    for (const [name, section] of Object.entries(golden.sections) as Array<[string, { entries: Record<string, { value: unknown }> }]>) {
      for (const [rel, entry] of Object.entries(section.entries)) {
        const roundTrip = JSON.parse(JSON.stringify(structuredClone(entry.value)))
        expect(roundTrip, `${name}:${rel} 팩트에 JSON 비직렬화 값(undefined/Map/Set/NaN) 혼입`).toEqual(entry.value)
      }
    }
  })
})
