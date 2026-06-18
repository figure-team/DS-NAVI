import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyzeImpact, ImpactInputMissingError } from './engine.js'
import { IMPACT_REPORT_FILENAME } from './types.js'
import type { ImpactSeed } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const petstore = join(here, '..', '..', 'fixtures', 'impact-recall', 'petstore')

let dir: string
beforeEach(() => {
  // 커밋된 fixture 오염 방지 — tmp 사본에서 analyzeImpact 실행(impact.json 기록).
  dir = mkdtempSync(join(tmpdir(), 'ktds-impact-io-'))
  cpSync(petstore, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const seed: ImpactSeed = {
  relPath: 'src/main/java/com/petstore/service/impl/AccountServiceImpl.java',
  origin: 'path',
  confidence: 'CONFIRMED',
}

describe('analyzeImpact (fixture, tmp 사본)', () => {
  it('상류=AccountController/Service, 하류=AccountMapper(.xml), API both, 매퍼 namespace', () => {
    const { result, verify, impactPath } = analyzeImpact(dir, [seed])
    const up = result.upstream.files.map((f) => f.relPath)
    expect(up).toContain('src/main/java/com/petstore/web/AccountController.java')
    expect(up).toContain('src/main/java/com/petstore/service/AccountService.java')

    const down = result.downstream.files.map((f) => f.relPath)
    expect(down).toContain('src/main/java/com/petstore/persistence/AccountMapper.java')
    expect(down).toContain('src/main/resources/com/petstore/persistence/AccountMapper.xml')

    // catalog 슬라이스는 누출되지 않는다(StringUtils 허브 제외)
    const all = new Set([...up, ...down])
    expect(all.has('src/main/java/com/petstore/web/CatalogController.java')).toBe(false)
    expect(all.has('src/main/java/com/petstore/persistence/ProductMapper.java')).toBe(false)

    // API: 로그인/signon 라우트 both → CONFIRMED_AI
    const login = result.upstream.api.find((a) => a.id === 'route:GET /account/login')
    expect(login?.via).toBe('both')
    expect(login?.confidence).toBe('CONFIRMED_AI')

    // 영속성 매퍼 namespace 추출
    const mapper = result.upstream.persistence.mappers.find((m) =>
      m.relPath.endsWith('AccountMapper.xml'),
    )
    expect(mapper?.namespace).toBe('com.petstore.persistence.AccountMapper')

    // KG table 카탈로그 로드
    expect(result.upstream.persistence.kgTableCatalog.map((t) => t.name)).toContain('account')

    // verify: 인용 보유 항목 근거율(GROUNDED) — 강신호 엣지 인용은 실파일 일치해야
    expect(verify.overall.itemGrounded).toBeGreaterThan(0)
    expect(impactPath.endsWith(IMPACT_REPORT_FILENAME)).toBe(true)
  })

  it('결정론: 두 번 실행 → impact.json byte-identical', () => {
    analyzeImpact(dir, [seed])
    const first = readFileSync(join(dir, '.spec', 'map', IMPACT_REPORT_FILENAME), 'utf8')
    analyzeImpact(dir, [seed])
    const second = readFileSync(join(dir, '.spec', 'map', IMPACT_REPORT_FILENAME), 'utf8')
    expect(first).toBe(second)
  })

  it('flow/domain 영향: account 도메인 INFERRED', () => {
    const { result } = analyzeImpact(dir, [seed])
    expect(result.upstream.domains.map((d) => d.key)).toContain('account')
    const acct = result.upstream.domains.find((d) => d.key === 'account')!
    expect(acct.confidence).toBe('INFERRED')
    expect(acct.name).toBe('account')
  })

  it('.spec/map 산출물 부재 → ImpactInputMissingError(fail-closed)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'ktds-impact-empty-'))
    try {
      expect(() => analyzeImpact(empty, [seed])).toThrow(ImpactInputMissingError)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('잘못된 산출물 파일명(경로 탈출) → 거부', () => {
    expect(() => analyzeImpact(dir, [seed], {}, { reportFilename: '../evil.json' })).toThrow()
  })
})
