#!/usr/bin/env node
/**
 * /understand-rtm 인테이크 단계화(절차 A)의 결정론 글루 CLI — P2.
 * 사용:
 *   node rtm-intake.mjs validate <identified.json 경로>
 *
 * ① 식별 단계가 쓴 identified.json 을 스키마로 검증(parseIdentifiedIntake)하고 비치명
 * 일관성 진단(diagnoseIntake)을 표면화한다. 스키마 위반이면 비0 종료(조용한 null드롭 방지).
 * 분해/매칭 같은 추론은 스킬(claude -p)이 하고, 이 CLI 는 그 산출을 검증만 한다.
 * 세션 오케스트레이션(sid 발급·단계 spawn)은 서버(P3)가 담당한다.
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')

if (!existsSync(distEntry)) {
  console.error(
    '엔진(@ktds/legacy-core)이 빌드되지 않았습니다. 먼저 빌드하세요:\n' +
      '  pnpm --filter @ktds/legacy-core build',
  )
  process.exit(2)
}

const [, , cmd, ...rest] = process.argv

if (cmd !== 'validate') {
  console.error('사용법: node rtm-intake.mjs validate <identified.json 경로>')
  process.exit(2)
}

const target = rest[0]
if (!target) {
  console.error('identified.json 경로를 지정하세요: node rtm-intake.mjs validate <경로>')
  process.exit(2)
}
if (!existsSync(target)) {
  console.error(`파일이 없습니다: ${target}`)
  process.exit(2)
}

const engine = await import(distEntry)
const { parseIdentifiedIntake, diagnoseIntake } = engine

let raw
try {
  raw = JSON.parse(readFileSync(target, 'utf8'))
} catch (err) {
  console.error(`JSON 파싱 실패(${target}): ${err.message}`)
  process.exit(1)
}

let intake
try {
  intake = parseIdentifiedIntake(raw)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

const fnCount = intake.requirements.reduce(
  (n, r) =>
    n +
    r.changeset.added.length +
    r.changeset.modified.length +
    r.changeset.removed.length +
    r.changeset.revived.length,
  0,
)
console.log(`identified.json 검증 통과 — ${target}`)
console.log(
  `  요청 ${intake.request.id} (${intake.request.name}) · 요구사항 ${intake.requirements.length}건` +
    ` · changeset 기능 ${fnCount} · 질문 ${intake.questions.length}`,
)
for (const r of intake.requirements) {
  const derived = r.derivedFrom ? ` ←${r.derivedFrom}` : ''
  console.log(`    - ${r.id} [${r.category}] ${r.name} (${r.priority}${derived})`)
}
if (intake.questions.length > 0) {
  console.log('  [확인필요]:')
  for (const q of intake.questions) console.log(`    ? ${q}`)
}

const diags = diagnoseIntake(intake)
if (diags.length > 0) {
  console.log(`  ⚠ 일관성 진단 ${diags.length}건(강제 아님, 검토 권장):`)
  for (const d of diags) console.log(`    - ${d}`)
}
console.log('전부 [추정] 상태. 사용자가 단계 컨펌 후 다음 단계로 진행한다.')
