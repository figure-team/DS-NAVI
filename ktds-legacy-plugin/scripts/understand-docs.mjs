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
        if (content.includes('<mapper') && content.includes('namespace')) {
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

const input = { nodes: graph.nodes, edges: graph.edges, routes, mybatisModel, methodCallGraph, project, buildDeps, fileEdges }
const sourceCommit = graph.gitCommit ?? null
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
console.log(`  위키 볼트: .spec/wiki/ (${vault.files.length}개 파일, index.md 허브 포함)`)
console.log('모든 표 행/주장은 file:line 근거 + 신뢰도 태그를 갖는다(AC-9). 생성물은 편집·확정 가능(D3).')
