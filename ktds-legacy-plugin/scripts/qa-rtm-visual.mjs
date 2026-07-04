#!/usr/bin/env node
/* global window, document */
// (window/document 는 page.evaluate/addInitScript 의 브라우저 컨텍스트 코드에서만 사용.)
/**
 * R6: RTM 탭 헤드리스 시각QA(playwright) — 설계: RTM_TEST_SCENARIO_DESIGN.md §7.
 * 사용: node qa-rtm-visual.mjs <baseUrl> <token> [outDir]
 *   예) 대시보드를 먼저 띄운 뒤:
 *       (dashboard) GRAPH_DIR=<repo>/examples/jpetstore-6 UNDERSTAND_ACCESS_TOKEN=qa-token npx vite --port 5199 --strictPort
 *       node ktds-legacy-plugin/scripts/qa-rtm-visual.mjs http://localhost:5199 qa-token
 *
 * 시나리오: ①기능 뷰 렌더(행>0) ②시험 탭 → 시나리오 표 ③시나리오 드로어 ④확정 1건 반영
 *          ⑤+필드 커스텀 열 추가 반영 ⑥단계별 스크린샷 + console error 0 단언.
 * 전제(HANDOFF §헤드리스 QA): CJK 폰트(fonts-noto-cjk 또는 ~/.fonts NotoSansKR),
 * playwright-core + chromium 캐시(legacy-core 의존성), 온보딩은 ?onboard=skip.
 * 주의: ④⑤는 rtm-overrides.json 에 QA 데이터가 기록된다(수동 QA 게이트 전용 —
 * 데모 데이터 커밋 전엔 오버레이 파일을 정리할 것).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [baseUrl, token, outDirArg] = process.argv.slice(2)
if (!baseUrl || !token) {
  console.error('사용: node qa-rtm-visual.mjs <baseUrl> <token> [outDir]')
  process.exit(2)
}
const outDir = outDirArg || join(process.cwd(), '.understand-anything', 'qa')
mkdirSync(outDir, { recursive: true })

const { loadPlaywright } = await import(
  join(here, '..', 'packages', 'legacy-core', 'dist', 'screen-capture', 'playwright-loader.js')
)
const pw = await loadPlaywright()

const consoleErrors = []
const httpErrors = []
const failures = []
// 선택적 리소스(없어도 정상 degrade) — 404 가 정상인 엔드포인트는 실패로 안 센다.
const OPTIONAL_404 = [/diff-overlay\.json/, /favicon/, /manifest/]
const browser = await pw.chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('response', (res) => {
  if (res.status() >= 400 && !OPTIONAL_404.some((re) => re.test(res.url()))) {
    httpErrors.push(`${res.status()} ${res.url()}`)
  }
})
// 승인자 프롬프트 억제(확정 흐름 자동화) + 온보딩 억제.
await page.addInitScript(() => {
  try {
    localStorage.setItem('ktds.approver', 'QA봇')
    window.prompt = () => 'QA필드'
    window.confirm = () => true
  } catch { /* */ }
})

const shot = async (name) => {
  await page.screenshot({ path: join(outDir, name), fullPage: false })
  console.log(`  📸 ${name}`)
}
const assert = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else { failures.push(msg); console.error(`  ✗ ${msg}`) }
}
/** 텍스트로 버튼 클릭(evaluate — 오버레이 간섭 회피 관례). */
const clickButton = (text) =>
  page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t || b.textContent?.includes(t))
    if (btn) { btn.click(); return true }
    return false
  }, text)

try {
  // ① 기능 뷰.
  await page.goto(`${baseUrl}/rtm?token=${encodeURIComponent(token)}&onboard=skip`, { waitUntil: 'networkidle' })
  await page.waitForSelector('table tbody tr', { timeout: 20000 })
  const fnRows = await page.locator('table tbody tr').count()
  assert(fnRows > 0, `기능 뷰 렌더 — 행 ${fnRows}개`)
  await shot('rtm-1-function.png')

  // ② 시험 탭 → 시나리오 표.
  assert(await clickButton('시험'), '시험 탭 클릭')
  await page.waitForTimeout(400)
  const tsRows = await page.locator('table tbody tr').count()
  assert(tsRows > 0, `시나리오 표 렌더 — 행 ${tsRows}개`)
  assert((await page.getByText('정상', { exact: false }).count()) > 0, '구분 배지(정상) 표시')
  await shot('rtm-2-scenarios.png')

  // ③ 첫 시나리오 드로어.
  await page.evaluate(() => {
    const tr = document.querySelector('table tbody tr')
    if (tr) tr.click()
  })
  await page.waitForTimeout(400)
  assert((await page.getByText('초안 [추정]').count()) > 0 || (await page.getByText('Given', { exact: false }).count()) > 0, '시나리오 드로어 열림')
  await shot('rtm-3-drawer.png')

  // ④ 확정 1건 — TrustBadge 반영.
  const confirmed = await clickButton('✓ 확정')
  assert(confirmed, '확정 버튼 클릭')
  await page.waitForTimeout(900)
  await shot('rtm-4-confirmed.png')
  const badge = await page.evaluate(() => document.body.textContent?.includes('QA봇'))
  assert(Boolean(badge), '확정자(QA봇) 배지 반영 — 라운드트립')

  // ⑤ R7: 기능 기준 탭에서 +필드 → 커스텀 열 추가.
  assert(await clickButton('기능 기준'), '기능 기준 탭 복귀')
  await page.waitForTimeout(300)
  assert(await clickButton('＋필드'), '+필드 클릭')
  await page.waitForTimeout(700)
  const hasField = await page.evaluate(() => document.body.textContent?.includes('QA필드'))
  assert(Boolean(hasField), '커스텀 필드 열(QA필드) 반영')
  await shot('rtm-5-custom-field.png')
} catch (err) {
  failures.push(`예외: ${err?.message ?? err}`)
  await shot('rtm-error.png').catch(() => {})
} finally {
  await browser.close()
}

// HTTP 오류는 URL 기준(선택적 리소스 제외), console 오류는 리소스 로드 잡음 제외 후 판정.
const severeConsole = consoleErrors.filter((e) => !/Failed to load resource|font|favicon|manifest/i.test(e))
writeFileSync(join(outDir, 'rtm-qa-report.json'), JSON.stringify({ failures, httpErrors, consoleErrors }, null, 2) + '\n')
const severe = [...httpErrors, ...severeConsole]
if (severe.length > 0) {
  console.error(`  ✗ HTTP/console error ${severe.length}건:`)
  for (const e of severe.slice(0, 5)) console.error(`    - ${e}`)
  failures.push(`errors: ${severe.length}`)
} else {
  console.log('  ✓ HTTP/console error 0건(선택적 리소스 제외)')
}

if (failures.length > 0) {
  console.error(`\nRTM 시각QA 실패 ${failures.length}건 — ${outDir} 스크린샷 확인`)
  process.exit(1)
}
console.log(`\nRTM 시각QA 통과 — 스크린샷: ${outDir}`)
