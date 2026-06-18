/**
 * doc-state 영속 IO (P4.2) — `.spec/docs/<docId>.state.json`.
 *
 * 결정론: stableJson(키 재귀 정렬 + 2칸 들여쓰기 + 후행 개행)으로 byte-identical
 * 재기록. read 는 zod(DocStateSchema)로 검증해 손편집/버전 스큐를 조용히 통과시키지
 * 않는다. 파일 부재(ENOENT)는 null(미생성), 권한/IO/손상 오류는 throw(fail-closed).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stableJson } from '../domain-map/persist.js'
import { DocStateSchema } from './index.js'
import type { DocState } from './index.js'

/** `.spec/docs/` 디렉터리 경로 — doc-state 산출물이 사는 곳. */
export function specDocsDir(projectRoot: string): string {
  return join(projectRoot, '.spec', 'docs')
}

/** `.spec/docs/<docId>.state.json` 파일 경로. */
export function docStatePath(projectRoot: string, docId: string): string {
  return join(specDocsDir(projectRoot), `${docId}.state.json`)
}

/**
 * DocState 를 `.spec/docs/<docId>.state.json` 에 안정 JSON 으로 기록
 * (`.spec/docs/` mkdir -p 선행). 기록한 파일의 절대 경로를 반환한다.
 */
export function writeDocState(projectRoot: string, docId: string, state: DocState): string {
  const dir = specDocsDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  const file = docStatePath(projectRoot, docId)
  writeFileSync(file, stableJson(state), 'utf8')
  return file
}

/**
 * `.spec/docs/<docId>.state.json` 을 읽어 DocState 로 반환. 파일이 없으면 null.
 * 권한/IO 오류는 던진다(fail-closed). zod parse 로 스키마를 검증한다.
 */
export function readDocState(projectRoot: string, docId: string): DocState | null {
  const file = docStatePath(projectRoot, docId)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return DocStateSchema.parse(JSON.parse(raw))
}
