#!/usr/bin/env node
/**
 * 영향도 반증 게이트 — 오라클의 각 시드가 산출 영향도에서 mustInclude 를 도달하고,
 * mustNotInclude 가 상류/하류로 누출되지 않는지 검증.
 *
 * 사용법:
 *   node impact-recall.mjs <projectRoot> <expected.json> [--min <pct>] [--json]
 *
 * 동작:
 *   - 오라클(JSON) 로드 -> 시드별 analyzeImpact(projectRoot, [seed]) 실행(빌드된 dist).
 *     시드 origin="path", confidence="CONFIRMED".
 *   - produced = upstream.files ∪ downstream.files ∪ upstream.api(id) ∪
 *     upstream.persistence.mappers(relPath).
 *   - recall = |mustInclude ∩ produced| / |mustInclude|
 *     (mustInclude = upstream ∪ downstream ∪ api ∪ mappers 합집합, 집합 연산).
 *   - leak = mustNotInclude ∩ (upstream.files ∪ downstream.files) 가 비어야 함.
 *   - 시드별 + 전체 recall 출력. --min 지정 + 전체 < min 또는 누출 있으면 exit 1.
 *
 * 결정론: 집합 연산만 사용(인덱스/순서 비의존).
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { analyzeImpact } from '../dist/impact/index.js'

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

/** mustInclude 의 모든 섹션을 하나의 정답 집합으로 합친다(집합, 순서 무관). */
function unionMustInclude(mi) {
  const set = new Set()
  for (const k of ['upstream', 'downstream', 'api', 'mappers']) {
    for (const v of mi[k] ?? []) set.add(v)
  }
  return set
}

async function main() {
  const { positional, min, json } = parseArgs(process.argv.slice(2))
  if (positional.length < 2) {
    console.error('usage: node impact-recall.mjs <projectRoot> <expected.json> [--min <pct>] [--json]')
    process.exit(2)
  }
  const projectRoot = abs(positional[0])
  const oraclePath = abs(positional[1])

  const oracle = JSON.parse(readFileSync(oraclePath, 'utf8'))
  const seeds = Array.isArray(oracle.seeds) ? oracle.seeds : []

  const perSeed = []
  let totalMust = 0
  let totalHit = 0
  let anyLeak = false

  for (const s of seeds) {
    const seedPath = s.seed
    const { result } = analyzeImpact(projectRoot, [
      { relPath: seedPath, origin: 'path', confidence: 'CONFIRMED' },
    ])

    // 산출 집합.
    const upstreamFiles = new Set(result.upstream.files.map((f) => f.relPath))
    const downstreamFiles = new Set(result.downstream.files.map((f) => f.relPath))
    const apiIds = new Set(result.upstream.api.map((a) => a.id))
    const mapperPaths = new Set(result.upstream.persistence.mappers.map((m) => m.relPath))
    const produced = new Set([...upstreamFiles, ...downstreamFiles, ...apiIds, ...mapperPaths])
    const reachFiles = new Set([...upstreamFiles, ...downstreamFiles])

    // recall.
    const must = unionMustInclude(s.mustInclude ?? {})
    const hit = [...must].filter((f) => produced.has(f))
    const missing = [...must].filter((f) => !produced.has(f))
    const recall = must.size === 0 ? 1 : hit.length / must.size
    totalMust += must.size
    totalHit += hit.length

    // 누출(precision-style): mustNotInclude 가 상류/하류 파일에 등장하면 실패.
    const forbidden = Array.isArray(s.mustNotInclude) ? s.mustNotInclude : []
    const leaks = forbidden.filter((f) => reachFiles.has(f))
    if (leaks.length > 0) anyLeak = true

    perSeed.push({
      seed: seedPath,
      mustInclude: must.size,
      hit: hit.length,
      recall,
      missing: missing.sort(),
      leaks: leaks.sort(),
    })
  }

  const overall = totalMust === 0 ? 1 : totalHit / totalMust
  const overallPct = overall * 100

  if (json) {
    console.log(
      JSON.stringify(
        {
          project: oracle.project ?? null,
          perSeed: perSeed.map((r) => ({ ...r, recallPct: r.recall * 100 })),
          overall: { mustInclude: totalMust, hit: totalHit, recallPct: overallPct },
          anyLeak,
          knownGaps: oracle.knownGaps ?? [],
        },
        null,
        2,
      ),
    )
  } else {
    console.log(`impact-recall: project=${oracle.project ?? '(unknown)'}`)
    for (const r of perSeed) {
      const pct = (r.recall * 100).toFixed(1)
      console.log(`  ${pct.padStart(6)}%  ${r.hit}/${r.mustInclude}  ${r.seed}`)
      for (const m of r.missing) console.log(`            MISSING: ${m}`)
      for (const l of r.leaks) console.log(`            LEAK: ${l}`)
    }
    console.log(`  ------`)
    console.log(`  ${overallPct.toFixed(1).padStart(6)}%  ${totalHit}/${totalMust}  OVERALL  (leak=${anyLeak})`)
  }

  if (anyLeak) {
    if (!json) console.error('FAIL: mustNotInclude 파일이 상류/하류 영향에 누출됨')
    process.exit(1)
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
