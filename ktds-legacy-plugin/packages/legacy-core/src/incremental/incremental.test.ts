import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CensusReport } from '../domain-map/types.js'
import type { GeneratedDoc } from '../doc-generator/types.js'
import {
  computeFileFingerprints,
  diffFingerprints,
  isUnchanged,
  anchorFingerprints,
} from './index.js'
import { detectStaleClaims } from '../stale/index.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ktds-incremental-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'A.java'), 'class A {}\n', 'utf8')
  writeFileSync(join(dir, 'src', 'B.java'), 'class B {}\n', 'utf8')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const census: CensusReport = {
  schemaVersion: 1,
  gitCommit: null,
  fileCount: 2,
  files: [
    { relPath: 'src/A.java', lang: 'java' },
    { relPath: 'src/B.java', lang: 'java' },
  ],
}

describe('computeFileFingerprints / diffFingerprints (AC-29)', () => {
  it('내용 변경 → changed, 동일 → unchanged', () => {
    const prev = computeFileFingerprints(dir, census)
    // 변경 없음 → 동일
    expect(isUnchanged(diffFingerprints(prev, computeFileFingerprints(dir, census)))).toBe(true)
    // A 변경
    writeFileSync(join(dir, 'src', 'A.java'), 'class A { int x; }\n', 'utf8')
    const curr = computeFileFingerprints(dir, census)
    const diff = diffFingerprints(prev, curr)
    expect(diff.changed).toEqual(['src/A.java'])
    expect(isUnchanged(diff)).toBe(false)
  })

  it('추가/삭제 파일 감지', () => {
    const prev = computeFileFingerprints(dir, census)
    const census2: CensusReport = {
      ...census,
      fileCount: 2,
      files: [
        { relPath: 'src/A.java', lang: 'java' },
        { relPath: 'src/C.java', lang: 'java' },
      ],
    }
    writeFileSync(join(dir, 'src', 'C.java'), 'class C {}\n', 'utf8')
    const curr = computeFileFingerprints(dir, census2)
    const diff = diffFingerprints(prev, curr)
    expect(diff.added).toEqual(['src/C.java'])
    expect(diff.removed).toEqual(['src/B.java'])
  })

  it('결정론: 동일 내용 → 동일 fingerprint', () => {
    expect(computeFileFingerprints(dir, census)).toEqual(computeFileFingerprints(dir, census))
  })

  it('읽기 실패 → absent, 변경으로 감지(크래시 없음, 리뷰 LOW)', () => {
    const prev = computeFileFingerprints(dir, census)
    rmSync(join(dir, 'src', 'B.java'))
    const curr = computeFileFingerprints(dir, census) // B 는 census 에 남아 있으나 파일 없음
    expect(curr['src/B.java']).toBe('absent')
    expect(diffFingerprints(prev, curr).changed).toContain('src/B.java')
  })
})

describe('anchorFingerprints 브리지 → STALE (AC-29→AC-26)', () => {
  const doc: GeneratedDoc = {
    docId: 'd',
    title: 't',
    methodology: 'as-built',
    sections: [
      {
        heading: 'S',
        claims: [
          { text: 'claim on A', confidence: 'CONFIRMED', evidence: [{ file: 'src/A.java', line: 1 }], requiresHumanReview: false },
          { text: 'claim on B', confidence: 'CONFIRMED', evidence: [{ file: 'src/B.java', line: 1 }], requiresHumanReview: false },
        ],
      },
    ],
  }

  it('변경 파일에 근거를 둔 claim 만 STALE', () => {
    const prevFp = computeFileFingerprints(dir, census)
    writeFileSync(join(dir, 'src', 'A.java'), 'class A { int y; }\n', 'utf8')
    const currFp = computeFileFingerprints(dir, census)
    const prev = anchorFingerprints(doc, prevFp)
    const curr = anchorFingerprints(doc, currFp)
    const report = detectStaleClaims(doc, prev, curr)
    expect(report.staleCount).toBe(1)
    expect(report.freshCount).toBe(1)
    expect(report.staleSections[0].staleClaims[0].claim).toBe('claim on A')
  })
})
