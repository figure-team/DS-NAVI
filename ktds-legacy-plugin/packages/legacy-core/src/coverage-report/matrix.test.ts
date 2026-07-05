import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCensus } from '../domain-map/census.js'
import { scanDomainMap } from '../domain-map/extract.js'
import { renderCoverageReport } from './index.js'
import {
  bestTierOf,
  computeLangSupport,
  coreTierOf,
  renderCoverageMatrixMd,
  tierOf,
} from './matrix.js'

function writeFile(root: string, rel: string, content: string): void {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, content, 'utf8')
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'w9-matrix-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('coverage-matrix — 지원 수준 선언·미지원 표면화 (W9)', () => {
  it('tierOf: 명시 없는 (언어,기능) 은 none, 선언은 그대로', () => {
    expect(tierOf('routes', 'java')).toBe('full')
    expect(tierOf('routes', 'kotlin')).toBe('none')
    expect(tierOf('edges', 'xml')).toBe('partial')
    expect(tierOf('complexity', 'jsp')).toBe('none')
  })

  it('best vs core: sql 은 db-schema 가 덮어 best=full 이지만 구조분석 core=none', () => {
    expect(bestTierOf('sql')).toBe('full')
    expect(coreTierOf('sql')).toBe('none')
    expect(bestTierOf('kotlin')).toBe('none')
    expect(bestTierOf('java')).toBe('full')
  })

  it('computeLangSupport: kotlin/Pro*C 만 미지원으로 세고 sql/cmd 는 세지 않는다', () => {
    writeFile(root, 'src/A.java', 'public class A {}\n')
    writeFile(root, 'src/B.kt', 'class B\n')
    writeFile(root, 'src/C.kt', 'class C\n')
    writeFile(root, 'src/legacy/D.pc', 'EXEC SQL SELECT 1;\n')
    writeFile(root, 'db/schema.sql', 'CREATE TABLE t (id INT);\n')
    writeFile(root, 'bin/run.cmd', 'java -jar app.jar\n')
    writeFile(root, 'README.md', '# 문서 — 분석 유관 아님\n')

    const ls = computeLangSupport(buildCensus(root))
    expect(ls.unsupportedFiles).toBe(3) // kotlin 2 + pc 1 (sql/cmd/md 제외)
    const byLang = Object.fromEntries(ls.byLang.map((r) => [r.lang, r]))
    expect(byLang['kotlin']).toMatchObject({ files: 2, best: 'none', core: 'none' })
    expect(byLang['pc']).toMatchObject({ files: 1, best: 'none' })
    expect(byLang['sql']).toMatchObject({ best: 'full', core: 'none' })
    expect(byLang['cmd']).toMatchObject({ best: 'partial' })
    expect(byLang['md']).toBeUndefined() // 분석 유관 언어 아님 — 계상 밖(문서류)
  })

  it('java 뿐인 프로젝트는 미지원 0건', () => {
    writeFile(root, 'src/A.java', 'public class A {}\n')
    expect(computeLangSupport(buildCensus(root)).unsupportedFiles).toBe(0)
  })

  it('매트릭스 문서 렌더는 결정론(2회 동일) + degrade 정의 포함', () => {
    const a = renderCoverageMatrixMd()
    expect(renderCoverageMatrixMd()).toBe(a)
    expect(a).toContain('손편집 금지')
    expect(a).toContain('degrade 정의')
    expect(a).toContain('| 진입점(라우트) |')
  })
})

describe('coverage-matrix — 문서 drift (CI 고정)', () => {
  it('docs/ktds/COVERAGE_MATRIX.md 가 단일 소스 렌더와 byte 일치한다', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const mdPath = join(here, '..', '..', '..', '..', '..', 'docs', 'ktds', 'COVERAGE_MATRIX.md')
    expect(existsSync(mdPath), 'COVERAGE_MATRIX.md 부재 — qa-coverage-matrix.mjs --write 로 생성').toBe(true)
    expect(readFileSync(mdPath, 'utf8'), 'drift — matrix.ts 변경 후 qa-coverage-matrix.mjs --write 재생성 필요').toBe(
      renderCoverageMatrixMd(),
    )
  })
})

describe('coverage-matrix — 스캔 통합(e2e): 미지원이 coverage.json 에 표면화', () => {
  it('kotlin 혼입 프로젝트: langSupport 계상 + 렌더 경고 문구', async () => {
    writeFile(root, 'src/A.java', 'public class A { void a() {} }\n')
    writeFile(root, 'src/B.kt', 'class B { fun b() {} }\n')
    const { coverage } = await scanDomainMap(root)
    expect(coverage.langSupport?.unsupportedFiles).toBe(1)
    const kotlin = coverage.langSupport!.byLang.find((l) => l.lang === 'kotlin')
    expect(kotlin).toMatchObject({ files: 1, best: 'none' })
    // 산출 파일에도 실렸는지(스키마 라운드트립).
    const onDisk = JSON.parse(readFileSync(join(root, '.spec', 'map', 'coverage.json'), 'utf8'))
    expect(onDisk.langSupport.unsupportedFiles).toBe(1)
    // 사람용 렌더에 [미확인] 경고.
    const text = renderCoverageReport(coverage)
    expect(text).toContain('스캐너 미지원 소스 1파일 [미확인]')
    expect(text).toContain('kotlin 1')
  })
})
