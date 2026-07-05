#!/usr/bin/env node
/**
 * qa-coverage-matrix.mjs — W9 커버리지 매트릭스 자동 검증/문서 생성.
 *
 * 사용:
 *   --write                COVERAGE_MATRIX.md 를 단일 소스(matrix.ts)에서 재생성
 *   --check                문서 drift 검사만(생성 결과와 byte 비교)
 *   <projectRoot>...       각 타깃을 스캔해 "실측 ⊆ 매트릭스 주장" 검증(수용 기준:
 *                          examples/jpetstore-6 + eGov cop 둘 다 통과)
 *
 * 검증 원칙(설계 COVERAGE_MATRIX_DESIGN.md §3.4):
 *   - 매트릭스가 none 이라 주장하는 (언어, 기능)에서 산출물이 나오면 FAIL(과소 주장).
 *   - 역방향(full 주장인데 실측 0건)은 프로젝트에 신호가 없을 수 있어 검증 대상 아님.
 *   - coverage.json langSupport.unsupportedCoreFiles == census×매트릭스 재계산값.
 * 종료 코드: 전부 통과 0, 아니면 1(모순 목록 출력 — 은폐 금지).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
const MATRIX_MD = join(here, '..', '..', 'docs', 'ktds', 'COVERAGE_MATRIX.md')

if (!existsSync(distEntry)) {
  console.error('엔진 미빌드: pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const engine = await import(distEntry)
const { renderCoverageMatrixMd, tierOf, computeLangSupport, SOURCE_LANG_BY_EXT } = engine

const args = process.argv.slice(2)
let failures = 0
const fail = (msg) => {
  failures++
  console.error(`  ✗ ${msg}`)
}

// ── 문서 생성/드리프트 ──────────────────────────────────────────────────────
if (args.includes('--write')) {
  writeFileSync(MATRIX_MD, renderCoverageMatrixMd(), 'utf8')
  console.log(`COVERAGE_MATRIX.md 재생성 완료 — ${MATRIX_MD}`)
}
{
  const rendered = renderCoverageMatrixMd()
  const onDisk = existsSync(MATRIX_MD) ? readFileSync(MATRIX_MD, 'utf8') : null
  if (onDisk === rendered) {
    console.log('✓ 문서 drift 없음 (COVERAGE_MATRIX.md == matrix.ts 렌더)')
  } else {
    fail(
      onDisk === null
        ? 'COVERAGE_MATRIX.md 부재 — --write 로 생성하세요'
        : '문서 drift — matrix.ts 변경 후 --write 재생성 필요',
    )
  }
}

// ── 타깃 실측 검증 ──────────────────────────────────────────────────────────
const targets = args.filter((a) => !a.startsWith('--'))

/** census 의 lang 분류를 산출물 파일 경로에 재적용(census 와 동일 규칙). */
function langOf(relPath) {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'other'
  const ext = base.slice(dot + 1).toLowerCase()
  if (ext.length === 0) return 'other'
  return SOURCE_LANG_BY_EXT[ext] ?? ext
}

/** (기능, 파일) 실측이 매트릭스 주장의 부분집합인지 — none 인데 산출 존재 = 모순. */
function checkSubset(capability, files, { exempt } = {}) {
  const bad = new Map()
  for (const f of files) {
    if (exempt && exempt(f)) continue
    const lang = langOf(f)
    if (tierOf(capability, lang) === 'none') {
      bad.set(lang, (bad.get(lang) ?? 0) + 1)
    }
  }
  for (const [lang, n] of [...bad.entries()].sort()) {
    fail(`${capability}: 매트릭스는 ${lang}=none 인데 산출물 ${n}건 존재(과소 주장 — 매트릭스 갱신 필요)`)
  }
}

for (const projectRoot of targets) {
  console.log(`\n── 실측 검증: ${projectRoot}`)
  const scan = await engine.scanDomainMap(projectRoot)
  const { census, routes, edges, interfaces, riskReport, coverage } = scan
  const mapDir = join(projectRoot, '.spec', 'map')

  // routes / batch (crontab 은 경로 관례 — 언어 축 면제, matrix.ts exceptions 와 짝).
  checkSubset('routes', routes.routes.map((r) => r.filePath))
  checkSubset(
    'batch',
    routes.batchEntries.map((b) => b.filePath),
    { exempt: (f) => routes.batchEntries.some((b) => b.filePath === f && b.trigger === 'crontab') },
  )
  // edges — source/target 모두.
  checkSubset('edges', edges.edges.flatMap((e) => [e.source, e.target]))
  // method-calls — buildMap 산출물이 있으면 대조(스캔 단독엔 없음).
  const mcPath = join(mapDir, 'method-calls.json')
  if (existsSync(mcPath)) {
    const mc = JSON.parse(readFileSync(mcPath, 'utf8'))
    checkSubset('method-calls', (mc.calls ?? []).flatMap((c) => [c.callerFile, c.calleeFile ?? c.callerFile]))
  }
  // interfaces — 항목 callSites.
  checkSubset('interfaces', interfaces.items.flatMap((it) => it.callSites.map((cs) => cs.file)))
  // jpa / db-schema.
  const jpa = JSON.parse(readFileSync(join(mapDir, 'jpa-model.json'), 'utf8'))
  checkSubset('jpa', [
    ...jpa.entities.map((e) => e.relPath),
    ...jpa.repositories.map((r) => r.relPath),
  ])
  const db = JSON.parse(readFileSync(join(mapDir, 'db-schema.json'), 'utf8'))
  checkSubset('db-schema', db.tables.map((t) => t.relPath))
  // complexity — 측정값이 있는 파일만(null 은 미측정 = 주장 없음).
  if (riskReport) {
    checkSubset(
      'complexity',
      riskReport.items.filter((it) => it.metrics.complexity !== null).map((it) => it.filePath),
    )
  }
  // langSupport 재계산 일치(표면화 정확성).
  const recomputed = computeLangSupport(census)
  const reported = coverage.langSupport?.unsupportedFiles
  if (reported !== recomputed.unsupportedFiles) {
    fail(`langSupport 불일치 — coverage.json ${reported} vs 재계산 ${recomputed.unsupportedFiles}`)
  }
  console.log(
    `  파일 ${census.fileCount} · 스캐너 미지원 ${recomputed.unsupportedFiles}건` +
      (recomputed.unsupportedFiles > 0
        ? ` (${recomputed.byLang.filter((l) => l.best === 'none').map((l) => `${l.lang} ${l.files}`).join(' · ')})`
        : ''),
  )
  if (failures === 0) console.log('  ✓ 실측 ⊆ 매트릭스 주장 — 모순 없음')
}

console.log('')
if (failures > 0) {
  console.error(`FAIL — 모순 ${failures}건`)
  process.exit(1)
}
console.log('PASS — 커버리지 매트릭스 검증 통과')
