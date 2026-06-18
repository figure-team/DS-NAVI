/**
 * `.spec/map/` 산출물 IO 헬퍼.
 *
 * 결정론(byte-identical) 보장: stableJson 으로 객체 키를 재귀 정렬하고
 * 2칸 들여쓰기 + 후행 개행으로 직렬화한다(배열 순서는 생산자가 이미 정렬).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CensusReport, EdgesReport, RoutesReport, SlicesReport } from './types.js'

/** `.spec/map/` 디렉터리 경로. */
export function specMapDir(projectRoot: string): string {
  return join(projectRoot, '.spec', 'map')
}

/** 현재 git 커밋 해시(HEAD). git 저장소가 아니거나 실패하면 null. */
export function gitCommitHash(projectRoot: string): string | null {
  try {
    const out = execFileSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const hash = out.trim()
    return hash.length > 0 ? hash : null
  } catch {
    return null
  }
}

/** 객체 키를 재귀 정렬한 사본을 만든다(배열 순서는 유지). */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => sortKeysDeep(v))
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key])
    }
    return out
  }
  return value
}

/**
 * 안정 JSON 직렬화 — 키 재귀 정렬, 2칸 들여쓰기, 후행 개행.
 * 동일 입력 -> byte-identical 출력.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + '\n'
}

/** `.spec/map/<fileName>` 에 안정 JSON 을 기록(`.spec/map/` mkdir -p 선행). */
function writeReport(projectRoot: string, fileName: string, report: unknown): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, fileName), stableJson(report), 'utf8')
}

/** census.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeCensus(projectRoot: string, report: CensusReport): void {
  writeReport(projectRoot, 'census.json', report)
}

/** routes.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeRoutes(projectRoot: string, report: RoutesReport): void {
  writeReport(projectRoot, 'routes.json', report)
}

/** edges.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeEdges(projectRoot: string, report: EdgesReport): void {
  writeReport(projectRoot, 'edges.json', report)
}

/** slices.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeSlices(projectRoot: string, report: SlicesReport): void {
  writeReport(projectRoot, 'slices.json', report)
}
