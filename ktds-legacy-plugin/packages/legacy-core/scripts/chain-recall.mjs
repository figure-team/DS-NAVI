#!/usr/bin/env node
/**
 * 체인 반증 게이트 — 오라클의 각 루트가 산출 슬라이스에서 mustReach 를 도달하는지 검증.
 *
 * 사용법:
 *   node chain-recall.mjs <projectRoot> <expected.json> [--min <pct>] [--json]
 *
 * 동작:
 *   - 오라클(JSON) 로드 -> scanDomainMap(projectRoot) 실행(빌드된 dist 사용).
 *   - 루트별 recall = |mustReach ∩ reached| / |mustReach| (순서 무관 집합 연산).
 *   - 루트별 + 전체 recall 출력. --min 지정 + 전체 < min 이면 exit 1.
 *
 * 결정론: 집합 연산만 사용(인덱스/순서 비의존).
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { scanDomainMap } from '../dist/domain-map/extract.js'

function parseArgs(argv) {
  const positional = []
  let min = null
  let json = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--min') {
      min = Number(argv[++i])
    } else if (a === '--json') {
      json = true
    } else {
      positional.push(a)
    }
  }
  return { positional, min, json }
}

function abs(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p)
}

async function main() {
  const { positional, min, json } = parseArgs(process.argv.slice(2))
  if (positional.length < 2) {
    console.error('usage: node chain-recall.mjs <projectRoot> <expected.json> [--min <pct>] [--json]')
    process.exit(2)
  }
  const projectRoot = abs(positional[0])
  const oraclePath = abs(positional[1])

  const oracle = JSON.parse(readFileSync(oraclePath, 'utf8'))
  const chains = Array.isArray(oracle.chains) ? oracle.chains : []

  const { slices } = await scanDomainMap(projectRoot)
  const reachedByRoot = new Map()
  for (const s of slices.slices) {
    reachedByRoot.set(s.root, new Set(s.reached))
  }

  const perRoot = []
  let totalMust = 0
  let totalHit = 0
  for (const chain of chains) {
    const must = Array.isArray(chain.mustReach) ? chain.mustReach : []
    const reached = reachedByRoot.get(chain.root) ?? new Set()
    const hit = must.filter((f) => reached.has(f))
    const missing = must.filter((f) => !reached.has(f))
    const recall = must.length === 0 ? 1 : hit.length / must.length
    totalMust += must.length
    totalHit += hit.length
    perRoot.push({
      root: chain.root,
      mustReach: must.length,
      hit: hit.length,
      recall,
      missing,
    })
  }

  const overall = totalMust === 0 ? 1 : totalHit / totalMust
  const overallPct = overall * 100

  if (json) {
    console.log(
      JSON.stringify(
        {
          project: oracle.project ?? null,
          perRoot: perRoot.map((r) => ({ ...r, recallPct: r.recall * 100 })),
          overall: { mustReach: totalMust, hit: totalHit, recallPct: overallPct },
          knownGaps: oracle.knownGaps ?? [],
        },
        null,
        2,
      ),
    )
  } else {
    console.log(`chain-recall: project=${oracle.project ?? '(unknown)'}`)
    for (const r of perRoot) {
      const pct = (r.recall * 100).toFixed(1)
      console.log(`  ${pct.padStart(6)}%  ${r.hit}/${r.mustReach}  ${r.root}`)
      for (const m of r.missing) console.log(`            MISSING: ${m}`)
    }
    console.log(`  ------`)
    console.log(`  ${overallPct.toFixed(1).padStart(6)}%  ${totalHit}/${totalMust}  OVERALL`)
  }

  if (min !== null && overallPct < min) {
    if (!json) console.error(`FAIL: overall recall ${overallPct.toFixed(1)}% < required ${min}%`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
