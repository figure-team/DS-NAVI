#!/usr/bin/env node
/**
 * /understand-docs CLI 래퍼 — 템플릿 기반 산출물(문서) 생성(D2).
 * 사용: node understand-docs.mjs [projectRoot]
 *
 * 확정 플랜 + 스캔 산출물로 근거 가능 9종(DOC_SET)을 생성한다. 각 문서는 템플릿(.md)을
 * 로드해(프로젝트 override → 플러그인 동봉) 빌더 산출에 입힌다(applyDocTemplate). 생성물은
 * `.understand-anything/doc-output/<docId>.md` 로 쓰며, 사용자가 편집·확정할 수 있다(D3).
 * 모든 표 행/주장은 file:line 근거 + 신뢰도 태그(AC-9). 위키 볼트(.spec/wiki/)도 함께 갱신.
 */
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'

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
  DOC_SET,
  parseDocTemplate,
  applyDocTemplate,
  renderMarkdown,
  evidenceRate,
  buildWikiVault,
  writeWikiVault,
  buildMyBatisModel,
  isMapperXmlDocument,
  readDbSchema,
  buildXlsxWorkbook,
  docToSheets,
  rtmToSheets,
} = engine

const PLUGIN_DOC_DIR = join(here, '..', 'templates', 'doc')
const PROJECT_DOC_DIR = join(projectRoot, '.understand-anything', 'doc')
const OUTPUT_DIR = join(projectRoot, '.understand-anything', 'doc-output')

// 입력은 **디스크의 fill 완료 그래프**를 읽는다(비파괴). buildMap 은 domain-graph.json 을
// 결정론 skeleton 으로 재-emit(채움 소실)하므로 호출하지 않는다. 채움 그래프는 understand-map
// 의 `map`→`emit` 으로 생성/갱신한다.
const graphPath = join(projectRoot, '.understand-anything', 'domain-graph.json')
if (!existsSync(graphPath)) {
  console.error('도메인 그래프가 없습니다(.understand-anything/domain-graph.json). 먼저 생성하세요:')
  console.error('  understand-map <project> map  →  (fill 작성)  →  understand-map <project> emit')
  process.exit(2)
}
let graph
try {
  graph = JSON.parse(readFileSync(graphPath, 'utf8'))
} catch (err) {
  console.error(`도메인 그래프 파싱 실패: ${err.message}`)
  process.exit(2)
}
if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
  console.error('도메인 그래프 형식 오류: nodes/edges 배열이 필요합니다.')
  process.exit(2)
}

// 라우트(배치 진입점 포함)는 스캔 산출물에서 읽는다(없으면 빈 세트).
let routes = { schemaVersion: 1, gitCommit: null, contextPath: null, routes: [], batchEntries: [] }
const routesPath = join(projectRoot, '.spec', 'map', 'routes.json')
if (existsSync(routesPath)) {
  try {
    routes = JSON.parse(readFileSync(routesPath, 'utf8'))
  } catch {
    // 손상 시 빈 세트(정직 — 배치/라우트 문서는 0행).
  }
}

// 대외 인터페이스(W1)는 스캔 산출물에서 읽는다(없으면 null → §2 송신 0행).
let interfaces = null
const interfacesPath = join(projectRoot, '.spec', 'map', 'interfaces.json')
if (existsSync(interfacesPath)) {
  try {
    interfaces = JSON.parse(readFileSync(interfacesPath, 'utf8'))
  } catch {
    // 손상 시 null(정직 — 송신 섹션 0행).
  }
}

// 배치 인벤토리(W2)는 스캔 산출물에서 읽는다(없으면 null → si-배치정의서 0행).
let batchJobs = null
const batchJobsPath = join(projectRoot, '.spec', 'map', 'batch-jobs.json')
if (existsSync(batchJobsPath)) {
  try {
    batchJobs = JSON.parse(readFileSync(batchJobsPath, 'utf8'))
  } catch {
    // 손상 시 null(정직 — 배치정의서 0행).
  }
}

// 프로그램 목록+FP 기초(W3)는 스캔 산출물에서 읽는다(없으면 null → si-프로그램목록 0행).
let programInventory = null
const programInventoryPath = join(projectRoot, '.spec', 'map', 'program-inventory.json')
if (existsSync(programInventoryPath)) {
  try {
    programInventory = JSON.parse(readFileSync(programInventoryPath, 'utf8'))
  } catch {
    // 손상 시 null(정직 — 프로그램목록 0행).
  }
}

// 위험 모듈 리포트(W4)는 스캔 산출물에서 읽는다(없으면 null → si-위험모듈리포트 0행).
let riskReport = null
const riskReportPath = join(projectRoot, '.spec', 'map', 'risk-report.json')
if (existsSync(riskReportPath)) {
  try {
    riskReport = JSON.parse(readFileSync(riskReportPath, 'utf8'))
  } catch {
    // 손상 시 null(정직 — 위험 리포트 0행).
  }
}

// 실적 요약(W6)은 스캔 산출물에서 읽는다(없으면 null → si-실적요약보고서 현황 행 안내).
// 주의: 기간은 understand-report 수집 시점의 해석 결과가 박제됨 — 새 기간은 재수집.
// 스키마 검증(safeParse)으로 로드 — 구버전/형식 이탈 산출물은 크래시 대신 현황 행으로
// degrade(W6-b 리뷰 T1: 빌더 크래시가 뒤 문서 전체 생성을 중단시키는 경로 차단).
let workSummary = null
const workSummaryPath = join(projectRoot, '.spec', 'map', 'work-summary.json')
if (existsSync(workSummaryPath)) {
  try {
    const parsed = engine.WorkSummaryReportSchema.safeParse(
      JSON.parse(readFileSync(workSummaryPath, 'utf8')),
    )
    if (parsed.success) workSummary = parsed.data
    else console.error('  work-summary.json 형식 불일치(구버전?) — understand-report 재실행 권장. 실적 문서는 현황 행으로 생성.')
  } catch {
    // 손상 시 null(정직 — 현황 행 안내).
  }
}

// RTM 원장(W5)은 rtm.json 에서 읽는다(없으면 null → si-단위테스트시나리오 0행).
let rtm = null
const rtmModelPath = join(projectRoot, '.understand-anything', 'rtm.json')
if (existsSync(rtmModelPath)) {
  try {
    rtm = JSON.parse(readFileSync(rtmModelPath, 'utf8'))
  } catch {
    // 손상 시 null(정직 — 시나리오 0행).
  }
}

// MyBatis Mapper XML 스캔(Tier B) — 테이블/CRUD grounding. 매퍼 XML 없으면 빈 모델.
function findMapperXmls(root) {
  const SKIP = new Set(['node_modules', '.git', 'target', 'build', 'dist', '.understand-anything', '.spec', '.idea'])
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(join(dir, e.name))
      } else if (e.name.endsWith('.xml')) {
        const p = join(dir, e.name)
        let content
        try {
          content = readFileSync(p, 'utf8')
        } catch {
          continue
        }
        // 루트 요소 기준 판별 — 부분 문자열 검사는 문서 코드 예제(maven xdoc)를 오분류(W4).
        if (isMapperXmlDocument(content)) {
          out.push({ relPath: relative(root, p), content })
        }
      }
    }
  }
  walk(root)
  return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
}
const mybatisModel = buildMyBatisModel(findMapperXmls(projectRoot))

// 메서드 호출그래프(P3) — crud-matrix 흐름별 핸들러→매퍼 메서드 정밀 귀속(있으면).
let methodCallGraph = null
const mcgPath = join(projectRoot, '.spec', 'map', 'method-calls.json')
if (existsSync(mcgPath)) {
  try {
    methodCallGraph = JSON.parse(readFileSync(mcgPath, 'utf8'))
  } catch {
    // 손상 시 null(폴백: 파일 단위 사용메서드).
  }
}

// 언어 도출 — 그래프 노드 filePath 확장자에서(emit project.languages 가 비어 있어 보강).
const EXT_LANG = { java: "Java", kt: "Kotlin", ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", py: "Python", go: "Go", rb: "Ruby", cs: "C#", php: "PHP" }
function deriveLanguages(nodes) {
  const set = new Set()
  for (const n of nodes) {
    const fp = typeof n.filePath === "string" ? n.filePath : ""
    const ext = fp.includes(".") ? fp.slice(fp.lastIndexOf(".") + 1).toLowerCase() : ""
    if (EXT_LANG[ext]) set.add(EXT_LANG[ext])
  }
  return [...set].sort()
}

// Maven pom.xml 의존성 추출(file:line) — tech-stack 프레임워크/라이브러리 grounding. test/provided 제외.
function findBuildDeps(root) {
  const pom = join(root, "pom.xml")
  if (!existsSync(pom)) return []
  let xml
  try {
    xml = readFileSync(pom, "utf8")
  } catch {
    return []
  }
  const out = []
  const seen = new Set()
  for (const m of xml.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    if (/<scope>\s*(test|provided)\s*<\/scope>/.test(m[1])) continue
    const aid = /<artifactId>([^<]+)<\/artifactId>/.exec(m[1])
    if (!aid) continue
    const name = aid[1].trim()
    if (seen.has(name)) continue
    seen.add(name)
    const absIdx = (m.index ?? 0) + m[0].indexOf(aid[0])
    out.push({ name, file: "pom.xml", line: xml.slice(0, absIdx).split("\n").length })
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

// 파일 의존 엣지(edges.json) — architecture 의존 방향/순환 grounding(없으면 빈 배열).
let fileEdges = []
const edgesPath = join(projectRoot, ".spec", "map", "edges.json")
if (existsSync(edgesPath)) {
  try {
    const er = JSON.parse(readFileSync(edgesPath, "utf8"))
    if (Array.isArray(er.edges)) fileEdges = er.edges
  } catch {
    // 손상 시 빈 배열(architecture 는 calls 폴백).
  }
}

const langs = deriveLanguages(graph.nodes)
const project = {
  ...(graph.project ?? {}),
  languages: langs.length > 0 ? langs : graph.project?.languages ?? [],
}
const buildDeps = findBuildDeps(projectRoot)

// PA3: db-spec 가 DDL 의 실제 컬럼/PK/FK/CHECK 를 grounding 으로 싣도록 map(scan) 산출을 로드.
// 없으면(맵 미실행/code-only) null → db-spec 은 기존 노드 기반 목록만(우아한 degrade).
const dbSchema = readDbSchema(projectRoot)
const input = { nodes: graph.nodes, edges: graph.edges, routes, interfaces, batchJobs, programInventory, riskReport, rtm, workSummary, mybatisModel, methodCallGraph, project, buildDeps, fileEdges, dbSchema }
// domain-graph.json 은 최상위 gitCommit 을 갖지 않는다 — 스탬프는 ktdsMap.generatedFromCommit
// (emit 이 skeleton.gitCommit 에서 투영, 없으면 빈 문자열)과 project.gitCommitHash 에 있다.
// `||` 인 이유: emit.ts 가 `?? ''` 로 쓰므로 빈 문자열을 유효값으로 받으면 안 된다.
const sourceCommit = graph.ktdsMap?.generatedFromCommit || graph.project?.gitCommitHash || null
const graphSource = 'domain-graph.json(채움)'

/** 한 문서의 템플릿 로드 — 프로젝트 override → 플러그인 동봉. 없으면 null(빌더 기본 구조). */
function loadDocTemplate(entry) {
  const projectPath = join(PROJECT_DOC_DIR, entry.templateFile)
  const pluginPath = join(PLUGIN_DOC_DIR, entry.templateFile)
  const path = existsSync(projectPath) ? projectPath : existsSync(pluginPath) ? pluginPath : null
  if (!path) return { tpl: null, source: 'builtin' }
  try {
    return { tpl: parseDocTemplate(readFileSync(path, 'utf8')), source: path === projectPath ? 'project' : 'plugin' }
  } catch (err) {
    console.error(`문서 템플릿 파싱 실패(${entry.templateFile}): ${err.message}`)
    console.error('형식: frontmatter(docId/title/methodology) + "## 라벨 {#바인딩키}" + (표) 컬럼 헤더 1줄.')
    process.exit(2)
  }
}

mkdirSync(OUTPUT_DIR, { recursive: true })
const overridden = []
const docs = []
const meta = []
for (const entry of DOC_SET) {
  const { tpl, source } = loadDocTemplate(entry)
  if (source === 'project') overridden.push(entry.docId)
  let doc = entry.build(input)
  if (tpl) doc = applyDocTemplate(doc, tpl)
  const m = {
    docId: doc.docId,
    title: doc.title,
    methodology: doc.methodology,
    status: 'DRAFT',
    sourceCommit,
    evidenceRate: evidenceRate(doc),
  }
  writeFileSync(join(OUTPUT_DIR, `${doc.docId}.md`), renderMarkdown(doc, m), 'utf8')
  docs.push(doc)
  meta.push(m)
}

// W7: xlsx 병기 — 표 보유 문서만, md 와 동일 데이터(빌더 산출)에서 생성(불일치 금지).
// 라이터는 의존성 0·고정 타임스탬프라 동일 입력 → byte-identical.
// 재생성 전 기존 .xlsx 전부 제거 — 문서가 표를 잃거나 개명되면 낡은 파일이 잔존해
// hasXlsx 로 계속 서빙되는 사고 방지(이 디렉터리의 xlsx 는 전부 본 스크립트 산출물).
for (const f of readdirSync(OUTPUT_DIR)) {
  if (f.endsWith('.xlsx')) rmSync(join(OUTPUT_DIR, f))
}
const xlsxDocs = []
const xlsxMeta = { sourceCommit }
for (const doc of docs) {
  const sheets = docToSheets(doc, xlsxMeta)
  if (sheets.length === 0) continue
  writeFileSync(join(OUTPUT_DIR, `${doc.docId}.xlsx`), buildXlsxWorkbook(sheets))
  xlsxDocs.push(doc.docId)
}
// RTM 원장(rtm.json) → rtm.xlsx(문서정보+요구/기능 원장+커버리지 현황).
const rtmPath = join(projectRoot, '.understand-anything', 'rtm.json')
let rtmXlsx = false
if (existsSync(rtmPath)) {
  try {
    const rtm = JSON.parse(readFileSync(rtmPath, 'utf8'))
    writeFileSync(
      join(OUTPUT_DIR, 'rtm.xlsx'),
      buildXlsxWorkbook(rtmToSheets(rtm, { sourceCommit: rtm.gitCommit ?? sourceCommit })),
    )
    rtmXlsx = true
  } catch (err) {
    console.error(`  rtm.xlsx 생략 — rtm.json 판독 실패: ${err.message}`)
  }
}

// 위키 볼트(.spec/wiki/)도 함께 갱신(허브 index 포함).
const vault = buildWikiVault(docs, (doc) => meta.find((m) => m.docId === doc.docId))
writeWikiVault(projectRoot, vault)

const myb = mybatisModel.mappers.length > 0
  ? ` · MyBatis ${mybatisModel.mappers.length}매퍼/${mybatisModel.tables.length}테이블`
  : ''
console.log(`understand-docs 완료 — ${projectRoot} (입력: ${graphSource}${myb})`)
console.log(`  문서 ${docs.length}종 → .understand-anything/doc-output/:`)
for (const m of meta) {
  console.log(`    - ${m.docId}: ${m.title} (근거율 ${(m.evidenceRate * 100).toFixed(0)}%)`)
}
if (overridden.length > 0) {
  console.log(`  템플릿 프로젝트 override: ${overridden.join(', ')} (${PROJECT_DOC_DIR}/)`)
}
console.log(`  xlsx 병기: 문서 ${xlsxDocs.length}종${rtmXlsx ? ' + rtm.xlsx(요구/기능 원장)' : ''} → doc-output/*.xlsx`)
console.log(`  위키 볼트: .spec/wiki/ (${vault.files.length}개 파일, index.md 허브 포함)`)
console.log('모든 표 행/주장은 file:line 근거 + 신뢰도 태그를 갖는다(AC-9). 생성물은 편집·확정 가능(D3).')
