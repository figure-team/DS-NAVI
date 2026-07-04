/**
 * git 변경빈도(churn) 수집(W4) — `git log --numstat` 1회 실행, 파일별 커밋수/변경라인.
 *
 * 결정론: HEAD 가 같으면 이력이 같다 — 리포트가 census.gitCommit 앵커를 기록해
 * 동일 commit 재실행 byte-diff=0 을 보장한다. `--no-renames` 로 rename 유사도
 * 휴리스틱의 비결정 변동을 배제한다(한계: rename 전 이력 미승계, 설계 §3.2).
 *
 * projectRoot 가 레포 하위 디렉터리인 경우(모노레포 vendored — examples/jpetstore-6
 * 실측 케이스) numstat 경로는 **레포 루트 기준**이므로 `rev-parse --show-prefix` 로
 * 접두어를 벗겨 census relPath 좌표계로 맞춘다.
 *
 * git 없음/이력 없음/실패 → null — 호출자가 meta.churnAvailable=false + [미확인]으로
 * 표면화한다(침묵 누락 금지). buildRiskReport 와 분리된 주입식 수집기라 픽스처
 * 테스트는 고정 ChurnMap 을 주입한다(픽스처는 레포 이력에 오염되면 비결정).
 */
import { execFileSync } from 'node:child_process'

export interface ChurnEntry {
  /** 이 파일을 변경한 커밋 수(전체 이력, merge 커밋 제외 — numstat 무발행). */
  commits: number
  /** 추가+삭제 라인 누계(바이너리 diff '-' 는 0 계상). */
  linesChanged: number
}

/** relPath(projectRoot 기준) → churn. */
export type ChurnMap = Map<string, ChurnEntry>

function git(projectRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', projectRoot, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 256 * 1024 * 1024,
  })
}

/** 전체 이력 numstat 을 파일별로 집계. git 불가 시 null. */
export function collectGitChurn(projectRoot: string): ChurnMap | null {
  let prefix: string
  let raw: string
  try {
    prefix = git(projectRoot, ['rev-parse', '--show-prefix']).trim()
    raw = git(projectRoot, ['log', '--numstat', '--no-renames', '--format=', '--', '.'])
  } catch {
    return null
  }
  const out: ChurnMap = new Map()
  for (const line of raw.split('\n')) {
    // numstat 행: `<added>\t<deleted>\t<path>` (바이너리는 `-\t-\t<path>`).
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (!m) continue
    const repoPath = m[3]
    if (prefix && !repoPath.startsWith(prefix)) continue
    const relPath = prefix ? repoPath.slice(prefix.length) : repoPath
    const added = m[1] === '-' ? 0 : Number(m[1])
    const deleted = m[2] === '-' ? 0 : Number(m[2])
    const cur = out.get(relPath) ?? { commits: 0, linesChanged: 0 }
    // 한 커밋에서 같은 경로는 numstat 1행 — 행 수 = 커밋 수.
    cur.commits += 1
    cur.linesChanged += added + deleted
    out.set(relPath, cur)
  }
  return out
}
