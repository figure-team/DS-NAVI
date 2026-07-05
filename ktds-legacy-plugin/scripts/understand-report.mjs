#!/usr/bin/env node
/**
 * /understand-report CLI 래퍼 — 주간/월간 실적 요약(W6).
 * 사용: node understand-report.mjs [projectRoot] [--weeks N | --month YYYY-MM | --range A..B]
 *
 * ①기간 해석+git 수집(collectWorkLog) + 원장 스캔(rtm-overrides/doc-state) →
 * ②`.spec/map/work-summary.json` 기록(writeMapArtifact) →
 * ③si-실적요약보고서 단독 빌드(템플릿 → doc-output/…md + xlsx).
 *
 * domain-graph.json 을 요구하지 않는다(설계 §6) — 수용 기준의 실측 대상(이 레포)은
 * 그래프가 없다. 그래프 보유 타깃에서 understand-docs 를 재실행하면 전체 세트(14종)에
 * 자연 편입된다(understand-docs 가 work-summary.json 을 로드).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')

if (!existsSync(distEntry)) {
  console.error(
    '엔진(@ktds/legacy-core)이 빌드되지 않았습니다. 먼저 빌드하세요:\n' +
      '  pnpm --filter @ktds/legacy-core build',
  )
  process.exit(2)
}

// ── 인자 파싱 — 기본 = 최근 1주 ─────────────────────────────────────────────
const args = process.argv.slice(2)
const positional = []
let spec = null
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--weeks') {
    spec = { mode: 'weeks', weeks: Number(args[++i]) }
  } else if (a === '--month') {
    spec = { mode: 'month', month: String(args[++i] ?? '') }
  } else if (a === '--range') {
    spec = { mode: 'range', range: String(args[++i] ?? '') }
  } else if (a.startsWith('--')) {
    console.error(`알 수 없는 옵션: ${a} (--weeks N | --month YYYY-MM | --range A..B)`)
    process.exit(2)
  } else {
    positional.push(a)
  }
}
if (spec === null) spec = { mode: 'weeks', weeks: 1 }
const projectRoot = positional[0] || process.cwd()

const engine = await import(distEntry)
const {
  collectWorkLog,
  buildWorkSummary,
  writeMapArtifact,
  WORK_SUMMARY_FILENAME,
  DOC_SET,
  parseDocTemplate,
  applyDocTemplate,
  renderMarkdown,
  evidenceRate,
  buildXlsxWorkbook,
  docToSheets,
} = engine

// 인자 사전 검증 — 오타가 스택트레이스가 아니라 안내로 끝나게(리뷰 R1, range 와 대칭).
if (spec.mode === 'weeks' && (!Number.isInteger(spec.weeks) || spec.weeks < 1)) {
  console.error(`--weeks 는 1 이상의 정수여야 합니다. 입력: ${process.argv.slice(2).join(' ')}`)
  process.exit(2)
}
if (spec.mode === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(spec.month)) {
  console.error(`--month 형식: YYYY-MM (01~12). 입력: ${spec.month}`)
  process.exit(2)
}
// range 모드는 rev 를 사전 검증해 사용자 오류를 구분 표면화(수집기는 no-git 으로 뭉갠다).
if (spec.mode === 'range') {
  if (spec.range.includes('...')) {
    console.error(`--range 는 2점(A..B)만 지원합니다 — symmetric diff(A...B)는 미지원. 입력: ${spec.range}`)
    process.exit(2)
  }
  const m = /^(.+?)\.\.(.*)$/.exec(spec.range)
  if (!m) {
    console.error(`--range 형식: <from>..<to> (to 생략 시 HEAD). 입력: ${spec.range}`)
    process.exit(2)
  }
  if (m[2].length === 0) spec = { mode: 'range', range: `${m[1]}..HEAD` }
  for (const rev of [m[1], m[2] || 'HEAD']) {
    try {
      execFileSync('git', ['-C', projectRoot, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
    } catch {
      console.error(`해석 불가한 rev: ${rev} — 브랜치/태그/커밋 해시를 확인하세요.`)
      process.exit(2)
    }
  }
}

// ── ① 수집 ──────────────────────────────────────────────────────────────────
// 상대 기간은 --since 로 로그 출력을 바운드(리뷰 C3 — 대형 레포 256MB 절벽 방지).
// 다주 추이(W6-b)의 직전 기간까지 덮도록 두 윈도 길이 + 1일 여유. 윈도 필터는
// build 단계가 다시 적용한다(결정론 불변).
let sinceIso
if (spec.mode === 'weeks') {
  try {
    const headIso = execFileSync('git', ['-C', projectRoot, 'show', '-s', '--format=%cI', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const headMs = Date.parse(headIso)
    if (!Number.isNaN(headMs)) {
      sinceIso = new Date(headMs - (spec.weeks * 14 + 1) * 24 * 60 * 60 * 1000).toISOString()
    }
  } catch {
    // git 불가 — collectWorkLog 가 no-git 으로 표면화.
  }
} else if (spec.mode === 'month') {
  const [y, mo] = spec.month.split('-').map(Number)
  // 직전 달력 월 1일 − 1일 여유.
  sinceIso = new Date(Date.UTC(y, mo - 2, 1) - 24 * 60 * 60 * 1000).toISOString()
}
const collected = collectWorkLog(projectRoot, {
  revRange: spec.mode === 'range' ? spec.range : undefined,
  sinceIso,
})
if (collected.kind === 'shallow') {
  console.error('경고: shallow clone — 잘린 이력은 결정론 보장이 불가해 git 실적을 [미확인]으로 남깁니다.')
} else if (collected.kind === 'too-large') {
  console.error('경고: git 이력 출력이 256MB 를 초과 — 더 짧은 기간(--weeks)으로 재시도하세요. git 실적은 [미확인].')
} else if (collected.kind === 'no-git') {
  console.error('경고: git 이력 수집 불가(레포 아님/이력 없음) — git 실적을 [미확인]으로 남깁니다.')
}

// 모듈 귀속(W3, 있으면) — 손상 시 null(디렉터리 버킷 폴백).
let programInventory = null
const invPath = join(projectRoot, '.spec', 'map', 'program-inventory.json')
if (existsSync(invPath)) {
  try {
    programInventory = JSON.parse(readFileSync(invPath, 'utf8'))
  } catch {
    console.error('경고: program-inventory.json 판독 실패 — 모듈 귀속을 디렉터리 버킷으로 폴백.')
  }
}

// RTM 확정 원장(있으면) — 부재는 null([미확인], 0 과 구분).
let rtmOverlay = null
const overlayPath = join(projectRoot, '.understand-anything', 'rtm-overrides.json')
if (existsSync(overlayPath)) {
  try {
    rtmOverlay = JSON.parse(readFileSync(overlayPath, 'utf8'))
  } catch {
    console.error('경고: rtm-overrides.json 판독 실패 — RTM 진척을 [미확인]으로 남깁니다.')
  }
}

// 문서 상태 원장(있으면) — docId ASC 로 결정론 순회.
let docStates = null
const docsDir = join(projectRoot, '.spec', 'docs')
if (existsSync(docsDir)) {
  docStates = []
  for (const f of readdirSync(docsDir).sort()) {
    if (!f.endsWith('.state.json')) continue
    try {
      docStates.push({ docId: f.slice(0, -'.state.json'.length), raw: JSON.parse(readFileSync(join(docsDir, f), 'utf8')) })
    } catch {
      console.error(`경고: ${f} 판독 실패 — 해당 문서 진척은 집계에서 빠집니다(카운트 왜곡 아님, 이벤트 미확인).`)
    }
  }
}

// ── ② 집계·기록 ────────────────────────────────────────────────────────────
let report
try {
  report = buildWorkSummary({ spec, collected, programInventory, rtmOverlay, docStates })
} catch (err) {
  console.error(`실적 집계 실패: ${err.message}`)
  process.exit(2)
}
const artifactPath = writeMapArtifact(projectRoot, WORK_SUMMARY_FILENAME, report)

// ── ③ si-실적요약보고서 단독 빌드 ───────────────────────────────────────────
const entry = DOC_SET.find((e) => e.docId === 'si-실적요약보고서')
const PROJECT_DOC_DIR = join(projectRoot, '.understand-anything', 'doc')
const PLUGIN_DOC_DIR = join(here, '..', 'templates', 'doc')
const OUTPUT_DIR = join(projectRoot, '.understand-anything', 'doc-output')

let tpl = null
let tplSource = 'builtin'
for (const [dir, label] of [
  [PROJECT_DOC_DIR, 'project'],
  [PLUGIN_DOC_DIR, 'plugin'],
]) {
  const p = join(dir, entry.templateFile)
  if (!existsSync(p)) continue
  try {
    tpl = parseDocTemplate(readFileSync(p, 'utf8'))
    tplSource = label
    break
  } catch (err) {
    console.error(`문서 템플릿 파싱 실패(${entry.templateFile}): ${err.message}`)
    process.exit(2)
  }
}

// 그래프 무관 최소 DocInput(설계 §6) — 실적 문서는 노드/엣지 grounding 이 필요 없다.
let doc = entry.build({ nodes: [], edges: [], workSummary: report, programInventory })
if (tpl) doc = applyDocTemplate(doc, tpl)
const meta = {
  docId: doc.docId,
  title: doc.title,
  methodology: doc.methodology,
  status: 'DRAFT',
  sourceCommit: report.gitCommit,
  evidenceRate: evidenceRate(doc),
}
mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(join(OUTPUT_DIR, `${doc.docId}.md`), renderMarkdown(doc, meta), 'utf8')
const sheets = docToSheets(doc, { sourceCommit: report.gitCommit })
if (sheets.length > 0) {
  writeFileSync(join(OUTPUT_DIR, `${doc.docId}.xlsx`), buildXlsxWorkbook(sheets))
}

// ── 요약 출력 ────────────────────────────────────────────────────────────────
const r = report.range
const rangeText =
  r.mode === 'range'
    ? `커밋 범위 ${r.rawArg}`
    : r.mode === 'month'
      ? `${r.rawArg} 월간`
      : `최근 ${r.rawArg}주 (${r.fromIso ?? '[미확인]'} ~ ${r.toIso ?? '[미확인]'}]`
console.log(`understand-report 완료 — ${projectRoot}`)
console.log(`  기간: ${rangeText}`)
console.log(
  `  실적: 커밋 ${report.totals.commits}건(작성자 ${report.totals.authors}명, 머지 ${report.totals.mergeCommits}건) · 파일 ${report.totals.files}개(+${report.totals.added}/−${report.totals.deleted})${report.meta.gitAvailable ? '' : ' — git [미확인]'}`,
)
console.log(
  `  RTM 진척: ${report.rtmProgress ? `전환 ${report.rtmProgress.functionsConfirmed + report.rtmProgress.scenariosConfirmed + report.rtmProgress.requirementsConfirmed}건` : '[미확인](원장 없음/기간 축 없음)'} · 문서 진척: ${report.docProgress ? `승인 ${report.docProgress.approved}건` : '[미확인]'}`,
)
console.log(`  산출물: ${artifactPath}`)
console.log(`  문서: doc-output/${doc.docId}.md${sheets.length > 0 ? ' + .xlsx' : ''} (근거율 ${(meta.evidenceRate * 100).toFixed(0)}%, 템플릿 ${tplSource})`)
console.log('요약의 모든 서술은 수집 사실만 인용한다(날조 0). 보강 서술·확정은 대시보드 편집 플로우로.')
