#!/usr/bin/env node
/**
 * petstore 영향도 픽스처 산출물 생성기 — 실제 스캔 파이프라인으로 `.spec/map/` +
 * `.understand-anything/domain-graph.json` 을 생성한다(손으로 쓰지 않는다).
 *
 * 절차:
 *   1) scanDomainMap(projectRoot)  → census/routes/edges/slices/candidates 기록.
 *   2) buildAutoPlan(candidates)   → 후보를 그대로 수용한 확정 플랜.
 *   3) writeConfirmedPlan(...)     → domain-plan.confirmed.json 기록(사람 게이트 대체).
 *   4) buildMap(projectRoot)       → skeleton.json + domain-graph.json 까지 생성.
 *   5) 산출 파일 목록 로그.
 *
 * 결정론: 출력은 동일 commit + 동일 소스면 byte-identical. 타임스탬프 없음.
 *
 * 사용법: node fixtures/impact-recall/generate-petstore.mjs
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  scanDomainMap,
  buildMap,
  buildAutoPlan,
  writeConfirmedPlan,
} from '../../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, 'petstore')

async function main() {
  // 1) 스캔: census → routes → edges → slices → candidates ( `.spec/map/` 기록).
  const scan = await scanDomainMap(projectRoot)
  console.log(`scan: ${scan.census.fileCount} files, ${scan.edges.edges.length} edges, ` +
    `${scan.routes.routes.length} routes, ${scan.candidates.candidates.length} domain candidates`)

  // 2) 후보 수용 자동 플랜 → 3) 확정 플랜 기록(사람 게이트 대체).
  const plan = buildAutoPlan(scan.candidates, 'fixture-generator')
  const planPath = writeConfirmedPlan(projectRoot, plan)
  console.log(`confirmed plan: ${plan.domains.length} domains [${plan.domains.map((d) => d.key).join(', ')}] -> ${planPath}`)

  // 4) 전체 빌드: skeleton.json + domain-graph.json.
  const built = await buildMap(projectRoot)
  if (built.needsConfirm) {
    throw new Error('buildMap returned needsConfirm=true — 확정 플랜이 적용되지 않음')
  }
  console.log(`build: skeleton flows=${built.skeleton.flows?.length ?? 0}, ` +
    `methodCalls=${built.methodCallGraph.calls?.length ?? 0}`)

  // 5) 산출 파일.
  const files = [
    '.spec/map/census.json',
    '.spec/map/routes.json',
    '.spec/map/edges.json',
    '.spec/map/slices.json',
    '.spec/map/candidates.json',
    '.spec/map/domain-plan.confirmed.json',
    '.spec/map/skeleton.json',
    '.spec/map/method-calls.json',
    '.understand-anything/domain-graph.json',
  ]
  console.log('generated artifacts:')
  for (const f of files) console.log(`  ${f}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
