#!/usr/bin/env node
/**
 * /understand-docs CLI 래퍼 — 결정론 산출물(문서) 생성.
 * 사용: node understand-docs.mjs [projectRoot] [as-built|si-standard]
 *
 * 확정 플랜(domain-plan.confirmed.json) + 스캔 산출물에서 방법론 모듈로 문서셋을
 * 생성해 .spec/docs/ 와 위키 볼트(.spec/wiki/)에 기록한다. 모든 주장은 근거(file:line) 기반.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

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
const methodologyId = process.argv[3] || 'as-built'

const engine = await import(distEntry)
const { buildMap, getMethodology, listMethodologies, renderMarkdown, buildWikiVault, writeWikiVault } =
  engine

if (!listMethodologies().includes(methodologyId)) {
  console.error(
    `'${methodologyId}' 은 알 수 없는 방법론입니다. 사용 가능: ${listMethodologies().join(', ')}.`,
  )
  process.exit(2)
}

const map = await buildMap(projectRoot)
if (map.needsConfirm) {
  console.error('확정 플랜이 없습니다. 먼저 도메인 경계를 확정하세요:')
  console.error('  understand-map confirm --auto-approve --by <담당자>')
  process.exit(2)
}

// DocInput 조립: skeleton 노드/엣지 + 라우트(+ 프로젝트 메타는 선택).
const input = { nodes: map.skeleton.nodes, edges: map.skeleton.edges, routes: map.routes }
const module = getMethodology(methodologyId)
const docs = module.buildDocSet(input)

const sourceCommit = map.skeleton.gitCommit ?? null
const meta = (doc) => ({
  docId: doc.docId,
  title: doc.title,
  methodology: doc.methodology,
  status: 'DRAFT',
  sourceCommit,
  evidenceRate: engine.evidenceRate(doc),
})

const vault = buildWikiVault(docs, meta)
writeWikiVault(projectRoot, vault)

console.log(`understand-docs 완료 — ${projectRoot} (방법론: ${methodologyId})`)
console.log(`  문서 ${docs.length}종:`)
for (const doc of docs) {
  console.log(`    - ${doc.docId}: ${doc.title} (근거율 ${(engine.evidenceRate(doc) * 100).toFixed(0)}%)`)
}
console.log(`  위키 볼트: .spec/wiki/ (${vault.files.length}개 파일, index.md 허브 포함)`)
console.log('모든 표 행/주장은 file:line 근거 + 신뢰도 태그를 갖는다(AC-9).')
