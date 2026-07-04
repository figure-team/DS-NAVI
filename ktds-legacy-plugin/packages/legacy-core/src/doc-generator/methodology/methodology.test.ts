/**
 * 방법론 모듈 시스템(Layer 2) + SI표준 모듈(보완 C) — P4.3 게이트 테스트.
 *
 * AC-23: 동일 DocInput 에 모듈을 교체하면 다른 문서 집합이 나온다(as-built 5종 ↔
 *   si-standard 3종). AC-24: SI 문서 표 열/순서가 template §2 와 일치, 경로/메서드/
 *   핸들러 행은 CONFIRMED+근거, 추론 셀은 `[추정]`, 날조 사실 없음(grounding 불변).
 * AC-36: SI 문서 섹션 헤딩·표 헤더가 doc-templates.md §2 와 정확히 일치.
 * 결정론: renderSkeleton 골든 스냅샷(SI 문서별) + byte-identical 더블런.
 */
import { describe, it, expect } from 'vitest'
import type { RoutesReport, UaGraphEdge, UaGraphNode } from '../../domain-map/types.js'
import type { DocInput } from '../builders/index.js'
import { renderSkeleton } from '../render.js'
import type { GeneratedDoc, Section } from '../types.js'
import { getMethodology, listMethodologies } from './registry.js'
import { buildSiTableSpec } from './si-standard.js'
import { buildDomainPolicyDoc } from './domain-policy.js'
import type { DbSchemaModel } from '../../db-schema/types.js'
import type { DomainPolicyInput } from '../../domain-policy/types.js'

// ──────────────────────────────────────────────────────────────────────────
// 결정론 픽스처 — doc-generator.test.ts 와 동일 형태(근거 보유/미보유 혼합).
// ──────────────────────────────────────────────────────────────────────────

function node(id: string, type: UaGraphNode['type'], over: Partial<UaGraphNode> = {}): UaGraphNode {
  return {
    id,
    type,
    name: over.name ?? id,
    summary: over.summary ?? '',
    tags: over.tags ?? [],
    complexity: over.complexity ?? 'simple',
    filePath: over.filePath,
    lineRange: over.lineRange,
    domainMeta: over.domainMeta,
    layer: over.layer,
  }
}

const NODES: UaGraphNode[] = [
  node('domain:order', 'domain', {
    name: '주문',
    summary: '주문 처리',
    filePath: 'src/order/OrderService.java',
    lineRange: [10, 80],
    domainMeta: { entities: ['Order'], businessRules: ['재고 차감'], entryPoint: 'POST /orders' },
  }),
  // 근거 없는 도메인 -> INFERRED 행(grounding 분기 검증).
  node('domain:report', 'domain', { name: '리포트', summary: '집계' }),
  node('flow:place', 'flow', { name: '주문생성', filePath: 'src/order/OrderService.java', lineRange: [20, 40] }),
  node('tbl:orders', 'step', {
    name: 'ORDERS',
    summary: '주문 테이블',
    tags: ['table'],
    filePath: 'schema/orders.sql',
    lineRange: [1, 30],
  }),
]

const EDGES: UaGraphEdge[] = [{ source: 'flow:place', target: 'tbl:orders', type: 'calls' }]

const ROUTES: RoutesReport = {
  schemaVersion: 1,
  gitCommit: null,
  contextPath: null,
  routes: [
    {
      routeId: 'r1',
      method: 'POST',
      path: '/orders',
      rawPath: '/orders',
      kind: 'api',
      framework: 'spring',
      filePath: 'src/web/OrderController.java',
      line: 42,
      handler: 'OrderController.placeOrder',
      notes: [],
    },
  ],
  batchEntries: [],
}

const INPUT: DocInput = {
  project: { languages: ['Java'], frameworks: ['Spring'] },
  nodes: NODES,
  edges: EDGES,
  routes: ROUTES,
}

function tableOf(section: Section) {
  if (!section.table) throw new Error(`section has no table: ${section.heading}`)
  return section.table
}

// ──────────────────────────────────────────────────────────────────────────
// AC-23: 모듈 교체 -> 다른 문서 집합(동일 입력).
// ──────────────────────────────────────────────────────────────────────────

describe('AC-23: methodology swap yields different doc sets', () => {
  it('registry: as-built 기본 + si-standard + policy + domain-policy 등록(정렬)', () => {
    expect(listMethodologies()).toEqual(['as-built', 'domain-policy', 'policy', 'si-standard'])
  })

  it('policy -> 정책서 PoC 4종(glossary/data/validation/authz)', () => {
    const docs = getMethodology('policy').buildDocSet(INPUT)
    expect(docs.map((d) => d.docId)).toEqual(['policy-glossary', 'policy-data', 'policy-validation', 'policy-authz'])
    expect(docs.every((d) => d.methodology === 'policy')).toBe(true)
    // 신호 미주입(INPUT 에 policySignals 없음) → 빈 표 + 안내 claim(누락 보고).
    expect(docs.every((d) => d.sections[0].table?.rows.length === 0)).toBe(true)
    expect(docs.every((d) => d.sections[0].claims.length === 1)).toBe(true)
  })

  it('as-built -> 현행 5종(01..05)', () => {
    const docs = getMethodology('as-built').buildDocSet(INPUT)
    expect(docs.map((d) => d.docId)).toEqual([
      '01_tech-stack',
      '02_architecture',
      '03_feature-spec',
      '04_api-spec',
      '05_db-spec',
    ])
    expect(docs.every((d) => d.methodology === 'as-built')).toBe(true)
  })

  it('si-standard -> SI 정형 3종', () => {
    const docs = getMethodology('si-standard').buildDocSet(INPUT)
    expect(docs.map((d) => d.docId)).toEqual([
      'si-기능명세서',
      'si-인터페이스정의서',
      'si-테이블정의서',
      'si-배치정의서',
    ])
    expect(docs.every((d) => d.methodology === 'si-standard')).toBe(true)
  })

  it('동일 입력에서 두 모듈의 문서 집합이 다르다', () => {
    const asBuilt = getMethodology('as-built').buildDocSet(INPUT)
    const si = getMethodology('si-standard').buildDocSet(INPUT)
    expect(asBuilt.length).not.toBe(si.length)
    const asIds = new Set(asBuilt.map((d) => d.docId))
    expect(si.some((d) => asIds.has(d.docId))).toBe(false)
  })

  it('미등록 방법론은 throw(fail-closed)', () => {
    expect(() => getMethodology('nope')).toThrow(/unknown methodology/)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// AC-24/AC-36: SI 문서 표 열/순서 + 헤딩이 template §2 와 일치, grounding 불변.
// ──────────────────────────────────────────────────────────────────────────

describe('AC-24/AC-36: SI table columns + headings conform to §2', () => {
  const si = getMethodology('si-standard').buildDocSet(INPUT)
  const byId = new Map(si.map((d) => [d.docId, d]))

  it('si-기능명세서: 열 순서 = 기능ID|기능명|설명|진입점|관련 API|관련 테이블|업무규칙', () => {
    const doc = byId.get('si-기능명세서')!
    const t = tableOf(doc.sections[0])
    expect(t.columns).toEqual(['기능ID', '기능명', '설명', '진입점', '관련 API', '관련 테이블', '업무규칙'])
    // 근거 있는 도메인 행 = CONFIRMED + 앵커; 근거 없는 도메인 = INFERRED.
    const order = t.rows.find((r) => r.cells[1] === '주문')!
    expect(order.confidence).toBe('CONFIRMED')
    expect(order.evidence).toEqual([{ file: 'src/order/OrderService.java', line: 10 }])
    expect(order.cells[3]).toBe('POST /orders') // 진입점(domainMeta.entryPoint)
    expect(order.cells[6]).toBe('재고 차감') // 업무규칙
    expect(order.cells[4]).toBe('[추정]') // 관련 API: 합성 금지 -> 추론
    const report = t.rows.find((r) => r.cells[1] === '리포트')!
    expect(report.confidence).toBe('INFERRED')
    expect(report.evidence).toEqual([])
  })

  it('si-인터페이스정의서: 열 = API_ID|HTTP|경로|컨트롤러·핸들러|요청|응답|인증; path/method/handler CONFIRMED', () => {
    const doc = byId.get('si-인터페이스정의서')!
    expect(doc.sections[0].heading).toBe('API 목록')
    const t = tableOf(doc.sections[0])
    expect(t.columns).toEqual(['API_ID', 'HTTP', '경로', '컨트롤러·핸들러', '요청', '응답', '인증'])
    const row = t.rows[0]
    expect(row.cells.slice(1, 4)).toEqual(['POST', '/orders', 'OrderController.placeOrder'])
    expect(row.confidence).toBe('CONFIRMED')
    expect(row.evidence).toEqual([{ file: 'src/web/OrderController.java', line: 42 }])
    // 요청/응답/인증은 추론 -> [추정].
    expect(row.cells.slice(4)).toEqual(['[추정]', '[추정]', '[추정]'])
  })

  it('si-인터페이스정의서 §2: interfaces 입력 → 송신 행(탐지 CONFIRMED, 대상시스템 [추정], 미해석 [미확인])', () => {
    const withInterfaces: DocInput = {
      ...INPUT,
      interfaces: {
        schemaVersion: 1,
        gitCommit: null,
        items: [
          {
            id: 'IF-HTTP-aaaa1111',
            direction: 'outbound',
            protocol: 'http',
            clientType: 'RestTemplate',
            endpoint: { raw: '${pay.api.url}/v1', resolved: 'https://pay.example.com/v1', resolvedFrom: 'application.properties:1' },
            dataHint: 'POST',
            callSites: [
              { file: 'src/PayClient.java', line: 12, symbol: 'PayClient#approve' },
              { file: 'src/PayClient.java', line: 30, symbol: 'PayClient#retry' },
            ],
            unresolved: false,
          },
          {
            id: 'IF-HTTP-bbbb2222',
            direction: 'outbound',
            protocol: 'http',
            clientType: 'RestTemplate',
            endpoint: { raw: null, resolved: null, resolvedFrom: null },
            dataHint: null,
            callSites: [{ file: 'src/PayClient.java', line: 20, symbol: 'PayClient#status' }],
            unresolved: true,
          },
          {
            id: 'IF-MQ-cccc3333',
            direction: 'inbound-extra',
            protocol: 'mq',
            clientType: 'KafkaListener',
            endpoint: { raw: 'order-events', resolved: 'order-events', resolvedFrom: null },
            dataHint: 'consume',
            callSites: [{ file: 'src/OrderListener.java', line: 8, symbol: 'OrderListener#on' }],
            unresolved: false,
          },
        ],
        stats: {
          total: 3,
          unresolvedEndpoints: 1,
          byProtocol: [{ protocol: 'http', count: 2 }, { protocol: 'mq', count: 1 }],
          callSiteTotal: 4,
        },
        suspectSignals: { count: 0, samples: [] },
      },
    }
    const doc = getMethodology('si-standard')
      .buildDocSet(withInterfaces)
      .find((d) => d.docId === 'si-인터페이스정의서')!
    const sec = doc.sections[1]
    expect(sec.heading).toBe('대외 연계(송신·라우트 외 수신)')
    const t = tableOf(sec)
    expect(t.columns).toEqual([
      'IF_ID',
      '인터페이스명',
      '프로토콜',
      '방향',
      '연계방식',
      '대상시스템',
      '엔드포인트',
      '데이터',
      '해석',
    ])
    expect(t.rows).toHaveLength(3)
    expect(t.rows[0].cells).toEqual([
      'IF-HTTP-aaaa1111',
      'PayClient#approve [추정]',
      'http',
      '송신',
      '실시간(온라인) [추정]',
      '[추정]',
      'https://pay.example.com/v1',
      'POST',
      '해석됨',
    ])
    expect(t.rows[0].confidence).toBe('CONFIRMED')
    // 병합된 호출 지점 전부 근거로 승계.
    expect(t.rows[0].evidence).toEqual([
      { file: 'src/PayClient.java', line: 12 },
      { file: 'src/PayClient.java', line: 30 },
    ])
    // 미해석 endpoint → [미확인] 셀 2곳(엔드포인트/해석) — 침묵 누락 금지.
    expect(t.rows[1].cells[6]).toBe('[미확인]')
    expect(t.rows[1].cells[8]).toBe('[미확인]')
    // 라우트 외 수신(리스너) 방향 표기 + 연계방식 분류.
    expect(t.rows[2].cells[3]).toBe('수신')
    expect(t.rows[2].cells[4]).toBe('비동기(MQ) [추정]')
  })

  it('si-인터페이스정의서 §2: interfaces 미제공 → 0행(합성 금지)', () => {
    const doc = byId.get('si-인터페이스정의서')!
    expect(doc.sections[1].heading).toBe('대외 연계(송신·라우트 외 수신)')
    expect(tableOf(doc.sections[1]).rows).toEqual([])
  })

  it('si-배치정의서: batchJobs 입력 → 행(배치명 [추정]·[미확인]·외부 구분), 미제공 → 0행', () => {
    const withBatch: DocInput = {
      ...INPUT,
      batchJobs: {
        schemaVersion: 1,
        gitCommit: null,
        jobs: [
          {
            id: 'BAT-aaaa1111',
            name: 'orderSyncJobDetail',
            trigger: 'quartz',
            schedule: 'cron=0 0 4 * * ?',
            handler: 'orderSyncJobDetail',
            handlerFile: 'src/OrderSyncJob.java',
            unresolvedHandler: false,
            evidence: { file: 'src/context-batch.xml', line: 13 },
            reachableFiles: 2,
            notes: [],
          },
          {
            id: 'BAT-bbbb2222',
            name: 'ghost',
            trigger: 'quartz',
            schedule: null,
            handler: 'ghost',
            handlerFile: null,
            unresolvedHandler: true,
            evidence: { file: 'src/context-batch.xml', line: 31 },
            reachableFiles: 1,
            notes: [],
          },
          {
            id: 'BAT-cccc3333',
            name: 'settle-batch.jar',
            trigger: 'shell',
            schedule: null,
            handler: 'settle-batch.jar',
            handlerFile: null,
            unresolvedHandler: false,
            evidence: { file: 'bin/run.sh', line: 4 },
            reachableFiles: 1,
            notes: [],
          },
        ],
        stats: { total: 3, byTrigger: [{ trigger: 'quartz', count: 2 }, { trigger: 'shell', count: 1 }], unresolvedHandlers: 1 },
        suspectSignals: { count: 0, samples: [] },
      },
    }
    const doc = getMethodology('si-standard')
      .buildDocSet(withBatch)
      .find((d) => d.docId === 'si-배치정의서')!
    const t = tableOf(doc.sections[0])
    expect(t.columns).toEqual(['BAT_ID', '배치명', '트리거', '스케줄', '핸들러', '도달범위(파일)', '해석'])
    expect(t.rows[0].cells).toEqual([
      'BAT-aaaa1111',
      'orderSyncJobDetail [추정]',
      'quartz',
      'cron=0 0 4 * * ?',
      'orderSyncJobDetail',
      '2',
      '해석됨',
    ])
    expect(t.rows[0].evidence).toEqual([{ file: 'src/context-batch.xml', line: 13 }])
    expect(t.rows[1].cells[6]).toBe('[미확인]')
    expect(t.rows[2].cells[6]).toBe('외부')
    // 미제공 → 0행(합성 금지).
    const empty = byId.get('si-배치정의서')!
    expect(tableOf(empty.sections[0]).rows).toEqual([])
  })

  it('si-테이블정의서: 테이블별 섹션 + 열 = 컬럼|타입|PK|FK|NULL|설명', () => {
    const doc = byId.get('si-테이블정의서')!
    expect(doc.sections.map((s) => s.heading)).toEqual(['ORDERS 테이블'])
    const t = tableOf(doc.sections[0])
    expect(t.columns).toEqual(['컬럼', '타입', 'PK', 'FK', 'NULL', '설명'])
    const row = t.rows[0]
    expect(row.confidence).toBe('CONFIRMED')
    expect(row.evidence).toEqual([{ file: 'schema/orders.sql', line: 1 }])
    expect(row.cells[5]).toBe('주문 테이블') // 설명=summary
  })

  it('si-테이블정의서(PA3): dbSchema 있으면 컬럼/타입/PK/FK/NULL 을 DDL 근거로 확정', () => {
    const dbSchema: DbSchemaModel = {
      schemaVersion: 1,
      gitCommit: null,
      tier: 'ddl+data',
      sqlFileCount: 1,
      tables: [
        {
          name: 'member',
          relPath: 'db/ddl.sql',
          line: 1,
          comment: '회원',
          columns: [
            { name: 'member_id', type: 'BIGINT', nullable: false, primaryKey: true, unique: false, default: null, comment: 'PK', line: 2 },
            { name: 'status_cd', type: 'VARCHAR(10)', nullable: false, primaryKey: false, unique: false, default: "'ACTIVE'", comment: null, line: 3 },
          ],
          primaryKey: ['member_id'],
          uniques: [],
          foreignKeys: [{ columns: ['status_cd'], refTable: 'common_code', refColumns: ['code'], line: 4 }],
          checks: [],
          indexes: [],
          isCodeTable: false,
          rows: [],
          rowCount: 0,
        },
      ],
      liveDbSignals: [],
      unresolved: [],
    }
    const doc = buildSiTableSpec({ ...INPUT, dbSchema })
    expect(doc.sections.map((s) => s.heading)).toEqual(['member 테이블 — 회원'])
    const t = doc.sections[0].table!
    expect(t.columns).toEqual(['컬럼', '타입', 'PK', 'FK', 'NULL', '설명'])
    const pk = t.rows.find((r) => r.cells[0] === 'member_id')!
    expect(pk.confidence).toBe('CONFIRMED')
    expect(pk.evidence).toEqual([{ file: 'db/ddl.sql', line: 2 }])
    expect(pk.cells[1]).toBe('BIGINT')
    expect(pk.cells[2]).toBe('PK')
    expect(pk.cells[4]).toBe('NOT NULL')
    expect(pk.cells[5]).toBe('PK') // 설명=컬럼 주석
    const fk = t.rows.find((r) => r.cells[0] === 'status_cd')!
    expect(fk.cells[3]).toBe('→ common_code(code)')
    expect(fk.cells[4]).toBe('NOT NULL')
  })

  it('grounding 불변: 모든 CONFIRMED 행은 근거≥1, 날조 없음', () => {
    for (const doc of si) {
      for (const s of doc.sections) {
        for (const r of s.table?.rows ?? []) {
          if (r.confidence === 'CONFIRMED') expect(r.evidence.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 렌더: SI 표가 신뢰도 + 근거 열을 자동 부가해 결정론 렌더된다(template §2).
// ──────────────────────────────────────────────────────────────────────────

describe('SI table render: 신뢰도 + 근거 columns', () => {
  it('renderSkeleton 이 표 헤더에 신뢰도/근거 열을 부가하고 행에 태그·앵커를 방출', () => {
    const doc = getMethodology('si-standard').buildDocSet(INPUT)[1] // 인터페이스정의서
    const md = renderSkeleton(doc)
    expect(md).toContain('| API_ID | HTTP | 경로 | 컨트롤러·핸들러 | 요청 | 응답 | 인증 | 신뢰도 | 근거 |')
    expect(md).toContain('| API-001 | POST | /orders | OrderController.placeOrder | [추정] | [추정] | [추정] | [확정] | `src/web/OrderController.java:42` |')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 결정론 — renderSkeleton 골든 스냅샷(SI 문서별) + byte-identical 더블런.
// ──────────────────────────────────────────────────────────────────────────

describe('determinism: SI golden skeleton + double-run', () => {
  const si: GeneratedDoc[] = getMethodology('si-standard').buildDocSet(INPUT)

  for (const doc of si) {
    it(`renderSkeleton golden: ${doc.docId}`, () => {
      expect(renderSkeleton(doc)).toMatchSnapshot()
    })
  }

  it('byte-identical 더블런(si-standard 전 문서)', () => {
    const a = getMethodology('si-standard').buildDocSet(INPUT)
    const b = getMethodology('si-standard').buildDocSet(INPUT)
    for (let i = 0; i < a.length; i++) {
      expect(renderSkeleton(a[i])).toBe(renderSkeleton(b[i]))
    }
  })
})

// ──────────────────────────────────────────────────────────────────────────
// domain-policy — 정책 정의서 §0~§8 양식(문서정보/개요/용어/상태값/의사결정테이블/예외/흐름/검증/미결).
// ──────────────────────────────────────────────────────────────────────────

const ORDER_DOMAIN: DomainPolicyInput = {
  key: 'order',
  name: '주문 체크아웃',
  classes: [{ className: 'OrderActionBean', relPath: 'web/OrderActionBean.java' }],
  flows: [{ name: 'checkout', entry: { file: 'web/OrderActionBean.java', line: 142 } }],
  branches: [
    { relPath: 'web/OrderActionBean.java', line: 125, className: 'OrderActionBean', methodName: 'newOrderForm', kind: 'if', condition: '!acc.isAuthenticated()', then: 'return BLOCK;' },
    { relPath: 'web/OrderActionBean.java', line: 150, className: 'OrderActionBean', methodName: 'newOrder', kind: 'if', condition: 'getOrder() != null', then: 'insertOrder(order); return VIEW;' },
  ],
}

describe('domain-policy 방법론 — 정책 정의서 §0~§8', () => {
  it('docId/title + §0~§8 섹션 골격', () => {
    const doc = buildDomainPolicyDoc(ORDER_DOMAIN)
    expect(doc.docId).toBe('policy-domain-order')
    expect(doc.title).toBe('주문 체크아웃 정책 정의서')
    expect(doc.methodology).toBe('domain-policy')
    expect(doc.sections.map((s) => s.heading)).toEqual([
      '문서 정보',
      '개정 이력',
      '개요',
      '용어 정의',
      '상태값 정의',
      '정책 규칙 — 의사결정 테이블',
      '예외 및 엣지 케이스',
      '처리 흐름 (의사코드)',
      '검증 시나리오',
      '미결 사항',
    ])
  })

  it('§4 의사결정 테이블 — 분기→PL-ID·IF·THEN + file:line 근거(CONFIRMED)', () => {
    const doc = buildDomainPolicyDoc(ORDER_DOMAIN)
    const dt = doc.sections.find((s) => s.key === 'decision-table')!.table!
    expect(dt.columns).toEqual(['정책 ID', '정책명', '적용 조건 (IF)', '처리 내용 (THEN)', '우선순위', '예외/비고'])
    const r0 = dt.rows[0]
    expect(r0.cells[0]).toBe('PL-001')
    expect(r0.cells[2]).toBe('!acc.isAuthenticated()') // IF
    expect(r0.cells[3]).toBe('return BLOCK;') // THEN
    expect(r0.confidence).toBe('CONFIRMED')
    expect(r0.evidence).toEqual([{ file: 'web/OrderActionBean.java', line: 125 }])
    const r1 = dt.rows[1]
    expect(r1.cells[3]).toBe('insertOrder(order); return VIEW;') // THEN 본문 시드
  })

  it('§6 처리 흐름 — 메서드: IF→THEN claim(CONFIRMED)', () => {
    const doc = buildDomainPolicyDoc(ORDER_DOMAIN)
    const flow = doc.sections.find((s) => s.key === 'process-flow')!
    expect(flow.claims.some((c) => c.text.includes('IF !acc.isAuthenticated() →'))).toBe(true)
    expect(flow.claims.every((c) => c.confidence === 'CONFIRMED')).toBe(true)
  })

  it('§3 상태값 미발견 → 안내 + §8 미결 자동 시드', () => {
    const doc = buildDomainPolicyDoc(ORDER_DOMAIN)
    const status = doc.sections.find((s) => s.key === 'status-codes')!
    expect(status.table!.rows.length).toBe(0)
    expect(status.claims[0].text).toContain('상태값 코드')
    const issues = doc.sections.find((s) => s.key === 'open-issues')!.table!
    expect(issues.rows.some((r) => r.cells[1].includes('상태값 코드'))).toBe(true)
  })

  it('분기 0이면 §4 "조건 분기 없음" 단정(빈 표 + 안내 claim)', () => {
    const doc = buildDomainPolicyDoc({ ...ORDER_DOMAIN, branches: [] })
    const sec = doc.sections.find((s) => s.key === 'decision-table')!
    expect(sec.table!.rows.length).toBe(0)
    expect(sec.claims[0].text).toContain('무조건 처리')
  })

  it('방법론 buildDocSet: domainPolicies → 도메인당 1문서(동적)', () => {
    const docs = getMethodology('domain-policy').buildDocSet({ ...INPUT, domainPolicies: [ORDER_DOMAIN] })
    expect(docs.length).toBe(1)
    expect(docs[0].docId).toBe('policy-domain-order')
    expect(getMethodology('domain-policy').buildDocSet(INPUT).length).toBe(0)
  })
})
