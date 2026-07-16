/**
 * project-intake 단위테스트 — ⑥ 투영(identified.json → 현 rtm 스키마, 옵션 B).
 */
import { describe, it, expect } from 'vitest'
import { parseIdentifiedIntake } from './intake-types.js'
import { intakeReqToRtmRequirement, intakeFnStub, fnDomainKey } from './project-intake.js'
import { RtmRequirementSchema, RtmFunctionRowSchema } from './types.js'

const INTAKE = parseIdentifiedIntake({
  request: { id: 'REQ-002', name: '비밀번호 재설정', raw: '비밀번호 재설정 추가', source: '고객' },
  requirements: [
    {
      id: 'SFR-010', category: 'SFR', name: '비밀번호 재설정', priority: 'HIGH',
      acceptanceCriteria: [{ id: 'AC-1', text: '토큰 발급', fnIds: ['to-be:account/재설정-요청'] }],
      changeset: { added: ['to-be:account/재설정-요청'], modified: ['flow:ANY /actions/Account.action?signon'], removed: [], revived: [] },
    },
    {
      id: 'SER-004', category: 'SER', name: '토큰 보안', priority: 'HIGH', type: 'nonfunctional', nfrCategory: 'security',
      derivedFrom: 'SFR-010',
      changeset: { added: [], modified: ['to-be:account/재설정-요청'], removed: [], revived: [] },
    },
  ],
})

describe('intakeReqToRtmRequirement', () => {
  it('요구사항을 현 스키마 RtmRequirement 로 투영하고 스키마를 통과한다', () => {
    const r = intakeReqToRtmRequirement(INTAKE.requirements[0], INTAKE.request)
    expect(() => RtmRequirementSchema.parse(r)).not.toThrow()
    expect(r.id).toBe('SFR-010')
    expect(r.lifecycle).toBe('RECEIVED')
    expect(r.status).toBe('ACTIVE')
    expect(r.source?.section).toBe('REQ-002') // 요청ID 귀속
    expect(r.acceptanceCriteria[0].fnIds).toContain('to-be:account/재설정-요청')
  })

  it('derivedFrom 을 dependsOn 으로, 비기능은 nfrScope 로 횡단 귀속한다', () => {
    const r = intakeReqToRtmRequirement(INTAKE.requirements[1], INTAKE.request)
    expect(r.dependsOn).toEqual(['SFR-010'])
    expect(r.type).toBe('nonfunctional')
    expect(r.nfrCategory).toBe('security')
    expect(r.nfrScope).toContain('to-be:account/재설정-요청')
  })

  it('WITHDRAWN 상태는 WITHDRAWN 으로 투영(절차 B — 대체 없는 철회, SUPERSEDED 와 구분)', () => {
    const wreq = { ...INTAKE.requirements[0], status: 'WITHDRAWN' as const }
    expect(intakeReqToRtmRequirement(wreq, INTAKE.request).status).toBe('WITHDRAWN')
  })
})

describe('intakeFnStub', () => {
  it('TO-BE 기능 스텁을 만들고 스키마를 통과한다(셀 전부 미검증)', () => {
    const f = intakeFnStub('to-be:account/재설정-요청', 'FN-101', 'domain:account', '계정/회원', ['SFR-010'])
    expect(() => RtmFunctionRowSchema.parse(f)).not.toThrow()
    expect(f.name).toBe('재설정 요청') // 하이픈→공백
    expect(f.origin).toBe('TO_BE')
    expect(f.state).toBe('PLANNED')
    expect(f.entryPoint.confidence).toBe('UNVERIFIED')
    expect(f.requirementHistory).toEqual(['SFR-010'])
  })
})

describe('fnDomainKey', () => {
  it('신규 기능 id(to-be:/domain:)의 스코프 접두를 떼고 도메인 키를 뽑는다', () => {
    expect(fnDomainKey('to-be:account/재설정-요청')).toBe('account')
    expect(fnDomainKey('domain:cart/장바구니추가')).toBe('cart')
    expect(fnDomainKey('to-be:notification/알림-발송')).toBe('notification')
  })
})
