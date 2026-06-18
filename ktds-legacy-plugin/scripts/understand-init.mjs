#!/usr/bin/env node
/**
 * /understand-init CLI 래퍼 — 결정론 엔진(@ktds/legacy-core)의 initProject 호출.
 * 사용: node understand-init.mjs [projectRoot]
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

const { initProject } = await import(distEntry)
const projectRoot = process.argv[2] || process.cwd()
const result = initProject(projectRoot)

console.log(`understand-init 완료 — ${projectRoot}`)
if (result.created.length) console.log(`  생성: ${result.created.join(', ')}`)
if (result.preserved.length) console.log(`  보존(기존 유지): ${result.preserved.join(', ')}`)
console.log('다음: U-A `/understand` 로 knowledge-graph.json 생성 후 `/understand-map scan`.')
