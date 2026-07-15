#!/usr/bin/env node
/**
 * /understand-rtm 인테이크 단계화(절차 A)의 결정론 글루 CLI.
 * 사용:
 *   node rtm-intake.mjs validate <identified.json 경로> [--project <projectRoot>]
 *   node rtm-intake.mjs intake-input <projectRoot> --request <원문> [--session <sid>]
 *   node rtm-intake.mjs project  <projectRoot> <sid>
 *
 * - intake-input(①전 근거 번들, P3): 분석 산출물 3축(도메인·데이터·추적표)을 요청 원문으로
 *   사전 필터해 **유계 요약**을 rtm-intake/<sid>/intake-input.json 에 쓴다. ①이 이걸 읽고
 *   설계한다(현재는 rtm.json 하나만 보고 지어낸다 — 설계서 §1.1).
 * - validate(①후 게이트): identified.json 을 스키마로 검증 + 비치명 일관성 진단
 *   + **실재 대조 게이트(P1, fail-closed exit 2)** — changeset 기능 ⊂ rtm.json,
 *   참조 테이블 ⊂ db-schema.json. projectRoot 는 경로 규약에서 역산하거나 --project 로 준다.
 * - project(⑤): identified.json(2계층) → 현 rtm-requirements.json 스키마로 **투영·병합**(옵션 B).
 *   요구사항(SFR…)을 1급 requirement 로, changeset.added 를 TO-BE 기능 스텁으로. 기존 보존(id 병합).
 *   투영 후 SKILL 이 understand-rtm.mjs 를 돌려 rtm.json 을 재생성한다.
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §9(옵션 B).
 */
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')

if (!existsSync(distEntry)) {
  console.error('엔진(@ktds/legacy-core)이 빌드되지 않았습니다:\n  pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const engine = await import(distEntry)
const {
  parseIdentifiedIntake,
  diagnoseIntake,
  checkIntakeGrounding,
  intakeReqToRtmRequirement,
  intakeFnStub,
  fnDomainKey,
  withdrawRequest,
  computeChangeImpact,
  buildIntakeInputBundle,
  serializeIntakeBundle,
  checkMinimalSet,
} = engine

const [, , cmd, ...rest] = process.argv

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// ── 실재 대조 인벤토리 로드(P1) — IO 경계. 순수 게이트는 legacy-core 가 갖고 여기선 읽어 주입만.
// 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.1-4.

/**
 * identified.json 경로에서 projectRoot 를 역산한다.
 * 규약 경로: <projectRoot>/.understand-anything/rtm-intake/<sid>/identified.json (SKILL.md:84).
 * 규약에 안 맞으면 null — 호출자가 --project 로 명시해야 한다.
 */
function deriveProjectRoot(identifiedPath) {
  const abs = resolve(identifiedPath)
  const parts = abs.split(sep)
  const i = parts.lastIndexOf('.understand-anything')
  if (i <= 0) return null
  return parts.slice(0, i).join(sep) || sep
}

/**
 * rtm.json(기능 id) · db-schema.json(테이블명) 을 읽어 인벤토리를 만든다.
 * 각 축은 **있을 때만** 채운다 — 없는 축은 undefined 로 남겨 대조를 생략시킨다(P1 은 부재를
 * 차단하지 않는다. 최소집합 부재의 fail-closed 는 P7 완료 게이트 몫 — 설계서 §9).
 */
function loadIntakeInventory(projectRoot) {
  const inv = {}
  const sources = []
  const missing = []

  const rtmPath = join(projectRoot, '.understand-anything', 'rtm.json')
  if (existsSync(rtmPath)) {
    try {
      const rtm = readJson(rtmPath)
      inv.fnIds = (rtm.functions ?? []).map((f) => f.id).filter((id) => typeof id === 'string')
      sources.push(`rtm.json 기능 ${inv.fnIds.length}건`)
    } catch (err) {
      missing.push(`rtm.json 파싱 실패(${err.message}) — 기능 대조 생략`)
    }
  } else {
    missing.push('rtm.json 없음 — 기능 대조 생략')
  }

  const dbPath = join(projectRoot, '.spec', 'map', 'db-schema.json')
  if (existsSync(dbPath)) {
    try {
      const db = readJson(dbPath)
      inv.tables = (db.tables ?? []).map((t) => t.name).filter((n) => typeof n === 'string')
      sources.push(`db-schema.json 테이블 ${inv.tables.length}건`)
    } catch (err) {
      missing.push(`db-schema.json 파싱 실패(${err.message}) — 테이블 대조 생략`)
    }
  } else {
    missing.push('db-schema.json 없음 — 테이블 대조 생략')
  }

  return { inventory: inv, sources, missing }
}

// ── validate ────────────────────────────────────────────────────────────────
if (cmd === 'validate') {
  const target = rest[0]
  if (!target || !existsSync(target)) {
    console.error(`identified.json 경로가 필요합니다(없음): ${target ?? '(미지정)'}`)
    process.exit(2)
  }
  // --project <root>: 실재 대조 인벤토리의 출처. 미지정이면 경로 규약에서 역산한다.
  const projIdx = rest.indexOf('--project')
  const projectRoot =
    projIdx >= 0 && rest[projIdx + 1] ? resolve(rest[projIdx + 1]) : deriveProjectRoot(target)
  let raw
  try {
    raw = readJson(target)
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
  console.log(`identified.json 검증 통과 — ${target}`)
  console.log(`  요청 ${intake.request.id} (${intake.request.name}) · 요구사항 ${intake.requirements.length}건 · 질문 ${intake.questions.length}`)
  for (const r of intake.requirements) {
    console.log(`    - ${r.id} [${r.category}] ${r.name} (${r.priority}${r.derivedFrom ? ` ←${r.derivedFrom}` : ''})`)
  }
  const diags = diagnoseIntake(intake)
  if (diags.length > 0) {
    console.log(`  ⚠ 일관성 진단 ${diags.length}건(강제 아님, 검토 권장):`)
    for (const d of diags) console.log(`    - ${d}`)
  }

  // ★ 실재 대조 게이트(P1, P1b 교정) — error 만 fail-closed(exit 2). info(신규 테이블 제안)는
  // 표면화만 하고 통과시킨다: 신규 제안 자체는 정당하고, "db-schema 를 안 봤다"는 게이트로
  // 검출할 수 없다(P3 근거 번들·P2/P5 인용 요구가 푼다). 설계: RTM_IMPACT_GATE_DESIGN.md §1.2.
  if (projectRoot) {
    const { inventory, sources, missing } = loadIntakeInventory(projectRoot)
    console.log(`  실재 대조 인벤토리(${projectRoot}): ${sources.length > 0 ? sources.join(' · ') : '없음'}`)
    for (const m of missing) console.log(`    ⚠ ${m}`)
    const found = checkIntakeGrounding(intake, inventory)
    const errors = found.filter((v) => v.level === 'error')
    const infos = found.filter((v) => v.level !== 'error')
    if (infos.length > 0) {
      console.error(`\n⚠ 신규 참조 ${infos.length}건 — 차단하지 않습니다(신규 제안은 정당). 근거를 확인하십시오:`)
      for (const v of infos) console.error(`    - [${v.kind}] ${v.message}`)
      console.error(
        '  → 제안 전에 db-schema.json 을 대조했는지, 기존 테이블 확장으로 될 일은 아닌지 검토하십시오.\n' +
          '    확신이 없으면 `questions[]` 에 [확인필요] 로 올려 사람이 판단하게 하십시오.',
      )
    }
    if (errors.length > 0) {
      console.error(`\n✗ 실재 대조 실패 ${errors.length}건:`)
      for (const v of errors) console.error(`    - [${v.kind}] ${v.message}`)
      console.error(
        '\n고치는 법:\n' +
          '  - unknown-fn: 바꾸려는 기능은 실존해야 합니다 — rtm.json functions[].id 만 쓰십시오.\n' +
          '    신규 기능은 changeset.added 에 `to-be:` 접두로 넣습니다.\n' +
          '  - unknown-table: 신규 테이블 제안 자체는 허용됩니다. 다만 db-schema.json 에 없는 것을\n' +
          '    [확정] 으로 단언하지 마십시오 — 근거 없는 확정은 금지입니다([추정]으로 낮추십시오).\n' +
          '  - uncited-confirmed: 근거 0건인 AC 를 [확정] 으로 단언했습니다. 근거를 달거나\n' +
          '    (acceptanceCriteria[].evidence 에 {file, line}), 신뢰도를 [추정]으로 낮추십시오.',
      )
      process.exit(2)
    }
    console.log(
      `  ✓ 실재 대조 통과 — changeset 기능이 전부 실재합니다${infos.length > 0 ? ` (신규 테이블 참조 ${infos.length}건은 [추정] 제안으로 통과)` : ''}.`,
    )
  } else {
    console.log('  ⚠ 실재 대조 생략 — projectRoot 를 못 찾았습니다(--project <projectRoot> 로 지정).')
  }

  console.log('전부 [추정] 상태. 사용자가 단계 컨펌 후 다음 단계로 진행한다.')
  process.exit(0)
}

// ── intake-input(①전): 근거 번들 v1 조립 — 3축 유계 요약 ──────────────────────
// 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.2 · §9 P3 · §10-1.
// IO 경계: 여기서 읽고/쓰고/exit 한다. 필터·요약·캡은 전부 legacy-core 의 순수 함수.
if (cmd === 'intake-input') {
  const projectRoot = rest[0]
  const reqIdx = rest.indexOf('--request')
  const request = reqIdx >= 0 ? rest[reqIdx + 1] : undefined
  const sidIdx = rest.indexOf('--session')
  // --session 미지정이면 요청 원문의 결정론 해시로 세션을 잡는다(Date.now() 금지 — 재현성).
  const sid = sidIdx >= 0 && rest[sidIdx + 1] ? rest[sidIdx + 1] : null
  const outIdx = rest.indexOf('--out')
  const outOverride = outIdx >= 0 && rest[outIdx + 1] ? rest[outIdx + 1] : null

  if (!projectRoot || !request) {
    console.error('사용법: node rtm-intake.mjs intake-input <projectRoot> --request <원문> [--session <sid>] [--out <경로>]')
    process.exit(2)
  }

  // 3축 소스 로드. 파싱 실패는 **부재와 구분**한다 — "손상"을 "없음"으로 뭉개면 §4.1 오독의 재판이다.
  const load = (path, label) => {
    if (!existsSync(path)) return { value: null, note: null }
    try {
      return { value: readJson(path), note: null }
    } catch (err) {
      return { value: null, note: `${label} 파싱 실패(${err.message}) — 없는 것으로 취급합니다: ${path}` }
    }
  }
  const uaDir = join(projectRoot, '.understand-anything')
  const mapDir = join(projectRoot, '.spec', 'map')
  const loaded = {
    domainGraph: load(join(uaDir, 'domain-graph.json'), 'domain-graph.json'),
    dbSchema: load(join(mapDir, 'db-schema.json'), 'db-schema.json'),
    crudMatrix: load(join(mapDir, 'crud-matrix.json'), 'crud-matrix.json'),
    rtm: load(join(uaDir, 'rtm.json'), 'rtm.json'),
    // P4 화면 축 — 축소 모드(§10-1): 없으면 생략하고 번들에 명시(exit 2 아님).
    screens: load(join(uaDir, 'screens.json'), 'screens.json'),
  }
  const sources = Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, v.value]))
  for (const { note } of Object.values(loaded)) if (note) console.error(`⚠ ${note}`)

  // ★ P4 정책 축 — `doc-output/policy-*.md` 전량을 **원문 그대로** 넘긴다(파싱은 legacy-core 의
  //   순수 함수 몫). 파일명 정렬 고정 = 결정론. 없으면 null → 축소 모드.
  const docOutDir = join(uaDir, 'doc-output')
  let policyDocs = null
  if (existsSync(docOutDir)) {
    const names = readdirSync(docOutDir)
      .filter((n) => n.startsWith('policy-') && n.endsWith('.md'))
      .sort()
    const docs = []
    for (const n of names) {
      try {
        docs.push({ relPath: `.understand-anything/doc-output/${n}`, markdown: readFileSync(join(docOutDir, n), 'utf8') })
      } catch (err) {
        console.error(`⚠ 정책서 읽기 실패(${n}): ${err.message} — 생략합니다.`)
      }
    }
    if (docs.length > 0) policyDocs = docs
  }
  sources.policyDocs = policyDocs

  // ★ 최소집합 fail-closed(§10-1 사용자 결정) — 도메인·데이터·추적표 중 하나라도 없으면 exit 2.
  //   현재 인테이크는 rtm.json 이 없어도 **조용히 빈 인벤토리로 진행**한다(rtm-intake.mjs:167-180).
  //   `understand-rtm/SKILL.md:45` 가 "없으면 멈춤"이라 규정만 하고 코드엔 없던 것을 여기서 구현한다.
  const minimal = checkMinimalSet(sources)
  if (!minimal.ok) {
    console.error(`\n✗ 최소집합 부재 — 근거 번들을 만들 수 없습니다(${projectRoot}).`)
    console.error('  없는 축:')
    for (const m of minimal.missing) console.error(`    - ${m}`)
    console.error(
      '\n근거 없이 요구사항을 설계하면 인테이크가 지어냅니다(설계서 §1.2).\n' +
        '  먼저 분석을 돌리십시오: /understand-map → /understand-rtm',
    )
    process.exit(2)
  }

  const bundle = buildIntakeInputBundle(sources, { request })

  // 세션 디렉터리: --session 우선, 없으면 요청 원문 해시(결정론 — 같은 요청 → 같은 sid).
  const sessionId = sid ?? `req-${createHash('sha256').update(request, 'utf8').digest('hex').slice(0, 8)}`
  const outPath = outOverride ?? join(uaDir, 'rtm-intake', sessionId, 'intake-input.json')
  mkdirSync(dirname(outPath), { recursive: true })
  // ★ charCap 이 재는 것과 **같은 직렬화**로 쓴다 — 어긋나면 캡이 장식이 된다(intake-bundle.ts).
  const serialized = serializeIntakeBundle(bundle)
  writeFileSync(outPath, serialized, 'utf8')

  const pct = (e) => (e.rate === null ? '측정 불가(항목 0건)' : `${(e.rate * 100).toFixed(0)}% (${e.cited}/${e.total})`)
  const axisLine = (label, a) =>
    a.present
      ? `  ${label}: ${a.selected}/${a.total} 선정${a.omittedCount > 0 ? ` (미포함 ${a.omittedCount})` : ''} · 근거율 ${pct(a.evidence)}${a.gitCommit ? ` · 커밋 ${a.gitCommit.slice(0, 8)}` : ' · 커밋 없음'}`
      : `  ${label}: ✗ 소스 없음 — **"없다"가 아니라 "못 봤다"입니다**`

  console.log(`근거 번들 조립 완료(P4 v2 — 도메인·데이터·추적표·화면·정책 5축 + pre-cite) — ${projectRoot}`)
  console.log(`  요청: "${request}"`)
  console.log(`  판별 토큰: ${bundle.request.tokens.join(', ') || '(없음 — 전부 불용어)'} · 필터 ${bundle.filter.mode}`)
  console.log(axisLine('도메인  ', bundle.axes.domain))
  console.log(axisLine('스키마  ', bundle.axes.data.schema))
  console.log(axisLine('CRUD    ', bundle.axes.data.crud))
  console.log(axisLine('추적표  ', bundle.axes.rtm))
  console.log(axisLine('화면    ', bundle.axes.screens))
  console.log(axisLine('정책    ', bundle.axes.policy))
  if (bundle.axes.domain.items.length > 0) {
    console.log(`  선정 도메인: ${bundle.axes.domain.items.map((d) => `${d.name}(${d.id})`).join(' · ')}`)
  }
  if (bundle.axes.data.schema.items.length > 0) {
    console.log(`  선정 테이블: ${bundle.axes.data.schema.items.map((t) => t.name).join(' · ')}`)
  }
  if (bundle.axes.screens.items.length > 0) {
    console.log(`  선정 화면: ${bundle.axes.screens.items.map((s) => `${s.title ?? s.id}[ann ${s.annotations.length}/${s.annotationCount}]`).join(' · ')}`)
  }
  if (bundle.axes.policy.items.length > 0) {
    console.log(`  선정 정책서: ${bundle.axes.policy.items.map((d) => `${d.docId}(절 ${d.sections.length}·행 ${d.rowCount})`).join(' · ')}`)
  }
  // pre-cite 실적 — 이 번들의 존재 이유라 눈에 보이게 센다(§6.2 "인용 생산을 LLM 에서 제거").
  const preCites =
    bundle.axes.domain.items.reduce((n, d) => n + d.claims.reduce((m, c) => m + c.citations.filter((z) => z.snippet).length, 0), 0) +
    bundle.axes.screens.items.reduce(
      (n, s) => n + s.annotations.reduce((m, a) => m + (a.handler?.evidence ?? []).filter((z) => z.snippet).length, 0),
      0,
    )
  console.log(`  pre-cite(스니펫 동봉 인용): ${preCites}건 — LLM 은 이걸 verbatim 복사만 하십시오(인용 생산 금지).`)
  for (const f of bundle.filter.fallbacks) console.log(`  ⚠ ${f}`)
  for (const w of bundle.warnings) console.log(`  ⚠ ${w}`)
  if (bundle.omitted.length > 0) {
    console.log(`  ⚠ charCap(${bundle.charCap.limit}) 초과로 ${bundle.omitted.length}건 생략(조용한 누락 아님 — omitted[] 에 전부 기록):`)
    for (const o of bundle.omitted.slice(0, 5)) console.log(`    - ${o}`)
    if (bundle.omitted.length > 5) console.log(`    … 외 ${bundle.omitted.length - 5}건`)
  }
  if (bundle.charCap.exceeded) {
    console.log(`  ⚠ 트림 후에도 예산(${bundle.charCap.limit}자) 초과 — 번들이 유계가 아닙니다.`)
  }
  // P4 축별 예산 실적 — "왜 이만큼만 실렸나"를 사람이 감사할 수 있게.
  console.log('  축별 예산(P4 — floor 최소보장 + 잔여 가중배분):')
  for (const [k, b] of Object.entries(bundle.budget)) {
    const tight = b.used < b.demand ? ` ← 수요 ${b.demand} 중 트림됨` : ''
    console.log(`    ${k.padEnd(8)} 사용 ${String(b.used).padStart(6)} / 배분 ${String(b.allocated).padStart(6)} (floor ${b.floor})${tight}`)
  }
  console.log(`  번들 크기: ${serialized.length}자 / 예산 ${bundle.charCap.limit}자`)
  console.log(`  산출물: ${outPath}`)
  console.log('')
  console.log('다음 단계(SKILL ①식별): 호스트(LLM)가 위 파일을 읽어 요구사항을 분해한다.')
  console.log('  ※ 이 요약이 판단 입력의 전부다 — 전 소스를 읽지 않는다(understand-map/SKILL.md:82 와 동일 계약).')
  console.log('  ※ 근거율·항목수를 함께 읽어라. 0건은 "없음"이 아니라 "못 봄"일 수 있다(설계서 §4.1).')
  process.exit(0)
}

// ── next-req(①): 충돌 없는 다음 요청ID 산출 ──────────────────────────────────
// 요청ID(REQ-)는 요구사항 id 로 존재하지 않고 source.section 에만 있을 수 있다. 둘 다(및 원장)를
// 스캔해 최댓값+1 을 돌려준다(요구사항 id 만 보면 section 으로 쓰인 번호와 충돌한다).
if (cmd === 'next-req') {
  const projectRoot = rest[0]
  if (!projectRoot) {
    console.error('사용법: node rtm-intake.mjs next-req <projectRoot>')
    process.exit(2)
  }
  const uaDir = join(projectRoot, '.understand-anything')
  let maxN = 0
  const scan = (obj) => {
    for (const r of obj.requirements ?? []) {
      for (const v of [r.id, r.source && r.source.section]) {
        const m = /^REQ-(\d+)$/.exec(String(v ?? ''))
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
      }
    }
  }
  for (const name of ['rtm.json', 'rtm-requirements.json']) {
    const path = join(uaDir, name)
    if (existsSync(path)) {
      try {
        scan(readJson(path))
      } catch {
        /* 손상 무시 */
      }
    }
  }
  console.log(`REQ-${String(maxN + 1).padStart(3, '0')}`)
  process.exit(0)
}

// ── next-cr(절차 B): 충돌 없는 다음 변경요청ID(CR-00N) ────────────────────────
// changeReq.crNo 는 요구사항 id 가 아니라 메타에만 존재한다. rtm-requirements.json·rtm.json 의
// 모든 changeReq.crNo 를 스캔해 최댓값+1 을 돌려준다(next-req 와 동일한 충돌 방지 규약).
if (cmd === 'next-cr') {
  const projectRoot = rest[0]
  if (!projectRoot) {
    console.error('사용법: node rtm-intake.mjs next-cr <projectRoot>')
    process.exit(2)
  }
  const uaDir = join(projectRoot, '.understand-anything')
  let maxN = 0
  const scan = (obj) => {
    for (const r of obj.requirements ?? []) {
      const m = /^CR-(\d+)$/.exec(String(r.changeReq?.crNo ?? ''))
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
    }
  }
  for (const name of ['rtm.json', 'rtm-requirements.json']) {
    const path = join(uaDir, name)
    if (existsSync(path)) {
      try {
        scan(readJson(path))
      } catch {
        /* 손상 무시 */
      }
    }
  }
  console.log(`CR-${String(maxN + 1).padStart(3, '0')}`)
  process.exit(0)
}

// ── project(⑤) ───────────────────────────────────────────────────────────────
if (cmd === 'project') {
  const projectRoot = rest[0]
  const sid = rest[1]
  if (!projectRoot || !sid) {
    console.error('사용법: node rtm-intake.mjs project <projectRoot> <sid>')
    process.exit(2)
  }
  const uaDir = join(projectRoot, '.understand-anything')
  const idPath = join(uaDir, 'rtm-intake', sid, 'identified.json')
  if (!existsSync(idPath)) {
    console.error(`identified.json 이 없습니다: ${idPath}`)
    process.exit(2)
  }
  let intake
  try {
    intake = parseIdentifiedIntake(readJson(idPath))
  } catch (err) {
    console.error(`identified.json 검증 실패:\n${err.message}`)
    process.exit(1)
  }

  // 인벤토리(도메인·featureId max·기존 기능 id)는 rtm.json 에서.
  const rtmPath = join(uaDir, 'rtm.json')
  let domains = []
  let existingFnIds = new Set()
  let featureSeq = 0
  if (existsSync(rtmPath)) {
    try {
      const rtm = readJson(rtmPath)
      domains = Array.isArray(rtm.domains) ? rtm.domains : []
      for (const f of rtm.functions ?? []) {
        if (typeof f.id === 'string') existingFnIds.add(f.id)
        const n = parseInt(String(f.featureId ?? '').replace(/\D/g, '') || '0', 10)
        if (n > featureSeq) featureSeq = n
      }
    } catch {
      /* 손상 시 빈 인벤토리(스텁은 새 to-be 도메인으로) */
    }
  }

  // 기존 rtm-requirements.json 보존(append 병합).
  const reqPath = join(uaDir, 'rtm-requirements.json')
  let prior = { requirements: [], functions: [] }
  if (existsSync(reqPath)) {
    try {
      const p = readJson(reqPath)
      prior = { requirements: Array.isArray(p.requirements) ? p.requirements : [], functions: Array.isArray(p.functions) ? p.functions : [] }
    } catch {
      /* 손상 시 새로 시작(기존 내용 보존 불가 — 경고) */
      console.error('경고: 기존 rtm-requirements.json 파싱 실패 — 새로 작성합니다.')
    }
  }
  for (const f of prior.functions) existingFnIds.add(f.id)

  // 도메인 해석 — fnId 키를 기존 도메인(접미 일치)에 매칭, 없으면 새 to-be 도메인.
  function resolveDomain(fnId) {
    const key = fnDomainKey(fnId)
    const hit = domains.find((d) => d.id === `domain:${key}` || d.id === `to-be:${key}` || d.id.endsWith(`:${key}`))
    if (hit) return { domainId: hit.id, domainName: hit.name }
    return { domainId: `to-be:${key}`, domainName: key }
  }

  // requirementHistory: 각 added fnId 를 추가한 요구사항 id 목록.
  const addedBy = new Map() // fnId -> [reqId]
  for (const r of intake.requirements) {
    for (const fnId of r.changeset.added) {
      if (!addedBy.has(fnId)) addedBy.set(fnId, [])
      addedBy.get(fnId).push(r.id)
    }
  }

  // 신규 기능 스텁(중복·기존 제외) — featureId 는 max+1 부터.
  const newFunctions = []
  for (const [fnId, reqIds] of addedBy) {
    if (existingFnIds.has(fnId)) continue
    existingFnIds.add(fnId)
    featureSeq += 1
    const featureId = `FN-${String(featureSeq).padStart(3, '0')}`
    const { domainId, domainName } = resolveDomain(fnId)
    newFunctions.push(intakeFnStub(fnId, featureId, domainId, domainName, reqIds))
  }

  // 요구사항 투영.
  const projectedReqs = intake.requirements.map((r) => intakeReqToRtmRequirement(r, intake.request))

  // 병합(id 키) — 새 것이 기존을 덮어쓰고, 나머지는 보존.
  function mergeById(priorArr, nextArr) {
    const byId = new Map(priorArr.map((x) => [x.id, x]))
    for (const x of nextArr) byId.set(x.id, x)
    return [...byId.values()]
  }
  const merged = {
    requirements: mergeById(prior.requirements, projectedReqs),
    functions: mergeById(prior.functions, newFunctions),
  }

  mkdirSync(uaDir, { recursive: true })
  writeFileSync(reqPath, JSON.stringify(merged, null, 2) + '\n', 'utf8')

  console.log(`투영 완료(⑤) — ${reqPath}`)
  console.log(`  요청 ${intake.request.id} → 요구사항 ${projectedReqs.length}건 투영 · 신규 TO-BE 기능 ${newFunctions.length}개`)
  for (const r of projectedReqs) console.log(`    + ${r.id} ${r.text}`)
  for (const f of newFunctions) console.log(`    ~ ${f.featureId} ${f.name} (${f.domainName})`)
  console.log(`  병합 후 rtm-requirements.json: 요구사항 ${merged.requirements.length} · 기능 ${merged.functions.length}`)
  console.log('다음: understand-rtm.mjs 로 rtm.json 을 재생성하세요.')
  process.exit(0)
}

// ── withdraw(절차 B): 요청(REQ) 단위 철회 → rtm-requirements.json 폐기 표시 ──────
// source.section===REQ 인 요구사항을 WITHDRAWN + changeReq 로 표시(파괴적 삭제 없음).
// 이후 SKILL 이 understand-rtm.mjs 로 rtm.json 을 재bake 하면 현행 head 에서 폐기분이 빠져 기능이 원복된다.
if (cmd === 'withdraw') {
  const projectRoot = rest[0]
  const reqId = rest[1]
  const crNo = rest[2]
  const reason = rest[3] ?? null
  if (!projectRoot || !reqId || !crNo) {
    console.error('사용법: node rtm-intake.mjs withdraw <projectRoot> <REQ-00N> <CR-00N> [사유]')
    process.exit(2)
  }
  const uaDir = join(projectRoot, '.understand-anything')
  const reqPath = join(uaDir, 'rtm-requirements.json')
  if (!existsSync(reqPath)) {
    console.error(`rtm-requirements.json 이 없습니다(인테이크된 요구사항 필요): ${reqPath}`)
    process.exit(2)
  }
  let doc
  try {
    doc = readJson(reqPath)
  } catch (err) {
    console.error(`rtm-requirements.json 파싱 실패: ${err.message}`)
    process.exit(1)
  }
  const requirements = Array.isArray(doc.requirements) ? doc.requirements : []
  const result = withdrawRequest(requirements, reqId, { crNo, reason })
  if (result.notFound) {
    console.error(`요청 ${reqId} 에 속한 요구사항이 없습니다(source.section 불일치). 철회 대상 없음.`)
    process.exit(1)
  }
  const merged = { ...doc, requirements: result.requirements }
  writeFileSync(reqPath, JSON.stringify(merged, null, 2) + '\n', 'utf8')
  console.log(`철회 완료(절차 B) — ${reqPath}`)
  console.log(`  요청 ${reqId} → ${crNo} 로 폐기: ${result.withdrawn.length}건${result.alreadyWithdrawn.length ? ` (이미 폐기 ${result.alreadyWithdrawn.length}건)` : ''}`)
  for (const id of result.withdrawn) console.log(`    − ${id} WITHDRAWN`)
  console.log('다음: understand-rtm.mjs 로 rtm.json 을 재생성(폐기 반영·기능 원복)하세요.')
  process.exit(0)
}

// ── impact(절차 B): 요청(REQ) 철회 영향분석(RTM 역추적) → JSON ────────────────────
// rtm.json 모델에서 영향 기능 분류·다운스트림 의존·AC·산출물·후속조치를 결정론으로 산정해 출력한다.
// 변경영향분석서(05) 작성의 데이터 소스. --out <path> 면 파일로도 쓴다.
if (cmd === 'impact') {
  const projectRoot = rest[0]
  const reqId = rest[1]
  if (!projectRoot || !reqId) {
    console.error('사용법: node rtm-intake.mjs impact <projectRoot> <REQ-00N> [--out <경로>]')
    process.exit(2)
  }
  const uaDir = join(projectRoot, '.understand-anything')
  const rtmPath = join(uaDir, 'rtm.json')
  if (!existsSync(rtmPath)) {
    console.error(`rtm.json 이 없습니다(먼저 추적표 생성): ${rtmPath}`)
    process.exit(2)
  }
  let model
  try {
    model = readJson(rtmPath)
  } catch (err) {
    console.error(`rtm.json 파싱 실패: ${err.message}`)
    process.exit(1)
  }
  const report = computeChangeImpact(model, reqId)
  const json = JSON.stringify(report, null, 2)
  const outIdx = rest.indexOf('--out')
  if (outIdx >= 0 && rest[outIdx + 1]) {
    writeFileSync(rest[outIdx + 1], json + '\n', 'utf8')
    console.error(`영향분석 JSON 기록: ${rest[outIdx + 1]}`)
  }
  if (report.requirements.length === 0) {
    console.error(`경고: 요청 ${reqId} 에 귀속된 요구사항이 rtm.json 에 없습니다(영향 비어 있음).`)
  }
  console.log(json)
  process.exit(0)
}

console.error(
  '사용법:\n' +
    '  node rtm-intake.mjs intake-input <projectRoot> --request <원문> [--session <sid>] [--out <경로>]\n' +
    '  node rtm-intake.mjs validate <identified.json 경로> [--project <projectRoot>]\n' +
    '  node rtm-intake.mjs next-req <projectRoot>\n' +
    '  node rtm-intake.mjs next-cr  <projectRoot>\n' +
    '  node rtm-intake.mjs project  <projectRoot> <sid>\n' +
    '  node rtm-intake.mjs withdraw <projectRoot> <REQ> <CR> [사유]\n' +
    '  node rtm-intake.mjs impact   <projectRoot> <REQ> [--out <경로>]',
)
process.exit(2)
