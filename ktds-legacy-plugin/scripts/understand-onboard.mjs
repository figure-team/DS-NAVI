#!/usr/bin/env node
/**
 * /understand-onboard CLI — 가이드 1-명령 온보딩(보완 D-a, AC-28).
 * 사용: node understand-onboard.mjs [projectRoot] [--by <handle>] [--skip-docs] [--methodology as-built|si-standard]
 *
 * 신규 투입자용 단일 진입점 — 결정론 ktds 분석 체인을 한 번에 돌린다:
 *   init → map scan(--auto-approve 자동 1차 패스) → map(skeleton) → docs → 커버리지 리포트.
 * 각 단계는 기존 granular CLI 를 그대로 호출(파워유저용 granular 명령은 유지). UA 네이티브
 * `/understand`(knowledge-graph.json)는 대시보드/dual-load 용 — 온보딩 전/후 별도 실행을
 * 안내한다(ktds 분석은 .spec/map 기반이라 KG 없이도 동작).
 *
 * 자동 1차 패스(--auto-approve)는 자동 분류 경계를 그대로 확정한다 — 정밀 도메인 경계는
 * 선택적 후속(plan→confirm 재실행)으로 안내한다.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error('엔진(@ktds/legacy-core)이 빌드되지 않았습니다: pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const projectRoot = positional[0] || process.cwd()
function flagValue(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--') ? args[i + 1] : null
}
const by = flagValue('--by') || 'onboard'
const methodology = flagValue('--methodology') || 'as-built'
const skipDocs = flags.includes('--skip-docs')

function step(label, script, scriptArgs) {
  console.log(`\n▶ ${label}`)
  try {
    const out = execFileSync('node', [join(here, script), projectRoot, ...scriptArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    process.stdout.write(out)
  } catch (err) {
    process.stdout.write(err.stdout ?? '')
    process.stderr.write(err.stderr ?? '')
    console.error(`\n✗ 단계 실패: ${label} — 중단합니다.`)
    process.exit(2)
  }
}

console.log(`가이드 온보딩 시작 — ${projectRoot}`)
console.log('(UA 대시보드/dual-load 를 원하면 먼저 /understand 로 knowledge-graph.json 을 생성하세요. ktds 분석은 KG 없이도 진행됩니다.)')

step('1/4 초기화 (init)', 'understand-init.mjs', [])
step('2/4 스캔 (map scan)', 'understand-map.mjs', ['scan'])
step('3/4 도메인 경계 자동 1차 확정 (map confirm --auto-approve)', 'understand-map.mjs', [
  'confirm',
  '--auto-approve',
  '--by',
  by,
])
step('3.5/4 도메인 맵 빌드 (map)', 'understand-map.mjs', ['map'])
if (!skipDocs) {
  step('4/4 산출물 생성 (docs)', 'understand-docs.mjs', [methodology])
} else {
  console.log('\n▷ docs 단계 건너뜀(--skip-docs).')
}

// 커버리지 리포트(보완 D-c) — 스캔이 .spec/map/coverage.json 을 남긴다.
const covPath = join(projectRoot, '.spec', 'map', 'coverage.json')
if (existsSync(covPath)) {
  const engine = await import(distEntry)
  const report = engine.CoverageReportSchema.parse(JSON.parse(readFileSync(covPath, 'utf8')))
  console.log('\n' + engine.renderCoverageReport(report))
}

console.log('온보딩 완료. 다음(선택):')
console.log('  - 정밀 도메인 경계: /understand-map plan → confirm (자동 1차 경계 재정련)')
console.log('  - 변경 영향도/생성예측: /understand-impact')
console.log('  - 증분 재스캔: 코드 변경 후 다시 /understand-onboard (변경 파일만 재도출, 확정 플랜 보존)')
