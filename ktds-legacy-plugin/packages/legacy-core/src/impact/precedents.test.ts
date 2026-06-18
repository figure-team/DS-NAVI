import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadImpactInputs } from './engine.js'
import {
  buildFlowSlices,
  rankPrecedents,
  findPrecedents,
  classifyRole,
  tokenize,
  PrecedentPreconditionError,
  type KgSimilarity,
} from './precedents.js'

const here = dirname(fileURLToPath(import.meta.url))
const petstore = join(here, '..', '..', 'fixtures', 'impact-recall', 'petstore')

describe('classifyRole / tokenize', () => {
  it('역할 분류 — 명명/패키지 관례', () => {
    expect(classifyRole('src/main/java/com/petstore/web/AccountController.java')).toBe('controller')
    expect(classifyRole('src/main/java/com/petstore/service/impl/AccountServiceImpl.java')).toBe('service')
    expect(classifyRole('src/main/java/com/petstore/persistence/AccountMapper.java')).toBe('repository')
    expect(classifyRole('src/main/resources/com/petstore/persistence/AccountMapper.xml')).toBe('xml')
    expect(classifyRole('src/main/java/com/petstore/domain/Account.java')).toBe('entity')
    expect(classifyRole('src/main/java/com/petstore/common/StringUtils.java')).toBe('other')
  })
  it('camelCase 분해 + 소문자 토큰', () => {
    expect(tokenize('KakaoLoginController')).toEqual(['kakao', 'login', 'controller'])
  })
})

describe('buildFlowSlices (fixture)', () => {
  it('흐름별 수직 슬라이스 + 진입 라우트 파일/라인', () => {
    const inputs = loadImpactInputs(petstore)
    const slices = buildFlowSlices(inputs.skeleton!, inputs.routes.routes, inputs.confirmed, inputs.census)
    const login = slices.find((s) => s.flowId === 'flow:GET /account/login')!
    expect(login.routeId).toBe('route:GET /account/login')
    expect(login.domainKey).toBe('account')
    expect(login.entryFile).toBe('src/main/java/com/petstore/web/AccountController.java')
    expect(login.entryLine).toBe(18)
    expect(login.filesByRole.controller).toContain('src/main/java/com/petstore/web/AccountController.java')
    expect(login.filesByRole.service).toContain('src/main/java/com/petstore/service/AccountService.java')
  })
})

describe('rankPrecedents — F1 도메인/흐름명 우선', () => {
  it('도메인 힌트 "account" → account 흐름 강(strong) 상위, catalog 제외', () => {
    const inputs = loadImpactInputs(petstore)
    const slices = buildFlowSlices(inputs.skeleton!, inputs.routes.routes, inputs.confirmed, inputs.census)
    const res = rankPrecedents(slices, { domainHints: ['account'], entityHints: ['Kakao', 'login'] }, null)
    expect(res.empty).toBe(false)
    expect(res.candidates[0].matchStrength).toBe('strong')
    expect(res.candidates[0].domainKey).toBe('account')
    expect(res.candidates.every((c) => c.domainKey !== 'catalog')).toBe(true)
    expect(res.candidates[0].whyMatched.some((w) => w.includes('account'))).toBe(true)
  })

  it('흐름명 부분 매칭 "login" → fuzzy strong', () => {
    const inputs = loadImpactInputs(petstore)
    const slices = buildFlowSlices(inputs.skeleton!, inputs.routes.routes, inputs.confirmed, inputs.census)
    const res = rankPrecedents(slices, { domainHints: ['login'] }, null)
    expect(res.candidates.some((c) => c.flowId.includes('login'))).toBe(true)
  })

  it('매칭 0건 → empty=true (선례없음 강등은 host/A-A3)', () => {
    const inputs = loadImpactInputs(petstore)
    const slices = buildFlowSlices(inputs.skeleton!, inputs.routes.routes, inputs.confirmed, inputs.census)
    const res = rankPrecedents(slices, { domainHints: ['nonexistent-zzz'] }, null)
    expect(res.empty).toBe(true)
    expect(res.candidates).toHaveLength(0)
  })

  it('KG similar_to/related 확장 — 약신호 가점', () => {
    const inputs = loadImpactInputs(petstore)
    const slices = buildFlowSlices(inputs.skeleton!, inputs.routes.routes, inputs.confirmed, inputs.census)
    // catalog 컨트롤러를 account 힌트 매칭 파일과 KG 로 잇는다(인위적).
    const kg: KgSimilarity = {
      fileById: new Map([
        ['n1', 'src/main/java/com/petstore/web/CatalogController.java'],
        ['n2', 'src/main/java/com/petstore/web/AccountController.java'],
      ]),
      edges: [{ source: 'n1', target: 'n2' }],
    }
    const withKg = rankPrecedents(slices, { domainHints: ['account'] }, kg)
    const cat = withKg.candidates.find((c) => c.domainKey === 'catalog')
    // catalog 가 KG 확장으로 점수를 얻어 후보에 들 수 있다(account 와 연결).
    if (cat) expect(cat.whyMatched.some((w) => w.includes('KG'))).toBe(true)
  })

  it('결정론: 동일 입력 → 동일 랭킹', () => {
    const inputs = loadImpactInputs(petstore)
    const slices = buildFlowSlices(inputs.skeleton!, inputs.routes.routes, inputs.confirmed, inputs.census)
    const a = rankPrecedents(slices, { domainHints: ['account'] }, null)
    const b = rankPrecedents(slices, { domainHints: ['account'] }, null)
    expect(a.candidates.map((c) => [c.flowId, c.score])).toEqual(b.candidates.map((c) => [c.flowId, c.score]))
  })
})

describe('findPrecedents — IO + F3 precondition', () => {
  it('fixture: account 로그인 의도 → 후보 산출', () => {
    const res = findPrecedents(petstore, { domainHints: ['account'], entityHints: ['login'] })
    expect(res.empty).toBe(false)
    expect(res.candidates[0].domainKey).toBe('account')
  })

  it('confirm 전(skeleton/confirmed 부재) → fail-closed PrecedentPreconditionError', () => {
    const inputs = loadImpactInputs(petstore)
    expect(() =>
      findPrecedents(petstore, { domainHints: ['account'] }, { inputs: { ...inputs, skeleton: null } }),
    ).toThrow(PrecedentPreconditionError)
    expect(() =>
      findPrecedents(petstore, { domainHints: ['account'] }, { inputs: { ...inputs, confirmed: null } }),
    ).toThrow(PrecedentPreconditionError)
  })
})
