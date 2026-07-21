#!/usr/bin/env node
/**
 * /understand-policy CLI 래퍼 — 정책서(.md) 결정론 생성(P3, 1단계).
 * 사용: node understand-policy.mjs [projectRoot]
 *
 * domain-graph 없이 **raw 소스**에서 직접 동작한다:
 *   census(파일 인구조사) → db-schema(정적 .sql, 3-Tier) → policy-signals(코드+DB 신호)
 *   → getMethodology('policy').buildDocSet → 템플릿 적용 → doc-output/policy-*.md
 *
 * 이 스크립트는 **앵커(file:line)만 결정론으로** 싣는다. 규범 진술·역할 표현식 같은 값/의미는
 * 후속 LLM 보강(SKILL §보강)이 앵커 소스를 읽어 채우고 [추정] 표기한다(여기선 합성 금지).
 * 중간 산출(db-schema.json, policy-signals.json)은 .spec/map/ 에 남겨 재스캔 0회 재사용.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { appendRunLedger, runStartedAt } from './lib/run-ledger.mjs'
import { loadLexicon } from './lib/load-lexicon.mjs'

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
const runBegan = runStartedAt()

const engine = await import(distEntry)
const {
  buildCensus,
  extractDbSchema,
  writeDbSchema,
  readDbSchema,
  scanPolicySignals,
  writePolicySignals,
  readPolicySignals,
  scanPolicyReconcile,
  writePolicyReconcile,
  getMethodology,
  parseDocTemplate,
  applyDocTemplate,
  renderMarkdown,
  evidenceRate,
  assembleDomainPolicies,
  prepPolicyFill,
  auditPolicyFillFragments,
  mergePolicyFillFragments,
  DEFAULT_MAX_FILL_ROWS,
  gitCommitHash,
} = engine

const PLUGIN_DOC_DIR = join(here, '..', 'templates', 'doc')
const PROJECT_DOC_DIR = join(projectRoot, '.understand-anything', 'doc')
const OUTPUT_DIR = join(projectRoot, '.understand-anything', 'doc-output')

// ── 채움 팬아웃 서브커맨드(대규모 보강) ─────────────────────────────────────
// 기존 생성 모드(1단계 결정론 앵커 표)와 별개다. 규모가 커진 LLM 보강을 청크 팬아웃으로
// 전환한다: fill-prep(문서별 청크·행별 pre-cite 동봉) → 청크당 에이전트 → fill-audit
// (커버리지·[확정]⇒인용≥1) → fill-merge(채움 섹션 덧붙임, 앵커 표 불변, 인용 진위 검증).
// 모드: 기본 category(policy-signals.json), `--mode domain`(도메인 분기). fill-audit 는
// 순수 JSON 1줄만 출력한다(Workflow 감사 에이전트가 verbatim 소비).
const fillCommand = process.argv[3]
// 알 수 없는 모드는 거부한다 — 폴스루로 1단계 재생성이 돌면 policy-*.md 가 다시 쓰이며
// <!-- policy-fill --> 채움 섹션(LLM 보강)이 조용히 사라진다. 1단계 재생성은 모드 생략 시에만.
const KNOWN_MODES = ['fill-prep', 'fill-audit', 'fill-merge', 'domain']
if (fillCommand !== undefined && !KNOWN_MODES.includes(fillCommand)) {
  console.error(
    `알 수 없는 모드: ${fillCommand} — 사용 가능: ${KNOWN_MODES.join(' | ')}\n` +
      '  1단계 결정론 생성(정책서 재생성)은 모드를 생략하고 실행하세요: understand-policy.mjs <projectRoot>\n' +
      '  ⚠️ 1단계 재생성은 policy-*.md 를 다시 써서 기존 채움 섹션(규범 진술)을 초기화한다 — fill-merge 로 복원 가능.',
  )
  process.exit(2)
}
if (fillCommand === 'fill-prep' || fillCommand === 'fill-audit' || fillCommand === 'fill-merge') {
  const flags = process.argv.slice(4)
  const flagValue = (name) => {
    const i = flags.indexOf(name)
    return i >= 0 && i + 1 < flags.length ? flags[i + 1] : null
  }
  const mode = flagValue('--mode') === 'domain' ? 'domain' : 'category'

  if (fillCommand === 'fill-prep') {
    const raw = flagValue('--max-rows')
    const maxRows = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_FILL_ROWS
    if (!Number.isInteger(maxRows) || maxRows < 1) {
      console.error(`--max-rows 값이 잘못됐습니다: ${raw} (1 이상 정수)`)
      process.exit(2)
    }
    let index
    try {
      ;({ index } = await prepPolicyFill(projectRoot, { mode, maxRows }))
    } catch (err) {
      console.error(`fill-prep 실패: ${err.message}`)
      process.exit(2)
    }
    const t = index.totals
    console.log(`정책서 채움 팬아웃 청크 준비 완료(${mode}) — ${projectRoot}`)
    console.log(`  문서 ${t.docs}종 · 행 ${t.rows}건 → 청크 ${t.chunks}개 (청크당 행 상한 ${index.maxRows})`)
    if (t.preCiteMissing > 0) {
      console.log(
        `  ⚠️ 앵커 pre-cite 미확보 ${t.preCiteMissing}건 — 해당 행은 에이전트가 슬라이스에서 직접 인용해야 합니다(실패 시 [추정] 강등).`,
      )
    }
    if (index.skippedDocs.length > 0) {
      console.log(`  ⚠️ 대상 md 없어 제외 ${index.skippedDocs.length}종(1단계 생성 선행 필요): ${index.skippedDocs.map((d) => d.docId).join(', ')}`)
    }
    console.log('  산출물: .spec/map/policy-fill-prep/<chunkId>.json + index.json')
    console.log('')
    console.log('다음 단계(팬아웃): Workflow 도구로 scripts/policy-fill-fanout.workflow.js 실행')
    console.log('  (청크 id 목록은 policy-fill-prep/index.json 의 chunks[].chunkId)')
    console.log('  에이전트가 policy-fill-frag/<chunkId>.json 을 쓰면: fill-audit(감사) → fill-merge(병합)')
    process.exit(0)
  }

  if (fillCommand === 'fill-audit') {
    const chunkFlag = flagValue('--chunk')
    const only = chunkFlag ? chunkFlag.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    let audit
    try {
      audit = await auditPolicyFillFragments(projectRoot, only)
    } catch (err) {
      console.error(`fill-audit 실패: ${err.message}`)
      process.exit(2)
    }
    console.log(JSON.stringify(audit))
    process.exit(0)
  }

  // fill-merge
  const lex = loadLexicon(engine, projectRoot, join(here, '..'))
  let result
  try {
    result = await mergePolicyFillFragments(projectRoot, lex.lexicon ? { lexicon: lex.lexicon } : undefined)
  } catch (err) {
    console.error(`fill-merge 실패: ${err.message}`)
    process.exit(2)
  }
  console.log(`정책서 채움 조각 병합 완료 — ${projectRoot}`)
  if (lex.error) console.log(`  ⚠️ 렉시콘 파싱 실패(${lex.path}): ${lex.error} — 표기 통일 생략`)
  if (result.lexiconHits > 0) console.log(`  🔤 표기 통일(렉시콘) ${result.lexiconHits}건 — ${lex.path}`)
  console.log(`  채움 반영 행 ${result.rowsFilled}건 → 문서 ${result.docPaths.length}종`)
  if (result.missingRows.length > 0) {
    console.log(`  ⚠️ 미반영 행 ${result.missingRows.length}건(완결 조각 없음 — 부분 병합).`)
  }
  if (result.droppedItems > 0) {
    console.log(`  ⚠️ 청크 선언 밖 rowKey ${result.droppedItems}건 버림(유령 키 — 조용한 수용 금지).`)
  }
  if (result.citationsRemoved > 0 || result.tagsDemoted > 0) {
    console.log(
      `  ⚠️ 인용 진위 검증: 실파일 불일치 인용 ${result.citationsRemoved}건 제거` +
        `, 근거 0 → [추정] 강등 ${result.tagsDemoted}건(fail-closed).`,
    )
  }
  if (result.missingDocs.length > 0) {
    console.log(`  ⚠️ 대상 md 없어 건너뜀: ${result.missingDocs.join(', ')}`)
  }
  if (result.staleSectionsCleared > 0) {
    console.log(`  🧹 커버리지 소실로 낡은 채움 섹션 제거 ${result.staleSectionsCleared}종.`)
  }
  console.log('앵커 표(본체)는 불변 — 채움은 <!-- policy-fill --> 섹션에만 덧붙는다(재실행 멱등).')
  process.exit(0)
}

// ── 도메인 정책서 모드(PD3): `understand-policy <root> domain` ──────────────
// confirm/emit 이후 산출물(candidates + domain-graph)에서 도메인별 정책서를 만든다.
// 분기(if/switch/삼항)는 도메인 경계 안에서만 스캔 → 위치·조건식 [확정], 업무분류는 PD4 보강.
if (process.argv[3] === 'domain') {
  let inputs
  try {
    inputs = await assembleDomainPolicies(projectRoot)
  } catch (err) {
    console.error(`도메인 정책서 조립 실패: ${err.message}`)
    process.exit(2)
  }
  // 템플릿 — 전 도메인 공용 1개(domain-policy/domain.md). 프로젝트 override → 플러그인 동봉.
  // 헤딩/열이름/섹션순서를 제어하되 docId/title 은 도메인별이므로 적용 후 복원한다.
  const domTplRel = join('domain-policy', 'domain.md')
  const domTplProject = join(PROJECT_DOC_DIR, domTplRel)
  const domTplPlugin = join(PLUGIN_DOC_DIR, domTplRel)
  const domTplPath = existsSync(domTplProject) ? domTplProject : existsSync(domTplPlugin) ? domTplPlugin : null
  let domTpl = null
  if (domTplPath) {
    try {
      domTpl = parseDocTemplate(readFileSync(domTplPath, 'utf8'))
    } catch (err) {
      console.error(`도메인 정책 템플릿 파싱 실패(${domTplRel}): ${err.message}`)
      process.exit(2)
    }
  }
  const domTplOverridden = domTplPath === domTplProject

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const meta = []
  for (const built of getMethodology('domain-policy').buildDocSet({ nodes: [], edges: [], domainPolicies: inputs })) {
    // 템플릿 적용 시 docId/title 이 자리표시로 덮이므로 빌더 값으로 복원(도메인별 식별 유지).
    const doc = domTpl ? { ...applyDocTemplate(built, domTpl), docId: built.docId, title: built.title } : built
    const m = {
      docId: doc.docId,
      title: doc.title,
      methodology: doc.methodology,
      status: 'DRAFT',
      // 생성 시점 HEAD(candidates.json.gitCommit 이 아님) — 도메인 모드는 branch-scanner 로
      // 소스를 직접 읽으므로 HEAD 가 실제 유래(RTM_IMPACT_GATE_DESIGN.md §9.1, P0b 결정).
      sourceCommit: gitCommitHash(projectRoot) ?? null,
      evidenceRate: evidenceRate(doc),
    }
    writeFileSync(join(OUTPUT_DIR, `${doc.docId}.md`), renderMarkdown(doc, m), 'utf8')
    meta.push(m)
  }
  console.log(`understand-policy(도메인) 완료 — ${projectRoot}`)
  console.log(`  도메인 정책서 ${meta.length}종 → .understand-anything/doc-output/:`)
  for (let i = 0; i < inputs.length; i++) {
    const d = inputs[i]
    console.log(`    - policy-domain-${d.key}: ${d.name} (클래스 ${d.classes.length}·흐름 ${d.flows.length}·분기 ${d.branches.length})`)
  }
  if (domTplOverridden) {
    console.log(`  템플릿 프로젝트 override: domain-policy/domain.md (${PROJECT_DOC_DIR}/domain-policy/)`)
  } else if (!domTpl) {
    console.log('  템플릿 없음 — 빌더 기본 구조로 렌더(domain-policy/domain.md 두면 헤딩/열 override 가능).')
  }
  console.log('분기 위치·조건식 = 결정론 [확정]. 업무분류(권한/상태/계산)·의미 = SKILL 보강에서 [추정](합성 금지).')
  // 실행 원장 — 정책서 산출물은 결정론이라 시각을 못 싣는다. 실행 사실은 원장에만.
  appendRunLedger(projectRoot, {
    tool: 'understand-policy',
    action: 'domain',
    startedAt: runBegan,
    summary: `도메인 정책서 ${meta.length}종`,
  })
  process.exit(0)
}

// 1) census — 파일 인구조사(.sql/.java 발견).
const census = buildCensus(projectRoot)
// 2) db-schema — PA2: map(scan)이 .spec/map/db-schema.json 을 산출하면 그대로 로드(재스캔 0).
//    맵 미실행(policy 단독 실행) 시에만 자체 생성(단독성 보존). 동일 입력 → byte-identical.
let dbSchema = readDbSchema(projectRoot)
const dbSchemaFromMap = dbSchema !== null
if (!dbSchema) {
  dbSchema = extractDbSchema(projectRoot, census)
  writeDbSchema(projectRoot, dbSchema)
}

// 3) policy-signals — PA3: map(scan)이 .spec/map/policy-signals.json 을 산출하면 그대로
//    로드(재스캔 0). 맵 미실행(policy 단독 실행) 시에만 자체 생성(단독성 보존, PA2 동형).
let signals = readPolicySignals(projectRoot)
const signalsFromMap = signals !== null
if (!signals) {
  signals = await scanPolicySignals(projectRoot, census, dbSchema)
  writePolicySignals(projectRoot, signals)
}

// 3b) 기존 정책서 대조(있을 때) — .understand-anything/policy-input/*.md → 준수/미정의/문서에만.
const reconcile = scanPolicyReconcile(projectRoot, signals.signals)
writePolicyReconcile(projectRoot, reconcile)

// 4) policy 방법론 — 신호를 카테고리별 정책서로(빌더는 policySignals 만 소비).
const input = { nodes: [], edges: [], policySignals: signals }
const sourceCommit = signals.gitCommit ?? null

/** docId(policy-<name>) → 템플릿 상대경로(policy/<name>.md). */
function templateFileFor(docId) {
  return join('policy', `${docId.replace(/^policy-/, '')}.md`)
}

/** 템플릿 로드 — 프로젝트 override → 플러그인 동봉. 없으면 null(빌더 기본 구조). */
function loadDocTemplate(docId) {
  const rel = templateFileFor(docId)
  const projectPath = join(PROJECT_DOC_DIR, rel)
  const pluginPath = join(PLUGIN_DOC_DIR, rel)
  const path = existsSync(projectPath) ? projectPath : existsSync(pluginPath) ? pluginPath : null
  if (!path) return { tpl: null, source: 'builtin' }
  try {
    return { tpl: parseDocTemplate(readFileSync(path, 'utf8')), source: path === projectPath ? 'project' : 'plugin' }
  } catch (err) {
    console.error(`정책 템플릿 파싱 실패(${rel}): ${err.message}`)
    process.exit(2)
  }
}

/** 대조 상태 표시 라벨. */
const STATUS_LABEL = {
  준수: '✅ 준수',
  위반: '⚠️ 위반',
  미정의: '➕ 미정의(코드에만)',
  문서에만: '❓ 문서에만(미구현 후보)',
}

/**
 * 한 정책서(docId=policy-<category>)에 대한 "## 대조" 마크다운 섹션.
 * 기존 문서 항목(준수/문서에만)이 있을 때만 렌더(없으면 빈 문자열 — 신규 생성 경로는 깨끗).
 * DocsView 가 GFM 표로 그대로 렌더하므로 서버/배지 플럼빙이 필요 없다.
 */
function reconcileSection(docId) {
  const category = docId.replace(/^policy-/, '')
  const es = reconcile.entries.filter((e) => e.category === category)
  if (!es.some((e) => e.status === '준수' || e.status === '문서에만')) return ''
  const rows = es
    .map((e) => {
      const anchor = e.anchor ? `\`${e.anchor.file}:${e.anchor.line}\`` : '—'
      return `| ${e.subject} | ${STATUS_LABEL[e.status] ?? e.status} | ${anchor} |`
    })
    .join('\n')
  return `\n## 대조 (기존 정책서)\n\n> \`.understand-anything/policy-input/${category}.md\` 와 코드/DB 신호 대조. 위반(값 모순)은 LLM 보강에서 판정.\n\n| 항목 | 상태 | 코드/DB 근거 |\n| --- | --- | --- |\n${rows}\n`
}

mkdirSync(OUTPUT_DIR, { recursive: true })
const overridden = []
const meta = []
for (const built of getMethodology('policy').buildDocSet(input)) {
  const { tpl, source } = loadDocTemplate(built.docId)
  if (source === 'project') overridden.push(built.docId)
  const doc = tpl ? applyDocTemplate(built, tpl) : built
  const m = {
    docId: doc.docId,
    title: doc.title,
    methodology: doc.methodology,
    status: 'DRAFT',
    sourceCommit,
    evidenceRate: evidenceRate(doc),
  }
  writeFileSync(join(OUTPUT_DIR, `${doc.docId}.md`), renderMarkdown(doc, m) + reconcileSection(doc.docId), 'utf8')
  meta.push(m)
}

const tierKo = { 'ddl+data': 'DDL+데이터', ddl: 'DDL만', 'code-only': '코드만(폴백)' }
console.log(`understand-policy 완료 — ${projectRoot}`)
console.log(
  `  DB 분석: tier=${tierKo[dbSchema.tier] ?? dbSchema.tier} (.sql ${dbSchema.sqlFileCount}개, 테이블 ${dbSchema.tables.length}) ` +
    `[${dbSchemaFromMap ? 'map 산출 재사용' : '자체 생성(맵 미실행)'}]`,
)
// PA-gate: 외부 라이브 DB 감지 시 .sql 덤프 권장(내장형/신호없음은 조용히 진행).
const live = dbSchema.liveDbSignals ?? []
if (live.length > 0) {
  const vendors = [...new Set(live.map((x) => x.vendor))].join(', ')
  const external = live.filter((x) => !x.embedded)
  console.log(`  라이브 DB 신호: ${live.length}건 (벤더 ${vendors})${external.length === 0 ? ' — 내장형(.sql 로딩)' : ''}`)
  if (external.length > 0) {
    console.log('  ⚠️ 외부 라이브 DB 감지 — 권위 스키마를 .sql 로 덤프해 넣으면 반영됩니다(권장). 라이브 연결은 추후.')
  }
}
console.log(
  `  정책 신호: ${signals.signals.length}건 → .spec/map/policy-signals.json [${signalsFromMap ? 'map 산출 재사용' : '자체 생성(맵 미실행)'}]`,
)
console.log(`  정책서 ${meta.length}종 → .understand-anything/doc-output/:`)
for (const m of meta) {
  console.log(`    - ${m.docId}: ${m.title} (근거율 ${(m.evidenceRate * 100).toFixed(0)}%)`)
}
if (overridden.length > 0) {
  console.log(`  템플릿 프로젝트 override: ${overridden.join(', ')} (${PROJECT_DOC_DIR}/policy/)`)
}
// 기존 정책서가 있었을 때만 대조 요약(준수/문서에만 = 문서 항목 존재).
const s = reconcile.summary
if (s.준수 + s.문서에만 > 0) {
  console.log(`  기존 정책서 대조 → .spec/map/policy-reconcile.json:`)
  console.log(`    준수 ${s.준수} · 문서에만(미구현 후보) ${s.문서에만} · 미정의(코드에만) ${s.미정의}`)
  console.log(`    (위반=값 모순은 SKILL 보강에서 앵커 소스 대조로 판정)`)
} else if (reconcile.unresolved.length > 0) {
  console.log(`  policy-input 일부 미처리: ${reconcile.unresolved.map((u) => u.ref).join(', ')}`)
}
console.log('앵커(file:line)는 결정론 [확정]. 규범 진술·값은 SKILL 보강에서 [추정]로 채운다(합성 금지).')

// 실행 원장 — 정책서 산출물은 결정론이라 시각을 못 싣는다. 실행 사실은 원장에만.
appendRunLedger(projectRoot, {
  tool: 'understand-policy',
  action: 'category',
  startedAt: runBegan,
  summary: `정책서 ${meta.length}종 · 신호 ${signals.signals.length}건`,
})
