#!/usr/bin/env node
/**
 * CRUD 매트릭스 구조화 산출(export) — 대시보드 "데이터" 화면용.
 * 사용: node export-crud-matrix.mjs [projectRoot]
 *
 * understand-docs 의 07_crud-matrix 빌더(buildCrudMatrix)를 그대로 호출해 md 렌더 전의
 * **구조화 표 모델**(columns/rows+근거)을 `.spec/map/crud-matrix.json` 으로 쓴다.
 * md(doc-output/07_crud-matrix.md)와 동일 입력·동일 빌더 → 두 산출물은 항상 일치한다.
 */
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error('엔진(@ktds/legacy-core)이 빌드되지 않았습니다: pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const projectRoot = process.argv[2] || process.cwd()
const engine = await import(distEntry)
const { buildCrudMatrix, buildMyBatisModel, isMapperXmlDocument } = engine

const graphPath = join(projectRoot, '.understand-anything', 'domain-graph.json')
if (!existsSync(graphPath)) {
  console.error('도메인 그래프가 없습니다(.understand-anything/domain-graph.json) — understand-map 먼저.')
  process.exit(2)
}
const graph = JSON.parse(readFileSync(graphPath, 'utf8'))

// Mapper XML 스캔 — understand-docs.mjs 와 동일 규칙(루트 요소 판별, 결정론 정렬).
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
        if (isMapperXmlDocument(content)) out.push({ relPath: relative(root, p), content })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
}
const mybatisModel = buildMyBatisModel(findMapperXmls(projectRoot))

let methodCallGraph = null
const mcgPath = join(projectRoot, '.spec', 'map', 'method-calls.json')
if (existsSync(mcgPath)) {
  try {
    methodCallGraph = JSON.parse(readFileSync(mcgPath, 'utf8'))
  } catch {
    // 손상 시 null(빌더가 파일 단위 폴백).
  }
}

const doc = buildCrudMatrix({ nodes: graph.nodes, edges: graph.edges, mybatisModel, methodCallGraph })
// 표 섹션(첫 table 보유 섹션)만 구조화로 내보낸다 — 행=기능(flow), 열=테이블/DAO.
const section = doc.sections.find((s) => s.table)
if (!section) {
  console.error('crud-matrix 빌더가 표 섹션을 내지 않았습니다(그래프에 flow 없음?) — 산출 생략.')
  process.exit(2)
}
const out = {
  schemaVersion: 1,
  gitCommit: graph.gitCommit ?? null,
  heading: section.heading,
  prose: section.prose ?? null,
  columns: section.table.columns,
  rows: section.table.rows,
}
const outPath = join(projectRoot, '.spec', 'map', 'crud-matrix.json')
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(`crud-matrix.json → ${outPath} (열 ${out.columns.length} · 행 ${out.rows.length})`)
