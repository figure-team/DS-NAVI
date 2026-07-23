#!/usr/bin/env node
/**
 * /understand-incident 결정론 글루 CLI — DS-APM 장애 RCA 리포트 드롭 처리.
 * 사용:
 *   node incident.mjs ingest  <projectRoot>                 드롭 폴더 스캔·파싱·수령(runId 멱등)
 *   node incident.mjs seed    <projectRoot> --run <runId>   file:line → census 대조(시드 판정)
 *   node incident.mjs analyze <projectRoot> --run <runId>   understand-impact 엔진 실행(스냅샷 격리)
 *   node incident.mjs resolve-input <projectRoot> --run <runId>   해결방안서 LLM 입력 번들(유계)
 *   node incident.mjs finalize <projectRoot> --run <runId>  resolution.md 인용 검증 + 원장 확정
 *
 * 설계: docs/ktds/INCIDENT_ANALYSIS_DESIGN.md §2.3 · 계약: INCIDENT_DROP_CONTRACT.md.
 * 순수 로직(파싱·시드 판정)은 legacy-core `src/incident/`, 여기는 IO 경계만.
 * 원장: .understand-anything/incident-history/ledger.json (impact-history 와 동형 append,
 * 키=runId, 상한 50, 절삭 시 건 디렉터리 삭제). 건별: .understand-anything/incidents/<runId>/.
 * 루트 슬롯(.spec/map/impact.json)·문서 09·구조 오버레이는 **건드리지 않는다**(rtm-intake
 * code-impact 선례 — 스테이징 리다이렉트 후 스냅샷 이동).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error('엔진(@ktds/legacy-core)이 빌드되지 않았습니다:\n  pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const engine = await import(distEntry)
const { parseIncidentReport, resolveIncidentSeeds } = engine

const [, , cmd, projectRoot, ...flags] = process.argv

/** 드롭 폴더(계약 C2 — 가칭). 경로 확정 시 이 상수 1곳만 바꾼다. */
const INCIDENT_DROP_DIR = join('ds-hub', '장애')
const INCIDENT_HISTORY_MAX = 50
/** 드롭 파일 크기 상한(신뢰 불가 입력 DoS 방어). RCA 리포트는 수 KB — 1MB 면 넉넉하다. */
const MAX_DROP_BYTES = 1024 * 1024

function flagValue(name) {
  const i = flags.indexOf(name)
  return i >= 0 && i + 1 < flags.length ? flags[i + 1] : null
}
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
function uaDir() {
  return join(projectRoot, '.understand-anything')
}
function incidentDir(runId) {
  return join(uaDir(), 'incidents', runId)
}
function historyDir() {
  return join(uaDir(), 'incident-history')
}

/**
 * incident 원장 append — impact-history `appendLedgerEntry` 와 동형(최신 앞, 키 dedup,
 * 상한 절삭 + 절삭분 건 디렉터리 삭제). 키만 jobId→runId. 같은 runId 재기록 = 상태 전이.
 */
function appendIncidentLedger(entry) {
  const dir = historyDir()
  const ledgerPath = join(dir, 'ledger.json')
  let entries = []
  try {
    const raw = readJson(ledgerPath)
    if (Array.isArray(raw.entries)) entries = raw.entries
  } catch {
    // 부재/파손 = 기록 없음(정직한 empty)
  }
  const prev = entries.find((e) => e.runId === entry.runId)
  const next = [{ ...prev, ...entry }, ...entries.filter((e) => e.runId !== entry.runId)]
  mkdirSync(dir, { recursive: true })
  writeFileSync(ledgerPath, JSON.stringify({ entries: next.slice(0, INCIDENT_HISTORY_MAX) }, null, 2) + '\n', 'utf8')
  for (const drop of next.slice(INCIDENT_HISTORY_MAX)) {
    try {
      rmSync(incidentDir(drop.runId), { recursive: true, force: true })
    } catch {
      // 건 디렉터리 정리 실패는 무시(원장에서만 제거)
    }
  }
}

/** runId 는 디렉터리명이 된다 — rtm-intake sid 와 동일한 어휘 가드. */
/** runId 어휘 규칙(디렉터리명이 된다) — 순수 판정. exit 은 호출자가 결정한다. */
function isValidRunId(runId) {
  return /^[A-Za-z0-9._-]{1,64}$/.test(runId) && !runId.startsWith('.')
}
function guardRunId(runId) {
  if (!isValidRunId(runId)) {
    console.error(`runId 가 잘못됐습니다(영숫자·._- 만, 64자 이내, . 로 시작 불가): ${runId}`)
    process.exit(2)
  }
}

function requireRun() {
  const runId = flagValue('--run')
  if (!projectRoot || !runId) {
    console.error(`사용법: node incident.mjs ${cmd} <projectRoot> --run <runId>`)
    process.exit(2)
  }
  guardRunId(runId)
  const dir = incidentDir(runId)
  if (!existsSync(join(dir, 'report.json'))) {
    console.error(`수령된 건이 없습니다(ingest 먼저): ${join(dir, 'report.json')}`)
    process.exit(2)
  }
  return { runId, dir, report: readJson(join(dir, 'report.json')) }
}

function loadCensusRelPaths() {
  const censusPath = join(projectRoot, '.spec', 'map', 'census.json')
  if (!existsSync(censusPath)) {
    console.error(`census.json 이 없습니다 — 먼저 /understand-map scan 을 실행하세요(fail-closed): ${censusPath}`)
    process.exit(2)
  }
  const census = readJson(censusPath)
  return { relPaths: (census.files ?? []).map((f) => f.relPath), gitCommit: census.gitCommit ?? null }
}

// ── ingest: 드롭 폴더 스캔 → 파싱 → 수령(멱등) ──────────────────────────────
if (cmd === 'ingest') {
  if (!projectRoot) {
    console.error('사용법: node incident.mjs ingest <projectRoot>')
    process.exit(2)
  }
  const dropDir = join(projectRoot, INCIDENT_DROP_DIR)
  if (!existsSync(dropDir)) {
    console.log(`드롭 폴더 없음(수령 0건): ${dropDir}`)
    console.log('DS-APM 이 아직 리포트를 쓰지 않았거나 경로 계약(C2)이 미확정입니다.')
    process.exit(0)
  }
  const files = readdirSync(dropDir).filter((f) => f.endsWith('.md')).sort()
  console.log(`장애 리포트 수령 — ${dropDir} (.md ${files.length}건)`)
  let newCount = 0
  for (const name of files) {
    // 파일 크기 상한 — 드롭은 외부(DS-APM)가 쓰는 신뢰 불가 입력이라, 거대 파일 하나가
    // readFile+정규식으로 ingest 를 묶는 것을 막는다(정직한 skip, 배치는 계속).
    try {
      if (statSync(join(dropDir, name)).size > MAX_DROP_BYTES) {
        console.log(`  ! ${name} → 파일이 너무 큼(> ${Math.round(MAX_DROP_BYTES / 1024)}KB, 수령 건너뜀)`)
        continue
      }
    } catch {
      console.log(`  ! ${name} → 파일 상태 확인 실패(수령 건너뜀)`)
      continue
    }
    const raw = readFileSync(join(dropDir, name), 'utf8')
    const parsed = parseIncidentReport(raw)
    // unparseable 은 runId 가 없을 수 있다 — 파일명 해시로 대체 키(원문 보존이 목적).
    const runId = parsed.frontmatter?.runId || 'unparseable-' + createHash('sha256').update(name).digest('hex').slice(0, 12)
    // ★ 오염된 runId(외부가 통제) 는 이 파일만 건너뛴다 — exit 로 배치 전체를 죽이지 않는다.
    // (`svc/checkout`·`chk 1` 처럼 parseable 이어도 어휘 규칙 위반이면 디렉터리명이 될 수 없다.)
    if (!isValidRunId(runId)) {
      console.log(`  ! ${name} → runId 형식이 잘못됨(수령 건너뜀): "${runId}"`)
      continue
    }
    const dir = incidentDir(runId)
    if (existsSync(join(dir, 'report.json'))) {
      console.log(`  = ${name} — 이미 수령(runId ${runId.slice(0, 12)}…), 멱등 스킵`)
      continue
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'report.md'), raw, 'utf8') // 원문 불변 보존
    writeFileSync(
      join(dir, 'report.json'),
      JSON.stringify({ sourceFile: name, ingestedAt: new Date().toISOString(), ...parsed }, null, 2) + '\n',
      'utf8',
    )
    appendIncidentLedger({
      runId,
      sourceFile: name,
      service: parsed.frontmatter?.service ?? null,
      title: parsed.title,
      confidence: parsed.frontmatter?.confidence ?? null,
      baselineCommit: parsed.frontmatter?.baselineCommit ?? null,
      reportCreatedAt: parsed.frontmatter?.createdAt ?? null,
      ingestedAt: new Date().toISOString(),
      status: parsed.parseable ? 'ingested' : 'unparseable',
      reasons: parsed.reasons,
    })
    newCount++
    if (parsed.parseable) {
      console.log(`  + ${name} → runId ${runId.slice(0, 12)}… (${parsed.frontmatter.service}, confidence ${parsed.frontmatter.confidence}, refs ${parsed.refs.length})`)
    } else {
      console.log(`  ! ${name} → unparseable(원문 보존, 분석 차단): ${parsed.reasons.join(' · ')}`)
    }
  }
  console.log(`\n신규 ${newCount}건 · 원장: ${join(historyDir(), 'ledger.json')}`)
  console.log('다음(SKILL): 신규 건마다 `seed` 로 시드 판정 → 사용자 확인 게이트.')
  process.exit(0)
}

// ── seed: file:line 후보 → census 대조 ──────────────────────────────────────
if (cmd === 'seed') {
  const { runId, dir, report } = requireRun()
  if (!report.parseable) {
    console.error(`unparseable 건은 시드 판정 불가(원문만 보존): ${report.reasons.join(' · ')}`)
    process.exit(2)
  }
  const { relPaths, gitCommit } = loadCensusRelPaths()
  const res = resolveIncidentSeeds(report.refs, relPaths)
  writeFileSync(
    join(dir, 'seed.json'),
    JSON.stringify({ runId, censusGitCommit: gitCommit, ...res }, null, 2) + '\n',
    'utf8',
  )
  appendIncidentLedger({ runId, status: 'seeded', seeds: res.seeds.length, allNotInProject: res.allNotInProject })

  console.log(`시드 판정 — ${report.sourceFile} (runId ${runId.slice(0, 12)}…)`)
  for (const r of res.resolutions) {
    const mark = r.verdict === 'matched' ? '✓' : r.verdict === 'ambiguous' ? '?' : '✗'
    const detail =
      r.verdict === 'matched'
        ? `→ ${r.relPath}${r.via === 'basename' ? ' (basename 유일)' : ''}`
        : r.verdict === 'ambiguous'
          ? `후보 ${r.candidates.length}개: ${r.candidates.join(' · ')}`
          : '이 프로젝트에 없음'
    console.log(`  ${mark} ${r.ref.path}:${r.ref.line} [${r.ref.section}] ${detail}`)
  }
  // 장애 baselineCommit vs 스캔 커밋 — 다르면 UI "커밋 불일치" 배지의 근거(침묵 금지).
  const baseline = report.frontmatter?.baselineCommit
  if (baseline && gitCommit && baseline !== gitCommit) {
    console.log(`  ⚠ 커밋 불일치: 리포트 baseline ${baseline.slice(0, 8)} ≠ 스캔 census ${gitCommit.slice(0, 8)} — 재스캔 검토`)
  }
  if (res.allNotInProject) {
    console.log('\n★ 전량 not-in-project — **다른 프로젝트의 리포트일 수 있습니다**(DS-APM 서비스→레포 매핑 확인).')
    console.log('  시드 0개라 영향 분석은 진행할 수 없습니다(fail-closed).')
    process.exit(0)
  }
  console.log(`\n시드 ${res.seeds.length}개: ${res.seeds.join(' · ')}`)
  console.log('다음(SKILL): 위 시드를 사용자에게 제시하고 ✋확인 게이트 후 `analyze`. ambiguous 는 사용자 지정으로 해소.')
  process.exit(0)
}

// ── analyze: 확정 시드 → impact 엔진(스테이징 리다이렉트 → 스냅샷 격리) ──────
if (cmd === 'analyze') {
  const { runId, dir, report } = requireRun()
  const seedPath = join(dir, 'seed.json')
  if (!existsSync(seedPath)) {
    console.error('seed.json 이 없습니다(seed 먼저).')
    process.exit(2)
  }
  const seedRes = readJson(seedPath)
  // 사용자 확정 오버라이드(--path 반복) — 대시보드 시드 게이트에서 ambiguous 해소·시드 조정 시
  // 사용한다. 없으면 seed.json 의 결정론 시드 그대로. 오버라이드도 실존 검증(fail-closed).
  const overridePaths = []
  for (let i = 0; i < flags.length; i++) if (flags[i] === '--path' && flags[i + 1]) overridePaths.push(flags[i + 1])
  let seedPaths = seedRes.seeds
  let seedGate = null
  if (overridePaths.length > 0) {
    const missing = overridePaths.filter((p) => !existsSync(join(projectRoot, p)))
    if (missing.length > 0) {
      console.error(`--path 시드가 실존하지 않습니다(fail-closed): ${missing.join(' · ')}`)
      process.exit(2)
    }
    seedPaths = overridePaths
    seedGate = 'user-confirmed'
  }
  if (!Array.isArray(seedPaths) || seedPaths.length === 0) {
    console.error('확정 시드가 0개입니다 — 영향 분석 불가(fail-closed). not-in-project/ambiguous 는 사용자 해소가 먼저입니다.')
    process.exit(2)
  }
  const seeds = seedPaths.map((relPath) => ({ relPath, origin: 'path', confidence: 'CONFIRMED' }))
  const stageReport = `impact-incident-${runId.slice(0, 16)}.json`
  const stageVerify = `impact-incident-verify-${runId.slice(0, 16)}.json`
  let analyzed
  try {
    analyzed = engine.analyzeImpact(projectRoot, seeds, undefined, {
      reportFilename: stageReport,
      verifyFilename: stageVerify,
    })
  } catch (err) {
    // 스테이징 잔재 청소 — 엔진이 리포트를 쓴 뒤 검증에서 throw 하면 `.spec/map/` 에
    // 곁다리 파일이 남는다(고정명이라 누적은 없으나 실패 후 잔재는 소비처를 헷갈리게 한다).
    for (const f of [stageReport, stageVerify]) {
      try {
        rmSync(join(projectRoot, '.spec', 'map', f), { force: true })
      } catch {
        // 청소 실패는 무시(원래 오류가 본선)
      }
    }
    console.error(`영향도 분석 실패: ${err.message}`)
    console.error('  먼저 /understand-map scan(+confirm) 으로 .spec/map/ 산출물을 만드세요(fail-closed).')
    process.exit(2)
  }
  const { result, verify } = analyzed

  // 스냅샷 격리(설계 §2.2) — 루트 슬롯·문서 09·오버레이 무변경(code-impact 선례).
  for (const [stagePath, name] of [
    [analyzed.impactPath, 'impact.json'],
    [analyzed.verifyPath, 'impact-verify-report.json'],
  ]) {
    copyFileSync(stagePath, join(dir, name))
    rmSync(stagePath, { force: true })
  }

  // ★ 연합(IMPACT_LEDGER_FEDERATION_DESIGN §2.1) — impact-history 복사·append 를 제거했다.
  // 정본은 incidents/<runId>/ 하나이고, /change 목록·스냅샷 서빙은 서버가 incident-history
  // 원장을 읽기 시점에 병합/해석한다. jobId(결정론 해시)는 병합 dedup·열람 키로 원장에 남긴다.
  const jobId = createHash('sha256').update(`incident:${runId}`, 'utf8').digest('hex').slice(0, 16)
  appendIncidentLedger({
    runId,
    status: 'analyzed',
    jobId,
    analyzedAt: new Date().toISOString(), // 연합 파생 행의 시각 축(구 항목은 스냅샷 mtime 근사)
    analyzedGitCommit: result.gitCommit,
    seedGate,
  })

  console.log(`영향 분석 — runId ${runId.slice(0, 12)}… (시드 ${seeds.length}개)`)
  console.log(`  상류: 파일 ${result.upstream.files.length} · API ${result.upstream.api.length} · 흐름 ${result.upstream.flows.length} · 도메인 ${result.upstream.domains.length}`)
  console.log(`  하류: 파일 ${result.downstream.files.length} · 매퍼 ${result.upstream.persistence.mappers.length}`)
  console.log(`  근거율: ${verify.overall.groundedPct}% · 영향 도메인: ${result.upstream.domains.map((d) => d.key).join(' · ') || '(없음)'}`)
  console.log(`  스냅샷: ${dir}/impact.json (+verify) · 병합 열람 jobId ${jobId}(/change 는 읽기 병합)`)
  console.log('  루트 슬롯(.spec/map/impact.json)·문서 09·구조 오버레이: 무변경')
  console.log('다음(SKILL): `resolve-input` 으로 해결방안서 입력 번들 생성.')
  process.exit(0)
}

// impact-history append 헬퍼는 연합(IMPACT_LEDGER_FEDERATION_DESIGN §2.1)으로 제거됐다 —
// /change 노출은 서버가 incident-history 원장을 읽기 시점에 병합한다.

// ── resolve-input: 해결방안서 LLM 입력 번들(유계 — "이 요약이 판단 입력의 전부") ─
if (cmd === 'resolve-input') {
  const { runId, dir, report } = requireRun()
  const seed = existsSync(join(dir, 'seed.json')) ? readJson(join(dir, 'seed.json')) : null
  const impact = existsSync(join(dir, 'impact.json')) ? readJson(join(dir, 'impact.json')) : null
  if (!seed || !impact) {
    console.error('seed.json/impact.json 이 없습니다 — seed → analyze 를 먼저 완료하세요(fail-closed).')
    process.exit(2)
  }
  const bundle = {
    runId,
    // RCA 원문 섹션(수정 제안은 "DS-APM RCA 제안" 인용 승계용, 한계는 말미 승계 필수)
    report: {
      service: report.frontmatter.service,
      confidence: report.frontmatter.confidence,
      baselineCommit: report.frontmatter.baselineCommit,
      title: report.title,
      sections: report.sections,
    },
    // 시드 판정(근거 있는 파일만)
    seeds: seed.resolutions.filter((r) => r.verdict === 'matched').map((r) => ({ relPath: r.relPath, line: r.ref.line })),
    unresolved: seed.resolutions.filter((r) => r.verdict !== 'matched'),
    // 영향 요약(엔진 결과만 — 영향 단언의 유일한 인용원)
    impact: {
      gitCommit: impact.gitCommit,
      upstream: {
        files: impact.upstream.files,
        api: impact.upstream.api,
        flows: impact.upstream.flows,
        domains: impact.upstream.domains,
      },
      downstream: { files: impact.downstream.files, persistence: impact.upstream.persistence },
      needsReview: impact.needsReview,
    },
  }
  writeFileSync(join(dir, 'resolution-input.json'), JSON.stringify(bundle, null, 2) + '\n', 'utf8')
  console.log(`해결방안서 입력 번들: ${join(dir, 'resolution-input.json')}`)
  console.log('다음(SKILL): 이 번들**만** 근거로 resolution.md 를 작성한다(전 소스를 읽지 않는다).')
  console.log('  규약: 영향 단언=impact 결과만 인용 · 수정 제안="DS-APM RCA 제안" 표기 승계 · 한계 말미 승계 · 무근거=[추정].')
  process.exit(0)
}

// ── finalize: resolution.md 인용 검증(pre-cite 게이트) + 원장 확정 ───────────
if (cmd === 'finalize') {
  const { runId, dir, report } = requireRun()
  const resolutionPath = join(dir, 'resolution.md')
  if (!existsSync(resolutionPath)) {
    console.error(`resolution.md 가 없습니다: ${resolutionPath}`)
    process.exit(2)
  }
  const md = readFileSync(resolutionPath, 'utf8')
  if (md.trim().length === 0) {
    console.error('resolution.md 가 비어 있습니다.')
    process.exit(2)
  }
  // 인용 실재 대조(fail-closed) — 문서 **전체**의 file:line 이 census 에 실존해야 한다.
  // ★ 판정을 seed 매핑과 **같은 엔진 함수**(resolveIncidentSeeds)로 통일한다 — 예전엔
  // finalize 가 자체 basename 규칙(`endsWith('/'+ref)`, 루트 census 파일 누락)과 `onDisk`
  // 우회(census 밖 node_modules 도 통과)를 써서 seed 게이트와 규칙이 갈렸다. census 가
  // 실재의 유일 기준이다: matched(정확일치|basename 유일) 가 아니면 전부 dangling.
  const { relPaths } = loadCensusRelPaths()
  const refs = engine.extractFileLineRefs(md)
  const check = engine.resolveIncidentSeeds(
    refs.map((r) => ({ path: r.path, line: r.line, section: '근본 원인' })),
    relPaths,
  )
  const dangling = check.resolutions
    .filter((r) => r.verdict !== 'matched')
    .map((r) => `${r.ref.path}:${r.ref.line} (${r.verdict})`)
  if (dangling.length > 0) {
    console.error(`인용 실재 대조 실패 — 실존하지 않는 file:line ${dangling.length}건(발행 차단):`)
    for (const d of dangling) console.error(`  - ${d}`)
    process.exit(2)
  }
  // 한계 승계 확인 — 리포트에 한계가 있는데 문서에 없으면 경고(차단은 아님, SKILL 규약이 본선).
  if (report.sections?.['한계'] && !/^##\s+한계/m.test(md)) {
    console.log('⚠ 리포트의 `## 한계` 가 resolution.md 에 승계되지 않았습니다 — 과신 방지를 위해 승계를 권장합니다.')
  }
  appendIncidentLedger({ runId, status: 'resolved', resolvedAt: new Date().toISOString() })
  console.log(`해결방안서 확정 — ${resolutionPath} (인용 ${refs.length}건 실재 대조 통과)`)
  console.log(`원장: ${join(historyDir(), 'ledger.json')} — status: resolved`)
  process.exit(0)
}

console.error(
  '사용법:\n' +
    '  node incident.mjs ingest  <projectRoot>\n' +
    '  node incident.mjs seed    <projectRoot> --run <runId>\n' +
    '  node incident.mjs analyze <projectRoot> --run <runId>\n' +
    '  node incident.mjs resolve-input <projectRoot> --run <runId>\n' +
    '  node incident.mjs finalize <projectRoot> --run <runId>',
)
process.exit(2)
