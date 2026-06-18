/**
 * 증분 재스캔(보완 D-b, AC-29) — 변경 파일만 재도출 + confirmed plan 보존 + STALE 표시.
 *
 * 핵심: 파일 내용 fingerprint(content hash)를 census 전체에 대해 계산하고, 직전 스냅샷과
 * 비교해 변경/추가/삭제 파일을 가린다. 변경 파일에 근거를 둔 문서 claim 은 기존 STALE
 * 머신(stale/index.ts detectStaleClaims/incrementalReapproval)으로 증분 재승인된다 —
 * 이 모듈은 파일 fingerprint 를 claim 앵커 fingerprint 로 잇는 브리지를 제공한다.
 *
 * confirmed domain-plan 보존: 스캔은 domain-plan.confirmed.json 을 건드리지 않으므로
 * (confirm 은 별도 사람 게이트), 증분 재스캔 후에도 확정 경계가 유지된다.
 *
 * 결정론: 정렬된 출력, 타임스탬프 없음. content hash 는 파일 내용의 순수 함수.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CensusReport } from '../domain-map/types.js'
import { claimUnits } from '../doc-generator/claims.js'
import { evidenceAnchor } from '../stale/index.js'
import type { FingerprintMap } from '../stale/index.js'
import type { GeneratedDoc } from '../doc-generator/types.js'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 파일 내용 → 짧은 content hash(sha256 앞 16자). 읽기 실패 → 'absent'. */
function fileHash(abs: string): string {
  try {
    return createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16)
  } catch {
    return 'absent'
  }
}

/** census 전체에 대한 파일 fingerprint 맵(relPath → content hash). 결정론. */
export function computeFileFingerprints(projectRoot: string, census: CensusReport): FingerprintMap {
  const out: FingerprintMap = {}
  for (const f of [...census.files].sort((a, b) => cmp(a.relPath, b.relPath))) {
    out[f.relPath] = fileHash(join(projectRoot, f.relPath))
  }
  return out
}

/** 직전/현재 fingerprint 비교 결과 — 변경/추가/삭제 파일(정렬). */
export interface FileChangeSet {
  changed: string[]
  added: string[]
  removed: string[]
}

/** prev → curr fingerprint 차이를 가린다(변경/추가/삭제). 결정론(정렬). */
export function diffFingerprints(prev: FingerprintMap, curr: FingerprintMap): FileChangeSet {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const rel of Object.keys(curr)) {
    if (!(rel in prev)) added.push(rel)
    else if (prev[rel] !== curr[rel]) changed.push(rel)
  }
  for (const rel of Object.keys(prev)) {
    if (!(rel in curr)) removed.push(rel)
  }
  return { changed: changed.sort(cmp), added: added.sort(cmp), removed: removed.sort(cmp) }
}

/** 변경/추가/삭제가 하나도 없으면 true(재도출 불필요). */
export function isUnchanged(diff: FileChangeSet): boolean {
  return diff.changed.length === 0 && diff.added.length === 0 && diff.removed.length === 0
}

/**
 * 파일 fingerprint 를 문서 claim 앵커 fingerprint 로 투영한다(브리지).
 * detectStaleClaims 는 앵커 단위(file 또는 file:line) prev/curr 를 비교하므로, 각 앵커를
 * 그 파일의 content hash 로 매핑하면 "근거 파일이 바뀐 claim" 이 STALE 로 잡힌다(AC-26 연결).
 * 앵커의 파일 부분이 fileFingerprints 에 없으면 생략(미추적 근거는 STALE 비교 대상 아님).
 */
export function anchorFingerprints(doc: GeneratedDoc, fileFingerprints: FingerprintMap): FingerprintMap {
  const out: FingerprintMap = {}
  for (const unit of claimUnits(doc)) {
    for (const ev of unit.evidence) {
      const anchor = evidenceAnchor(ev)
      const fp = fileFingerprints[ev.file]
      if (fp !== undefined) out[anchor] = fp
    }
  }
  return out
}
