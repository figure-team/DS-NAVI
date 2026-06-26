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

const engine = await import(distEntry)
const {
  buildCensus,
  extractDbSchema,
  writeDbSchema,
  scanPolicySignals,
  writePolicySignals,
  scanPolicyReconcile,
  writePolicyReconcile,
  getMethodology,
  parseDocTemplate,
  applyDocTemplate,
  renderMarkdown,
  evidenceRate,
} = engine

const PLUGIN_DOC_DIR = join(here, '..', 'templates', 'doc')
const PROJECT_DOC_DIR = join(projectRoot, '.understand-anything', 'doc')
const OUTPUT_DIR = join(projectRoot, '.understand-anything', 'doc-output')

// 1) census — 파일 인구조사(.sql/.java 발견). 2) db-schema — 정적 .sql(3-Tier degrade).
const census = buildCensus(projectRoot)
const dbSchema = extractDbSchema(projectRoot, census)
writeDbSchema(projectRoot, dbSchema)

// 3) policy-signals — 코드(java-facts) + DB 신호 병합(앵커).
const signals = await scanPolicySignals(projectRoot, census, dbSchema)
writePolicySignals(projectRoot, signals)

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
  writeFileSync(join(OUTPUT_DIR, `${doc.docId}.md`), renderMarkdown(doc, m), 'utf8')
  meta.push(m)
}

const tierKo = { 'ddl+data': 'DDL+데이터', ddl: 'DDL만', 'code-only': '코드만(폴백)' }
console.log(`understand-policy 완료 — ${projectRoot}`)
console.log(`  DB 분석: tier=${tierKo[dbSchema.tier] ?? dbSchema.tier} (.sql ${dbSchema.sqlFileCount}개, 테이블 ${dbSchema.tables.length})`)
console.log(`  정책 신호: ${signals.signals.length}건 → .spec/map/policy-signals.json`)
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
