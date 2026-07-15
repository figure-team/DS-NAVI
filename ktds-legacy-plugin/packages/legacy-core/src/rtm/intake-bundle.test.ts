/**
 * intake-bundle(P3 근거 번들 v1) 단위 테스트 — 사전 필터·유계 요약·정직한 생략·결정론.
 *
 * 픽스처는 `examples/jpetstore-6` 실측 구조를 축소 재현한다(키 이름·중첩이 실물과 동일해야
 * 의미가 있다 — 실물 키를 잘못 짚으면 조용히 빈 번들이 나온다).
 */
import { describe, it, expect } from 'vitest'
import {
  buildIntakeInputBundle,
  checkMinimalSet,
  tokenizeRequest,
  serializeIntakeBundle,
  allocateAxisBudget,
  parsePolicyMarkdown,
  DEFAULT_BUNDLE_CHAR_CAP,
  SAMPLE_FILES_MAX,
  FALLBACK_TOP_N,
  AXIS_BUDGET,
} from './intake-bundle.js'

const REQUEST = '카카오 로그인 기능 추가'

function domainGraph() {
  return {
    version: 1,
    ktdsMap: { generatedFromCommit: 'dfbb9822' },
    project: { gitCommitHash: 'dfbb9822' },
    nodes: [
      {
        id: 'domain:account',
        name: '계정/회원',
        type: 'domain',
        tags: ['account'],
        summary: '계정 도메인',
        domainMeta: {
          entities: ['Account는 로그인 자격증명을 운반한다.'],
          businessRules: ['로그인은 AccountService.getAccount 로 검증한다.'],
          businessFlows: [{ fillIndex: 0, nodes: [{ id: 's', kind: 'start', label: '시작' }], edges: [] }],
          ktdsClaims: [
            { kind: 'summary', ref: 'domain:account', text: '계정 도메인 요약', verdict: 'GROUNDED', citations: [{ filePath: 'A.java', line: 43, snippet: 'class A', status: 'ok' }] },
            { kind: 'rule', ref: 'domain:account', text: '근거 없는 주장', verdict: 'REVIEW', citations: [] },
          ],
          groundedCount: 1,
          groundedPct: 50,
          reviewCount: 1,
        },
      },
      { id: 'flow:signon', name: '로그인 처리', type: 'flow', tags: ['account'], filePath: 'AccountActionBean.java', summary: '로그인' },
      { id: 'step:signon-1', name: '계정 조회', type: 'step', tags: ['account'], filePath: 'AccountActionBean.java', summary: '조회' },
      { id: 'step:signon-2', name: '세션 세팅', type: 'step', tags: ['account'], filePath: 'AccountSession.java', summary: '세션' },
      {
        id: 'domain:cart',
        name: '장바구니',
        type: 'domain',
        tags: ['cart'],
        summary: '장바구니 도메인',
        domainMeta: { entities: [], businessRules: [], businessFlows: [], ktdsClaims: [], groundedPct: 0 },
      },
      { id: 'flow:cart', name: '장바구니 조회', type: 'flow', tags: ['cart'], filePath: 'CartActionBean.java', summary: '카트' },
    ],
    edges: [],
  }
}

function dbSchema() {
  return {
    schemaVersion: 1,
    gitCommit: 'dfbb9822',
    tables: [
      {
        name: 'SIGNON',
        relPath: 'schema.sql',
        line: 30,
        primaryKey: ['username'],
        columns: [
          { name: 'username', type: 'varchar(25)', nullable: false, primaryKey: false, line: 31 },
          { name: 'password', type: 'varchar(25)', nullable: false, primaryKey: false, line: 32 },
        ],
        foreignKeys: [],
        rowCount: 4,
        rows: [{ line: 170, values: { username: 'j2ee', password: 'j2ee' } }],
      },
      {
        name: 'ACCOUNT',
        relPath: 'schema.sql',
        line: 10,
        primaryKey: ['userid'],
        columns: [{ name: 'userid', type: 'varchar(80)', nullable: false, primaryKey: true, line: 11 }],
        foreignKeys: [],
        rowCount: 0,
        rows: [],
      },
      { name: 'ORDERS', relPath: 'schema.sql', line: 90, primaryKey: [], columns: [], foreignKeys: [], rowCount: 0, rows: [] },
    ],
  }
}

function crudMatrix() {
  return {
    schemaVersion: 1,
    gitCommit: 'dfbb9822',
    columns: ['기능', 'ACCOUNT', 'ORDERS', 'SIGNON'],
    rows: [
      { cells: ['로그인 처리', 'R', '', 'R'], confidence: 'CONFIRMED', evidence: [{ file: 'AccountMapper.xml', line: 26 }] },
      { cells: ['계정 기본 진입(로그인 폼)', '', '', ''], confidence: 'INFERRED', evidence: [] },
      { cells: ['주문 생성', '', 'C', ''], confidence: 'CONFIRMED', evidence: [{ file: 'OrderMapper.xml', line: 12 }] },
    ],
  }
}

function rtm() {
  return {
    schemaVersion: 1,
    gitCommit: 'dfbb9822',
    domains: [{ id: 'domain:account', name: '계정/회원' }],
    functions: [
      {
        id: 'flow:ANY /actions/Account.action?signon',
        name: '로그인 처리',
        domainId: 'domain:account',
        domainName: '계정/회원',
        entryPoint: { value: 'ANY /actions/Account.action?signon', confidence: 'CONFIRMED', evidence: [{ file: 'AccountActionBean.java', line: 158 }] },
        implementation: { value: 'AccountActionBean', confidence: 'CONFIRMED', evidence: [{ file: 'AccountActionBean.java', line: 158 }] },
        data: { value: '', confidence: 'INFERRED', evidence: [] },
        origin: 'AS_IS',
        state: 'IMPLEMENTED',
      },
      {
        id: 'flow:ANY /actions/Account.action?newAccount',
        name: '신규 계정 등록 처리',
        domainId: 'domain:account',
        domainName: '계정/회원',
        entryPoint: { value: 'x', confidence: 'CONFIRMED', evidence: [{ file: 'AccountActionBean.java', line: 120 }] },
        implementation: { value: 'AccountActionBean', confidence: 'CONFIRMED', evidence: [] },
        origin: 'AS_IS',
        state: 'IMPLEMENTED',
      },
      {
        id: 'flow:ANY /actions/Order.action',
        name: '주문 생성',
        domainId: 'domain:order',
        domainName: '주문',
        entryPoint: { value: 'y', confidence: 'CONFIRMED', evidence: [] },
        implementation: { value: 'OrderActionBean', confidence: 'CONFIRMED', evidence: [] },
        origin: 'AS_IS',
        state: 'IMPLEMENTED',
      },
    ],
  }
}

// ── P4 픽스처(화면·정책) ─────────────────────────────────────────────────────
// 실측 구조 축소 재현: screens.json 의 annotation 은 `handler.evidence[].snippet` 을 **이미**
// 갖고 있다(= pre-cite 리프트 원천). 정책서는 frontmatter + `## N. 제목` + 표 구조.

function screens() {
  return {
    schemaVersion: 1,
    gitCommit: 'c81c91ae',
    screens: [
      {
        id: 'screen:actions/Account.action__signonForm',
        jspFile: 'src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp',
        title: '로그인',
        domain: 'account',
        url: 'actions/Account.action?signonForm=',
        summary: { text: '아이디/비밀번호로 로그인하는 화면.', confidence: 'CONFIRMED' },
        annotations: [
          // 공통 헤더(남의 액션) — DOM 상 **앞**이지만 관련도는 꼴찌라 제일 먼저 양보해야 한다.
          {
            no: 1,
            label: 'a',
            eventType: 'link',
            selector: '#MenuContent > a:nth-of-type(1)',
            bbox: { x: 578, y: 34, width: 16, height: 21 },
            description: '장바구니 화면을 조회한다.',
            mechanical: { tag: 'a', href: '/jpetstore/actions/Cart.action?viewCart=', formAction: null, inputType: null, required: false },
            handler: {
              target: 'CartActionBean#viewCart',
              confidence: 'CONFIRMED',
              evidence: [{ file: 'CartActionBean.java', line: 137, snippet: 'public ForwardResolution viewCart() {' }],
            },
          },
          // 화면 자기 폼 — 핸들러도 토큰도 없지만 **삽입 지점 판단에 필수**(rank 2 형 입력).
          {
            no: 2,
            label: 'username',
            eventType: 'input',
            selector: '#stripes-1932365029',
            bbox: { x: 100, y: 200, width: 120, height: 20 },
            description: '아이디 입력.',
            mechanical: { tag: 'input', inputType: 'text', name: 'username', formAction: '/jpetstore/actions/Account.action', formMethod: 'POST', href: null },
            handler: null,
          },
          // 토큰 매치(설명에 "로그인") — rank 0.
          {
            no: 3,
            label: 'Login',
            eventType: 'submit',
            selector: '#Catalog > form > input',
            bbox: { x: 100, y: 260, width: 60, height: 24 },
            description: '입력한 아이디/비밀번호로 로그인한다.',
            mechanical: { tag: 'input', inputType: 'submit', name: 'signon', formAction: '/jpetstore/actions/Account.action', formMethod: 'POST', href: null },
            handler: {
              target: 'AccountActionBean#signon',
              confidence: 'CONFIRMED',
              evidence: [{ file: 'AccountActionBean.java', line: 161, snippet: 'account = accountService.getAccount(getUsername(), getPassword());' }],
            },
          },
        ],
      },
      {
        id: 'screen:actions/Cart.action__viewCart',
        jspFile: 'src/main/webapp/WEB-INF/jsp/cart/Cart.jsp',
        title: '장바구니',
        domain: 'cart',
        url: 'actions/Cart.action?viewCart=',
        summary: { text: '장바구니 화면.', confidence: 'CONFIRMED' },
        annotations: [],
      },
    ],
  }
}

/** 실측 policy-domain-account.md 축소판 — §8 미결이 **요청 토큰을 하나도 안 갖는 것**이 핵심. */
const POLICY_ACCOUNT_MD = `---
docId: policy-domain-account
title: 계정/회원 정책 정의서
methodology: domain-policy
status: DRAFT
sourceCommit: null
evidenceRate: 0.4090909090909091
---

# 계정/회원 정책 정의서

## 0. 문서 정보

| 항목 | 내용 | 신뢰도 | 근거 |
| --- | --- | --- | --- |
| 문서명 | 계정/회원 정책 정의서 | [추정] |  |

## 4. 정책 규칙 — 의사결정 테이블

| 정책 ID | 정책명 | 적용 조건 (IF) | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| PL-001 | 자격증명 불일치 로그인 차단 | account == null | [확정] | \`AccountActionBean.java:163\` |

## 8. 미결 사항

| No | 이슈 | 상태 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
| 1 | 비밀번호 정책이 코드에 명문화되어 있지 않음 — SIGNON.PASSWORD는 varchar(25) 평문 컬럼이며 해시/솔트 처리 로직은 발견되지 않음 | 미검토 | [확인 필요] | \`jpetstore-hsqldb-schema.sql:30-34\`, \`AccountMapper.xml:52-77,122-130\` |
`

/** §4.1 의 함정 — 표 **헤더만 있고 데이터 행 0건**(Stripes @Validate 를 스캐너가 못 봄). */
const POLICY_AUTHZ_MD = `---
docId: policy-authz
title: 권한 정책
methodology: policy
status: DRAFT
sourceCommit: ffe1992c
evidenceRate: 0
---

# 권한 정책

## 권한 통제 지점

| 대상 | 권한 어노테이션 | 범위 | 신뢰도 | 근거 |
| --- | --- | --- | --- | --- |
`

function policyDocs() {
  return [
    { relPath: '.understand-anything/doc-output/policy-authz.md', markdown: POLICY_AUTHZ_MD },
    { relPath: '.understand-anything/doc-output/policy-domain-account.md', markdown: POLICY_ACCOUNT_MD },
  ]
}

function sources() {
  return { domainGraph: domainGraph(), dbSchema: dbSchema(), crudMatrix: crudMatrix(), rtm: rtm() }
}

/** P4 5축 전량(화면·정책 포함). */
function sourcesV2() {
  return { ...sources(), screens: screens(), policyDocs: policyDocs() }
}

describe('tokenizeRequest', () => {
  it('의도 동사·범용어를 떨어내고 판별 토큰만 남긴다', () => {
    // "기능"·"추가"가 살아남으면 모든 항목에 매치돼 필터가 무의미해진다.
    expect(tokenizeRequest(REQUEST)).toEqual(['로그인', '카카오'])
  })

  it('정렬 고정 + 중복 제거 — 어순이 달라도 같은 토큰집합(결정론)', () => {
    expect(tokenizeRequest('로그인 카카오 로그인 추가')).toEqual(['로그인', '카카오'])
  })

  it('영문은 소문자화하고 1글자는 버린다', () => {
    expect(tokenizeRequest('Add OAuth to SIGNON')).toEqual(['oauth', 'signon'])
  })

  it('전부 불용어면 빈 배열 — 폴백 경로로 넘어간다', () => {
    expect(tokenizeRequest('기능 추가 해주세요')).toEqual([])
  })
})

describe('checkMinimalSet', () => {
  it('3축 전부 있으면 통과', () => {
    expect(checkMinimalSet(sources())).toEqual({ ok: true, missing: [] })
  })

  it('축이 빠지면 무엇이 없는지 이름으로 알린다(fail-closed 의 근거)', () => {
    const r = checkMinimalSet({ domainGraph: null, dbSchema: null, crudMatrix: null, rtm: null })
    expect(r.ok).toBe(false)
    expect(r.missing).toHaveLength(3) // crud-matrix 는 데이터 축의 하위 소스라 최소집합이 아니다
    expect(r.missing.join('\n')).toContain('domain-graph.json')
    expect(r.missing.join('\n')).toContain('db-schema.json')
    expect(r.missing.join('\n')).toContain('rtm.json')
  })

  it('crud-matrix 만 없으면 최소집합은 통과(축 부재가 아니라 하위 소스 부재)', () => {
    expect(checkMinimalSet({ ...sources(), crudMatrix: null }).ok).toBe(true)
  })
})

describe('buildIntakeInputBundle — 사전 필터(카카오 로그인)', () => {
  it('account 도메인만 고르고 cart 는 뺀다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.axes.domain.items.map((d) => d.id)).toEqual(['domain:account'])
    expect(b.axes.domain.total).toBe(2)
    expect(b.axes.domain.omittedCount).toBe(1)
    expect(b.axes.domain.items[0].matchedTokens).toEqual(['로그인'])
  })

  it('"로그인 처리" CRUD 행을 고르고 "주문 생성"은 뺀다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.axes.data.crud.items.map((r) => r.feature)).toEqual(['로그인 처리', '계정 기본 진입(로그인 폼)'])
  })

  it('CRUD 행의 비어있지 않은 셀만 싣는다(13열 전량 금지)', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    const login = b.axes.data.crud.items.find((r) => r.feature === '로그인 처리')!
    expect(login.cells).toEqual([
      { table: 'ACCOUNT', ops: 'R' },
      { table: 'SIGNON', ops: 'R' },
    ])
    // ★ 실측 계약: 로그인은 SIGNON 을 **R(읽기)만** 한다. 인테이크가 지어낸 `SIGNON(CR)` 의 반증.
    expect(login.confidence).toBe('CONFIRMED')
    expect(login.evidence).toEqual([{ file: 'AccountMapper.xml', line: 26 }])
  })

  it('테이블은 CRUD 조인으로 좁힌다 — SIGNON·ACCOUNT 는 들어오고 ORDERS 는 빠진다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.axes.data.schema.items.map((t) => t.name)).toEqual(['ACCOUNT', 'SIGNON'])
    expect(b.axes.data.schema.items.find((t) => t.name === 'SIGNON')!.selectedBy).toEqual(['crud'])
  })

  it('요청이 테이블명을 직접 부르면 token 으로도 잡는다', () => {
    const b = buildIntakeInputBundle(sources(), { request: 'ORDERS 테이블에 컬럼 추가' })
    const orders = b.axes.data.schema.items.find((t) => t.name === 'ORDERS')!
    expect(orders.selectedBy).toContain('token')
  })

  it('스키마는 컬럼·PK·line 을 싣고 시드 데이터 행은 개수만 싣는다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    const signon = b.axes.data.schema.items.find((t) => t.name === 'SIGNON')!
    expect(signon.primaryKey).toEqual(['username'])
    expect(signon.columns).toEqual([
      { name: 'username', type: 'varchar(25)', nullable: false, primaryKey: false, line: 31 },
      { name: 'password', type: 'varchar(25)', nullable: false, primaryKey: false, line: 32 },
    ])
    expect(signon.rowCount).toBe(4)
    expect(JSON.stringify(signon)).not.toContain('j2ee') // 시드 값은 새어나오면 안 된다
  })

  it('추적표는 토큰 매치 + 선정 도메인 확장으로 고르고 출처를 남긴다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.axes.rtm.items.map((f) => [f.name, f.selectedBy])).toEqual([
      ['로그인 처리', 'token'],
      ['신규 계정 등록 처리', 'domain'], // 카카오 자동가입 설계에 필요한데 토큰으론 안 잡힌다
    ])
    expect(b.axes.rtm.items[0].entryPoint.evidence).toEqual([{ file: 'AccountActionBean.java', line: 158 }])
  })

  it('토큰 매치가 도메인 확장보다 앞에 온다(캡에 잘릴 때 확장분이 먼저 빠지도록)', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.axes.rtm.items[0].selectedBy).toBe('token')
  })

  it('도메인 파일 귀속은 step/flow 의 filePath 에서 온다(domain 노드엔 filePath 가 없다)', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    const acc = b.axes.domain.items[0]
    expect(acc.sampleFiles).toEqual(['AccountActionBean.java', 'AccountSession.java'])
    expect(acc.fileCount).toBe(2)
    expect(acc.counts).toMatchObject({ flows: 1, steps: 2 })
  })
})

describe('buildIntakeInputBundle — §4.1 빈 산출물 오독 방지', () => {
  it('각 축에 항목수와 근거율(분자·분모 포함)을 동봉한다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    // 도메인: claim 2건 중 1건만 citation 있음
    expect(b.axes.domain.evidence).toEqual({ cited: 1, total: 2, rate: 0.5 })
    // CRUD: 2행 중 1행만 evidence — "권한 통제 없음" 오독을 막는 바로 그 신호
    expect(b.axes.data.crud.evidence).toEqual({ cited: 1, total: 2, rate: 0.5 })
    // 추적표: entryPoint/implementation 4셀 중 3셀에 근거
    expect(b.axes.rtm.evidence).toEqual({ cited: 3, total: 4, rate: 0.75 })
  })

  it('잴 것이 0건이면 rate 는 0 이 아니라 null 이다("근거 없음" ≠ "잴 것 없음")', () => {
    const s = sources()
    s.crudMatrix.rows = []
    const b = buildIntakeInputBundle(s, { request: REQUEST })
    expect(b.axes.data.crud.evidence).toEqual({ cited: 0, total: 0, rate: null })
    expect(b.warnings.join('\n')).toContain('근거 없음')
  })

  it('축 소스가 없으면 present:false + "못 봤습니다" 로 표기한다', () => {
    const b = buildIntakeInputBundle({ ...sources(), crudMatrix: null }, { request: REQUEST })
    expect(b.axes.data.crud.present).toBe(false)
    expect(b.axes.data.crud.reason).toContain('못 봤습니다')
    expect(b.warnings.join('\n')).toContain('"없음"으로 읽지 마십시오')
  })
})

describe('buildIntakeInputBundle — §7 C7 필터 실패 폴백', () => {
  it('토큰이 어디에도 안 맞으면 상위 N + 사유를 보고한다(조용히 비우지 않는다)', () => {
    const b = buildIntakeInputBundle(sources(), { request: '전혀무관한요청어' })
    expect(b.filter.mode).toBe('fallback')
    expect(b.axes.domain.items.map((d) => d.id)).toEqual(['domain:account', 'domain:cart'])
    expect(b.axes.domain.reason).toContain('폴백')
    expect(b.filter.fallbacks).toHaveLength(4)
  })

  it('폴백은 상위 N 으로 유계다', () => {
    const s = sources()
    s.crudMatrix.rows = Array.from({ length: 40 }, (_, i) => ({ cells: [`무관기능${String(i).padStart(2, '0')}`, '', '', ''], confidence: 'INFERRED', evidence: [] }))
    const b = buildIntakeInputBundle(s, { request: '전혀무관한요청어' })
    expect(b.axes.data.crud.items).toHaveLength(FALLBACK_TOP_N.crudRows)
    expect(b.axes.data.crud.total).toBe(40)
  })

  it('일부 축만 폴백하면 mode 는 mixed', () => {
    // "로그인"은 도메인·CRUD·추적표엔 맞지만 테이블명엔 안 맞는다 → 스키마는 CRUD 조인으로 살아난다.
    // 스키마 조인마저 끊으려면 CRUD 를 비워야 한다.
    const s = sources()
    s.crudMatrix.rows = [{ cells: ['주문 생성', '', 'C', ''], confidence: 'CONFIRMED', evidence: [] }]
    const b = buildIntakeInputBundle(s, { request: REQUEST })
    expect(b.filter.mode).toBe('mixed')
    expect(b.axes.domain.reason).toBeNull() // 도메인은 여전히 토큰으로 좁혀졌다
    expect(b.axes.data.crud.reason).toContain('폴백')
  })
})

describe('buildIntakeInputBundle — §10-2 커밋 불일치', () => {
  it('전 축 커밋이 같으면 consistent:true, note 없음', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.commits.consistent).toBe(true)
    expect(b.commits.note).toBeNull()
  })

  it('커밋이 어긋나도 차단하지 않고 사실만 싣는다(강등 규칙은 P5 소관)', () => {
    const s = sources()
    s.dbSchema.gitCommit = 'a741cce0'
    const b = buildIntakeInputBundle(s, { request: REQUEST })
    expect(b.commits.consistent).toBe(false)
    expect(b.commits.note).toContain('차단하지 않습니다')
    expect(b.commits.note).toContain('a741cce0')
    expect(b.warnings.join('\n')).toContain('[추정]')
  })

  it('스탬프가 null 인 축은 불일치 계산에서 빠진다(§5.2 스탬프 누수 이력)', () => {
    const s = sources()
    s.rtm.gitCommit = null as unknown as string
    const b = buildIntakeInputBundle(s, { request: REQUEST })
    expect(b.commits.rtm).toBeNull()
    expect(b.commits.consistent).toBe(true)
  })
})

describe('buildIntakeInputBundle — 유계성·정직한 생략', () => {
  it('기본 charCap 안에 들어온다 — **디스크에 쓰는 형태** 기준', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(serializeIntakeBundle(b).length).toBeLessThanOrEqual(DEFAULT_BUNDLE_CHAR_CAP)
    expect(b.charCap).toEqual({ limit: DEFAULT_BUNDLE_CHAR_CAP, exceeded: false })
    expect(b.omitted).toEqual([])
  })

  it('sampleFiles 는 SAMPLE_FILES_MAX 로 자르고 fileCount 는 전체를 센다(group-input 계약)', () => {
    const s = sources()
    for (let i = 0; i < 20; i++) {
      s.domainGraph.nodes.push({ id: `step:x${i}`, name: '로그인 보조', type: 'step', tags: ['account'], filePath: `F${String(i).padStart(2, '0')}.java`, summary: '' } as never)
    }
    const b = buildIntakeInputBundle(s, { request: REQUEST })
    const acc = b.axes.domain.items[0]
    expect(acc.sampleFiles).toHaveLength(SAMPLE_FILES_MAX)
    expect(acc.fileCount).toBe(22) // 카운트는 전량 — 전량을 싣지 않을 뿐 세지 않는 게 아니다
  })

  it('charCap 초과분은 조용히 버리지 않고 omitted[] 로 보고한다', () => {
    const s = sources()
    const meta = s.domainGraph.nodes[0].domainMeta!
    meta.ktdsClaims = Array.from({ length: 30 }, (_, i) => ({
      kind: 'rule',
      ref: `claim-${i}`,
      text: '로그인 관련 주장 '.repeat(20),
      verdict: 'GROUNDED',
      citations: [{ filePath: 'AccountActionBean.java', line: i, snippet: 'x'.repeat(80), status: 'ok' }],
    }))
    const b = buildIntakeInputBundle(s, { request: REQUEST, charCap: 12_000 })
    expect(serializeIntakeBundle(b).length).toBeLessThanOrEqual(12_000)
    expect(b.omitted.length).toBeGreaterThan(0)
    expect(b.omitted.join('\n')).toContain('domain:account')
    expect(b.charCap.exceeded).toBe(false)
  })

  it('트림 후 축 카운터가 실제 실린 수와 일치한다(카운터가 거짓이면 오독 방지가 무너진다)', () => {
    const s = sources()
    const meta = s.domainGraph.nodes[0].domainMeta!
    meta.ktdsClaims = Array.from({ length: 30 }, (_, i) => ({ kind: 'rule', ref: `c${i}`, text: 'x'.repeat(300), verdict: 'GROUNDED', citations: [] }))
    const b = buildIntakeInputBundle(s, { request: REQUEST, charCap: 5_000 })
    expect(b.axes.rtm.selected).toBe(b.axes.rtm.items.length)
    expect(b.axes.data.schema.selected).toBe(b.axes.data.schema.items.length)
    expect(b.axes.data.crud.selected).toBe(b.axes.data.crud.items.length)
  })

  it('businessFlows 를 claims 보다 먼저 버린다(pre-cite 페이로드를 늦게까지 지킨다)', () => {
    const s = sources()
    const meta = s.domainGraph.nodes[0].domainMeta!
    meta.businessFlows = [{ nodes: Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, label: 'x'.repeat(60) })), edges: [] }]
    // flows(대용량)만 떨구면 들어맞는 예산 — claims 는 살아남아야 한다(pre-cite 보호).
    const b = buildIntakeInputBundle(s, { request: REQUEST, charCap: 9_000 })
    expect(b.omitted[0]).toContain('businessFlows')
    expect(b.axes.domain.items[0].businessFlows).toHaveLength(0)
    expect(b.axes.domain.items[0].claims.length).toBeGreaterThan(0)
  })

  it('★ 캡은 기록 형태를 잰다 — compact 로 재고 pretty 로 쓰면 파일이 예산의 ~1.75배가 된다', () => {
    const s = sources()
    const meta = s.domainGraph.nodes[0].domainMeta!
    meta.ktdsClaims = Array.from({ length: 60 }, (_, i) => ({
      kind: 'rule',
      ref: `c${i}`,
      text: '로그인 주장 '.repeat(15),
      verdict: 'GROUNDED',
      citations: [{ filePath: 'AccountActionBean.java', line: i, snippet: 'y'.repeat(60), status: 'ok' }],
    }))
    const b = buildIntakeInputBundle(s, { request: REQUEST, charCap: 8_000 })
    // 실제로 디스크에 나가는 바이트가 예산 안이어야 한다(LLM 이 읽는 건 파일이다).
    expect(serializeIntakeBundle(b).length).toBeLessThanOrEqual(8_000)
    expect(b.omitted.length).toBeGreaterThan(0)
  })

  it('★ 트림은 관련도 **역순**으로 — 1순위 도메인의 pre-cite 근거가 끝까지 남는다', () => {
    // 회귀 방지: 정순으로 털면 1순위(account)가 0건이 되고 말순위(cart)가 온전히 남는다.
    // 실측 사고였다(jpetstore: account claims 55→0, order 는 생존).
    const s = sources()
    const mkClaims = (tag: string) =>
      Array.from({ length: 25 }, (_, i) => ({
        kind: 'rule',
        ref: `${tag}-${i}`,
        text: `${tag} 주장 `.repeat(12),
        verdict: 'GROUNDED',
        citations: [{ filePath: 'A.java', line: i, snippet: 'z'.repeat(50), status: 'ok' }],
      }))
    s.domainGraph.nodes[0].domainMeta!.ktdsClaims = mkClaims('account')
    // cart 도 "로그인" 을 물게 해서 2순위로 선정시킨다(account 가 토큰 구체성으로 1순위 유지).
    const cart = s.domainGraph.nodes[4] as { summary: string; domainMeta: { ktdsClaims: unknown[] } }
    cart.summary = '장바구니 도메인 — 로그인 필요'
    cart.domainMeta.ktdsClaims = mkClaims('cart')

    const b = buildIntakeInputBundle(s, { request: REQUEST, charCap: 20_000 })
    const account = b.axes.domain.items.find((d) => d.id === 'domain:account')!
    const cartOut = b.axes.domain.items.find((d) => d.id === 'domain:cart')!
    expect(b.axes.domain.items[0].id).toBe('domain:account') // 관련도 1순위
    expect(account.claims.length).toBeGreaterThan(0) // 1순위 근거는 살아남아야 한다
    expect(account.claims.length).toBeGreaterThanOrEqual(cartOut.claims.length)
    expect(b.omitted.join('\n')).toContain('domain:cart claims') // 말순위부터 잘렸다
  })

  it('전부 잘라도 예산을 못 맞추면 exceeded:true 로 사실을 남긴다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST, charCap: 10 })
    expect(b.charCap.exceeded).toBe(true)
  })
})

describe('buildIntakeInputBundle — 결정론', () => {
  it('같은 입력 → 같은 바이트(2회 실행 diff 0)', () => {
    const a = JSON.stringify(buildIntakeInputBundle(sources(), { request: REQUEST }), null, 2)
    const b = JSON.stringify(buildIntakeInputBundle(sources(), { request: REQUEST }), null, 2)
    expect(a).toBe(b)
  })

  it('입력 노드 순서가 바뀌어도 같은 바이트', () => {
    const a = buildIntakeInputBundle(sources(), { request: REQUEST })
    const s = sources()
    s.domainGraph.nodes.reverse()
    s.dbSchema.tables.reverse()
    const b = buildIntakeInputBundle(s, { request: REQUEST })
    expect(JSON.stringify(b.axes.domain.items.map((d) => d.id))).toBe(JSON.stringify(a.axes.domain.items.map((d) => d.id)))
    expect(JSON.stringify(b.axes.data.schema)).toBe(JSON.stringify(a.axes.data.schema))
  })

  it('시각·난수 등 비결정 값을 담지 않는다(재현성)', () => {
    const json = serializeIntakeBundle(buildIntakeInputBundle(sources(), { request: REQUEST }))
    expect(json).not.toMatch(/"(generatedAt|timestamp|createdAt|runId)"/)
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })
})

describe('buildIntakeInputBundle — 손상 입력 방어', () => {
  it('노드·테이블이 쓰레기여도 죽지 않고 빈 축을 정직하게 낸다', () => {
    const b = buildIntakeInputBundle(
      { domainGraph: { nodes: [null, 42, { id: 1 }] }, dbSchema: { tables: 'nope' }, crudMatrix: { rows: [{}] }, rtm: { functions: [{}] } },
      { request: REQUEST },
    )
    expect(b.axes.domain.items).toEqual([])
    expect(b.axes.data.schema.items).toEqual([])
    expect(b.axes.rtm.items).toEqual([])
  })

  it('minimalSet 결과를 번들에 그대로 싣는다(호출자가 exit 2 판단에 쓴다)', () => {
    const b = buildIntakeInputBundle({ domainGraph: null, dbSchema: dbSchema(), crudMatrix: null, rtm: rtm() }, { request: REQUEST })
    expect(b.minimalSet.ok).toBe(false)
    expect(b.minimalSet.missing.join()).toContain('domain-graph.json')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// P4(v2) — 화면·정책 축 + pre-cite + 축별 예산 배분
// ════════════════════════════════════════════════════════════════════════════

describe('P4 화면 축', () => {
  it('요청 토큰·도메인 조인으로 화면을 고르고 무관한 화면은 뺀다', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    expect(b.axes.screens.present).toBe(true)
    expect(b.axes.screens.items.map((s) => s.id)).toEqual(['screen:actions/Account.action__signonForm'])
    expect(b.axes.screens.total).toBe(2)
    expect(b.axes.screens.gitCommit).toBe('c81c91ae')
  })

  it('★ annotation 에 pre-cite(실제 스니펫)를 동봉한다 — LLM 이 인용을 지어내지 않게', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const login = b.axes.screens.items[0].annotations.find((a) => a.label === 'Login')!
    expect(login.handler!.evidence).toEqual([
      {
        file: 'AccountActionBean.java',
        line: 161,
        snippet: 'account = accountService.getAccount(getUsername(), getPassword());',
      },
    ])
  })

  it('DOM 삽입 지점(selector·bbox)을 싣는다 — "카카오 버튼을 어디에 넣나"의 답', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const login = b.axes.screens.items[0].annotations.find((a) => a.label === 'Login')!
    expect(login.selector).toBe('#Catalog > form > input')
    expect(login.bbox).toEqual({ x: 100, y: 260, width: 60, height: 24 })
  })

  it('★ annotation 은 DOM 순서가 아니라 관련도 순 — 토큰 → 자기 액션 → 폼입력 → 공통 내비', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    // 픽스처의 DOM 순서는 [장바구니 링크, username, Login] 인데 관련도 순은 [Login, username, 장바구니].
    // 이게 뒤집히면 캡에 잘릴 때 **로그인 폼이 먼저 죽고 남의 도메인 내비만 남는다**(실측 사고).
    expect(b.axes.screens.items[0].annotations.map((a) => a.label)).toEqual(['Login', 'username', 'a'])
  })

  it('mechanical 의 null·기본값 필드는 떨어낸다(원본은 null 8개 — 예산 낭비)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const username = b.axes.screens.items[0].annotations.find((a) => a.label === 'username')!
    expect(username.mechanical).toEqual({
      formAction: '/jpetstore/actions/Account.action',
      formMethod: 'POST',
      inputType: 'text',
      name: 'username',
      tag: 'input',
    })
  })

  it('annotationCount 는 전량을 세고 annotations 는 실린 것만(§4.1 정직 보고)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const s = b.axes.screens.items[0]
    expect(s.annotationCount).toBe(3)
    expect(s.annotations.length).toBeLessThanOrEqual(s.annotationCount)
  })
})

describe('P4 정책 축', () => {
  it('★ 절은 토큰이 아니라 **종류 우선순위**로 고른다 — §8 미결이 요청 토큰을 하나도 안 갖기 때문', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const acct = b.axes.policy.items.find((d) => d.docId === 'policy-domain-account')!
    // 토큰 우선이면 "로그인"이 든 §4 만 살고 §8(평문 password)이 탈락한다 — 설계서 §1.2 가
    // 지적한 "(누락) password 처리 미설계"의 재발. 미결이 **첫 번째**여야 한다.
    expect(acct.sections[0].heading).toBe('8. 미결 사항')
    expect(acct.sections[0].rank).toBe(0)
  })

  it('★ 평문 password 미결이 근거·신뢰도와 함께 번들에 들어온다(카카오 설계의 핵심 쟁점)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const acct = b.axes.policy.items.find((d) => d.docId === 'policy-domain-account')!
    const row = acct.sections.flatMap((s) => s.rows).find((r) => r.cells.some((c) => c.includes('평문')))!
    expect(row).toBeDefined()
    expect(row.cells.some((c) => c.includes('varchar(25) 평문 컬럼') && c.includes('해시/솔트'))).toBe(true)
    expect(row.confidence).toBe('[확인 필요]')
    // 근거 열 → pre-cite 참조(스니펫은 정책서가 안 갖고 있으므로 null — 정직 보고).
    expect(row.evidence).toEqual([
      { file: 'jpetstore-hsqldb-schema.sql', line: 30, snippet: null },
      { file: 'AccountMapper.xml', line: 52, snippet: null },
    ])
  })

  it('frontmatter 를 판독하고 도메인 조인으로 정책서를 고른다', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const acct = b.axes.policy.items.find((d) => d.docId === 'policy-domain-account')!
    expect(acct.title).toBe('계정/회원 정책 정의서')
    expect(acct.selectedBy).toContain('domain')
    expect(acct.declaredEvidenceRate).toBeCloseTo(0.409, 3)
    expect(acct.sourceCommit).toBeNull() // 실측: 도메인 정책서는 P0b 미완이라 null
  })

  it('parsePolicyMarkdown 은 절·표·우선순위를 결정론으로 뽑는다', () => {
    const p = parsePolicyMarkdown(POLICY_ACCOUNT_MD)
    expect(p.frontmatter.docId).toBe('policy-domain-account')
    expect(p.sections.map((s) => s.heading)).toEqual(['0. 문서 정보', '4. 정책 규칙 — 의사결정 테이블', '8. 미결 사항'])
    expect(p.sections.map((s) => s.rank)).toEqual([9, 1, 0]) // 보일러플레이트 9 · 정책규칙 1 · 미결 0
    expect(p.sections[2].rows).toHaveLength(1)
    expect(p.sections[2].columns).toEqual(['No', '이슈', '상태', '신뢰도', '근거'])
  })
})

describe('P4 §4.1 빈 산출물 오독 차단 — "없음"과 "못 봄"의 구분', () => {
  it('★ 행 0건 산출물은 rowCount 0 + rate **null** + emptyArtifact 로 실린다(rate 0 이 아니다)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const authz = b.axes.policy.items.find((d) => d.docId === 'policy-authz')!
    expect(authz).toBeDefined() // 실려야 한다 — 안 실리면 LLM 이 존재 자체를 모른다
    expect(authz.rowCount).toBe(0)
    expect(authz.emptyArtifact).toBe(true)
    // 선언값 0 과 측정값 null 을 **따로** 싣는다: 뭉개면 "근거율 0"(=근거 없음)으로 오독된다.
    expect(authz.declaredEvidenceRate).toBe(0)
    expect(authz.evidence).toEqual({ cited: 0, total: 0, rate: null })
  })

  it('★ 행 0건 문서를 이름을 들어 경고한다 — "권한 통제 없음" 오독 차단', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const w = b.warnings.find((x) => x.includes('policy-authz.md'))!
    expect(w).toBeDefined()
    expect(w).toContain('0건')
    expect(w).toContain('스캐너가 못 본 것')
  })

  it('★ 예산이 아무리 빠듯해도 행 0건 스텁은 안 버린다(§4.1 payload 이고 값이 거의 공짜)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST, charCap: 6_000 })
    expect(b.axes.policy.items.some((d) => d.docId === 'policy-authz')).toBe(true)
  })
})

describe('P4 축소 모드(§10-1) — 화면·정책은 최소집합이 아니다', () => {
  it('★ 화면·정책이 없어도 차단하지 않고(exit 2 아님) 최소집합은 통과한다', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.minimalSet.ok).toBe(true) // 최소집합 = 도메인·데이터·추적표뿐
    expect(b.axes.screens.present).toBe(false)
    expect(b.axes.policy.present).toBe(false)
  })

  it('★ 생략을 **명시**한다 — "없다"가 아니라 "못 봤다" + [추정] 강등 지시', () => {
    const b = buildIntakeInputBundle(sources(), { request: REQUEST })
    expect(b.reducedMode.active).toBe(true)
    expect(b.reducedMode.omittedAxes).toHaveLength(2)
    expect(b.reducedMode.note).toContain('[추정]')
    expect(b.axes.screens.reason).toContain('못 봤습니다')
    expect(b.axes.policy.reason).toContain('못 봤습니다')
  })

  it('5축 전부 있으면 축소 모드가 아니다', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    expect(b.reducedMode.active).toBe(false)
    expect(b.reducedMode.note).toBeNull()
  })

  it('부재 축은 floor 를 안 먹는다 — 그 몫이 풀로 환원된다(축소 모드가 다른 축을 굶기지 않는다)', () => {
    const v1 = buildIntakeInputBundle(sources(), { request: REQUEST })
    // 부재 축의 수요는 빈 배열 리터럴(`[]`)뿐 → `min(demand, floor)` 가 사실상 0 이라 풀이 안 준다.
    // (재배분 자체는 `allocateAxisBudget` 순수 함수 테스트가 직접 검증한다 — 여기선 전제만 확인.
    //  번들 레벨에서 v1↔v2 배분을 직접 비교하면 축소 모드 경고문 때문에 **봉투가 달라져** 교란된다.)
    expect(v1.budget.screens.demand).toBeLessThan(16)
    expect(v1.budget.policy.demand).toBeLessThan(16)
    expect(v1.budget.screens.allocated).toBeLessThan(16)
    expect(v1.budget.policy.allocated).toBeLessThan(16)
  })
})

describe('P4 축별 예산 배분(water-fill)', () => {
  it('floor 를 먼저 채우고 잔여를 가중 비례로 나눈다', () => {
    const demand = { domain: 50_000, schema: 50_000, crud: 50_000, rtm: 50_000, screens: 50_000, policy: 50_000 }
    const alloc = allocateAxisBudget(demand, 60_000)
    for (const k of Object.keys(AXIS_BUDGET) as (keyof typeof AXIS_BUDGET)[]) {
      expect(alloc[k]).toBeGreaterThanOrEqual(Math.min(demand[k], AXIS_BUDGET[k].floor))
    }
    expect(Object.values(alloc).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(60_000)
  })

  it('수요가 floor 보다 작으면 그만큼만 받고 남는 몫은 다른 축으로 간다', () => {
    const demand = { domain: 50_000, schema: 10, crud: 10, rtm: 10, screens: 50_000, policy: 10 }
    const alloc = allocateAxisBudget(demand, 60_000)
    expect(alloc.schema).toBe(10)
    expect(alloc.crud).toBe(10)
    // 굶는 축(domain·screens)이 남은 예산을 가중 비례로 나눠 갖는다.
    expect(alloc.domain).toBeGreaterThan(AXIS_BUDGET.domain.floor)
    expect(alloc.screens).toBeGreaterThan(AXIS_BUDGET.screens.floor)
  })

  it('예산이 floor 합보다 작으면 **비례 축소** — 어느 축도 조용히 0 이 되지 않는다', () => {
    const demand = { domain: 50_000, schema: 50_000, crud: 50_000, rtm: 50_000, screens: 50_000, policy: 50_000 }
    const alloc = allocateAxisBudget(demand, 4_000)
    expect(Object.values(alloc).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4_000)
    for (const v of Object.values(alloc)) expect(v).toBeGreaterThan(0)
  })

  it('배분 실적(demand·allocated·used·floor)을 번들에 실어 감사 가능하게 한다', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    for (const k of Object.keys(AXIS_BUDGET) as (keyof typeof AXIS_BUDGET)[]) {
      expect(b.budget[k].floor).toBe(AXIS_BUDGET[k].floor)
      expect(b.budget[k].used).toBeLessThanOrEqual(Math.max(b.budget[k].allocated, b.budget[k].demand))
    }
  })

  it('★ 화면·정책을 얹어도 1순위 도메인의 pre-cite(claims)가 살아남는다 — 이 작업의 목적', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const account = b.axes.domain.items[0]
    expect(account.id).toBe('domain:account')
    expect(account.claims.length).toBeGreaterThan(0)
    // 화면·정책도 함께 살아남아야 한다(어느 한 축이 다른 축을 굶기지 않는다).
    expect(b.axes.screens.items[0].annotations.length).toBeGreaterThan(0)
    expect(b.axes.policy.items.length).toBeGreaterThan(0)
  })
})

describe('P4 pre-cite(§6.2 "인용 생산을 LLM 에서 제거")', () => {
  it('claim 은 투영되고 citations 가 실제 스니펫을 나른다', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const account = b.axes.domain.items[0]
    const claim = account.claims.find((c) => c.citations.length > 0)!
    // 원본의 `status:"ok"` 잡음은 떨어내고 pre-cite 3필드만 남긴다(예산 회수, 손실 0).
    expect(claim.citations[0]).toEqual({ file: 'A.java', line: 43, snippet: 'class A' })
  })

  it('claim 투영은 verdict 를 남긴다(근거↔신뢰도 불변식의 신호라 떼면 안 된다)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const account = b.axes.domain.items[0]
    expect(account.claims.map((c) => c.verdict)).toContain('GROUNDED')
  })

  it('스니펫 없는 근거는 빈 문자열이 아니라 **null**(지어내지 말라는 신호)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const acct = b.axes.policy.items.find((d) => d.docId === 'policy-domain-account')!
    const ev = acct.sections.flatMap((s) => s.rows).flatMap((r) => r.evidence)
    expect(ev.length).toBeGreaterThan(0)
    for (const e of ev) expect(e.snippet).toBeNull()
  })

  it('★ claims 는 관련도 내림차순 — 트림이 꼬리부터 돌아 요청과 가까운 근거가 끝까지 남는다', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    const account = b.axes.domain.items[0]
    const matched = account.claims.map((c) => c.matchedTokens.length)
    expect([...matched].sort((a, b2) => b2 - a)).toEqual(matched)
  })
})

describe('P4 결정론·유계성(5축)', () => {
  it('같은 입력 → 같은 바이트(2회 실행 diff 0)', () => {
    const a = serializeIntakeBundle(buildIntakeInputBundle(sourcesV2(), { request: REQUEST }))
    const b = serializeIntakeBundle(buildIntakeInputBundle(sourcesV2(), { request: REQUEST }))
    expect(a).toBe(b)
  })

  it('정책서 입력 순서가 바뀌어도 같은 바이트', () => {
    const s1 = sourcesV2()
    const s2 = { ...sourcesV2(), policyDocs: [...policyDocs()].reverse() }
    expect(serializeIntakeBundle(buildIntakeInputBundle(s1, { request: REQUEST }))).toBe(
      serializeIntakeBundle(buildIntakeInputBundle(s2, { request: REQUEST })),
    )
  })

  it('★ 캡은 기록 형태를 잰다 — 5축에서도 파일이 예산 안에 든다(P3 회귀 가드 유지)', () => {
    const b = buildIntakeInputBundle(sourcesV2(), { request: REQUEST })
    expect(serializeIntakeBundle(b).length).toBeLessThanOrEqual(DEFAULT_BUNDLE_CHAR_CAP)
  })

  it('화면·정책이 손상돼도 죽지 않고 정직하게 빈 축을 낸다', () => {
    const b = buildIntakeInputBundle(
      { ...sources(), screens: { screens: [null, 42, {}] }, policyDocs: [{ relPath: 'x.md', markdown: '' }] },
      { request: REQUEST },
    )
    expect(b.axes.screens.items).toEqual([])
    expect(b.axes.policy.items.every((d) => d.rowCount === 0)).toBe(true)
  })
})
