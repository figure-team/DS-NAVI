#!/usr/bin/env node
/**
 * qa-golden-score.mjs — W10 LLM 보강 산출물 정확도 채점 + 기준선 회귀 게이트.
 *
 * 사용:
 *   qa-golden-score.mjs <projectRoot>                       # 채점 + 기준선 회귀 판정
 *   qa-golden-score.mjs <projectRoot> --update-baseline --yes
 *   qa-golden-score.mjs <projectRoot> --update-golden --yes # (--update-baseline 과 동시 금지)
 *
 * 후보 = <projectRoot>/.understand-anything/{domain-graph,rtm}.json
 * 골든/기준선 = packages/legacy-core/fixtures/golden/jpetstore/
 *
 * 지표(설계 GOLDEN_SET_DESIGN.md, 리뷰 반영 §8):
 *   - 구조 일치율 · 근거 위치 유효율 · 핵심 재현율 (비율 3종)
 *   - 인용 절대 개수(커버리지) · 초과 단위(정밀도 신호)
 * 회귀 판정:
 *   FAIL — 비율 하락(>0.1%p) · 측정 불가 전환 · 기준선 null→측정 가능 전환(재기준선 필요)
 *          · 인용 개수 10% 초과 감소(적게-내고-전부-유효 경로 차단, 비평 C2)
 *   WARN — 인용 개수 소폭 감소(≤10%) · 초과 단위 증가(날조 추가 신호, 비평 C1 —
 *          정당한 성장일 수 있어 FAIL 은 아님, 수동 리뷰 대상)
 * 거버넌스(비평 C4): 갱신 플래그는 --yes 2차 확인 필수 + diff 요약 출력,
 *   --update-golden 과 --update-baseline 동시 사용 금지(원커맨드 정답 리베이스 차단).
 * 정직성: "근거 위치 유효율"은 인용이 실존 지점(파일·라인·스니펫 근방)을 가리키는지의
 *   검증이지 서술의 진위 검증이 아니다(비평 C5). 산출물 부재는 0점이 아니라 명시 스킵.
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
if (!projectRoot || projectRoot.startsWith('--')) {
  console.error('사용법: qa-golden-score.mjs <projectRoot> [--update-baseline|--update-golden] [--yes]')
  process.exit(2)
}
const flags = process.argv.slice(3)
const engine = await import(distEntry)

/** 비율 하락 허용 오차(%p 아님, 비율) — 부동소수 잡음 방지. */
const EPSILON = 0.001
/** 인용 개수 감소 FAIL 임계(비평 C2) — 이하 감소는 WARN. */
const CITATION_DROP_FAIL = 0.1

const ARTIFACTS = [
  { kind: 'domain-graph', file: 'domain-graph.json' },
  { kind: 'rtm', file: 'rtm.json' },
]

const pct = (r) => (r === null || r === undefined ? '—(측정 불가)' : `${(r * 100).toFixed(2)}%`)
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch (err) {
    console.error(`손상/판독 불가 JSON: ${p} — ${err.message}`)
    process.exit(2)
  }
}

// ── 갱신 플래그 거버넌스(비평 C4) ───────────────────────────────────────────
const updGolden = flags.includes('--update-golden')
const updBaseline = flags.includes('--update-baseline')
if (updGolden && updBaseline) {
  console.error('--update-golden 과 --update-baseline 동시 사용 금지 — 골든 갱신·검수 후 별도 실행으로 기준선을 갱신하세요.')
  process.exit(2)
}
if ((updGolden || updBaseline) && !flags.includes('--yes')) {
  console.error('갱신은 사람 결정 게이트 — --yes 를 명시해야 실행합니다(diff 요약을 먼저 확인하세요).')
  process.exit(2)
}

// ── 채점 ───────────────────────────────────────────────────────────────────
const scores = {}
const skipped = []
for (const { kind, file } of ARTIFACTS) {
  const candidatePath = join(projectRoot, '.understand-anything', file)
  const goldenPath = join(GOLDEN_DIR, file)
  if (!existsSync(candidatePath)) {
    skipped.push(`${kind}(후보 부재: ${candidatePath})`)
    continue
  }
  if (!existsSync(goldenPath) && !updGolden) {
    skipped.push(`${kind}(골든 부재 — --update-golden --yes 로 동결 필요)`)
    continue
  }
  if (updGolden) {
    // diff 요약(단위/인용 수 변화)을 보여주고 동결 — 그 회차 비교는 자명 100%라 생략.
    const candidate = readJson(candidatePath)
    const cu = kind === 'domain-graph' ? engine.extractDomainGraphUnits(candidate) : engine.extractRtmUnits(candidate)
    const cc = engine.collectCitations(candidate)
    if (existsSync(goldenPath)) {
      const golden = readJson(goldenPath)
      const gu = kind === 'domain-graph' ? engine.extractDomainGraphUnits(golden) : engine.extractRtmUnits(golden)
      const gc = engine.collectCitations(golden)
      console.log(`── ${kind} 골든 갱신 diff: 단위 ${gu.length}→${cu.length} · 인용 ${gc.length}→${cc.length}`)
    } else {
      console.log(`── ${kind} 골든 신규 동결: 단위 ${cu.length} · 인용 ${cc.length}`)
    }
    cpSync(candidatePath, goldenPath)
    continue
  }
  const golden = readJson(goldenPath)
  const candidate = readJson(candidatePath)
  const s = engine.scoreGoldenArtifact(kind, golden, candidate, projectRoot)
  scores[kind] = s
  console.log(`── ${kind}`)
  console.log(`  구조 일치율        : ${pct(s.structure.rate)} (${s.structure.matched}/${s.structure.total})`)
  console.log(`  근거 위치 유효율   : ${pct(s.citations.rate)} (${s.citations.valid}/${s.citations.total}) — 인용 실존성(서술 진위 아님)`)
  console.log(`  핵심 재현율        : ${pct(s.recall.rate)} (${s.recall.found}/${s.recall.total})`)
  console.log(`  초과 단위(정밀도)  : ${s.structure.extras}개 — 골든에 없는 후보 단위(날조/성장 수동 리뷰)`)
  for (const m of s.structure.missingSamples.slice(0, 5)) console.log(`    ✗ 구조: ${m.key} — ${m.reason}`)
  for (const m of s.citations.invalidSamples.slice(0, 5)) console.log(`    ✗ 인용: ${m.file}:${m.line ?? '?'} — ${m.reason}`)
  for (const m of s.recall.missingSamples.slice(0, 5)) console.log(`    ✗ 재현 누락: [${m.kind}] ${m.text}`)
  for (const k of s.structure.extrasSamples.slice(0, 5)) console.log(`    ⚠ 초과: ${k}`)
}
for (const s of skipped) console.log(`  (스킵) ${s}`)
if (updGolden) {
  console.log('\n골든 갱신 완료 — 사람 검수 후 별도 실행으로 기준선을 갱신하세요: --update-baseline --yes')
  process.exit(0)
}

// ── 기준선 비교/갱신 ────────────────────────────────────────────────────────
const metricsOf = (s) => ({
  structure: s.structure.rate,
  citations: s.citations.rate,
  recall: s.recall.rate,
  citationCount: s.citations.total,
  extras: s.structure.extras,
})
const current = Object.fromEntries(Object.entries(scores).map(([k, s]) => [k, metricsOf(s)]))

if (updBaseline) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ schemaVersion: 2, scorerVersion: engine.GOLDEN_SCORER_VERSION, metrics: current }, null, 2) + '\n',
    'utf8',
  )
  console.log(`\n기준선 갱신 완료 — ${BASELINE}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.log('\n기준선 없음 — --update-baseline --yes 로 먼저 기록하세요(비교 없이 종료).')
  process.exit(2)
}
const baseline = readJson(BASELINE)
if (baseline.scorerVersion !== engine.GOLDEN_SCORER_VERSION) {
  console.error(
    `\n기준선 채점기 버전 불일치(기준선 v${baseline.scorerVersion ?? '?'} vs 현재 v${engine.GOLDEN_SCORER_VERSION}) — ` +
      '옛 기준선을 새 로직으로 비교하지 않습니다. 점수 확인 후 --update-baseline --yes 로 재기준선하세요.',
  )
  process.exit(2)
}

let regressions = 0
let warns = 0
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
    if (b === null || b === undefined) {
      if (c !== null && c !== undefined) {
        // 측정 불가 → 측정 가능 전환을 조용히 지나치면 그 지표는 영구 무검증(리뷰 R3).
        console.error(`  ✗ ${kind}.${metric}: 기준선 측정 불가 → 측정 가능 전환 — 재기준선 필요(--update-baseline --yes)`)
        regressions++
      }
      continue
    }
    if (c === null || c === undefined) {
      console.error(`  ✗ ${kind}.${metric}: ${pct(b)} → 측정 불가 전환(인용/단위 소실 의심) — 회귀`)
      regressions++
    } else if (c - b < -EPSILON) {
      console.error(`  ✗ ${kind}.${metric}: ${pct(b)} → ${pct(c)} 하락`)
      regressions++
    } else {
      console.log(`  ✓ ${kind}.${metric}: ${pct(b)} → ${pct(c)}`)
    }
  }
  // 인용 절대 개수 — "적게 내고 전부 유효" 커버리지 붕괴 차단(비평 C2).
  const bc = base.citationCount
  const cc = cur.citationCount
  if (typeof bc === 'number' && bc > 0) {
    const drop = (bc - cc) / bc
    if (drop > CITATION_DROP_FAIL) {
      console.error(`  ✗ ${kind}.citationCount: ${bc} → ${cc} (${(drop * 100).toFixed(1)}% 감소 > ${CITATION_DROP_FAIL * 100}%) — 커버리지 붕괴`)
      regressions++
    } else if (cc < bc) {
      console.log(`  ⚠ ${kind}.citationCount: ${bc} → ${cc} 소폭 감소 — 수동 확인 권장`)
      warns++
    } else {
      console.log(`  ✓ ${kind}.citationCount: ${bc} → ${cc}`)
    }
  }
  // 초과 단위 — 날조 추가 신호(비평 C1). 정당 성장 가능성 때문에 WARN.
  const be = base.extras ?? 0
  const ce = cur.extras
  if (ce > be) {
    console.log(`  ⚠ ${kind}.extras: ${be} → ${ce} 증가 — 골든에 없는 단위(날조/성장) 수동 리뷰`)
    warns++
  }
}

console.log('')
if (regressions > 0) {
  console.error(`FAIL — 기준선 대비 회귀 ${regressions}건${warns > 0 ? ` (경고 ${warns}건)` : ''} (의도된 개선이면 --update-baseline --yes)`)
  process.exit(1)
}
console.log(`PASS — 기준선 대비 회귀 없음${warns > 0 ? ` (경고 ${warns}건 — 수동 확인 권장)` : ''}`)
