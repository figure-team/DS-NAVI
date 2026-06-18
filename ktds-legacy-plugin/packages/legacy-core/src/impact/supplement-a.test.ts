import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analyzeImpact, loadImpactInputs } from './engine.js'
import { findPrecedents, type PrecedentCandidate } from './precedents.js'
import {
  buildCreationSuggestion,
  checkCreationL1,
  assertCreationL1,
  CreationL1Error,
  type CreationSuggestion,
} from './supplement-a.js'
import type { ImpactSeed } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
const petstore = join(here, '..', '..', 'fixtures', 'impact-recall', 'petstore')

const SEED: ImpactSeed = {
  relPath: 'src/main/java/com/petstore/service/impl/AccountServiceImpl.java',
  origin: 'path',
  confidence: 'CONFIRMED',
}
const SECURITY_CONFIG = 'src/main/java/com/petstore/config/SecurityConfig.java'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ktds-suppa-'))
  cpSync(petstore, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function strongSuggestion(): { suggestion: CreationSuggestion; precedent: PrecedentCandidate } {
  const inputs = loadImpactInputs(dir)
  const precedent = findPrecedents(dir, {
    domainHints: ['account'],
    entityHints: ['Kakao', 'login'],
    operationHints: ['callback'],
  }).candidates[0]
  const impact = analyzeImpact(dir, [SEED]).result
  const suggestion = buildCreationSuggestion(dir, {
    intent: { domainHints: ['account'], entityHints: ['Kakao'], operationHints: ['callback'] },
    entityHint: 'KakaoLogin',
    precedent,
    changeTargets: [{ relPath: SECURITY_CONFIG, line: 1, symbols: ['OAuth2 필터 등록'] }],
    impact,
    census: inputs.census,
  })
  return { suggestion, precedent }
}

describe('buildCreationSuggestion — 선례 강(strong)', () => {
  it('3버킷 + 선례 강 → [생성] 구체경로·심볼·선례앵커(실존), net-new=INFERRED', () => {
    const { suggestion } = strongSuggestion()
    expect(suggestion.strength).toBe('strong')
    expect(suggestion.create.length).toBeGreaterThan(0)
    // net-new 는 절대 CONFIRMED 아님(최대 INFERRED)
    expect(suggestion.create.every((c) => c.confidence === 'INFERRED')).toBe(true)
    // 컨트롤러 analog: 구체 경로 + 심볼(.callback())
    const ctrl = suggestion.create.find((c) => c.role === 'controller')!
    expect(ctrl.suggestedPath).toContain('KakaoLoginController.java')
    expect(ctrl.symbols.some((s) => s.includes('KakaoLoginController.callback()'))).toBe(true)
    // 선례 앵커는 실존(ok) → confirmed
    expect(ctrl.precedentAnchors[0].status).toBe('ok')
    expect(ctrl.precedentAnchors[0].confirmed).toBe(true)
    expect(ctrl.precedentAnchors[0].file).toContain('AccountController.java')
  })

  it('[변경] 기존 파일 — 앵커 실존 → CONFIRMED', () => {
    const { suggestion } = strongSuggestion()
    const sc = suggestion.change.find((c) => c.relPath === SECURITY_CONFIG)!
    expect(sc.anchor.status).toBe('ok')
    expect(sc.confidence).toBe('CONFIRMED')
    expect(sc.symbols).toContain('OAuth2 필터 등록')
  })

  it('[영향] reachability — account 도메인 포함', () => {
    const { suggestion } = strongSuggestion()
    expect(suggestion.impact.some((i) => i.kind === 'domain' && i.ref === 'account')).toBe(true)
  })

  it('L1 게이트 통과(위반 0)', () => {
    const { suggestion } = strongSuggestion()
    expect(suggestion.l1Violations).toEqual([])
    expect(() => assertCreationL1(suggestion)).not.toThrow()
  })
})

describe('buildCreationSuggestion — 선례 없음(none) 강등 A-A3', () => {
  it('역할 스캐폴드 + 관례앵커 + UNVERIFIED, 구체 파일명 없음', () => {
    const inputs = loadImpactInputs(dir)
    const impact = analyzeImpact(dir, [SEED]).result
    const suggestion = buildCreationSuggestion(dir, {
      intent: { domainHints: ['notification'] },
      entityHint: 'PushNotify',
      precedent: null,
      impact,
      census: inputs.census,
    })
    expect(suggestion.strength).toBe('none')
    expect(suggestion.create.every((c) => c.confidence === 'UNVERIFIED')).toBe(true)
    // 구체 파일명을 지어내지 않는다
    expect(suggestion.create.every((c) => c.suggestedPath === null)).toBe(true)
    // 관례 앵커는 실존 파일
    expect(suggestion.create.every((c) => c.conventionAnchors.every((a) => a.status === 'ok'))).toBe(true)
    expect(suggestion.l1Violations).toEqual([])
  })
})

describe('L1 하드게이트 — 위반 검출', () => {
  it('net-new CONFIRMED 차단', () => {
    const { suggestion } = strongSuggestion()
    const tampered: CreationSuggestion = {
      ...suggestion,
      create: suggestion.create.map((c, i) => (i === 0 ? { ...c, confidence: 'CONFIRMED' as const } : c)),
    }
    const violations = checkCreationL1(tampered)
    expect(violations.some((v) => v.includes('net-new CONFIRMED 위반'))).toBe(true)
    expect(() => assertCreationL1({ ...tampered, l1Violations: violations })).toThrow(CreationL1Error)
  })

  it('환각 선례 앵커(미실존 파일) 차단', () => {
    const inputs = loadImpactInputs(dir)
    const impact = analyzeImpact(dir, [SEED]).result
    const fakePrecedent = findPrecedents(dir, { domainHints: ['account'] }).candidates[0]
    // 컨트롤러 역할 파일을 실존하지 않는 경로로 바꾼다
    const hallucinated: PrecedentCandidate = {
      ...fakePrecedent,
      filesByRole: { ...fakePrecedent.filesByRole, controller: ['src/main/java/com/petstore/web/Ghost.java'] },
      entryLine: 1,
    }
    const suggestion = buildCreationSuggestion(dir, {
      intent: { domainHints: ['account'] },
      entityHint: 'KakaoLogin',
      precedent: hallucinated,
      impact,
      census: inputs.census,
    })
    expect(suggestion.l1Violations.some((v) => v.includes('앵커 미실존'))).toBe(true)
  })

  it('[변경] CONFIRMED 인데 앵커 미실존이면 위반(외부 호출자 위조 차단)', () => {
    const { suggestion } = strongSuggestion()
    const forged: CreationSuggestion = {
      ...suggestion,
      change: [
        {
          relPath: 'src/main/java/com/petstore/web/Ghost.java',
          symbols: [],
          anchor: { file: 'src/main/java/com/petstore/web/Ghost.java', line: 1, status: 'no-file', confirmed: false },
          confidence: 'CONFIRMED',
        },
      ],
    }
    expect(checkCreationL1(forged).some((v) => v.includes('[변경] CONFIRMED 인데 앵커 미실존'))).toBe(true)
  })

  it('선례 없음인데 구체 파일명이 들어가면 위반', () => {
    const { suggestion } = strongSuggestion()
    const bad: CreationSuggestion = {
      ...suggestion,
      create: [
        {
          role: '컨트롤러',
          suggestedPath: 'src/main/java/com/petstore/web/Made Up.java',
          symbols: [],
          precedentAnchors: [],
          conventionAnchors: [],
          confidence: 'UNVERIFIED',
          strength: 'none',
        },
      ],
    }
    expect(checkCreationL1(bad).some((v) => v.includes('선례없음인데 구체 파일명'))).toBe(true)
  })
})
