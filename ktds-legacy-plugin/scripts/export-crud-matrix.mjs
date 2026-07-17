#!/usr/bin/env node
/**
 * CRUD 매트릭스 구조화 산출(export) — 대시보드 "데이터" 화면용.
 * 사용: node export-crud-matrix.mjs [projectRoot]
 *
 * 실제 로직은 엔진의 `exportCrudMatrix`(packages/legacy-core/src/doc-generator/crud-export.ts)
 * 에 있고 이 스크립트는 얇은 CLI 래퍼다 — `understand-map emit` 이 같은 함수를 부른다
 * (단일 소스: 두 경로가 갈라지지 않는다).
 *
 * 평소엔 이 스크립트를 직접 부를 필요가 없다 — emit 이 매번 갱신한다. 그래프는 그대로 둔 채
 * CRUD 만 다시 뽑고 싶을 때의 수동 탈출구로 남긴다.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error('엔진(@ktds/legacy-core)이 빌드되지 않았습니다: pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const projectRoot = process.argv[2] || process.cwd()
const { exportCrudMatrix } = await import(distEntry)

if (!existsSync(join(projectRoot, '.understand-anything', 'domain-graph.json'))) {
  console.error('도메인 그래프가 없습니다(.understand-anything/domain-graph.json) — understand-map 먼저.')
  process.exit(2)
}

const result = exportCrudMatrix(projectRoot)
if (!result) {
  console.error('crud-matrix 빌더가 표 섹션을 내지 않았습니다(그래프에 flow 없음?) — 산출 생략.')
  process.exit(2)
}
console.log(`crud-matrix.json → ${result.outPath} (열 ${result.columns} · 행 ${result.rows})`)
