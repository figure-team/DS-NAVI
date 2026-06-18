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
 *
 * 모든 출력은 결정론·한국어. 동일 commit 재실행 시 산출물 byte-diff=0.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

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
const sub = process.argv[3] || 'scan'
const flags = process.argv.slice(4)

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
  default:
    console.error(
      `'${sub}' 은 지원하지 않는 서브커맨드입니다. 사용 가능: scan | plan | confirm | map.\n` +
        '(bundle/emit-with-fill 은 P4 로드맵.)',
    )
    process.exit(2)
}

async function runScan() {
  const { scanDomainMap } = engine
  const { census, routes, edges, slices, candidates } = await scanDomainMap(projectRoot)
  console.log(`understand-map scan 완료 — ${projectRoot}`)
  console.log(`  census: 파일 ${census.fileCount}개`)
  console.log(`  routes: 라우트 ${routes.routes.length}개 / 배치 ${routes.batchEntries.length}개`)
  console.log(`  edges: 엣지 ${edges.edges.length}개 / 미해소 ${edges.unresolved.length}개`)
  console.log(`  slices: 슬라이스 ${slices.slices.length}개`)
  console.log(`  candidates: 도메인 후보 ${candidates.candidates.length}개`)
  console.log('산출물: .spec/map/{census,routes,edges,slices,candidates}.json (동일 commit 재실행 byte-diff=0)')
  console.log('다음 단계: plan(경계 확인) → confirm(확정) → map(요약).')
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
