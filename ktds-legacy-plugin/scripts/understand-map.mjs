#!/usr/bin/env node
/**
 * /understand-map CLI 래퍼 — 결정론 도메인 맵.
 * 사용: node understand-map.mjs [projectRoot] [scan|plan|confirm|map] [flags]
 *
 * 서브커맨드:
 *   scan     census/routes/edges/slices/candidates 스캔(.spec/map/ 산출, 결정론).
 *   plan     candidates 의 도메인 경계 표(한국어, 사람 게이트 제시용). 쓰기 없음.
 *   confirm  도메인 경계 확정. NON-TTY 안전: 플래그 없으면 표 + 안내만 출력하고,
 *            `--auto-approve --by <handle>` 가 있을 때만 확정 플랜을 기록한다.
 *   map      도메인 맵 요약(우선순위 랭킹 + 교차 도메인 엣지, 한국어). 확정 플랜 필요.
 *   bundle   도메인별 LLM 채움 입력 묶음(.spec/map/bundle/<key>.json) 조립. skeleton 필요.
 *   emit     채움 파이프라인 — fill/<key>.json 적용 + 인용 기계검증 + domain-graph.json emit.
 *
 * 모든 출력은 결정론·한국어. 동일 commit 재실행 시 산출물 byte-diff=0.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
/** 사람 편집 권위 — 계층별 노드 상세 템플릿 디렉터리(파일 1개 = 계층 1개, 런타임 로드). */
const NODE_TEMPLATE_DIR = join(here, '..', 'templates', 'node-detail')
/** 계층 키 → 파일명(other.md = unknown 계층). */
const NODE_TEMPLATE_FILES = {
  api: 'api.md',
  service: 'service.md',
  dao: 'dao.md',
  db: 'db.md',
  unknown: 'other.md',
}

if (!existsSync(distEntry)) {
  console.error(
    '엔진(@ktds/legacy-core)이 빌드되지 않았습니다. 먼저 빌드하세요:\n' +
      '  pnpm --filter @ktds/legacy-core build',
  )
  process.exit(2)
}

const projectRoot = process.argv[2] || process.cwd()
const sub = process.argv[3] || 'scan'
const flags = process.argv.slice(4)
/** 프로젝트별 템플릿 override 디렉터리 — 플러그인 동봉본보다 우선. */
const PROJECT_TEMPLATE_DIR = join(projectRoot, '.understand-anything', 'node-detail')

function flagValue(name) {
  const i = flags.indexOf(name)
  return i >= 0 && i + 1 < flags.length ? flags[i + 1] : null
}
function hasFlag(name) {
  return flags.includes(name)
}

const engine = await import(distEntry)

switch (sub) {
  case 'scan':
    await runScan()
    break
  case 'plan':
    await runPlan()
    break
  case 'confirm':
    await runConfirm()
    break
  case 'map':
    await runMap()
    break
  case 'bundle':
    await runBundle()
    break
  case 'emit':
    await runEmit()
    break
  case 'templates':
    runTemplates()
    break
  default:
    console.error(
      `'${sub}' 은 지원하지 않는 서브커맨드입니다. 사용 가능: scan | plan | confirm | map | bundle | emit | templates.`,
    )
    process.exit(2)
}

async function runScan() {
  const { scanDomainMap } = engine
  const { census, routes, edges, slices, candidates, dbSchema, interfaces } = await scanDomainMap(projectRoot)
  console.log(`understand-map scan 완료 — ${projectRoot}`)
  console.log(`  census: 파일 ${census.fileCount}개`)
  console.log(`  routes: 라우트 ${routes.routes.length}개 / 배치 ${routes.batchEntries.length}개`)
  console.log(`  edges: 엣지 ${edges.edges.length}개 / 미해소 ${edges.unresolved.length}개`)
  console.log(`  slices: 슬라이스 ${slices.slices.length}개`)
  console.log(`  candidates: 도메인 후보 ${candidates.candidates.length}개`)
  reportInterfaces(interfaces)
  reportDbSchema(dbSchema)
  console.log('산출물: .spec/map/{census,routes,edges,slices,candidates,db-schema,interfaces}.json (동일 commit 재실행 byte-diff=0)')
  console.log('다음 단계: plan(경계 확인) → confirm(확정) → map(요약).')
}

/** W1 대외 인터페이스 스캔 결과 보고 — 0건도 "스캔했고 없음"으로 명시(침묵 누락 금지). */
function reportInterfaces(interfaces) {
  if (!interfaces) return
  const { total, unresolvedEndpoints, byProtocol, callSiteTotal } = interfaces.stats
  const suspects = interfaces.suspectSignals?.count ?? 0
  if (total === 0) {
    console.log('  인터페이스: 0건 (송신/라우트 외 수신 신호 없음 — 스캔 수행됨)')
    if (suspects > 0) {
      console.log(`  ⚠️ 의심 신호 ${suspects}건(http 리터럴/jdbc/wsdl) — 사내 공통연계모듈일 수 있습니다.`)
      console.log('     understanding.config.json 의 interfaceScan.clients 로 공통모듈 시그니처를 등록하세요.')
      console.log('     (근거: .spec/map/interfaces.json → suspectSignals.samples)')
    }
    return
  }
  const proto = byProtocol.map((p) => `${p.protocol} ${p.count}`).join(', ')
  console.log(`  인터페이스: ${total}건/호출 ${callSiteTotal}지점 (${proto})${unresolvedEndpoints > 0 ? ` — endpoint 미해석 ${unresolvedEndpoints}건 [미확인]` : ''}`)
}

/** db-schema tier + 라이브 DB 신호(정적 탐지) 보고 + .sql 덤프 권장 게이트(PA-gate). */
function reportDbSchema(dbSchema) {
  const tierKo = { 'ddl+data': 'DDL+데이터', ddl: 'DDL만', 'code-only': '코드만(폴백)' }
  console.log(
    `  db-schema: tier=${tierKo[dbSchema.tier] ?? dbSchema.tier} (.sql ${dbSchema.sqlFileCount}개, 테이블 ${dbSchema.tables.length})`,
  )
  const live = dbSchema.liveDbSignals ?? []
  if (live.length === 0) return
  const vendors = [...new Set(live.map((s) => s.vendor))].join(', ')
  const external = live.filter((s) => !s.embedded)
  console.log(
    `  라이브 DB 신호: ${live.length}건 (벤더 ${vendors})${external.length === 0 ? ' — 내장형(.sql 로딩, 외부 아님)' : ''}`,
  )
  if (external.length > 0) {
    console.log('  ⚠️ 외부 라이브 DB 감지 — 권위 스키마는 .sql 로 덤프해 넣으면 분석에 반영됩니다(권장).')
    console.log('     라이브 직접 연결은 추후 지원. 기존 .sql 을 그대로 쓰려면 그대로 진행하세요.')
  }
}

async function runPlan() {
  const { scanDomainMap, planTable } = engine
  const { candidates } = await scanDomainMap(projectRoot)
  const rows = planTable(candidates)
  console.log(`도메인 경계 계획(후보) — ${projectRoot}`)
  console.log('이 표는 자동 분류 결과입니다. 확정 전 사람 검토가 필요합니다(사람 게이트).')
  console.log('')
  printPlanTable(rows)
  console.log('')
  console.log(`총 ${rows.length}개 도메인 후보.`)
  console.log('확정하려면: confirm --auto-approve --by <담당자>')
}

async function runConfirm() {
  const { scanDomainMap, planTable, buildAutoPlan, writeConfirmedPlan } = engine
  const { candidates } = await scanDomainMap(projectRoot)
  const rows = planTable(candidates)
  const autoApprove = hasFlag('--auto-approve')
  const by = flagValue('--by')

  if (!autoApprove || !by) {
    console.log(`도메인 경계 확정(미실행) — ${projectRoot}`)
    console.log('확정은 사람 게이트입니다. 자동 확정하지 않습니다.')
    console.log('')
    printPlanTable(rows)
    console.log('')
    console.log('위 경계를 그대로 확정하려면 다음을 실행하세요(NON-TTY 안전):')
    console.log('  confirm --auto-approve --by <담당자 핸들>')
    process.exit(2)
  }

  const plan = buildAutoPlan(candidates, by)
  const path = writeConfirmedPlan(projectRoot, plan)
  console.log(`도메인 경계 확정 완료 — 결정자: ${by}`)
  console.log(`  확정 도메인 ${plan.domains.length}개:`)
  for (const d of plan.domains) {
    console.log(`    - ${d.key} (이름: ${d.name}, 루트 ${d.roots.length}개)`)
  }
  console.log(`  산출물: ${path}`)
  console.log('다음 단계: map(요약 + 우선순위 랭킹).')
}

async function runMap() {
  const { buildDomainMapSummary } = engine
  let summary
  try {
    summary = await buildDomainMapSummary(projectRoot)
  } catch (err) {
    console.error(`도메인 맵 요약 실패: ${err.message}`)
    console.error('확정 플랜이 없으면 먼저 confirm 을 실행하세요: confirm --auto-approve --by <담당자>')
    process.exit(2)
  }

  console.log(`도메인 맵 요약 — ${projectRoot}`)
  console.log('온보딩 우선순위("여기부터 보세요") 랭킹 + 교차 도메인 의존.')
  console.log('')
  console.log('  순위 키(key)            이름                흐름  노드  우선  근거')
  console.log('  ---- ------------------ ------------------ ---- ---- ---- ----')
  const ranked = [...summary.domains].sort((a, b) => a.rank - b.rank)
  for (const d of ranked) {
    console.log(
      `  ${padNum(d.rank, 4)} ${pad(d.key, 18)} ${pad(d.name, 18)} ` +
        `${padNum(d.flowCount, 4)} ${padNum(d.nodeCount, 4)} ${padNum(d.priorityScore, 4)} ` +
        `${d.grounded ? '예' : '아니오'}`,
    )
  }
  console.log('')
  console.log(`교차 도메인 의존 엣지 ${summary.crossDomain.edges.length}개:`)
  if (summary.crossDomain.edges.length === 0) {
    console.log('  (없음)')
  } else {
    for (const e of summary.crossDomain.edges) {
      console.log(`  ${e.from} → ${e.to}  (가중치 ${e.weight}, 근거 ${e.evidence.length}건)`)
    }
  }
  console.log('')
  console.log('산출물: .spec/map/domain-map.json (동일 commit 재실행 byte-diff=0)')
}

/**
 * 계층별 노드 상세 템플릿을 읽어 파싱한다 — **계층 파일마다** 프로젝트 override
 * (`<proj>/.understand-anything/node-detail/<계층>.md`)를 먼저 보고, 없으면 플러그인
 * 동봉본(`templates/node-detail/<계층>.md`)으로 폴백. 어느 출처를 썼는지 로깅(투명성).
 * 파일이 하나도 없으면 엔진 내장 기본으로(경고), 형식 오류는 명확히 종료(조용한 폴백 금지).
 */
function loadNodeDetailTemplate() {
  const filesByLayer = {}
  const overridden = []
  let found = 0
  for (const [layer, file] of Object.entries(NODE_TEMPLATE_FILES)) {
    const projectPath = join(PROJECT_TEMPLATE_DIR, file)
    const pluginPath = join(NODE_TEMPLATE_DIR, file)
    if (existsSync(projectPath)) {
      filesByLayer[layer] = readFileSync(projectPath, 'utf8')
      overridden.push(`${layer}(${file})`)
      found++
    } else if (existsSync(pluginPath)) {
      filesByLayer[layer] = readFileSync(pluginPath, 'utf8')
      found++
    }
  }
  if (found === 0) {
    console.warn(`⚠️ 노드 템플릿 없음(${PROJECT_TEMPLATE_DIR}/ · ${NODE_TEMPLATE_DIR}/) — 내장 기본 템플릿 사용.`)
    return undefined
  }
  if (overridden.length > 0) {
    console.log(`  노드 템플릿 프로젝트 override: ${overridden.join(', ')} (${PROJECT_TEMPLATE_DIR}/)`)
  }
  try {
    return engine.parseNodeDetailTemplate(filesByLayer)
  } catch (err) {
    console.error(`노드 템플릿 파싱 실패: ${err.message}`)
    console.error('형식(파일당): "## 라벨 {#id}" 섹션 + 그 아래 본문(promptHint).')
    process.exit(2)
  }
}

/** 활성 노드 상세 템플릿 조회 — 계층별 섹션 + override 출처(쓰기 없음). */
function runTemplates() {
  const tpl = loadNodeDetailTemplate() ?? engine.DEFAULT_NODE_DETAIL_TEMPLATE
  console.log(`노드 상세 템플릿 — ${projectRoot}`)
  console.log(`  프로젝트 override 경로: ${PROJECT_TEMPLATE_DIR}/<계층>.md (있으면 우선)`)
  console.log(`  플러그인 동봉 경로: ${NODE_TEMPLATE_DIR}/<계층>.md`)
  console.log('')
  for (const [layer, file] of Object.entries(NODE_TEMPLATE_FILES)) {
    const sections = tpl.byLayer[layer]
    if (!sections) continue
    console.log(`  [${layer}] (${file})  ${sections.map((s) => `${s.label}{#${s.id}}`).join(' · ')}`)
  }
  console.log('')
  console.log('계층 템플릿을 프로젝트별로 바꾸려면 위 override 경로에 <계층>.md 를 두세요(편집 즉시 반영).')
}

async function runBundle() {
  const { buildBundles } = engine
  const skeleton = readSkeletonOrExit()
  const nodeDetailTemplate = loadNodeDetailTemplate()
  const { bundles, paths } = await buildBundles(projectRoot, skeleton, { nodeDetailTemplate })
  console.log(`도메인 번들 조립 완료 — ${projectRoot}`)
  console.log(`  도메인 ${bundles.length}개 번들(.spec/map/bundle/):`)
  for (const b of bundles) {
    const omitted = b.sliceOmitted.length > 0 ? ` (슬라이스 생략 ${b.sliceOmitted.length}개)` : ''
    console.log(`    - ${b.key}: 흐름 ${b.flows.length}개 · 단계 ${b.steps.length}개 · 파일 ${b.files.length}개${omitted}`)
  }
  console.log('')
  console.log('산출물 경로:')
  for (const p of paths) console.log(`  ${p}`)
  console.log('')
  console.log('다음 단계: 도메인별 fill/<key>.json 을 작성한 뒤 emit 을 실행하세요.')
  console.log('계약: 모든 사실 주장(summary/entities/businessRules/흐름/단계)에 file:line + 스니펫 인용 필수.')
  console.log('  → fill 경로: .spec/map/fill/<key>.json  (스키마: DomainFill — citations min 1, snippet ≥ 8자)')
  console.log('  → 채움 후: emit (인용 기계검증 + domain-graph.json 산출).')
}

async function runEmit() {
  const { runFillPipeline } = engine
  let result
  try {
    result = await runFillPipeline(projectRoot)
  } catch (err) {
    console.error(`채움 emit 실패: ${err.message}`)
    console.error('skeleton 이 없으면 먼저 scan → confirm 을, 번들이 없으면 bundle 을 실행하세요.')
    process.exit(2)
  }

  console.log(`도메인 그래프 채움·검증·emit 완료 — ${projectRoot}`)
  console.log(`  채움 도메인: ${result.report.domains.length}개`)
  console.log(`  미작성(pending): ${result.pending.length}개${result.pending.length ? ` [${result.pending.join(', ')}]` : ''}`)
  console.log(`  무효(invalid): ${result.invalid.length}개${result.invalid.length ? ` [${result.invalid.map((i) => i.key).join(', ')}]` : ''}`)
  console.log(`  기각(rejected): ${result.rejected.length}개`)
  console.log(`  빈칸 잔여 노드: ${result.unfilled.length}개`)
  const o = result.report.overall
  console.log(`  근거율: 항목 ${o.itemGrounded}/${o.itemTotal} GROUNDED (${o.groundedPct}%) · 인용 ${o.citationOk}/${o.citationTotal} ok`)
  if (result.staleSkeleton) {
    console.log('  ⚠️ skeleton 이 옛 commit 산물입니다 — 라인 이동으로 정당한 인용이 강등될 수 있습니다(재scan 권장).')
  }
  console.log('')
  console.log('산출물:')
  console.log(`  ${result.domainGraphPath}  (U-A 호환 도메인 그래프)`)
  console.log(`  ${result.verifyReportPath}  (인용 검증 리포트)`)
  console.log('동일 입력 재실행 시 byte-diff=0(NEEDS_REVIEW 항목은 [확인 필요] 마커로 보존).')
}

/** skeleton.json 을 읽어 반환. 없으면 안내 후 종료(조용한 빈 처리 금지). */
function readSkeletonOrExit() {
  const { readSkeleton } = engine
  const skeleton = readSkeleton(projectRoot)
  if (!skeleton) {
    console.error(`skeleton.json 없음 — ${projectRoot}`)
    console.error('먼저 도메인 경계를 확정하고 skeleton 을 산출하세요:')
    console.error('  scan → confirm --auto-approve --by <담당자> → (buildMap 으로 skeleton 산출)')
    process.exit(2)
  }
  return skeleton
}

/** 후보 도메인 경계 표(헤더 + 구분선 + 행)를 출력한다. plan/confirm 공용(동일 출력). */
function printPlanTable(rows) {
  console.log('  키(key)            루트수  진입수  파일수')
  console.log('  ------------------ ------ ------ ------')
  for (const r of rows) {
    console.log(
      `  ${pad(r.key, 18)} ${padNum(r.rootCount, 6)} ${padNum(r.entryCount, 6)} ${padNum(r.fileCount, 6)}`,
    )
  }
}

function pad(s, width) {
  const str = String(s ?? '')
  return str.length >= width ? str : str + ' '.repeat(width - str.length)
}
function padNum(n, width) {
  const str = String(n ?? 0)
  return str.length >= width ? str : ' '.repeat(width - str.length) + str
}
