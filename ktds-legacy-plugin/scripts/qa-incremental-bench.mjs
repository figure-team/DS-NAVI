#!/usr/bin/env node
/**
 * qa-incremental-bench.mjs — W8 증분 분석 수용 기준(AC) 실측 하네스.
 *
 * 사용: node qa-incremental-bench.mjs <projectRoot> [수정할 .java relPath]
 *   (relPath 생략 시 census 에서 첫 *Controller.java 를 고른다.)
 *
 * 절차(대상 파일은 반드시 원복):
 *   1) 캐시 삭제 → cold full 스캔(기준 시간)
 *   2) warm 무변경 재스캔 — 시간 + 산출물 byte-diff=0 확인
 *   3) 대상 java 파일에 프로브 클래스 append → 증분 스캔(시간)
 *   4) 같은 상태에서 --no-cache full 재스캔 → .spec/map 전 파일 byte-diff 비교
 *   5) 파일 원복 + 재스캔(산출물 원상복구)
 *
 * AC-1: (3) ≤ (4) 의 20% — 엔진 내부 scanDomainMap 시간 기준(node 기동 제외).
 * AC-2: (2)·(4) 모두 byte-diff=0.
 * 종료 코드: 둘 다 통과 0, 아니면 1(수치는 항상 출력 — 은폐 금지).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const distEntry = join(here, '..', 'packages', 'legacy-core', 'dist', 'index.js')
if (!existsSync(distEntry)) {
  console.error('엔진 미빌드: pnpm --filter @ktds/legacy-core build')
  process.exit(2)
}
const projectRoot = process.argv[2]
if (!projectRoot) {
  console.error('사용법: qa-incremental-bench.mjs <projectRoot> [수정할 .java relPath]')
  process.exit(2)
}

const engine = await import(distEntry)
const mapDir = join(projectRoot, '.spec', 'map')
const cacheDir = join(projectRoot, '.spec', 'cache')

/** .spec/map 파일 스냅샷(파일명 → 내용). */
function snapshotMap() {
  const out = {}
  for (const name of readdirSync(mapDir).sort()) {
    try {
      out[name] = readFileSync(join(mapDir, name), 'utf8')
    } catch {
      /* 하위 디렉터리 제외 */
    }
  }
  return out
}
function diffCount(a, b) {
  const names = new Set([...Object.keys(a), ...Object.keys(b)])
  let n = 0
  for (const name of names) if (a[name] !== b[name]) { n++; console.log(`    ✗ byte-diff: ${name}`) }
  return n
}
async function timedScan(opts = {}) {
  const t = performance.now()
  const r = await engine.scanDomainMap(projectRoot, opts)
  return { ms: performance.now() - t, r }
}

// 1) cold full.
rmSync(cacheDir, { recursive: true, force: true })
const cold = await timedScan()
const coldSnap = snapshotMap()
console.log(`1) cold full        : ${cold.ms.toFixed(0)}ms`)

// 2) warm 무변경.
const warm = await timedScan()
const warmSnap = snapshotMap()
const warmDiff = diffCount(coldSnap, warmSnap)
console.log(`2) warm 무변경      : ${warm.ms.toFixed(0)}ms (${((100 * warm.ms) / cold.ms).toFixed(1)}%) — byte-diff ${warmDiff}건, 재사용 ${warm.r.scanCache.statsSummary().reused}`)

// 3) 1파일 수정 → 증분.
let target = process.argv[3]
if (!target) {
  target = warm.r.census.files.find((f) => f.relPath.endsWith('Controller.java'))?.relPath
    ?? warm.r.census.files.find((f) => f.lang === 'java')?.relPath
}
if (!target) {
  console.error('java 파일이 없어 증분 측정 불가')
  process.exit(2)
}
const targetAbs = join(projectRoot, target)
const backupDir = mkdtempSync(join(tmpdir(), 'w8-bench-'))
cpSync(targetAbs, join(backupDir, 'backup.java'))
let incr, full, incrDiff
try {
  writeFileSync(
    targetAbs,
    readFileSync(targetAbs, 'utf8') +
      '\n// w8-bench probe\nclass W8BenchProbe { void probe(int x) { if (x > 0) { System.out.println(x); } } }\n',
    'utf8',
  )
  incr = await timedScan()
  const incrSnap = snapshotMap()
  console.log(`3) 증분(1파일 수정) : ${incr.ms.toFixed(0)}ms — 대상 ${target}`)

  // 4) 같은 상태에서 full(--no-cache) → byte-diff.
  full = await timedScan({ readCache: false })
  incrDiff = diffCount(snapshotMap(), incrSnap)
  console.log(`4) full(--no-cache) : ${full.ms.toFixed(0)}ms — 증분 대비 byte-diff ${incrDiff}건`)
} finally {
  // 5) 원복 + 산출물 원상복구.
  cpSync(join(backupDir, 'backup.java'), targetAbs)
  rmSync(backupDir, { recursive: true, force: true })
  await engine.scanDomainMap(projectRoot)
}
console.log('5) 대상 파일 원복 + 재스캔 완료')

const ratio = (100 * incr.ms) / full.ms
const ac1 = ratio <= 20
const ac2 = warmDiff === 0 && incrDiff === 0
console.log('')
console.log(`AC-1 (증분 ≤ full 20%) : ${ratio.toFixed(1)}% → ${ac1 ? 'PASS' : 'FAIL'}`)
console.log(`AC-2 (byte-diff=0)     : warm ${warmDiff}건 · 증분vs full ${incrDiff}건 → ${ac2 ? 'PASS' : 'FAIL'}`)
process.exit(ac1 && ac2 ? 0 : 1)
