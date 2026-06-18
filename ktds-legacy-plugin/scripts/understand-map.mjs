#!/usr/bin/env node
/**
 * /understand-map CLI 래퍼 — 결정론 도메인 맵 스캔.
 * 사용: node understand-map.mjs [projectRoot] [scan]
 *
 * P1 범위: `scan` (census/routes/edges/slices, 결정론, .spec/map/ 산출).
 * plan/confirm/bundle/emit 은 후속 phase(P2/P4)에서 추가된다.
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
const sub = process.argv[3] || 'scan'

if (sub !== 'scan') {
  console.error(`'${sub}' 은 아직 미지원입니다. P1 범위는 'scan' 입니다 (plan/confirm/bundle/emit 은 후속).`)
  process.exit(2)
}

const { scanDomainMap } = await import(distEntry)
const { census, routes, edges, slices } = await scanDomainMap(projectRoot)

console.log(`understand-map scan 완료 — ${projectRoot}`)
console.log(`  census: 파일 ${census.fileCount}개`)
console.log(`  routes: 라우트 ${routes.routes.length}개 / 배치 ${routes.batchEntries.length}개`)
console.log(`  edges: 엣지 ${edges.edges.length}개 / 미해소 ${edges.unresolved.length}개`)
console.log(`  slices: 슬라이스 ${slices.slices.length}개`)
console.log('산출물: .spec/map/{census,routes,edges,slices}.json (동일 commit 재실행 byte-diff=0)')
