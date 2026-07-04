/**
 * git churn 수집기 단위테스트(W4) — tmp 레포 시나리오(설계 §7).
 * 픽스처 스캔 테스트가 churn 을 주입식으로 고정하는 이유: 픽스처는 본 레포 이력에
 * 오염되면 비결정 — 수집기 자체는 여기서 독립 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectGitChurn } from './churn.js'

let repo: string

function git(args: string[]): void {
  execFileSync(
    'git',
    ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  )
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'churn-test-'))
  git(['init', '-q'])
  // 커밋 1: a.txt 2줄.
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'c1'])
  // 커밋 2: a.txt +1줄, sub/b.txt 신설 1줄.
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n')
  mkdirSync(join(repo, 'sub'))
  writeFileSync(join(repo, 'sub', 'b.txt'), 'bee\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'c2'])
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('collectGitChurn', () => {
  it('파일별 커밋수/변경라인 집계(전체 이력)', () => {
    const churn = collectGitChurn(repo)
    expect(churn).not.toBeNull()
    expect(churn!.get('a.txt')).toEqual({ commits: 2, linesChanged: 3 })
    expect(churn!.get('sub/b.txt')).toEqual({ commits: 1, linesChanged: 1 })
  })

  it('하위 디렉터리 루트: --show-prefix 로 relPath 좌표계 정렬', () => {
    const churn = collectGitChurn(join(repo, 'sub'))
    expect(churn).not.toBeNull()
    expect(churn!.get('b.txt')).toEqual({ commits: 1, linesChanged: 1 })
    expect(churn!.has('a.txt')).toBe(false)
  })

  it('git 레포가 아니면 null(호출자가 [미확인] 표면화)', () => {
    const plain = mkdtempSync(join(tmpdir(), 'churn-plain-'))
    try {
      expect(collectGitChurn(plain)).toBeNull()
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })
})
