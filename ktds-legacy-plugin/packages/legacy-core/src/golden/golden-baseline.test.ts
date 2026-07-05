import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GOLDEN_SCORER_VERSION, scoreGoldenArtifact } from './index.js'

/**
 * W10 게이트의 스위트 내 배선(비평 C3/리뷰 R5·R6) — 수동 qa 스크립트에만 의존하면
 * 회귀 게이트가 "사람이 기억할 때만" 발효된다. 이 테스트가 `pnpm test`(CI) 마다:
 *   1) 실 골든 픽스처 × 실 레포(examples/jpetstore-6)로 채점기 종합 경로를 돌리고
 *   2) 결과가 baseline.json 과 일치함을 단언한다 —
 * 픽스처 파손·채점기 로직 회귀·baseline 드리프트가 스위트에서 바로 깨진다.
 * (LLM 재생성물 상대 채점은 qa-golden-score.mjs — 재생성 워크플로는 설계 §5.)
 */
const here = dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = join(here, '..', '..', 'fixtures', 'golden', 'jpetstore')
const EXAMPLE_ROOT = join(here, '..', '..', '..', '..', '..', 'examples', 'jpetstore-6')

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

describe('golden 기준선 — 스위트 내 회귀 게이트', () => {
  it('실 골든 자기채점(domain-graph·rtm)이 baseline.json 과 일치한다', () => {
    expect(existsSync(join(GOLDEN_DIR, 'baseline.json'))).toBe(true)
    const baseline = readJson(join(GOLDEN_DIR, 'baseline.json'))
    expect(baseline.scorerVersion, 'baseline 채점기 버전 불일치 — qa-golden-score --update-baseline --yes 로 재기준선').toBe(
      GOLDEN_SCORER_VERSION,
    )
    for (const kind of ['domain-graph', 'rtm'] as const) {
      const golden = readJson(join(GOLDEN_DIR, `${kind}.json`))
      const s = scoreGoldenArtifact(kind, golden, golden, EXAMPLE_ROOT)
      const base = baseline.metrics[kind]
      expect(s.structure.rate, `${kind} 구조`).toBe(base.structure)
      expect(s.citations.rate, `${kind} 인용 위치 유효율`).toBe(base.citations)
      expect(s.recall.rate, `${kind} 재현율`).toBe(base.recall)
      expect(s.citations.total, `${kind} 인용 개수(커버리지)`).toBe(base.citationCount)
      expect(s.structure.extras, `${kind} 초과 단위`).toBe(base.extras)
    }
  })

  it('실 골든 규모 스팟체크 — 수집기가 인용을 통으로 놓치면 여기서 깨진다', () => {
    const g = readJson(join(GOLDEN_DIR, 'domain-graph.json'))
    const r = readJson(join(GOLDEN_DIR, 'rtm.json'))
    const sg = scoreGoldenArtifact('domain-graph', g, g, EXAMPLE_ROOT)
    const sr = scoreGoldenArtifact('rtm', r, r, EXAMPLE_ROOT)
    // 고유(dedupe) 인용 위치 기준 — 실측 290/64(원시 764/246에서 중복 제거).
    expect(sg.citations.total).toBeGreaterThan(200)
    expect(sr.citations.total).toBeGreaterThan(50)
    expect(sg.structure.total).toBeGreaterThan(50)
    expect(sr.structure.total).toBeGreaterThan(50)
  })
})
