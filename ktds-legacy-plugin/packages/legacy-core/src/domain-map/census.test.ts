import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCensus, isSkippedSegment } from './census.js'

function writeFile(root: string, rel: string, content: string): void {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'ignore', 'ignore'] })
}

const relPaths = (root: string) => buildCensus(root).files.map((f) => f.relPath)

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'census-skip-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('isSkippedSegment — 산출물 디렉터리와 그 변형', () => {
  it('산출물 디렉터리 자신을 건너뛴다', () => {
    expect(isSkippedSegment('.spec')).toBe(true)
    expect(isSkippedSegment('.understand-anything')).toBe(true)
  })

  it('백업/사본 변형을 건너뛴다 — 정확일치 필터가 놓쳤던 형태', () => {
    for (const seg of [
      '.spec.bak-1784231904',
      '.spec.old',
      '.spec-old',
      '.spec_2',
      '.spec copy',
      '.understand-anything.bak-1784231904',
      '.understand-anything-backup',
    ]) {
      expect(isSkippedSegment(seg), seg).toBe(true)
    }
  })

  // 계약: 도구가 `.spec`/`.understand-anything` 네임스페이스를 소유한다 — 베이스명에
  // 구분자(. - _ 공백)를 붙인 이름은 전부 도구 산출물의 변형으로 본다. 구분자 없이
  // 이어지는 이름(.specs)은 남의 디렉터리이므로 보존한다.
  it('구분자 없이 이어지는 남의 디렉터리는 건너뛰지 않는다(과잉 매칭 방지)', () => {
    for (const seg of ['.specs', '.specification', '.spectrum', '.understand-anythings']) {
      expect(isSkippedSegment(seg), seg).toBe(false)
    }
  })

  it('기존 정확일치 skip 대상은 그대로 유지된다', () => {
    for (const seg of ['node_modules', '.git', 'dist', '.mvn', 'target', 'ds-hub']) {
      expect(isSkippedSegment(seg), seg).toBe(true)
    }
  })

  // DS-APM 드롭 폴더(INCIDENT_DROP_CONTRACT.md) — 리포트 .md 가 소스로 오염되지 않게.
  it('ds-hub 는 정확일치만 스킵한다(ds-hubs 같은 남의 디렉터리는 보존)', () => {
    expect(isSkippedSegment('ds-hub')).toBe(true)
    expect(isSkippedSegment('ds-hubs')).toBe(false)
  })
})

describe('buildCensus — 백업 디렉터리 오염 회귀(git 열거 경로)', () => {
  it('추적도 무시도 안 된 .spec.bak-* 를 소스로 세지 않는다', () => {
    // 실제 결함 재현: git ls-files --others 가 백업을 소스로 넘겼다.
    writeFile(root, 'src/Real.java', 'public class Real {}\n')
    writeFile(root, '.spec.bak-1784231904/map/census.json', '{"files":[]}\n')
    writeFile(root, '.spec.bak-1784231904/map/bundle/order.json', '{"flows":[]}\n')
    writeFile(root, '.understand-anything.bak-1784231904/domain-graph.json', '{"nodes":[]}\n')
    git(root, 'init')

    const files = relPaths(root)
    expect(files).toEqual(['src/Real.java'])
  })

  it('현행 산출물 디렉터리(.spec/.understand-anything)도 계속 제외된다', () => {
    writeFile(root, 'src/Real.java', 'public class Real {}\n')
    writeFile(root, '.spec/map/census.json', '{"files":[]}\n')
    writeFile(root, '.understand-anything/domain-graph.json', '{"nodes":[]}\n')
    git(root, 'init')

    expect(relPaths(root)).toEqual(['src/Real.java'])
  })

  it('walk 폴백(비 git 디렉터리)에서도 백업을 제외한다', () => {
    writeFile(root, 'src/Real.java', 'public class Real {}\n')
    writeFile(root, '.spec.bak-1784231904/map/census.json', '{"files":[]}\n')
    // git init 없음 → listGitFiles 가 null → walkFiles 폴백

    expect(relPaths(root)).toEqual(['src/Real.java'])
  })

  it('이름이 비슷할 뿐인 소스 디렉터리는 보존한다', () => {
    writeFile(root, '.specs/Fixture.java', 'public class Fixture {}\n')
    writeFile(root, 'src/Real.java', 'public class Real {}\n')
    git(root, 'init')

    expect(relPaths(root)).toEqual(['.specs/Fixture.java', 'src/Real.java'])
  })
})
