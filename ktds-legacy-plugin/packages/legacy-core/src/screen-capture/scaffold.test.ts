import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  detectStartCommand,
  scaffoldScreensConfig,
  scaffoldScreensConfigOnDisk,
  type BuildSignals,
} from './scaffold.js'
import type { CensusRoute } from './triage.js'

const noBuild: BuildSignals = { hasMvnw: false, hasGradlew: false, pomXml: null, buildGradle: null }

function route(path: string, method = 'GET'): CensusRoute {
  return { path, method, handler: 'X#y', filePath: 'src/X.java', line: 1 }
}

describe('detectStartCommand — 빌드 신호 결정론 감지', () => {
  it('pom cargo 플러그인 + mvnw → ./mvnw cargo:run', () => {
    const r = detectStartCommand({
      ...noBuild,
      hasMvnw: true,
      pomXml: '<artifactId>cargo-maven3-plugin</artifactId>',
    })
    expect(r.command).toEqual(['./mvnw', 'cargo:run'])
    expect(r.source).toContain('cargo-maven')
  })

  it('pom spring-boot 플러그인, wrapper 없음 → mvn spring-boot:run', () => {
    const r = detectStartCommand({
      ...noBuild,
      pomXml: '<artifactId>spring-boot-maven-plugin</artifactId>',
    })
    expect(r.command).toEqual(['mvn', 'spring-boot:run'])
  })

  it('gradlew + spring boot → ./gradlew bootRun', () => {
    const r = detectStartCommand({
      ...noBuild,
      hasGradlew: true,
      buildGradle: "id 'org.springframework.boot' version '3.0.0'",
    })
    expect(r.command).toEqual(['./gradlew', 'bootRun'])
  })

  it('실행 플러그인 신호 없음 → null(오추정보다 공백)', () => {
    expect(detectStartCommand({ ...noBuild, pomXml: '<project/>' }).command).toBeNull()
    expect(detectStartCommand(noBuild).command).toBeNull()
  })
})

describe('scaffoldScreensConfig — routes census 초안', () => {
  it('contextPath 로 baseUrl 을 추정하고 GET-safe 목록성 라우트만 seedUrls 로 뽑는다', () => {
    const { screens, summary } = scaffoldScreensConfig({
      routes: [
        route('/cop/bbs/selectBoardList.do'),
        route('/cop/bbs/insertBoard.do'), // deny 토큰
        route('/cop/bbs/selectBoardDetail.do'), // 목록성 아님(파라미터 필요 소음)
        route('/uat/uia/actionMain.do', 'POST'), // GET-safe 아님
      ],
      contextPath: '/egovframe',
      build: noBuild,
    })
    expect(screens.baseUrl).toBe('http://localhost:8080/egovframe')
    expect(screens.seedUrls).toEqual(['/cop/bbs/selectBoardList.do'])
    expect(screens.scenarios).toEqual([])
    expect(screens.startCommand).toBeUndefined()
    expect(summary.routesTotal).toBe(4)
    expect(summary.seedUrls).toBe(1)
  })

  it('contextPath 없음 → 루트 baseUrl; 확인 노트에 로그인 시나리오 안내가 포함된다', () => {
    const { screens, summary } = scaffoldScreensConfig({
      routes: [],
      contextPath: null,
      build: noBuild,
    })
    expect(screens.baseUrl).toBe('http://localhost:8080')
    expect(summary.notes.some((n) => n.includes('scenarios'))).toBe(true)
    expect(summary.notes.some((n) => n.includes('startCommand 미감지'))).toBe(true)
  })

  it('라우트는 있는데 GET-safe 시드가 0건이면 SPA 의심 경고를 낸다(결함 1)', () => {
    // REST-only(전부 POST/비목록성) → 크롤 시드 0건 = 클라이언트 라우팅 SPA 신호.
    const { summary } = scaffoldScreensConfig({
      routes: [route('/api/trust/register', 'POST'), route('/api/royalty/settle', 'POST')],
      contextPath: null,
      build: noBuild,
    })
    expect(summary.seedUrls).toBe(0)
    expect(summary.spaSuspected).toBe(true)
    expect(summary.notes.some((n) => n.includes('SPA 의심'))).toBe(true)
  })

  it('GET-safe 목록성 시드가 있으면 SPA 의심이 아니다', () => {
    const { summary } = scaffoldScreensConfig({
      routes: [route('/cop/bbs/selectBoardList.do')],
      contextPath: null,
      build: noBuild,
    })
    expect(summary.spaSuspected).toBe(false)
    expect(summary.notes.some((n) => n.includes('SPA 의심'))).toBe(false)
  })
})

describe('scaffoldScreensConfigOnDisk — fail-closed IO', () => {
  let tmp: string
  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true })
  })

  async function seedProject(withScreens = false): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'scaffold-'))
    const cfg: Record<string, unknown> = { networkType: 3, outputLanguage: 'ko' }
    if (withScreens) cfg.screens = { baseUrl: 'http://localhost:9999/custom' }
    await writeFile(join(dir, 'understanding.config.json'), JSON.stringify(cfg))
    await mkdir(join(dir, '.spec', 'map'), { recursive: true })
    await writeFile(
      join(dir, '.spec', 'map', 'routes.json'),
      JSON.stringify({
        contextPath: '/app',
        routes: [route('/board/selectNoticeList.do')],
      }),
    )
    await writeFile(join(dir, 'pom.xml'), '<artifactId>cargo-maven3-plugin</artifactId>')
    await writeFile(join(dir, 'mvnw'), '#!/bin/sh')
    return dir
  }

  it('초안을 config 에 기록한다(기존 키 보존, zod 기본값 실체화)', async () => {
    tmp = await seedProject()
    const { summary } = scaffoldScreensConfigOnDisk(tmp)
    expect(summary.baseUrl).toBe('http://localhost:8080/app')
    expect(summary.startCommand).toEqual(['./mvnw', 'cargo:run'])
    const written = JSON.parse(await readFile(join(tmp, 'understanding.config.json'), 'utf8'))
    expect(written.outputLanguage).toBe('ko')
    expect(written.screens.baseUrl).toBe('http://localhost:8080/app')
    expect(written.screens.seedUrls).toEqual(['/board/selectNoticeList.do'])
    expect(written.screens.maxPages).toBe(40) // 스키마 기본값 실체화
  })

  it('기존 screens 섹션은 force 없이 덮지 않는다', async () => {
    tmp = await seedProject(true)
    expect(() => scaffoldScreensConfigOnDisk(tmp)).toThrow(/--force/)
    const { summary } = scaffoldScreensConfigOnDisk(tmp, { force: true })
    expect(summary.baseUrl).toBe('http://localhost:8080/app')
  })

  it('routes.json 부재 → /understand-map 선행 안내로 throw', async () => {
    tmp = await seedProject()
    await rm(join(tmp, '.spec'), { recursive: true })
    expect(() => scaffoldScreensConfigOnDisk(tmp)).toThrow(/understand-map/)
  })

  it('config 부재 → /understand-init 선행 안내로 throw', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'scaffold-'))
    expect(() => scaffoldScreensConfigOnDisk(tmp)).toThrow(/understand-init/)
  })
})
