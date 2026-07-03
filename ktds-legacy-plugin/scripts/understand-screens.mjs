#!/usr/bin/env node
/**
 * /understand-screens CLI 오케스트레이터 — 화면설계서 파이프라인.
 * 사용: node understand-screens.mjs <projectRoot> [capture|validate|status]
 *
 *  capture  : Stage A 결정론 캡처(러너 위임 — 앱 기동/크롤/시나리오/screens.json).
 *  validate : Stage B 이후 게이트 — 스키마/mechanicalHash 불변/CONFIRMED⇒근거/채움률.
 *  status   : 화면 수·확정율·미채움·미매핑 요약(한국어, 기본값).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error(
    '엔진(@ktds/legacy-core)이 빌드되지 않았습니다. 먼저 빌드하세요:\n' +
      '  pnpm --filter @ktds/legacy-core build',
  )
  process.exit(2)
}

const projectRoot = process.argv[2] || process.cwd()
const command = process.argv[3] || 'status'
const engine = await import(distEntry)
const { validateScreensFile, SCREENS_FILENAME } = engine
const screensPath = join(projectRoot, '.understand-anything', SCREENS_FILENAME)

if (command === 'capture') {
  const r = spawnSync(
    process.execPath,
    [join(here, 'understand-screens-capture.mjs'), projectRoot],
    { stdio: 'inherit' },
  )
  process.exit(r.status ?? 1)
}

if (!existsSync(screensPath)) {
  console.error(`screens.json 이 없습니다(${screensPath}). 먼저 캡처하세요:`)
  console.error(`  node ${join(here, 'understand-screens.mjs')} ${projectRoot} capture`)
  process.exit(2)
}
let file
try {
  file = JSON.parse(readFileSync(screensPath, 'utf8'))
} catch (err) {
  console.error(`screens.json 파싱 실패: ${err.message}`)
  process.exit(2)
}

const v = validateScreensFile(file)
const pct = (x) => (x === null ? '-' : `${Math.round(x * 100)}%`)

if (command === 'validate') {
  if (v.issues.length) {
    console.error(`검증 이슈 ${v.issues.length}건:`)
    for (const i of v.issues) {
      console.error(`  - [${i.code}]${i.screenId ? ` ${i.screenId}` : ''} ${i.message}`)
    }
  }
  if (v.stats) {
    console.log(
      `화면 ${v.stats.screenCount} / 주석 ${v.stats.annotationCount} / 확정율 ${pct(v.stats.confirmedActionRate)} / 설명 채움률 ${pct(v.stats.descriptionRate)} / JSP 매핑률 ${pct(v.stats.jspMappedRate)} / 미매핑 JSP ${v.stats.unmatchedJspCount}건`,
    )
  }
  if (Array.isArray(file.unmatchedJsps) && file.unmatchedJsps.length) {
    console.log('미매핑 JSP(전수 커버 게이트 — Stage B 에서 jspFile 매핑 필요):')
    for (const j of file.unmatchedJsps) console.log(`  - ${j}`)
  }
  console.log(v.ok ? '검증 통과.' : '검증 실패.')
  process.exit(v.ok ? 0 : 1)
}

// status (기본)
const st = v.stats
if (!st) {
  console.error('screens.json 스키마가 유효하지 않습니다. validate 로 상세를 확인하세요.')
  process.exit(1)
}
console.log('── 화면설계서 상태 ──')
console.log(`화면 ${st.screenCount}건 (주석 ${st.annotationCount}건)`)
console.log(`핸들러 확정율(action/link): ${pct(st.confirmedActionRate)}`)
console.log(`설명 채움률: ${pct(st.descriptionRate)} / JSP 매핑률: ${pct(st.jspMappedRate)}`)
console.log(`fragment ${file.fragments?.length ?? 0}건 / 미매핑 JSP ${st.unmatchedJspCount}건 / 도달실패 보고 ${file.missing?.length ?? 0}건`)
const sigGroups = new Map()
for (const s of file.screens ?? []) {
  if (!s.contentSignature) continue
  sigGroups.set(s.contentSignature, [...(sigGroups.get(s.contentSignature) ?? []), s.id])
}
const aliases = [...sigGroups.values()].filter((g) => g.length > 1)
if (aliases.length) {
  console.log('별칭 의심(동일 콘텐츠 시그니처):')
  for (const g of aliases) console.log(`  - ${g.join(' ↔ ')}`)
}
console.log(v.ok ? '스키마/불변 규칙: 통과' : `스키마/불변 규칙: 이슈 ${v.issues.length}건 (validate 로 확인)`)
