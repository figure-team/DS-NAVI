/**
 * 파일 인구조사(census) — 프로젝트 파일 목록 + 언어 분류.
 *
 * git 추적/미추적(무시 제외) 파일을 열거하고, 실패 시 재귀 walk 로 폴백한다.
 * 확장자 기반 언어 분류는 SOURCE_LANG_BY_EXT 단일 소스로 핀.
 * relPath(forward slash) 기준 정렬로 결정론을 보장한다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ignore from 'ignore'
import { gitCommitHash } from './persist.js'
import type { CensusReport } from './types.js'

/** 확장자(소문자, 점 제외) -> 언어. */
export const SOURCE_LANG_BY_EXT: Record<string, string> = {
  java: 'java',
  xml: 'xml',
  jsp: 'jsp',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'javascript',
  yaml: 'yaml',
  yml: 'yaml',
  properties: 'properties',
  sql: 'sql',
  kt: 'kotlin',
  py: 'python',
}

/** walk 폴백에서 건너뛸 디렉터리(정확 일치). */
const WALK_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  // 빌드 툴링(소스 아님) — Maven wrapper(.mvn/MavenWrapperDownloader.java 의 main()이
  // 가짜 배치 진입점/도메인으로 잡히는 것 방지), Maven/Gradle 산출물.
  '.mvn',
  'target',
])

/**
 * 도구 자체 산출물 디렉터리의 베이스명 — 이름 그대로도, **변형(백업/사본)도** 건너뛴다.
 *
 * census 는 `git ls-files --cached --others --exclude-standard` 로 열거하므로 추적도
 * 무시도 되지 않은 파일이 전부 소스로 들어온다. `mv .spec .spec.bak-$(date +%s)` 같은
 * 흔한 재실행 전 백업이 정확일치 필터를 그대로 통과해 다음 스캔을 오염시켰다
 * (jpetstore 실측: census 298개 중 150개가 백업 산출물, 유일한 증상은 plan 표의 유령 도메인).
 */
const WALK_SKIP_DIR_BASES = ['.spec', '.understand-anything']

/** 산출물 변형 접미사 구분자 — `.spec.bak-1784231904`, `.spec-old`, `.spec_2`, `.spec copy`. */
const SKIP_BASE_SUFFIX_SEP = /^[.\-_ ]/

/**
 * 경로 세그먼트가 skip 대상이면 true. 베이스명은 정확일치 또는 구분자로 시작하는
 * 접미사가 붙은 변형까지 포함한다(`.specs`·`.specification` 같은 남의 디렉터리는 제외).
 */
export function isSkippedSegment(seg: string): boolean {
  if (WALK_SKIP_DIRS.has(seg)) return true
  return WALK_SKIP_DIR_BASES.some(
    (base) =>
      seg === base || (seg.startsWith(base) && SKIP_BASE_SUFFIX_SEP.test(seg.slice(base.length))),
  )
}

/** relPath 의 경로 세그먼트 중 하나라도 skip 디렉터리면 true(인구조사 제외). */
function isInSkippedDir(relPath: string): boolean {
  return relPath.split('/').some(isSkippedSegment)
}

/** 경로 구분자를 forward slash 로 정규화. */
function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/')
}

/** 확장자로 언어를 분류한다. 미지의 확장자는 확장자 자체(없으면 "other"). */
function classifyLang(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'other'
  const ext = base.slice(dot + 1).toLowerCase()
  if (ext.length === 0) return 'other'
  return SOURCE_LANG_BY_EXT[ext] ?? ext
}

/** git ls-files 로 파일을 열거(추적+미추적, 무시 제외). 실패 시 null. */
function listGitFiles(projectRoot: string): string[] | null {
  try {
    const out = execFileSync(
      'git',
      ['-C', projectRoot, 'ls-files', '--cached', '--others', '--exclude-standard'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
    )
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map(toPosix)
  } catch {
    return null
  }
}

/** 재귀 walk 폴백 — 표준 디렉터리 제외. */
function walkFiles(projectRoot: string): string[] {
  const out: string[] = []
  const stack: string[] = [projectRoot]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as Dirent[]
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (isSkippedSegment(entry.name)) continue
        stack.push(full)
      } else if (entry.isFile()) {
        out.push(toPosix(relative(projectRoot, full)))
      }
    }
  }
  return out
}

/** .gitignore 가 있으면 best-effort 로 ignore 필터를 적용한다. */
function applyGitignore(projectRoot: string, files: string[]): string[] {
  const gitignorePath = join(projectRoot, '.gitignore')
  if (!existsSync(gitignorePath)) return files
  try {
    const ig = ignore().add(readFileSync(gitignorePath, 'utf8'))
    return files.filter((f) => !ig.ignores(f))
  } catch {
    return files
  }
}

/** 프로젝트 파일 인구조사를 만든다. */
export function buildCensus(projectRoot: string): CensusReport {
  const gitFiles = listGitFiles(projectRoot)
  let files: string[]
  if (gitFiles !== null) {
    files = gitFiles
  } else {
    files = applyGitignore(projectRoot, walkFiles(projectRoot))
  }
  // 빌드 툴링 디렉터리는 git ls-files(추적됨)로도 들어오므로 소스와 무관하게 제외한다.
  files = files.filter((relPath) => !isInSkippedDir(relPath))

  // statSync 로 실재 파일만(심볼릭/누락 방어), relPath 정렬.
  const seen = new Set<string>()
  const records = files
    .filter((relPath) => {
      if (seen.has(relPath)) return false
      seen.add(relPath)
      try {
        return statSync(join(projectRoot, relPath)).isFile()
      } catch {
        return false
      }
    })
    .map((relPath) => ({ relPath, lang: classifyLang(relPath) }))
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))

  return {
    schemaVersion: 1,
    gitCommit: gitCommitHash(projectRoot),
    fileCount: records.length,
    files: records,
  }
}
