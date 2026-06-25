/**
 * intake-types 단위테스트 — identified.json 2계층 스키마 파싱·default·일관성 진단(P2).
 */
import { describe, it, expect } from 'vitest'
import {
  parseIdentifiedIntake,
  diagnoseIntake,
  IdentifiedIntakeSchema,
} from './intake-types.js'

// 카카오 예시를 본뜬 ①-only 산출(③④ 필드 비움) — 후방호환 default 확인용.
const STEP1_ONLY = {
  request: { id: 'REQ-001', name: '카카오 로그인 추가', raw: '카카오 로그인 추가해주세요' },
  requirements: [
    {
      id: 'SFR-010',
      category: 'SFR',
      name: '카카오 소셜 로그인',
      priority: 'HIGH',
      acceptanceCriteria: [
        { id: 'AC-1', text: '카카오 콜백 처리', fnIds: ['to-be:auth/kakao-callback'] },
      ],
      changeset: { added: ['to-be:auth/kakao-callback'], modified: [], removed: [], revived: [] },
    },
    {
      id: 'SIR-002',
      category: 'SIR',
      name: '카카오 OAuth 2.0 API 연계',
      priority: 'HIGH',
      derivedFrom: 'SFR-010',
    },
  ],
  questions: ['기존 회원 계정 연동 정책은?'],
}

describe('parseIdentifiedIntake', () => {
  it('①-only 산출을 파싱하고 default 를 채운다', () => {
    const out = parseIdentifiedIntake(STEP1_ONLY)
    expect(out.schemaVersion).toBe(1)
    expect(out.request.source).toBe('') // default
    expect(out.request.requestedAt).toBeNull()
    const sfr = out.requirements[0]
    expect(sfr.type).toBe('functional') // default
    expect(sfr.status).toBe('ACTIVE') // default
    expect(sfr.definition).toBe('') // ③ 미보강 default
    expect(sfr.spec.details).toEqual([]) // ④ 미보강 default
    expect(sfr.acceptanceCriteria[0].kind).toBe('rule') // AC default
    expect(out.requirements[1].derivedFrom).toBe('SFR-010')
  })

  it('request.id 누락이면 사람이 읽을 메시지로 throw', () => {
    expect(() => parseIdentifiedIntake({ request: { name: 'x', raw: 'y' } })).toThrow(
      /identified\.json 검증 실패/,
    )
  })

  it('잘못된 category 는 거부한다', () => {
    expect(() =>
      parseIdentifiedIntake({
        request: { id: 'REQ-1', name: 'x', raw: 'y' },
        requirements: [{ id: 'XXX-1', category: 'XXX', name: 'n' }],
      }),
    ).toThrow()
  })
})

describe('diagnoseIntake', () => {
  it('깨끗한 산출은 경고가 없다', () => {
    expect(diagnoseIntake(parseIdentifiedIntake(STEP1_ONLY))).toEqual([])
  })

  it('id 접두와 category 불일치를 잡는다', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-1', name: 'x', raw: 'y' },
      requirements: [{ id: 'SIR-009', category: 'SFR', name: 'n' }],
    })
    expect(diagnoseIntake(intake).some((m) => m.includes('불일치'))).toBe(true)
  })

  it('AC fnId 가 changeset 에 없으면 유령 매핑을 잡는다', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-1', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-001',
          category: 'SFR',
          name: 'n',
          acceptanceCriteria: [{ id: 'AC-1', text: 't', fnIds: ['ghost:fn'] }],
          changeset: { added: [], modified: [], removed: [], revived: [] },
        },
      ],
    })
    expect(diagnoseIntake(intake).some((m) => m.includes('changeset 에 없음'))).toBe(true)
  })

  it('비기능인데 nfrCategory 누락을 잡는다', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-1', name: 'x', raw: 'y' },
      requirements: [{ id: 'PER-001', category: 'PER', name: 'n', type: 'nonfunctional' }],
    })
    expect(diagnoseIntake(intake).some((m) => m.includes('nfrCategory'))).toBe(true)
  })
})

describe('IdentifiedIntakeSchema', () => {
  it('requirements/questions 생략 시 빈 배열 default', () => {
    const out = IdentifiedIntakeSchema.parse({ request: { id: 'REQ-1', name: 'x', raw: 'y' } })
    expect(out.requirements).toEqual([])
    expect(out.questions).toEqual([])
  })
})
