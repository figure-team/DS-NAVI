#!/usr/bin/env node
/**
 * qa-golden-score.mjs — W10 LLM 보강 산출물 정확도 채점 + 기준선 회귀.
 *
 * 사용:
 *   qa-golden-score.mjs <projectRoot> [--update-baseline] [--update-golden]
 *
 * 후보 = <projectRoot>/.understand-anything/{domain-graph,rtm}.json
 * 골든/기준선 = packages/legacy-core/fixtures/golden/jpetstore/
 *
 * 지표 3종(설계 GOLDEN_SET_DESIGN.md): 구조 일치율·근거 유효율·핵심 항목 재현율.
 * 회귀 판정: 지표가 기준선 대비 0.1%p 초과 하락 → FAIL(exit 1). 상승/동일 → PASS.
 * `--update-baseline` 은 사람 결정 게이트(현재 점수를 기준선으로 기록).
 * `--update-golden` 은 후보를 골든으로 동결(사람 검수 후에만).
 * 정직성: 산출물 부재는 0점이 아니라 명시 스킵. 기준선 자체의 "골든 == 후보 → 구조·
 * 재현율 100%" 자명성은 설계 §3.3 에 명시 — 가치는 이후 변경분의 회귀 감지에 있다.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
const GOLDEN_DIR = join(here, '..', 'packages', 'legacy-core', 'fixtures', 'golden', 'jpetstore')
const BASELINE = join(GOLDEN_DIR, 'baseline.json')

if (!existsSync(distEntry)) {
  console.error('엔진 미빌드: pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const projectRoot = process.argv[2]
if (!projectRoot) {
  console.error('사용법: qa-golden-score.mjs <projectRoot> [--update-baseline] [--update-golden]')
  process.exit(2)
}
const flags = process.argv.slice(3)
const engine = await import(distEntry)

/** 지표 하락 허용 오차(%p) — 부동소수 잡음 방지. */
const EPSILON = 0.001

const ARTIFACTS = [
  { kind: 'domain-graph', file: 'domain-graph.json' },
  { kind: 'rtm', file: 'rtm.json' },
]

const pct = (r) => (r === null ? '—(측정 불가)' : `${(r * 100).toFixed(2)}%`)
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const scores = {}
const skipped = []
for (const { kind, file } of ARTIFACTS) {
  const candidatePath = join(projectRoot, '.understand-anything', file)
  const goldenPath = join(GOLDEN_DIR, file)
  if (!existsSync(candidatePath)) {
    skipped.push(`${kind}(후보 부재: ${candidatePath})`)
    continue
  }
  if (!existsSync(goldenPath)) {
    skipped.push(`${kind}(골든 부재 — --update-golden 으로 동결 필요)`)
    continue
  }
  if (flags.includes('--update-golden')) cpSync(candidatePath, goldenPath)
  const golden = readJson(goldenPath)
  const candidate = readJson(candidatePath)
  const s = engine.scoreGoldenArtifact(kind, golden, candidate, projectRoot)
  scores[kind] = s
  console.log(`── ${kind}`)
  console.log(`  구조 일치율   : ${pct(s.structure.rate)} (${s.structure.matched}/${s.structure.total})`)
  console.log(`  근거 유효율   : ${pct(s.citations.rate)} (${s.citations.valid}/${s.citations.total})`)
  console.log(`  핵심 재현율   : ${pct(s.recall.rate)} (${s.recall.found}/${s.recall.total})`)
  for (const m of s.structure.missingSamples.slice(0, 5)) console.log(`    ✗ 구조: ${m.key} — ${m.reason}`)
  for (const m of s.citations.invalidSamples.slice(0, 5)) console.log(`    ✗ 인용: ${m.file}:${m.line ?? '?'} — ${m.reason}`)
  for (const m of s.recall.missingSamples.slice(0, 5)) console.log(`    ✗ 재현 누락: [${m.kind}] ${m.text}`)
}
for (const s of skipped) console.log(`  (스킵) ${s}`)

// ── 기준선 비교/갱신 ────────────────────────────────────────────────────────
const metricsOf = (s) => ({ structure: s.structure.rate, citations: s.citations.rate, recall: s.recall.rate })
const current = Object.fromEntries(Object.entries(scores).map(([k, s]) => [k, metricsOf(s)]))

if (flags.includes('--update-baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ schemaVersion: 1, metrics: current }, null, 2) + '\n', 'utf8')
  console.log(`\n기준선 갱신 완료 — ${BASELINE}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.log('\n기준선 없음 — --update-baseline 으로 먼저 기록하세요(비교 없이 종료).')
  process.exit(2)
}
const baseline = readJson(BASELINE)
let regressions = 0
console.log('\n── 기준선 대비(회귀 판정)')
for (const [kind, base] of Object.entries(baseline.metrics ?? {})) {
  const cur = current[kind]
  if (!cur) {
    console.error(`  ✗ ${kind}: 기준선엔 있는데 이번 채점에서 스킵됨 — 회귀로 간주`)
    regressions++
    continue
  }
  for (const metric of ['structure', 'citations', 'recall']) {
    const b = base[metric]
    const c = cur[metric]
    if (b === null || b === undefined) continue // 기준선이 측정 불가였던 지표는 비교 밖.
    if (c === null || c - b < -EPSILON) {
      console.error(`  ✗ ${kind}.${metric}: ${pct(b)} → ${pct(c)} 하락`)
      regressions++
    } else {
      console.log(`  ✓ ${kind}.${metric}: ${pct(b)} → ${pct(c)}`)
    }
  }
}

console.log('')
if (regressions > 0) {
  console.error(`FAIL — 기준선 대비 회귀 ${regressions}건 (의도된 개선이면 --update-baseline 으로 갱신)`)
  process.exit(1)
}
console.log('PASS — 기준선 대비 회귀 없음')
