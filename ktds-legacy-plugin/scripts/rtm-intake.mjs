#!/usr/bin/env node
/**
 * /understand-rtm 인테이크 단계화(절차 A)의 결정론 글루 CLI.
 * 사용:
 *   node rtm-intake.mjs validate <identified.json 경로> [--project <projectRoot>]
 *   node rtm-intake.mjs intake-input <projectRoot> --request <원문> [--session <sid>]
 *   node rtm-intake.mjs code-impact <projectRoot> --session <sid>
 *   node rtm-intake.mjs project  <projectRoot> <sid>
 *
 * - intake-input(①전 근거 번들, P3): 분석 산출물 3축(도메인·데이터·추적표)을 요청 원문으로
 *   사전 필터해 **유계 요약**을 rtm-intake/<sid>/intake-input.json 에 쓴다. ①이 이걸 읽고
 *   설계한다(현재는 rtm.json 하나만 보고 지어낸다 — 설계서 §1.1).
 * - code-impact(②영향분석, P6): identified.json 의 `changeset.modified`(flow) → rtm.json 근거로
 *   **결정론 조인**해 시드 파일을 뽑고 impact 엔진을 돌린다. 루트 슬롯을 안 건드리고 요청별로
 *   보관 + impact 원장에 query=요청 원문으로 기록한다(RTM_INTAKE_WORKSPACE_DESIGN.md §2.3).
 * - validate(①후 게이트): identified.json 을 스키마로 검증 + 비치명 일관성 진단
 *   + **실재 대조 게이트(P1, fail-closed exit 2)** — changeset 기능 ⊂ rtm.json,
 *   참조 테이블 ⊂ db-schema.json. projectRoot 는 경로 규약에서 역산하거나 --project 로 준다.
 * - project(⑥): identified.json(2계층) → 현 rtm-requirements.json 스키마로 **투영·병합**(옵션 B).
 *   요구사항(SFR…)을 1급 requirement 로, changeset.added 를 TO-BE 기능 스텁으로. 기존 보존(id 병합).
 *   투영 후 SKILL 이 understand-rtm.mjs 를 돌려 rtm.json 을 재생성한다.
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §9(옵션 B).
 */
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
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
  resolveFlowSeeds,
  gitCommitHash,
} = engine

const [, , cmd, ...rest] = process.argv

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// impact 원장 append 는 연합(IMPACT_LEDGER_FEDERATION_DESIGN §2.1)으로 제거됐다 —
// impact-history 는 /change 서버 잡 단독 기록이고, code-impact 산출은 세션 디렉터리
// (rtm-intake/<sid>/impact/)가 정본이다. /change 목록 노출은 서버의 읽기 병합 몫.

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
 * ★ P7 완료 게이트 — 최소집합(도메인·데이터·추적표)을 **fail-closed**(exit 2)로 읽는다.
 * 설계: RTM_IMPACT_GATE_DESIGN.md §5.1 · §7 C2/C8 · §9 P7 · §10-1(사용자 결정).
 *
 * 이 게이트가 없으면 산출물이 없거나 손상돼도 **조용히 빈 인벤토리로 진행**한다(§5.1):
 *  - `project`(⑥): rtm.json 손상 → 도메인 귀속이 **전부 새 `to-be:`** 로 떨어진다.
 *  - `validate`(①후): rtm.json 부재 → 실재 대조가 **무음으로 생략**돼 게이트가 장식이 된다(C8).
 * `understand-rtm/SKILL.md` 의 "없으면 멈춤"은 LLM 에게 주는 **자연어 지시일 뿐 코드에 없었다** —
 * 그걸 여기서 코드로 만든다("게이트는 코드로", C8).
 *
 * **부재와 손상을 구분해 보고**하되 판정은 둘 다 차단이다 — 손상을 "없음"으로 뭉개면 §4.1
 * ("없음" vs "못 봄") 오독의 재판이다. 판정 규칙 자체는 legacy-core `checkMinimalSet` 하나뿐이고
 * 여긴 IO 경계 + 보고만 한다(순수 함수는 코어에).
 *
 * @returns 파싱된 3축 `{ domainGraph, dbSchema, rtm }` — 전부 non-null 보장(아니면 exit 2).
 */
function requireMinimalSet(projectRoot) {
  const uaDir = join(projectRoot, '.understand-anything')
  const mapDir = join(projectRoot, '.spec', 'map')
  const sources = { domainGraph: null, dbSchema: null, rtm: null }
  const corrupt = []
  for (const [key, path] of [
    ['domainGraph', join(uaDir, 'domain-graph.json')],
    ['dbSchema', join(mapDir, 'db-schema.json')],
    ['rtm', join(uaDir, 'rtm.json')],
  ]) {
    if (!existsSync(path)) continue
    try {
      sources[key] = readJson(path)
    } catch (err) {
      corrupt.push(`${path} — 파싱 실패(${err.message})`)
    }
  }
  const minimal = checkMinimalSet(sources)
  if (minimal.ok) return sources

  console.error(`\n✗ 최소집합 부재 — 인테이크를 진행할 수 없습니다(${projectRoot}).`)
  console.error('  못 쓰는 축(부재 또는 손상):')
  for (const m of minimal.missing) console.error(`    - ${m}`)
  if (corrupt.length > 0) {
    console.error('  ★ 손상 — 파일은 있으나 읽을 수 없습니다("없음"과 다릅니다):')
    for (const c of corrupt) console.error(`    - ${c}`)
    console.error('    → 재생성하십시오. 손상을 빈 인벤토리로 넘기면 근거 없이 지어냅니다(설계서 §5.1).')
  }
  console.error(
    '\n근거 없이 요구사항을 설계하면 인테이크가 지어냅니다(설계서 §1.2).\n' +
      '  먼저 분석을 돌리십시오: /understand-map → /understand-rtm',
  )
  process.exit(2)
}

/**
 * id 발급용 스캔(next-req · next-cr) — rtm.json · rtm-requirements.json 을 훑는다.
 * **부재는 정상**(아직 인테이크된 요청이 없는 프로젝트 = 1번부터)이지만 **손상은 exit 2** 다(P7):
 * 손상을 무시하면 이미 쓰인 번호를 못 보고 **기존과 충돌하는 REQ/CR 를 발급**한다 — 조용한
 * 오염이라 사람이 알아챌 길이 없다(§4.1 "없음" vs "못 봄"의 id 판).
 */
function scanForNextId(uaDir, scan) {
  for (const name of ['rtm.json', 'rtm-requirements.json']) {
    const path = join(uaDir, name)
    if (!existsSync(path)) continue
    try {
      scan(readJson(path))
    } catch (err) {
      console.error(`✗ ${path} 파싱 실패(${err.message}) — 번호를 발급할 수 없습니다.`)
      console.error('  손상된 파일을 "없음"으로 취급하면 이미 쓰인 번호와 충돌합니다. 재생성하십시오.')
      process.exit(2)
    }
  }
}

/**
 * 실재 대조 인벤토리(P1) — `requireMinimalSet` 이 이미 읽어 둔 3축에서 뽑는다(재읽기 없음).
 * 최소집합이 통과한 뒤에만 불리므로 **축 부재로 대조가 생략되는 경로가 없다**(그게 P7 의 요점).
 */
function buildIntakeInventory(rtm, dbSchema) {
  return {
    fnIds: (rtm.functions ?? []).map((f) => f.id).filter((id) => typeof id === 'string'),
    tables: (dbSchema.tables ?? []).map((t) => t.name).filter((n) => typeof n === 'string'),
  }
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
  // ★ P7 — projectRoot 를 모르면 대조를 **생략하지 않고 차단**한다. 무음 생략은 게이트가
  //   조용히 무력화되는 것이고, 그게 바로 이 게이트가 막으려는 실패다(§7 C8 "게이트는 코드로").
  if (!projectRoot) {
    console.error('\n✗ 실재 대조를 할 수 없습니다 — projectRoot 를 못 찾았습니다.')
    console.error(`  경로 규약(<projectRoot>/.understand-anything/rtm-intake/<sid>/identified.json)과 다릅니다: ${target}`)
    console.error('  → `--project <projectRoot>` 로 명시하십시오. 대조 없이 통과시키지 않습니다.')
    process.exit(2)
  }
  {
    // ★ P7 — 최소집합 fail-closed. 예전엔 rtm.json 이 없거나 손상되면 "기능 대조 생략" 경고만
    //   찍고 **exit 0 으로 통과**시켰다 — 게이트가 있는 척만 한 것이다(§5.1).
    const min = requireMinimalSet(projectRoot)
    const inventory = buildIntakeInventory(min.rtm, min.dbSchema)
    console.log(
      `  실재 대조 인벤토리(${projectRoot}): rtm.json 기능 ${inventory.fnIds.length}건 · db-schema.json 테이블 ${inventory.tables.length}건`,
    )
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
  // ★ 최소집합(도메인·데이터·추적표)은 fail-closed — 다른 서브커맨드와 **같은 게이트**를 쓴다(P7).
  const minimalSources = requireMinimalSet(projectRoot)
  // 나머지 축은 축소 모드(§10-1): 없으면 생략하고 번들에 명시(exit 2 아님).
  //  - crud-matrix: 데이터 축의 **하위 소스**라 최소집합이 아니다(checkMinimalSet 테스트 참조).
  //  - screens: 화면 축.
  const loaded = {
    crudMatrix: load(join(mapDir, 'crud-matrix.json'), 'crud-matrix.json'),
    screens: load(join(uaDir, 'screens.json'), 'screens.json'),
  }
  const sources = {
    ...minimalSources,
    ...Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, v.value])),
  }
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

  // ★ HEAD 주입(P7) — 축끼리만 대조하면 **전 축이 같은 옛 커밋에 멈춰 있어도 "정합"** 이 된다.
  //   그게 §9.2 가 실증한 사고(데모 산출물이 코드보다 낡았는데 아무 장치도 안 알림)다.
  //   git 이 아니면 null → 번들은 예전처럼 축끼리만 잰다(하위호환).
  const bundle = buildIntakeInputBundle(sources, { request, headCommit: gitCommitHash(projectRoot) })

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
  // ★ 커밋 정합 실적(P7) — **차단하지 않는다**(§10-2). 무엇이 어긋났는지 이름으로 알린다.
  console.log(
    `  커밋 정합: HEAD=${bundle.commits.head ? bundle.commits.head.slice(0, 8) : '(git 아님 — 낡음 판정 불가)'} · ` +
      (bundle.commits.staleAxes.length > 0
        ? `낡은 축 ${bundle.commits.staleAxes.length}개 → ${bundle.commits.staleAxes.join(' · ')} (경고 — 이 축의 결론은 [추정])`
        : bundle.commits.consistent
          ? '전 축 최신'
          : '축끼리 불일치(아래 경고 참조)'),
  )
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
  scanForNextId(uaDir, scan)
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
  scanForNextId(uaDir, scan)
  console.log(`CR-${String(maxN + 1).padStart(3, '0')}`)
  process.exit(0)
}

// ── project(⑥ RTM 반영) ──────────────────────────────────────────────────────
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
  // ★ P7 fail-closed — 예전엔 rtm.json 이 없거나 손상되면 **조용히 빈 인벤토리**로 진행했다.
  //   그러면 `resolveDomain` 이 기존 도메인을 하나도 못 찾아 **귀속이 전부 새 `to-be:`** 로
  //   떨어지고(§5.1), featureSeq=0 이라 **기존과 충돌하는 FN-001** 을 발급한다. 조용한 오염이라
  //   사람이 알아챌 길이 없다 — 그래서 차단한다.
  const { rtm } = requireMinimalSet(projectRoot)
  const domains = Array.isArray(rtm.domains) ? rtm.domains : []
  const existingFnIds = new Set()
  let featureSeq = 0
  for (const f of rtm.functions ?? []) {
    if (typeof f.id === 'string') existingFnIds.add(f.id)
    const n = parseInt(String(f.featureId ?? '').replace(/\D/g, '') || '0', 10)
    if (n > featureSeq) featureSeq = n
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

  console.log(`투영 완료(⑥) — ${reqPath}`)
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

// ── code-impact(①, 절차 A): changeset.modified → 시드 → 코드영향 분석 ──────────────
// 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.1-5 · §6.3 · §9 P6 · RTM_INTAKE_WORKSPACE_DESIGN.md §2.3.
//
// ★ 아래 `impact`(절차 B) 와 **다른 것**이다 — 설계서 §6.7 의 동음이의 3종 주의:
//   - `code-impact`(여기)  = /understand-impact 엔진. **코드 도달성**(파일·엣지 BFS).
//   - `impact`(아래)       = computeChangeImpact. **REQ 철회의 요구사항 역추적**. 코드 분석 아님.
//   두 서브시스템은 코드상 연결이 전혀 없다. 이름을 `impact` 로 겹치지 않게 한 이유가 이것이다.
//
// "한 번 돌리고 두 곳에서 본다"(워크스페이스 §2.3): 루트 슬롯을 **안 건드리고** 요청별로 보관하되,
// impact 원장에 query=요청 원문으로 기록해 `/change` 에서도 열람되게 한다.
if (cmd === 'code-impact') {
  const projectRoot = rest[0]
  const sidIdx = rest.indexOf('--session')
  const sid = sidIdx >= 0 && rest[sidIdx + 1] ? rest[sidIdx + 1] : null
  if (!projectRoot || !sid) {
    console.error('사용법: node rtm-intake.mjs code-impact <projectRoot> --session <sid>')
    process.exit(2)
  }
  // sid 는 파일명·디렉터리명이 된다. 대시보드 isValidSid(vite.config.ts:1363) 와 동일한 어휘 가드.
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sid) || sid.startsWith('.')) {
    console.error(`세션 id 가 잘못됐습니다(영숫자·._- 만, 64자 이내, . 로 시작 불가): ${sid}`)
    process.exit(2)
  }

  const uaDir = join(projectRoot, '.understand-anything')
  const sessionDir = join(uaDir, 'rtm-intake', sid)
  const idPath = join(sessionDir, 'identified.json')
  if (!existsSync(idPath)) {
    console.error(`identified.json 이 없습니다(①식별 먼저): ${idPath}`)
    process.exit(2)
  }
  let intake
  try {
    intake = parseIdentifiedIntake(readJson(idPath))
  } catch (err) {
    console.error(`identified.json 검증 실패:\n${err.message}`)
    process.exit(1)
  }

  // ★ P7 — 최소집합 fail-closed(다른 서브커맨드와 같은 게이트, exit 2). 예전엔 rtm.json 부재만
  //   보고 **손상은 exit 1** 로 갈라졌다 — 게이트의 종료코드는 하나여야 SKILL 이 분기할 수 있다.
  const { rtm } = requireMinimalSet(projectRoot)

  // ★ flow→시드 결정론 조인 — LLM 불필요(§6.3). 시드 범위는 entryPoint 만(impact/rtm-seeds.ts 주석).
  const modified = intake.requirements.flatMap((r) => r.changeset.modified)
  const res = resolveFlowSeeds(rtm.functions ?? [], modified)

  console.log(`코드영향 검증(①) — ${projectRoot}`)
  console.log(`  요청 ${intake.request.id}: "${intake.request.raw}"`)
  console.log(`  changeset.modified ${modified.length}건 → 시드 ${res.seeds.length}개(범위: entryPoint)`)
  for (const s of res.bySource) console.log(`    ${s.fnId}\n      → ${s.relPaths.join(' · ')}`)
  // 정직한 생략 보고(§6.2) — 조용히 떨구지 않는다.
  if (res.skippedToBe.length > 0) console.log(`  · 신규(to-be) ${res.skippedToBe.length}건 제외(파일 없음): ${res.skippedToBe.join(' · ')}`)
  if (res.unknownFnIds.length > 0) console.error(`  ⚠ rtm.json 에 없는 기능 ${res.unknownFnIds.length}건(validate 실재 대조 확인 필요): ${res.unknownFnIds.join(' · ')}`)
  if (res.ungroundedFnIds.length > 0) console.error(`  ⚠ 진입점 근거 0건이라 시드를 못 만든 기능 ${res.ungroundedFnIds.length}건: ${res.ungroundedFnIds.join(' · ')}`)

  if (res.seeds.length === 0) {
    // 전부 신규(added)면 바꿀 기존 코드가 없다 = 정당한 상태. 차단이 아니라 정직한 보고.
    console.log('\n시드 없음 — 코드영향 분석을 생략합니다(원장 기록 없음).')
    console.log('  modified 가 없거나 전부 to-be(신규)입니다. 신규 생성예측은 1차 범위 밖(설계서 §7 C6).')
    process.exit(0)
  }

  // 요청별 보관 — 루트 슬롯(.spec/map/impact.json)은 **건드리지 않는다**(§6.3 C3).
  // `.spec/map/` 은 코어 writeMapArtifact 가 강제하는 유일한 기록처라 여기 스테이징한 뒤
  // 원장 스냅샷으로 옮기고 지운다(정규 산출물 옆에 요청별 파일이 쌓이지 않게).
  const startedAt = new Date().toISOString()
  const stageReport = `impact-intake-${sid}.json`
  const stageVerify = `impact-intake-verify-${sid}.json`
  let analyzed
  try {
    analyzed = engine.analyzeImpact(projectRoot, res.seeds, undefined, {
      reportFilename: stageReport,
      verifyFilename: stageVerify,
    })
  } catch (err) {
    console.error(`\n영향도 분석 실패: ${err.message}`)
    console.error('  먼저 /understand-map scan(+confirm) 으로 .spec/map/ 산출물을 만드세요(fail-closed).')
    process.exit(2)
  }
  const { result, verify } = analyzed

  // 원장 기록(§2.3) — jobId 는 세션 결정론 해시. 같은 세션 재실행은 같은 jobId 라 원장에서
  // dedup 되고(항목이 쌓이지 않는다) 스냅샷도 제자리 갱신된다.
  const jobId = createHash('sha256').update(`rtm-intake:${sid}`, 'utf8').digest('hex').slice(0, 16)
  // ★ 연합(IMPACT_LEDGER_FEDERATION_DESIGN §2.1) — 스냅샷 정본은 **세션 디렉터리**다.
  // impact-history 원장은 /change 서버 잡 단독 기록으로 좁혀졌고, /change 목록·스냅샷 서빙은
  // 서버가 세션 포인터를 읽기 시점에 병합/해석한다(무잠금 3프로세스 RMW 경합 제거).
  const snapDir = join(sessionDir, 'impact')
  mkdirSync(snapDir, { recursive: true })
  for (const [stagePath, name] of [
    [analyzed.impactPath, 'impact.json'],
    [analyzed.verifyPath, 'impact-verify-report.json'],
  ]) {
    copyFileSync(stagePath, join(snapDir, name))
    rmSync(stagePath, { force: true }) // 스테이징 해제 — .spec/map 에 요청별 파일을 남기지 않는다
  }
  // impact-overlay.json 은 스냅샷하지 않는다 — 구조 탭 오버레이는 고정 루트 슬롯이라
  // 인테이크가 발행하면 /structure 의 현재 오버레이를 덮어쓴다(무오염 원칙).

  // 세션 포인터 — 워크스페이스 ①이 자기 분석을 찾는 키(RTM_INTAKE_WORKSPACE_DESIGN.md §2.3 인라인).
  writeFileSync(
    join(sessionDir, 'impact-run.json'),
    JSON.stringify(
      {
        jobId,
        requestId: intake.request.id,
        query: intake.request.raw,
        gitCommit: result.gitCommit,
        startedAt, // 연합 파생 행의 시각 축 — 구 포인터(필드 부재)는 서버가 mtime 으로 근사
        finishedAt: new Date().toISOString(),
        seedScope: 'entryPoint',
        seeds: res.seeds,
        bySource: res.bySource,
        skippedToBe: res.skippedToBe,
        unknownFnIds: res.unknownFnIds,
        ungroundedFnIds: res.ungroundedFnIds,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )

  console.log('')
  console.log(`  상류(영향받는 호출자): 파일 ${result.upstream.files.length} · API ${result.upstream.api.length} · 흐름 ${result.upstream.flows.length} · 도메인 ${result.upstream.domains.length}`)
  console.log(`  하류(의존 협력자): 파일 ${result.downstream.files.length} · 매퍼 ${result.upstream.persistence.mappers.length}`)
  console.log(`  검토 필요: ${result.needsReview.length}건 · 근거율(인용 보유): ${verify.overall.groundedPct}%`)
  console.log(`  영향 도메인: ${result.upstream.domains.map((d) => d.key).join(' · ') || '(없음)'}`)
  console.log('')
  console.log(`  요청별 보관: ${snapDir}/impact.json (+verify)`)
  console.log(`  세션 포인터: ${join(sessionDir, 'impact-run.json')} (jobId ${jobId})`)
  console.log(`  /change 열람: 서버가 세션 포인터를 병합해 목록에 노출(연합 — 원장 직접 기록 없음)`)
  console.log('  루트 슬롯(.spec/map/impact.json)·문서 09·구조 오버레이: 무변경')
  console.log('')
  console.log('다음(SKILL ①): 위 영향 범위를 근거 보고에 포함하고 **멈춘다** — 사용자 컨펌이 게이트다.')
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
    '  node rtm-intake.mjs code-impact <projectRoot> --session <sid>\n' +
    '  node rtm-intake.mjs next-req <projectRoot>\n' +
    '  node rtm-intake.mjs next-cr  <projectRoot>\n' +
    '  node rtm-intake.mjs project  <projectRoot> <sid>\n' +
    '  node rtm-intake.mjs withdraw <projectRoot> <REQ> <CR> [사유]\n' +
    '  node rtm-intake.mjs impact   <projectRoot> <REQ> [--out <경로>]',
)
process.exit(2)
