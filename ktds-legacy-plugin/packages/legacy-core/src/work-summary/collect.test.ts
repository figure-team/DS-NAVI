/**
 * git 작업 이력 수집기 단위테스트(W6) — tmp 레포 시나리오(설계 §7).
 * churn.test.ts(W4) 관례: 수집기는 tmp 레포에서 독립 검증, 리포트 조립 테스트는
 * 고정 WorkLogResult 를 주입한다(본 레포 이력 오염 방지).
 * 커밋 시각은 GIT_AUTHOR_DATE/GIT_COMMITTER_DATE 로 고정(결정론 검증 가능).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectWorkLog } from './collect.js'

let repo: string

function git(args: string[], dateIso?: string): string {
  return execFileSync(
    'git',
    ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=tester', '-c', 'commit.gpgsign=false', ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: dateIso
        ? { ...process.env, GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso }
        : process.env,
    },
  )
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'worklog-test-'))
  git(['init', '-q', '-b', 'main'])
  // c1(2026-01-01): a.txt 2줄.
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'c1'], '2026-01-01T00:00:00Z')
  // c2(2026-01-05): a.txt +1줄, sub/b.txt 신설.
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n')
  mkdirSync(join(repo, 'sub'))
  writeFileSync(join(repo, 'sub', 'b.txt'), 'bee\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'c2'], '2026-01-05T00:00:00Z')
  // 브랜치 커밋(2026-01-06) 후 머지(2026-01-08) — isMerge 검증.
  git(['checkout', '-q', '-b', 'topic'])
  writeFileSync(join(repo, 'sub', 'c.txt'), 'sea\n')
  git(['add', '.'])
  git(['commit', '-q', '-m', 'topic'], '2026-01-06T00:00:00Z')
  git(['checkout', '-q', 'main'])
  git(['merge', '-q', '--no-ff', '-m', 'merge topic', 'topic'], '2026-01-08T00:00:00Z')
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('collectWorkLog', () => {
  it('커밋 헤더+numstat 동시 수집 — committer date 축, 머지 플래그, 파일 정렬', () => {
    const r = collectWorkLog(repo)
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.prefix).toBe('')
    expect(r.headDateIso.startsWith('2026-01-08')).toBe(true)
    // 레포 루트 = pathspec 없음: 머지 포함 4건.
    expect(r.commits).toHaveLength(4)
    const bySubject = new Map(r.commits.map((c) => [c.subject, c]))
    const merge = bySubject.get('merge topic')!
    expect(merge.isMerge).toBe(true)
    expect(merge.files).toEqual([]) // 머지는 numstat 무발행 — 파일 통계 자연 제외.
    expect(merge.sha).toBe(r.headSha)
    const c2 = bySubject.get('c2')!
    expect(c2.isMerge).toBe(false)
    expect(c2.author).toBe('tester')
    expect(c2.dateIso.startsWith('2026-01-05')).toBe(true)
    // 파일 path ASC.
    expect(c2.files.map((f) => f.path)).toEqual(['a.txt', 'sub/b.txt'])
    expect(c2.files[0]).toEqual({ path: 'a.txt', added: 1, deleted: 0 })
  })

  it('revRange(A..B) — rev-list 집합만 수집', () => {
    const all = collectWorkLog(repo)
    if (all.kind !== 'ok') throw new Error('unreachable')
    const c1 = all.commits.find((c) => c.subject === 'c1')!
    const r = collectWorkLog(repo, `${c1.sha}..HEAD`)
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.commits.map((c) => c.subject).sort()).toEqual(['c2', 'merge topic', 'topic'])
  })

  it('하위 디렉터리 루트: --show-prefix 로 relPath 좌표계 정렬 + pathspec 축소', () => {
    const r = collectWorkLog(join(repo, 'sub'))
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.prefix).toBe('sub/')
    // sub/ 를 건드린 커밋만(c2, topic) — 경로 단순화로 머지 생략(문서화된 한계).
    const subjects = r.commits.map((c) => c.subject).sort()
    expect(subjects).toEqual(['c2', 'topic'])
    const c2 = r.commits.find((c) => c.subject === 'c2')!
    expect(c2.files).toEqual([{ path: 'b.txt', added: 1, deleted: 0 }])
  })

  it('잘못된 revRange 는 no-git 수렴(스크립트가 rev-parse 사전 검증으로 구분)', () => {
    expect(collectWorkLog(repo, 'no-such-ref..HEAD').kind).toBe('no-git')
  })

  it('git 레포가 아니면 no-git', () => {
    const plain = mkdtempSync(join(tmpdir(), 'worklog-plain-'))
    try {
      expect(collectWorkLog(plain).kind).toBe('no-git')
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it('shallow clone 은 shallow — 잘린 이력은 결정론 보장을 깬다(W4 R1 관례)', () => {
    const dst = join(tmpdir(), `worklog-shallow-${process.pid}`)
    rmSync(dst, { recursive: true, force: true })
    try {
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo}`, dst], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      expect(collectWorkLog(dst).kind).toBe('shallow')
    } finally {
      rmSync(dst, { recursive: true, force: true })
    }
  })
})
