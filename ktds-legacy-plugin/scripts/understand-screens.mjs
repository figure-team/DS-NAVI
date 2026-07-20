#!/usr/bin/env node
/**
 * /understand-screens CLI 오케스트레이터 — 화면설계서 파이프라인.
 * 사용: node understand-screens.mjs <projectRoot> [capture|fill-prep|fill-audit|fill-merge|assign-domains|validate|status]
 *
 *  capture    : Stage A 결정론 캡처(러너 위임 — 앱 기동/크롤/시나리오/screens.json).
 *  fill-prep  : Stage B 대규모 팬아웃용 청크 준비 — screens.json 을 화면 N개 자립
 *               청크로 분해(+핸들러 사전 pre-cite 동봉, .spec/map/screens-fill-prep/).
 *  fill-audit : 팬아웃 조각(screens-fill-frag) 완결성 감사 — 순수 JSON 1줄(기계 소비).
 *  fill-merge : 조각의 채움 필드만 screens.json 본체에 병합 + validate 재게이트.
 *  validate   : Stage B 이후 게이트 — 스키마/mechanicalHash 불변/CONFIRMED⇒근거/채움률.
 *  status     : 화면 수·확정율·미채움·미매핑 요약(한국어, 기본값).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendRunLedger, runStartedAt } from './lib/run-ledger.mjs'

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
// 알 수 없는 모드는 거부한다 — 조용히 status 로 떨어지면 오타(예: fill-merg)가 무해한 요약
// 출력으로 위장돼 단계 누락을 눈치채지 못한다(policy 쪽 1단계 폴스루 사고와 동일 계열).
const KNOWN_COMMANDS = ['scaffold', 'capture', 'fill-prep', 'fill-audit', 'fill-merge', 'resolve-views', 'assign-domains', 'validate', 'status']
if (!KNOWN_COMMANDS.includes(command)) {
  console.error(`알 수 없는 모드: ${command} — 사용 가능: ${KNOWN_COMMANDS.join(' | ')}`)
  process.exit(2)
}
const flags = process.argv.slice(4)
function flagValue(name) {
  const i = flags.indexOf(name)
  return i >= 0 && i + 1 < flags.length ? flags[i + 1] : null
}
const engine = await import(distEntry)
const { validateScreensFile, reconcileJsps, listJspFilesFromGraph, SCREENS_FILENAME } = engine
const screensPath = join(projectRoot, '.understand-anything', SCREENS_FILENAME)

/** KG 가 있으면 unmatchedJsps 를 재계산해 저장값의 신선도를 검사한다. */
function recomputeUnmatched(file) {
  const kgPath = join(projectRoot, '.understand-anything', 'knowledge-graph.json')
  if (!existsSync(kgPath)) return null
  try {
    const kg = JSON.parse(readFileSync(kgPath, 'utf8'))
    return reconcileJsps(listJspFilesFromGraph(kg.nodes ?? []), file.screens ?? [], file.fragments ?? [])
  } catch {
    return null
  }
}

// ── screens 설정 스캐폴딩(초안 자동 생성) ──────────────────────────────────
// capture 가 섹션 부재 시 자동 수행하지만, 재생성(--force)은 이 단독 모드로.
if (command === 'scaffold') {
  const { scaffoldScreensConfigOnDisk } = engine
  let r
  try {
    r = scaffoldScreensConfigOnDisk(projectRoot, { force: flags.includes('--force') })
  } catch (err) {
    console.error(`scaffold 실패: ${err.message}`)
    process.exit(2)
  }
  const s = r.summary
  console.log(`screens 설정 초안 생성 완료 — ${r.configPath}`)
  console.log(`  라우트 census ${s.routesTotal}건 → 크롤 시드 ${s.seedUrls}건 (GET-safe 목록성)`)
  console.log(`  baseUrl: ${s.baseUrl}`)
  console.log(`  startCommand: ${s.startCommand ? s.startCommand.join(' ') : '(미감지 — 생략)'}`)
  console.log('')
  console.log('확인 필요:')
  for (const n of s.notes) console.log(`  - ${n}`)
  console.log('')
  console.log('초안을 검토·수정한 뒤 capture 를 실행하세요.')
  process.exit(0)
}

if (command === 'capture') {
  const runBegan = runStartedAt()
  const r = spawnSync(
    process.execPath,
    [join(here, 'understand-screens-capture.mjs'), projectRoot],
    { stdio: 'inherit' },
  )
  // 실행 원장 — 성공 캡처만 기록(캡처는 라이브 앱 기동이라 원래 비결정론).
  if ((r.status ?? 1) === 0) {
    appendRunLedger(projectRoot, { tool: 'understand-screens', action: 'capture', startedAt: runBegan })
  }
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

// ── Stage B 팬아웃 서브커맨드(대규모 채움) ─────────────────────────────────
// fill-audit 는 순수 JSON 1줄만 출력한다(Workflow 감사 에이전트가 verbatim 소비).
if (command === 'fill-prep') {
  const { prepScreenFill, DEFAULT_CHUNK_SCREENS } = engine
  const raw = flagValue('--chunk-screens')
  const chunkScreens = raw ? Number.parseInt(raw, 10) : DEFAULT_CHUNK_SCREENS
  if (!Number.isInteger(chunkScreens) || chunkScreens < 1) {
    console.error(`--chunk-screens 값이 잘못됐습니다: ${raw} (1 이상 정수)`)
    process.exit(2)
  }
  let index
  try {
    ;({ index } = await prepScreenFill(projectRoot, { chunkScreens }))
  } catch (err) {
    console.error(`fill-prep 실패: ${err.message}`)
    process.exit(2)
  }
  const t = index.totals
  console.log(`화면 채움 팬아웃 청크 준비 완료 — ${projectRoot}`)
  console.log(`  화면 ${t.screens}개 → 청크 ${t.chunks}개 (청크당 화면 ${index.chunkScreens}개)`)
  console.log(`  주석 ${t.annotations}건`)
  if (t.handlerPreCiteMissing > 0) {
    console.log(
      `  ⚠️ 핸들러 pre-cite 미확보 ${t.handlerPreCiteMissing}건 — 해당 핸들러는 에이전트가 슬라이스에서 직접 인용해야 합니다(실패 시 신뢰도 강등).`,
    )
  }
  console.log('  산출물: .spec/map/screens-fill-prep/<chunkId>.json + index.json')
  console.log('')
  console.log('다음 단계(팬아웃): Workflow 도구로 scripts/screens-fill-fanout.workflow.js 실행')
  console.log('  (청크 id 목록은 screens-fill-prep/index.json 의 chunks[].chunkId)')
  console.log('  에이전트가 screens-fill-frag/<chunkId>.json 을 쓰면: fill-audit(감사) → fill-merge(병합) → validate')
  process.exit(0)
}

if (command === 'fill-audit') {
  const { auditScreenFillFragments } = engine
  const chunkFlag = flagValue('--chunk')
  const only = chunkFlag ? chunkFlag.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  let audit
  try {
    audit = await auditScreenFillFragments(projectRoot, only)
  } catch (err) {
    console.error(`fill-audit 실패: ${err.message}`)
    process.exit(2)
  }
  console.log(JSON.stringify(audit))
  process.exit(0)
}

if (command === 'fill-merge') {
  const runBeganMerge = runStartedAt()
  const { mergeScreenFillFragments } = engine
  let result
  try {
    result = await mergeScreenFillFragments(projectRoot)
  } catch (err) {
    console.error(`fill-merge 실패: ${err.message}`)
    process.exit(2)
  }
  const pct = (x) => (x === null ? '-' : `${Math.round(x * 100)}%`)
  console.log(`화면 채움 조각 병합 완료 — ${projectRoot}`)
  console.log(`  채움 반영 화면 ${result.screensFilled}개`)
  if (result.missingScreens.length > 0) {
    console.log(
      `  ⚠️ 미반영 화면 ${result.missingScreens.length}개(완결 조각 없음 — 부분 병합): ${result.missingScreens.join(', ')}`,
    )
  }
  if (result.droppedItems > 0) {
    console.log(`  ⚠️ 청크 선언 밖 화면/주석 항목 ${result.droppedItems}건 버림(유령 id — 조용한 수용 금지).`)
  }
  if (result.citationsRemoved > 0 || result.handlersDemoted > 0) {
    console.log(
      `  ⚠️ 인용 진위 검증: 실파일 불일치 evidence ${result.citationsRemoved}건 제거` +
        `, 근거 0 → INFERRED 강등 handler ${result.handlersDemoted}건(fail-closed).`,
    )
  }
  const st = result.validation.stats
  if (st) {
    console.log(
      `  검증: 화면 ${st.screenCount} / 주석 ${st.annotationCount} / 확정율 ${pct(st.confirmedActionRate)} / 설명 채움률 ${pct(st.descriptionRate)} / JSP 매핑률 ${pct(st.jspMappedRate)}`,
    )
  }
  if (result.validation.issues.length > 0) {
    console.log(`  ⚠️ 검증 이슈 ${result.validation.issues.length}건:`)
    for (const i of result.validation.issues) {
      console.log(`    - [${i.code}]${i.screenId ? ` ${i.screenId}` : ''} ${i.message}`)
    }
  }
  if (result.unmatchedJsps.length > 0) {
    console.log(`  미매핑 JSP ${result.unmatchedJsps.length}건: ${result.unmatchedJsps.join(', ')}`)
  }
  console.log('')
  console.log(`  산출물: ${result.screensPath}`)
  console.log('다음 단계: validate (게이트 재확인) → /understand-dashboard 화면설계서 탭 열람.')
  // 실행 원장 — Stage B 병합 완료(게이트 실패여도 병합 자체는 일어났으므로 기록).
  appendRunLedger(projectRoot, {
    tool: 'understand-screens',
    action: 'fill-merge',
    startedAt: runBeganMerge,
    summary: `채움 반영 화면 ${result.screensFilled}개`,
  })
  process.exit(result.validation.ok ? 0 : 1)
}

// ── ViewResolver 해석(Spring 뷰 이름→JSP 실경로) ───────────────────────────
// fill-merge 가 자동 수행하지만, 백필은 이 단독 모드로(이후 assign-domains 권장).
if (command === 'resolve-views') {
  const { resolveScreenViewsOnDisk } = engine
  let r
  try {
    r = resolveScreenViewsOnDisk(projectRoot)
  } catch (err) {
    console.error(`resolve-views 실패: ${err.message}`)
    process.exit(2)
  }
  const s = r.summary
  console.log(`ViewResolver 해석 완료 — ${projectRoot}`)
  if (s.configs === 0) {
    console.log('  리졸버 설정 없음 — 변경 없음(Stripes 류 직반환 프로젝트는 해당 없음).')
  } else {
    console.log(
      `  리졸버 설정 ${s.configs}건 · 뷰이름→실경로 치환 ${s.rewritten} · 라우트 리터럴 채움 ${s.filledFromRoute}` +
        ` · 분기 뷰 보류 ${s.ambiguous} · 미해결 ${s.unresolved}/${s.total}`,
    )
  }
  console.log(`  산출물: ${r.screensPath}`)
  console.log('다음 단계: assign-domains(도메인 재배정) → validate.')
  process.exit(0)
}

// ── 결정론 도메인 재배정(화면설계서 그룹 축) ───────────────────────────────
// fill-merge 가 자동 수행하지만, 백필·confirm 재확정 후 재정합은 이 단독 모드로.
if (command === 'assign-domains') {
  const { assignScreenDomainsOnDisk } = engine
  let r
  try {
    r = assignScreenDomainsOnDisk(projectRoot)
  } catch (err) {
    console.error(`assign-domains 실패: ${err.message}`)
    process.exit(2)
  }
  const m = r.summary.byMethod
  console.log(`화면 도메인 재배정 완료 — ${projectRoot}`)
  console.log(
    `  배정 ${r.summary.assigned}/${r.summary.total}` +
      ` (핸들러 조인 ${m.handlerJoin} · 뷰파일 조인 ${m.viewFileJoin} · 뷰폴더 파생 ${m.viewFolder}` +
      ` · URL 파생 ${m.urlFolder} · 미배정 ${m.unassigned})`,
  )
  console.log(`  산출물: ${r.screensPath}`)
  console.log('다음 단계: validate → 대시보드 화면설계서 그룹 확인.')
  process.exit(0)
}

const v = validateScreensFile(file)
const pct = (x) => (x === null ? '-' : `${Math.round(x * 100)}%`)

/** missing 트리아지 요약 한 줄(+미부여 경고) — validate/status 공용. */
function reportTriage() {
  const missing = file.missing ?? []
  if (missing.length === 0) return
  const counts = new Map()
  for (const m of missing) {
    const c = m.triage?.class ?? '(미부여)'
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const parts = [...counts.entries()].map(([c, n]) => `${c} ${n}`)
  console.log(`도달실패 트리아지: ${parts.join(' · ')}`)
  const staleWithCandidate = missing.filter((m) => m.triage?.candidateRoute)
  for (const m of staleWithCandidate) {
    console.log(`  - ${m.url} → 현행 후보 ${m.triage.candidateRoute.path}`)
  }
  const untriaged = missing.filter((m) => m.triage == null).length
  if (untriaged > 0 && existsSync(join(projectRoot, '.spec', 'map', 'routes.json'))) {
    console.log(
      `  ⚠️ routes.json 이 있는데 트리아지 미부여 ${untriaged}건 — 구버전 캡처 산출물입니다. ` +
        're-capture 시 자동 분류됩니다(스키마 회귀 보호를 위해 실패 처리는 하지 않음).',
    )
  }
  const seeded = (file.screens ?? []).filter((s) => s.seededFrom === 'routes-census').length
  if (seeded > 0) console.log(`census 보조 시드 회수 화면 ${seeded}건(메뉴 링크 없이 도달).`)
}

if (command === 'validate') {
  let ok = v.ok
  if (v.issues.length) {
    console.error(`검증 이슈 ${v.issues.length}건:`)
    for (const i of v.issues) {
      console.error(`  - [${i.code}]${i.screenId ? ` ${i.screenId}` : ''} ${i.message}`)
    }
  }
  if (v.stats) {
    console.log(
      `화면 ${v.stats.screenCount} / 주석 ${v.stats.annotationCount} / 확정율 ${pct(v.stats.confirmedActionRate)} / 설명 채움률 ${pct(v.stats.descriptionRate)} / JSP 매핑률 ${pct(v.stats.jspMappedRate)}`,
    )
  }
  {
    const screens = file.screens ?? []
    const domainAssigned = screens.filter((s) => s.domain != null).length
    console.log(
      `도메인 배정 ${domainAssigned}/${screens.length}` +
        (domainAssigned < screens.length ? ' — assign-domains 로 재배정 가능(화면설계서 그룹 축)' : ''),
    )
  }
  const recomputed = recomputeUnmatched(file)
  const unmatched = recomputed ?? file.unmatchedJsps ?? []
  if (recomputed && JSON.stringify(recomputed) !== JSON.stringify(file.unmatchedJsps)) {
    console.error(
      `unmatchedJsps 가 낡았습니다(저장 ${file.unmatchedJsps.length}건 ↔ 재계산 ${recomputed.length}건) — Stage B 채움 후 재계산해 기록하세요.`,
    )
    ok = false
  }
  if (unmatched.length) {
    console.log(`미매핑 JSP ${unmatched.length}건(전수 커버 게이트 — 시나리오/채움 보강 필요):`)
    for (const j of unmatched) console.log(`  - ${j}`)
  } else {
    console.log('미매핑 JSP 0건 — 비-fragment 뷰 전수 커버.')
  }
  reportTriage()
  console.log(ok ? '검증 통과.' : '검증 실패.')
  process.exit(ok ? 0 : 1)
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
reportTriage()
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
