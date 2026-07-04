/**
 * 설정 프로퍼티 인덱스(T2) — application*.properties / *.yml 의 key→value 를
 * file:line 근거와 함께 수집해 `${key}` 플레이스홀더를 해석한다.
 *
 * 결정론: census relPath ASC 순회, 동일 키 첫 출현 승리(파일 순서 고정이므로 안정).
 * yaml 은 외부 파서 없이 들여쓰기 기반 단순 flatten(리스트/멀티라인/anchor 미지원 —
 * 실패는 "키 없음"으로 귀결되어 unresolved 로 정직하게 표면화된다).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CensusReport } from '../domain-map/types.js'

export interface PropertyEntry {
  value: string
  file: string
  line: number
}

export type PropertyIndex = Map<string, PropertyEntry>

/** properties 형식 1파일 파싱 — `key=value` / `key: value` / `key value` 는 = : 만 지원. */
function parseProperties(text: string, relPath: string, out: PropertyIndex): void {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*[#!]/.test(line)) continue
    const m = line.match(/^\s*([\w.\-\[\]]+)\s*[=:]\s*(.*?)\s*$/)
    if (!m) continue
    const key = m[1]
    if (!out.has(key)) out.set(key, { value: m[2], file: relPath, line: i + 1 })
  }
}

/** yaml 1파일 단순 flatten — 스칼라 매핑만. `a:\n  b: v` → `a.b=v`. */
function parseYamlFlat(text: string, relPath: string, out: PropertyIndex): void {
  const lines = text.split('\n')
  // (indent, key) 스택으로 경로 유지.
  const stack: Array<{ indent: number; key: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (/^\s*(#|$)/.test(raw)) continue
    if (/^---\s*$/.test(raw)) {
      stack.length = 0
      continue
    }
    const m = raw.match(/^(\s*)([\w.\-]+)\s*:\s*(.*?)\s*$/)
    if (!m) continue // 리스트 항목/멀티라인 등 미지원 — 건너뜀(키 없음 → unresolved).
    const indent = m[1].length
    const key = m[2]
    const value = m[3]
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    const path = [...stack.map((s) => s.key), key].join('.')
    if (value === '') {
      stack.push({ indent, key })
      continue
    }
    const unquoted = value.replace(/^["']|["']$/g, '')
    if (!out.has(path)) out.set(path, { value: unquoted, file: relPath, line: i + 1 })
  }
}

/** census 에서 설정 파일(lang=properties|yaml)을 골라 프로퍼티 인덱스를 만든다. */
export function buildPropertyIndex(projectRoot: string, census: CensusReport): PropertyIndex {
  const out: PropertyIndex = new Map()
  const files = census.files
    .filter((f) => f.lang === 'properties' || f.lang === 'yaml')
    .map((f) => ({ ...f }))
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
  for (const f of files) {
    let text: string
    try {
      text = readFileSync(join(projectRoot, f.relPath), 'utf8')
    } catch {
      continue
    }
    if (f.lang === 'properties') parseProperties(text, f.relPath, out)
    else parseYamlFlat(text, f.relPath, out)
  }
  return out
}

/** `${key}` / `${key:default}` 플레이스홀더 매칭. */
const PLACEHOLDER_RE = /\$\{([^}:]+)(?::([^}]*))?\}/g

/**
 * raw 문자열의 `${...}` 를 프로퍼티 인덱스로 해석한다.
 * - 플레이스홀더 없음 → { resolved: raw, resolvedFrom: null }
 * - 전부 해석(또는 default 존재) → 치환 결과 + 첫 해석 근거 "file:line"
 * - 하나라도 실패 → { resolved: null, resolvedFrom: null } (호출측 unresolved 처리)
 */
export function resolvePlaceholders(
  raw: string,
  props: PropertyIndex,
): { resolved: string | null; resolvedFrom: string | null } {
  if (!raw.includes('${')) return { resolved: raw, resolvedFrom: null }
  let resolvedFrom: string | null = null
  let failed = false
  const resolved = raw.replace(PLACEHOLDER_RE, (_all, key: string, def: string | undefined) => {
    const entry = props.get(key.trim())
    if (entry) {
      if (resolvedFrom === null) resolvedFrom = `${entry.file}:${entry.line}`
      return entry.value
    }
    if (def !== undefined) return def
    failed = true
    return ''
  })
  if (failed) return { resolved: null, resolvedFrom: null }
  return { resolved, resolvedFrom }
}
