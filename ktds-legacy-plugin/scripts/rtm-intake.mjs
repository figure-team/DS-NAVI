#!/usr/bin/env node
/**
 * /understand-rtm 인테이크 단계화(절차 A)의 결정론 글루 CLI.
 * 사용:
 *   node rtm-intake.mjs validate <identified.json 경로>
 *   node rtm-intake.mjs project  <projectRoot> <sid>
 *
 * - validate(①후 게이트): identified.json 을 스키마로 검증 + 비치명 일관성 진단.
 * - project(⑤): identified.json(2계층) → 현 rtm-requirements.json 스키마로 **투영·병합**(옵션 B).
 *   요구사항(SFR…)을 1급 requirement 로, changeset.added 를 TO-BE 기능 스텁으로. 기존 보존(id 병합).
 *   투영 후 SKILL 이 understand-rtm.mjs 를 돌려 rtm.json 을 재생성한다.
 * 설계: docs/ktds/RTM_STEP_FLOW_DESIGN.md §9(옵션 B).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

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
  intakeReqToRtmRequirement,
  intakeFnStub,
  fnDomainKey,
  withdrawRequest,
  computeChangeImpact,
} = engine

const [, , cmd, ...rest] = process.argv

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// ── validate ────────────────────────────────────────────────────────────────
if (cmd === 'validate') {
  const target = rest[0]
  if (!target || !existsSync(target)) {
    console.error(`identified.json 경로가 필요합니다(없음): ${target ?? '(미지정)'}`)
    process.exit(2)
  }
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
  console.log('전부 [추정] 상태. 사용자가 단계 컨펌 후 다음 단계로 진행한다.')
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
    '  node rtm-intake.mjs validate <identified.json 경로>\n' +
    '  node rtm-intake.mjs next-req <projectRoot>\n' +
    '  node rtm-intake.mjs project  <projectRoot> <sid>\n' +
    '  node rtm-intake.mjs withdraw <projectRoot> <REQ> <CR> [사유]\n' +
    '  node rtm-intake.mjs impact   <projectRoot> <REQ> [--out <경로>]',
)
process.exit(2)
