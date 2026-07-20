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
    expect(tierOf('routes', 'python')).toBe('none')
    expect(tierOf('edges', 'xml')).toBe('partial')
    expect(tierOf('complexity', 'jsp')).toBe('none')
  })

  it('kotlin 지원 선언 고정 — 핵심 5축 full, batch 는 partial(Quartz/Executor 미탐지)', () => {
    expect(tierOf('routes', 'kotlin')).toBe('full')
    expect(tierOf('edges', 'kotlin')).toBe('full')
    expect(tierOf('method-calls', 'kotlin')).toBe('full')
    expect(tierOf('jpa', 'kotlin')).toBe('full')
    expect(tierOf('complexity', 'kotlin')).toBe('full')
    expect(tierOf('batch', 'kotlin')).toBe('partial')
    expect(bestTierOf('kotlin')).toBe('full')
    expect(coreTierOf('kotlin')).toBe('full')
    // TS/TSX: import·api-call 엣지 partial + complexity full — core 는 최고 tier 라 full.
    expect(tierOf('edges', 'tsx')).toBe('partial')
    expect(tierOf('complexity', 'typescript')).toBe('full')
    expect(bestTierOf('tsx')).toBe('full')
    expect(coreTierOf('tsx')).toBe('full')
  })

  it('best vs core: sql 은 db-schema 가 덮어 best=full 이지만 구조분석 core=none', () => {
    expect(bestTierOf('sql')).toBe('full')
    expect(coreTierOf('sql')).toBe('none')
    expect(bestTierOf('python')).toBe('none')
    expect(bestTierOf('java')).toBe('full')
    // C1/C2 정정 고정: yaml/gradle 은 liveDbSignals 산출 언어(partial), java 는 db-schema 행 없음.
    expect(tierOf('db-schema', 'yaml')).toBe('partial')
    expect(tierOf('db-schema', 'gradle')).toBe('partial')
    expect(tierOf('db-schema', 'java')).toBe('none')
    // C8 정정 고정: properties 는 interfaces 산출을 생산하지 않는다(해석 보조 각주).
    expect(tierOf('interfaces', 'properties')).toBe('none')
  })

  it('computeLangSupport: python/Pro*C 는 미지원, cmd 는 부분 지원, kotlin/sql/md 는 미지원 아님', () => {
    writeFile(root, 'src/A.java', 'public class A {}\n')
    writeFile(root, 'src/B.py', 'class B: pass\n')
    writeFile(root, 'src/C.py', 'class C: pass\n')
    writeFile(root, 'src/K.kt', 'class K\n')
    writeFile(root, 'src/legacy/D.pc', 'EXEC SQL SELECT 1;\n')
    writeFile(root, 'db/schema.sql', 'CREATE TABLE t (id INT);\n')
    writeFile(root, 'bin/run.cmd', 'java -jar app.jar\n')
    writeFile(root, 'README.md', '# 문서 — denylist 제외\n')

    const ls = computeLangSupport(buildCensus(root))
    expect(ls.unsupportedFiles).toBe(3) // python 2 + pc 1 (kotlin/sql/cmd/md 제외)
    expect(ls.partialFiles).toBe(1) // cmd — 좁은 관용구(batch)만이라 별도 표면화(C6)
    const byLang = Object.fromEntries(ls.byLang.map((r) => [r.lang, r]))
    expect(byLang['python']).toMatchObject({ files: 2, best: 'none', core: 'none' })
    expect(byLang['kotlin']).toMatchObject({ files: 1, best: 'full', core: 'full' })
    expect(byLang['pc']).toMatchObject({ files: 1, best: 'none' })
    expect(byLang['sql']).toMatchObject({ best: 'full', core: 'none' })
    expect(byLang['cmd']).toMatchObject({ best: 'partial' })
    expect(byLang['md']).toBeUndefined() // denylist(문서류) — 계상 밖
  })

  it('denylist 뒤집기(C3): 미등재 레거시 확장자(.vb)도 등장 즉시 미지원으로 센다', () => {
    writeFile(root, 'src/A.java', 'public class A {}\n')
    writeFile(root, 'legacy/Old.vb', "Module Old\nEnd Module\n")
    writeFile(root, 'legacy/JOB1.jcl', '//JOB1 JOB\n')
    writeFile(root, 'config/app.yaml', 'db:\n  url: jdbc:mysql://x\n') // 순수 설정 — 계상 밖
    const ls = computeLangSupport(buildCensus(root))
    expect(ls.unsupportedFiles).toBe(2) // vb 1 + jcl 1
    const langs = ls.byLang.map((r) => r.lang)
    expect(langs).toContain('vb')
    expect(langs).toContain('jcl')
    expect(langs).not.toContain('yaml')
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
  // lean main(마켓플레이스)은 docs/ktds 자체가 없음 — 게이트의 강제 서식지는 demo 라인.
  // 디렉터리가 존재하면(=demo) 반드시 강제: 파일 부재/불일치를 skip 이 아니라 실패로 본다.
  const here = dirname(fileURLToPath(import.meta.url))
  const docsDir = join(here, '..', '..', '..', '..', '..', 'docs', 'ktds')
  it.skipIf(!existsSync(docsDir))('docs/ktds/COVERAGE_MATRIX.md 가 단일 소스 렌더와 byte 일치한다', () => {
    const mdPath = join(docsDir, 'COVERAGE_MATRIX.md')
    expect(existsSync(mdPath), 'COVERAGE_MATRIX.md 부재 — qa-coverage-matrix.mjs --write 로 생성').toBe(true)
    expect(readFileSync(mdPath, 'utf8'), 'drift — matrix.ts 변경 후 qa-coverage-matrix.mjs --write 재생성 필요').toBe(
      renderCoverageMatrixMd(),
    )
  })
})

describe('coverage-matrix — 스캔 통합(e2e): 미지원이 coverage.json 에 표면화', () => {
  it('python 혼입 프로젝트: langSupport 계상 + 렌더 경고 문구(kotlin 은 지원이라 미계상)', async () => {
    writeFile(root, 'src/A.java', 'public class A { void a() {} }\n')
    writeFile(root, 'src/B.py', 'def b(): pass\n')
    writeFile(root, 'src/K.kt', 'class K { fun k() {} }\n')
    const { coverage } = await scanDomainMap(root)
    expect(coverage.langSupport?.unsupportedFiles).toBe(1)
    const python = coverage.langSupport!.byLang.find((l) => l.lang === 'python')
    expect(python).toMatchObject({ files: 1, best: 'none' })
    const kotlin = coverage.langSupport!.byLang.find((l) => l.lang === 'kotlin')
    expect(kotlin).toMatchObject({ files: 1, best: 'full', core: 'full' })
    // 산출 파일에도 실렸는지(스키마 라운드트립).
    const onDisk = JSON.parse(readFileSync(join(root, '.spec', 'map', 'coverage.json'), 'utf8'))
    expect(onDisk.langSupport.unsupportedFiles).toBe(1)
    // 사람용 렌더에 [미확인] 경고.
    const text = renderCoverageReport(coverage)
    expect(text).toContain('스캐너 미지원 소스 1파일 [미확인]')
    expect(text).toContain('python 1')
  })
})
