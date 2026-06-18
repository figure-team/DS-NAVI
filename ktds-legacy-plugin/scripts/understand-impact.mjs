#!/usr/bin/env node
/**
 * /understand-impact CLI 래퍼 — 변경 영향도 + 생성예측(보완 A).
 * 사용: node understand-impact.mjs [projectRoot] [seeds|precedents|analyze] [flags]
 *
 * 서브커맨드:
 *   seeds       시드 매핑 카탈로그(라우트·도메인·파일 인벤토리)를 한국어로 출력.
 *               host(LLM)가 자연어를 후보 파일로 매핑하는 입력. 쓰기 없음.
 *   precedents  선례검색(A-A1) — `--domain <힌트>` [--entity <명사>] [--op <연산>] [--top N].
 *               confirmed domain-map 필요(F3, fail-closed). top-N 후보 + score + why-matched.
 *   analyze     영향도 분석 — `--path <파일>`(반복) 필수(fail-closed). 산출:
 *               .spec/map/impact.json + impact-verify-report.json + docs/09_release/
 *               change-impact-analysis.md(read-only). 생성예측 섹션은 `--precedent <flowId>
 *               --entity <명사>` [--change <relPath:line>]... 가 있을 때 추가.
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
const sub = process.argv[3] || 'seeds'
const flags = process.argv.slice(4)

function flagValue(name) {
  const i = flags.indexOf(name)
  return i >= 0 && i + 1 < flags.length ? flags[i + 1] : null
}
function flagValues(name) {
  const out = []
  for (let i = 0; i < flags.length; i++) if (flags[i] === name && i + 1 < flags.length) out.push(flags[i + 1])
  return out
}

const engine = await import(distEntry)

function loadInputsOrExit() {
  try {
    return engine.loadImpactInputs(projectRoot)
  } catch (err) {
    console.error(`입력 로드 실패: ${err.message}`)
    console.error('먼저 /understand-map scan(+confirm) 을 실행해 .spec/map/ 산출물을 만드세요(fail-closed).')
    process.exit(2)
  }
}

switch (sub) {
  case 'seeds':
    runSeeds()
    break
  case 'precedents':
    runPrecedents()
    break
  case 'analyze':
    runAnalyze()
    break
  default:
    console.error(`'${sub}' 미지원. 사용 가능: seeds | precedents | analyze.`)
    process.exit(2)
}

function runSeeds() {
  const inputs = loadInputsOrExit()
  console.log(`시드 매핑 카탈로그 — ${projectRoot}`)
  console.log('host(=너)가 사용자의 자연어 변경요청을 아래 후보로 매핑한 뒤, ✋확인 게이트를 거쳐 analyze --path 로 진행한다.')
  console.log('')
  console.log(`■ 라우트/배치 진입점 (${inputs.routes.routes.length}+${inputs.routes.batchEntries.length})`)
  for (const r of inputs.routes.routes) {
    console.log(`  - ${r.routeId}  →  ${r.handler ?? '(핸들러 미상)'}  [${r.filePath}:${r.line}]`)
  }
  for (const b of inputs.routes.batchEntries) {
    console.log(`  - ${b.entryId}  →  ${b.handler ?? '(핸들러 미상)'}  [${b.filePath}:${b.line}]`)
  }
  console.log('')
  if (inputs.confirmed) {
    console.log(`■ 확정 도메인 (${inputs.confirmed.domains.length})`)
    for (const d of inputs.confirmed.domains) console.log(`  - ${d.key} (${d.name}) · 루트 ${d.roots.length}개`)
  } else {
    console.log('■ 확정 도메인: 없음 (confirm 전 — 도메인/흐름 영향은 [확인 필요]로 강등)')
  }
  console.log('')
  console.log(`■ 파일 인벤토리: ${inputs.census.fileCount}개 (census). 자연어→파일 매핑은 host 역할.`)
}

function runPrecedents() {
  const domain = flagValues('--domain')
  const entity = flagValues('--entity')
  const op = flagValues('--op')
  const top = Number(flagValue('--top') || engine.DEFAULT_PRECEDENT_TOP_N)
  if (domain.length === 0 && entity.length === 0) {
    console.error('선례검색에는 최소 하나의 힌트가 필요합니다: --domain <힌트> [--entity <명사>] [--op <연산>]')
    process.exit(2)
  }
  let res
  try {
    res = engine.findPrecedents(
      projectRoot,
      { domainHints: domain, entityHints: entity, operationHints: op },
      { topN: top },
    )
  } catch (err) {
    console.error(`선례검색 실패: ${err.message}`)
    process.exit(2)
  }
  console.log(`선례검색(top-${res.topN}) — ${projectRoot}`)
  console.log('최고점 자동채택 아님(F2): 아래 후보 중 하나를 사용자가 선택한 뒤에만 [생성] 제안을 진행한다.')
  console.log('')
  if (res.empty) {
    console.log('선례 없음 — A-A3 강등: 역할 단위 스캐폴드 + 프로젝트 관례 앵커 + [확인 필요]로 진행(구체 파일명 생성 금지).')
    return
  }
  for (const c of res.candidates) {
    console.log(`◆ ${c.flowId}  (점수 ${c.score}, ${c.matchStrength})`)
    console.log(`   도메인: ${c.domainName ?? c.domainKey ?? '(미상)'}  진입: ${c.entryFile ?? '(없음)'}${c.entryLine ? ':' + c.entryLine : ''}`)
    console.log(`   근거: ${c.whyMatched.join(' / ')}`)
    const roles = Object.entries(c.filesByRole).filter(([, v]) => v.length > 0)
    for (const [role, files] of roles) console.log(`   ${role}: ${files.join(', ')}`)
    console.log('')
  }
}

function runAnalyze() {
  const paths = flagValues('--path')
  if (paths.length === 0) {
    console.error('analyze 에는 시드가 필요합니다: --path <파일> [--path <파일2> ...] (fail-closed).')
    console.error('자연어→시드 매핑은 host 역할 — 먼저 seeds 카탈로그를 받아 ✋확인 게이트를 거쳐라.')
    process.exit(2)
  }
  const seeds = paths.map((relPath) => ({ relPath, origin: 'path', confidence: 'CONFIRMED' }))
  let analyzed
  try {
    analyzed = engine.analyzeImpact(projectRoot, seeds)
  } catch (err) {
    console.error(`영향도 분석 실패: ${err.message}`)
    process.exit(2)
  }
  const { result, verify, inputs } = analyzed

  // 선택: 생성예측(보완 A) — 선례 flowId + 엔티티가 주어지면 [생성] 섹션 추가.
  let suggestion
  const precedentFlowId = flagValue('--precedent')
  const entity = flagValue('--entity')
  if (precedentFlowId && entity) {
    // 사용자가 precedents 에서 명시 선택한 flowId(F2) → 그 흐름 슬라이스를 직접 후보화.
    const precedent = engine.selectPrecedentByFlowId(inputs, precedentFlowId)
    if (!precedent) {
      console.error(`선례 흐름을 찾을 수 없습니다: ${precedentFlowId} (precedents 로 유효한 flowId 를 확인하세요).`)
      process.exit(2)
    }
    const changeTargets = flagValues('--change').map((spec) => {
      const idx = spec.lastIndexOf(':')
      if (idx <= 0) {
        console.error(`--change 형식은 <relPath:line> 입니다(라인 누락): ${spec}`)
        process.exit(2)
      }
      const line = Number(spec.slice(idx + 1))
      if (!Number.isInteger(line) || line < 1) {
        console.error(`--change 라인은 양의 정수여야 합니다(임의 line 1 강등 금지): ${spec}`)
        process.exit(2)
      }
      return { relPath: spec.slice(0, idx), line }
    })
    suggestion = engine.buildCreationSuggestion(projectRoot, {
      intent: { domainHints: [entity], entityHints: [entity], operationHints: flagValues('--op') },
      entityHint: entity,
      precedent,
      changeTargets,
      impact: result,
      census: inputs.census,
    })
    // L1 하드게이트 — 위반 시 발행 차단(fail-closed).
    if (suggestion.l1Violations.length > 0) {
      console.error('생성예측 L1 게이트 위반 — 발행 차단:')
      for (const v of suggestion.l1Violations) console.error(`  - ${v}`)
      process.exit(2)
    }
  }

  const doc = engine.buildChangeImpact(result, verify, {
    aggregate: { census: inputs.census.files, confirmed: inputs.confirmed, ownership: inputs.slices.ownership },
    suggestion,
  })
  const mdPath = engine.publishChangeImpact(projectRoot, doc, { sourceCommit: result.gitCommit })

  console.log(`영향도 분석 완료 — ${projectRoot}`)
  console.log(`  상류(영향받는 호출자): 파일 ${result.upstream.files.length} · API ${result.upstream.api.length} · 흐름 ${result.upstream.flows.length} · 도메인 ${result.upstream.domains.length}`)
  console.log(`  하류(의존 협력자): 파일 ${result.downstream.files.length}`)
  console.log(`  DB/영속성: 매퍼 ${result.upstream.persistence.mappers.length} (SQL ${result.upstream.persistence.sqlFiles.length})`)
  console.log(`  검토 필요: ${result.needsReview.length}건 · 근거율(인용 보유): ${verify.overall.groundedPct}%`)
  if (suggestion) {
    console.log(`  생성예측(${suggestion.strength}): [변경] ${suggestion.change.length} · [생성] ${suggestion.create.length} · [영향] ${suggestion.impact.length}`)
    console.log('  주의: [생성]은 net-new 라 CONFIRMED 불가(최대 [추정]) — 선례 앵커만 실존 근거.')
  }
  console.log(`  산출물: .spec/map/impact.json · impact-verify-report.json · ${mdPath}(read-only)`)
}
