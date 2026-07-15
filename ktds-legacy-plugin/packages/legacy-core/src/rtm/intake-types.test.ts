/**
 * intake-types 단위테스트 — identified.json 2계층 스키마 파싱·default·일관성 진단(P2).
 */
import { describe, it, expect } from 'vitest'
import {
  parseIdentifiedIntake,
  diagnoseIntake,
  checkIntakeGrounding,
  extractTableRefs,
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

// ── 실재 대조 게이트(P1) ────────────────────────────────────────────────────────
// 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.1-4. 기준선은 examples/jpetstore-6 실측:
//   db-schema.json tables[].name = 13개(OAUTH_ACCOUNT 없음)
//   rtm.json functions[].id 에 REQ-001 이 modified 한 flow 3건이 실재
const JPETSTORE_TABLES = [
  'ACCOUNT', 'BANNERDATA', 'CATEGORY', 'INVENTORY', 'ITEM', 'LINEITEM', 'ORDERS',
  'ORDERSTATUS', 'PRODUCT', 'PROFILE', 'SEQUENCE', 'SIGNON', 'SUPPLIER',
]
const JPETSTORE_FN_IDS = [
  'flow:ANY /actions/Account.action',
  'flow:ANY /actions/Account.action?editAccount',
  'flow:ANY /actions/Account.action?editAccountForm',
  'flow:ANY /actions/Account.action?newAccount',
  'flow:ANY /actions/Account.action?newAccountForm',
  'flow:ANY /actions/Account.action?signoff',
  'flow:ANY /actions/Account.action?signon',
]
const JPETSTORE_INV = { fnIds: JPETSTORE_FN_IDS, tables: JPETSTORE_TABLES }

/** REQ-001("카카오 로그인 기능 추가") 실측 changeset 을 그대로 본뜬 ①-only 산출. */
const REQ_001 = {
  request: { id: 'REQ-001', name: '카카오 로그인 기능 추가', raw: '카카오 로그인 기능 추가' },
  requirements: [
    {
      id: 'SFR-001',
      category: 'SFR',
      name: '카카오 소셜 로그인',
      changeset: {
        added: [
          'to-be:account/카카오-로그인-진입',
          'to-be:account/카카오-콜백-처리',
          'to-be:account/카카오-계정연동-자동가입',
        ],
        modified: [
          'flow:ANY /actions/Account.action',
          'flow:ANY /actions/Account.action?signon',
          'flow:ANY /actions/Account.action?newAccount',
        ],
        removed: [],
        revived: [],
      },
    },
  ],
}

describe('extractTableRefs', () => {
  it('데이터 셀 실측 표기에서 테이블명만 뽑는다', () => {
    // jpetstore rtm.json to-be 스텁 data.value 원문.
    expect(extractTableRefs('(제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR)')).toEqual([
      'OAUTH_ACCOUNT', 'ACCOUNT', 'SIGNON',
    ])
  })

  it('CRUD 표기가 아닌 산문 대문자는 뽑지 않는다(오탐=차단이므로 좁게)', () => {
    expect(extractTableRefs('OAuth 로 SIGNON 을 읽고 API 를 호출한다')).toEqual([])
    expect(extractTableRefs('(제안) — (카카오 토큰·사용자 외부 API)')).toEqual([])
    expect(extractTableRefs('HTTP(S) 로 전송')).toEqual([]) // S ∉ CRUD
    expect(extractTableRefs('A(C) 는 한 글자라 제외')).toEqual([])
  })
})

describe('checkIntakeGrounding', () => {
  // ── P1b 교정: 신규 테이블 제안은 정당(info) · [확정] 단언만 차단(error) ──
  // 초판은 db-schema 에 없는 NAME(CRUD) 를 전건 차단해 정당한 제안까지 오차단했다.
  // 설계: RTM_IMPACT_GATE_DESIGN.md §1.2 "2026-07-16 교정".
  it('★ OAUTH_ACCOUNT 제안을 표면화하되 차단하지 않는다(info) — 신규 제안은 정당하다', () => {
    const intake = parseIdentifiedIntake({
      ...REQ_001,
      requirements: [
        {
          ...REQ_001.requirements[0],
          spec: { outputs: '(제안) OAUTH_ACCOUNT(C) · ACCOUNT(CR) · SIGNON(CR)' },
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({
      kind: 'unknown-table',
      level: 'info', // ← 차단 아님. 호출자는 error 만 exit 2.
      reqId: 'SFR-001',
      field: 'spec.outputs',
      value: 'OAUTH_ACCOUNT',
    })
    expect(v.filter((x) => x.level === 'error')).toEqual([]) // 통과(exit 0)
    // 같은 셀의 실존 테이블(ACCOUNT·SIGNON)은 소견조차 없어야 한다.
    expect(v.map((x) => x.value)).not.toContain('ACCOUNT')
    expect(v.map((x) => x.value)).not.toContain('SIGNON')
  })

  it('★ 신규 테이블을 [확정] 으로 단언하면 차단한다(error) — L1 net-new CONFIRMED 금지와 동일', () => {
    const intake = parseIdentifiedIntake({
      ...REQ_001,
      requirements: [
        {
          ...REQ_001.requirements[0],
          spec: { outputs: '[확정] OAUTH_ACCOUNT(C) · ACCOUNT(CR)' },
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ kind: 'unknown-table', level: 'error', value: 'OAUTH_ACCOUNT' })
    expect(v[0].message).toContain('net-new CONFIRMED 위반')
  })

  it('AC confidence=CONFIRMED 로 신규 테이블을 단언하면 차단한다(error)', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-010', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-010',
          category: 'SFR',
          name: 'n',
          acceptanceCriteria: [
            { id: 'AC-1', text: 'OAUTH_ACCOUNT(C) 에 연동정보 저장', confidence: 'CONFIRMED' },
          ],
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({
      kind: 'unknown-table',
      level: 'error',
      field: 'acceptanceCriteria.AC-1.text',
      value: 'OAUTH_ACCOUNT',
    })
  })

  it('AC confidence 는 default INFERRED 라 같은 문장이 통과한다(오차단 없음)', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-011', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-011',
          category: 'SFR',
          name: 'n',
          acceptanceCriteria: [{ id: 'AC-1', text: 'OAUTH_ACCOUNT(C) 에 연동정보 저장' }],
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v.map((x) => x.level)).toEqual(['info'])
  })

  it('[확정(AI)](CONFIRMED_AI)는 차단하지 않는다 — L1 도 CONFIRMED 만 막는다', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-012', name: 'x', raw: 'y' },
      requirements: [
        { id: 'SFR-012', category: 'SFR', name: 'n', definition: '[확정(AI)] OAUTH_ACCOUNT(C)' },
      ],
    })
    expect(checkIntakeGrounding(intake, JPETSTORE_INV).map((x) => x.level)).toEqual(['info'])
  })

  it('실존 테이블은 [확정] 으로 단언해도 통과한다(소견 없음)', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-013', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-013',
          category: 'SFR',
          name: 'n',
          definition: '[확정] ACCOUNT(CR) · SIGNON(CR)',
          acceptanceCriteria: [{ id: 'AC-1', text: 'SIGNON(R) 조회', confidence: 'CONFIRMED' }],
        },
      ],
    })
    expect(checkIntakeGrounding(intake, JPETSTORE_INV)).toEqual([])
  })

  it('REQ-001 실측 산출은 통과한다 — 실재 flow 3건 modified + to-be added 3건', () => {
    expect(checkIntakeGrounding(parseIdentifiedIntake(REQ_001), JPETSTORE_INV)).toEqual([])
  })

  it('to-be: added 는 오탐하지 않는다(신규니까 rtm.json 에 없는 게 정상)', () => {
    const intake = parseIdentifiedIntake(REQ_001)
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v.filter((x) => x.field === 'changeset.added')).toEqual([])
  })

  it('실재하지 않는 flow 를 modified 하면 잡는다', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-002', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-002',
          category: 'SFR',
          name: 'n',
          changeset: {
            added: [],
            modified: ['flow:ANY /actions/Kakao.action?callback'],
            removed: [],
            revived: [],
          },
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ kind: 'unknown-fn', level: 'error', field: 'changeset.modified' })
  })

  it('접두 없는 added 는 면제 대상이 아니다("기존 것을 추가" 모순)', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-003', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-003',
          category: 'SFR',
          name: 'n',
          changeset: { added: ['account/카카오-콜백'], modified: [], removed: [], revived: [] },
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ kind: 'unknown-fn', level: 'error', field: 'changeset.added' })
  })

  it('removed/revived 도 실재해야 한다', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-004', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-004',
          category: 'SFR',
          name: 'n',
          changeset: { added: [], modified: [], removed: ['ghost:a'], revived: ['ghost:b'] },
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v.map((x) => x.field).sort()).toEqual(['changeset.removed', 'changeset.revived'])
    expect(v.every((x) => x.level === 'error')).toBe(true)
  })

  it('AC/정의/범위 등 다른 자유텍스트의 신규 테이블도 표면화한다(info)', () => {
    const intake = parseIdentifiedIntake({
      request: { id: 'REQ-005', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-005',
          category: 'SFR',
          name: 'n',
          definition: 'KAKAO_TOKEN(C) 에 토큰 저장',
          acceptanceCriteria: [{ id: 'AC-1', text: 'SOCIAL_LINK(CR) 조회', fnIds: [] }],
        },
      ],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v.map((x) => x.value).sort()).toEqual(['KAKAO_TOKEN', 'SOCIAL_LINK'])
    expect(v.every((x) => x.level === 'info')).toBe(true) // 단언 안 했으니 차단 아님
  })

  // ── 하위호환: 인벤토리 미주입 시 대조 생략 ──
  it('인벤토리 미주입이면 대조를 생략한다(기존 호출자 동작 불변)', () => {
    const bad = parseIdentifiedIntake({
      request: { id: 'REQ-006', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-006',
          category: 'SFR',
          name: 'n',
          definition: 'OAUTH_ACCOUNT(C)',
          changeset: { added: [], modified: ['ghost:fn'], removed: [], revived: [] },
        },
      ],
    })
    expect(checkIntakeGrounding(bad)).toEqual([])
    expect(checkIntakeGrounding(bad, {})).toEqual([])
  })

  it('축별 부분 주입 — 준 축만 대조한다', () => {
    const bad = parseIdentifiedIntake({
      request: { id: 'REQ-007', name: 'x', raw: 'y' },
      requirements: [
        {
          id: 'SFR-007',
          category: 'SFR',
          name: 'n',
          definition: 'OAUTH_ACCOUNT(C)',
          changeset: { added: [], modified: ['ghost:fn'], removed: [], revived: [] },
        },
      ],
    })
    expect(checkIntakeGrounding(bad, { fnIds: JPETSTORE_FN_IDS }).map((x) => x.kind)).toEqual([
      'unknown-fn',
    ])
    expect(checkIntakeGrounding(bad, { tables: JPETSTORE_TABLES }).map((x) => x.kind)).toEqual([
      'unknown-table',
    ])
  })

  it('diagnoseIntake 는 대조 결과를 섞지 않는다(경고/차단 분리)', () => {
    const intake = parseIdentifiedIntake(REQ_001)
    expect(diagnoseIntake(intake)).toEqual([])
  })
})

// ── P2 근거 스키마 — 인용 + 화면·정책 축 ─────────────────────────────────────────
// 설계: docs/ktds/RTM_IMPACT_GATE_DESIGN.md §6.4. 기준선은 examples/jpetstore-6 실측:
//   rtm-requirements.json REQ-001 = AC 12건 전부 `evidence` 키 **없음** · CONFIRMED 0건
//   screens.json  `screen:actions/Account.action__signonForm` = SignonForm.jsp annotation 16건
//   doc-output/policy-domain-account.md §4 `PL-001` · §8(SIGNON.PASSWORD 평문 쟁점)

/** rtm-requirements.json REQ-001 AC-1 실측을 그대로 본뜬 ①-only 산출(인용 필드 부재). */
const LEGACY_NO_CITATION = {
  request: { id: 'REQ-001', name: '카카오 로그인 기능 추가', raw: '카카오 로그인 기능 추가' },
  requirements: [
    {
      id: 'SFR-001',
      category: 'SFR',
      name: '카카오 소셜 로그인',
      acceptanceCriteria: [
        {
          id: 'AC-1',
          text: "로그인 폼에 '카카오로 로그인' 버튼/링크를 노출한다",
          kind: 'rule',
          fnIds: ['flow:ANY /actions/Account.action', 'to-be:account/카카오-로그인-진입'],
          confidence: 'INFERRED',
          tests: [],
        },
      ],
      changeset: {
        added: ['to-be:account/카카오-로그인-진입'],
        modified: ['flow:ANY /actions/Account.action'],
        removed: [],
        revived: [],
      },
    },
  ],
}

describe('P2 인용 스키마 — 하위호환', () => {
  it('★ 인용 없는 기존 산출(rtm-requirements.json 실측 모양)이 그대로 파싱된다', () => {
    const out = parseIdentifiedIntake(LEGACY_NO_CITATION)
    const ac = out.requirements[0].acceptanceCriteria[0]
    // 인용 필드는 default 로 채우지 않는다 — "부재"와 "빈 배열"을 구별해야 하기 때문.
    expect(ac.evidence).toBeUndefined()
    expect(out.requirements[0].changeset.evidence).toBeUndefined()
    // 나머지 P2 축은 default 로 채워진다(불변식이 없어 3상태가 불필요).
    expect(ac.screenRefs).toEqual([])
    expect(ac.policyRefs).toEqual([])
    expect(out.requirements[0].screenRefs).toEqual([])
    expect(out.requirements[0].policyRefs).toEqual([])
  })

  it('★ 인용 없는 기존 산출은 error 를 유발하지 않는다(일괄 error 금지)', () => {
    const intake = parseIdentifiedIntake(LEGACY_NO_CITATION)
    expect(checkIntakeGrounding(intake, JPETSTORE_INV)).toEqual([])
    expect(checkIntakeGrounding(intake)).toEqual([])
  })

  it('★ 인용 필드가 부재면 CONFIRMED 라도 생략한다 — 낡은 산출을 소급 위반으로 만들지 않는다', () => {
    // 이게 default([]) 대신 optional 을 고른 이유다. default 였다면 이 건이 error 가 된다.
    const intake = parseIdentifiedIntake({
      ...LEGACY_NO_CITATION,
      requirements: [
        {
          ...LEGACY_NO_CITATION.requirements[0],
          acceptanceCriteria: [
            { id: 'AC-1', text: '로그인 폼에 버튼을 노출한다', confidence: 'CONFIRMED' },
          ],
        },
      ],
    })
    expect(intake.requirements[0].acceptanceCriteria[0].evidence).toBeUndefined()
    expect(checkIntakeGrounding(intake, JPETSTORE_INV)).toEqual([])
  })
})

describe('P2 근거↔신뢰도 불변식 — 인용 없는 확정 금지', () => {
  /** AC 1건짜리 산출을 만든다(인벤토리 대조에 걸릴 게 없는 최소 골격). */
  const withAc = (ac: Record<string, unknown>) =>
    parseIdentifiedIntake({
      request: { id: 'REQ-001', name: 'x', raw: 'y' },
      requirements: [{ id: 'SFR-001', category: 'SFR', name: 'n', acceptanceCriteria: [ac] }],
    })

  it('인용 있는 CONFIRMED 는 통과한다', () => {
    const intake = withAc({
      id: 'AC-1',
      text: '로그인 폼은 j_username·j_password 를 POST 한다',
      confidence: 'CONFIRMED',
      evidence: [
        { file: 'src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp', line: 12 },
        { file: 'src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java', line: 163 },
      ],
    })
    expect(checkIntakeGrounding(intake, JPETSTORE_INV)).toEqual([])
  })

  it('★ 인용이 명시적으로 빈 CONFIRMED 는 error 다', () => {
    const intake = withAc({
      id: 'AC-1',
      text: '카카오 로그인 시 기존 계정을 자동 연동한다',
      confidence: 'CONFIRMED',
      evidence: [],
    })
    const v = checkIntakeGrounding(intake, JPETSTORE_INV)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({
      kind: 'uncited-confirmed',
      level: 'error', // ← 차단(exit 2)
      reqId: 'SFR-001',
      field: 'acceptanceCriteria.AC-1.evidence',
      value: 'AC-1',
    })
  })

  it('인용이 비어도 CONFIRMED 로 단언하지 않으면 통과한다(TO-BE 추정은 정상)', () => {
    const intake = withAc({ id: 'AC-1', text: '카카오 버튼을 노출한다', evidence: [] })
    expect(intake.requirements[0].acceptanceCriteria[0].confidence).toBe('INFERRED') // default
    expect(checkIntakeGrounding(intake, JPETSTORE_INV)).toEqual([])
  })

  it('본문 [확정] 태그도 단언으로 본다(assertsConfirmed 재사용 — P1b 와 같은 판정)', () => {
    const intake = withAc({ id: 'AC-1', text: '[확정] SIGNON 은 평문 비밀번호를 쓴다', evidence: [] })
    expect(checkIntakeGrounding(intake, JPETSTORE_INV).map((x) => x.kind)).toEqual([
      'uncited-confirmed',
    ])
  })

  it('[확정(AI)] 는 걸리지 않는다(P1b 와 동일 — CONFIRMED_AI 는 허용)', () => {
    const intake = withAc({ id: 'AC-1', text: '[확정(AI)] 카카오 버튼을 노출한다', evidence: [] })
    expect(checkIntakeGrounding(intake, JPETSTORE_INV)).toEqual([])
  })

  it('★ 인벤토리 미주입이어도 검사한다(항목 자신만 보므로 인벤토리가 필요 없다)', () => {
    const intake = withAc({ id: 'AC-1', text: 'x', confidence: 'CONFIRMED', evidence: [] })
    expect(checkIntakeGrounding(intake).map((x) => x.kind)).toEqual(['uncited-confirmed'])
    expect(checkIntakeGrounding(intake, {}).map((x) => x.kind)).toEqual(['uncited-confirmed'])
  })
})

describe('P2 화면·정책 축 — 왕복', () => {
  /** AC-1 이 SignonForm 을 가리키고 §8 평문 비밀번호 쟁점을 참조하는 산출(설계서 §1.2 결함 해소). */
  const WITH_REFS = {
    request: { id: 'REQ-001', name: '카카오 로그인 기능 추가', raw: '카카오 로그인 기능 추가' },
    requirements: [
      {
        id: 'SFR-001',
        category: 'SFR',
        name: '카카오 소셜 로그인',
        screenRefs: [{ screenId: 'screen:actions/Account.action__signonForm' }],
        policyRefs: [
          {
            doc: 'policy-domain-account.md',
            section: '8',
            note: 'SIGNON.PASSWORD 평문 — OAuth 자동가입 설계 쟁점',
          },
        ],
        acceptanceCriteria: [
          {
            id: 'AC-1',
            text: "로그인 폼에 '카카오로 로그인' 버튼/링크를 노출한다",
            screenRefs: [
              {
                screenId: 'screen:actions/Account.action__signonForm',
                annotationNo: 1,
                note: '기존 로그인 버튼 아래',
              },
            ],
            policyRefs: [
              { doc: 'policy-domain-account.md', section: '4', ruleId: 'PL-001', note: '자격증명 불일치 차단' },
            ],
          },
        ],
      },
    ],
  }

  it('★ 화면·정책 축이 파싱→직렬화 왕복에서 보존된다', () => {
    const once = parseIdentifiedIntake(WITH_REFS)
    const twice = parseIdentifiedIntake(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once) // 왕복 고정점

    const ac = twice.requirements[0].acceptanceCriteria[0]
    expect(ac.screenRefs[0]).toEqual({
      screenId: 'screen:actions/Account.action__signonForm',
      annotationNo: 1,
      note: '기존 로그인 버튼 아래',
    })
    expect(ac.policyRefs[0]).toEqual({
      doc: 'policy-domain-account.md',
      section: '4',
      ruleId: 'PL-001',
      note: '자격증명 불일치 차단',
    })
    // 요구사항 레벨 축도 보존(AC 로 좁혀지지 않는 영향).
    expect(twice.requirements[0].screenRefs[0].screenId).toBe(
      'screen:actions/Account.action__signonForm',
    )
    expect(twice.requirements[0].policyRefs[0].section).toBe('8')
  })

  it('인용도 왕복에서 보존된다(부재는 부재로, 값은 값으로)', () => {
    const src = {
      ...WITH_REFS,
      requirements: [
        {
          ...WITH_REFS.requirements[0],
          changeset: {
            added: ['to-be:account/카카오-로그인-진입'],
            modified: [],
            removed: [],
            revived: [],
            evidence: [{ file: 'src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp', line: 12 }],
          },
          acceptanceCriteria: [
            {
              ...WITH_REFS.requirements[0].acceptanceCriteria[0],
              evidence: [{ file: 'x.java', line: null, snippet: 'signon()' }],
            },
          ],
        },
      ],
    }
    const once = parseIdentifiedIntake(src)
    const twice = parseIdentifiedIntake(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
    // line: null = 동적/불명(EvidenceSchema 계약). CitationSchema 였다면 표현 불가.
    expect(twice.requirements[0].acceptanceCriteria[0].evidence).toEqual([
      { file: 'x.java', line: null, snippet: 'signon()' },
    ])
    expect(twice.requirements[0].changeset.evidence).toHaveLength(1)
  })

  it('축 default — 미지정이면 빈 배열이고 기존 산출을 깨지 않는다', () => {
    const out = parseIdentifiedIntake(STEP1_ONLY)
    expect(out.requirements[0].screenRefs).toEqual([])
    expect(out.requirements[0].acceptanceCriteria[0].policyRefs).toEqual([])
    expect(out.requirements[1].screenRefs).toEqual([])
  })

  it('screenId 빈 문자열은 거부한다(조인 키라 빈 값이면 못 가리킨다)', () => {
    expect(() =>
      parseIdentifiedIntake({
        request: { id: 'REQ-1', name: 'x', raw: 'y' },
        requirements: [{ id: 'SFR-1', category: 'SFR', name: 'n', screenRefs: [{ screenId: '' }] }],
      }),
    ).toThrow(/identified\.json 검증 실패/)
  })
})
