/**
 * W5 테스트 시나리오 — 결정론 생성(정상/예외/경계) + 오버레이(_scenarios/_fields) 라운드트립.
 * 설계: RTM_TEST_SCENARIO_DESIGN.md §2~4, §8.
 */
import { describe, it, expect } from 'vitest'
import type { RtmFunctionRow, RtmModel } from './types.js'
import { buildTestScenarios, attachTestScenarios } from './test-scenarios.js'
import { applyOverlay } from './apply-overlay.js'

function fnRow(over: Partial<RtmFunctionRow>): RtmFunctionRow {
  return {
    id: 'account/list',
    featureId: 'FN-001',
    name: '계정 목록',
    domainId: 'account',
    domainName: '계정',
    entryPoint: { value: '', confidence: 'INFERRED', evidence: [] },
    implementation: { value: '', confidence: 'INFERRED', evidence: [] },
    data: { value: '', confidence: 'INFERRED', evidence: [] },
    test: { value: '', confidence: 'UNVERIFIED', evidence: [] },
    origin: 'AS_IS',
    state: 'IMPLEMENTED',
    requirementHistory: [],
    nfrTags: [],
    rules: [],
    deliverableRefs: [],
    custom: {},
    ...over,
  }
}

/** 픽스처: 시드 풍부 행(라우트+데이터+예외 AC 2) + 맨몸 행(시드 전무). */
function model(): RtmModel {
  const rich = fnRow({
    id: 'order/create',
    featureId: 'FN-001',
    name: '주문 생성',
    entryPoint: {
      value: 'POST /order',
      confidence: 'CONFIRMED',
      evidence: [{ file: 'web/OrderController.java', line: 12 }],
    },
    implementation: {
      value: 'OrderController, OrderService',
      confidence: 'CONFIRMED',
      evidence: [{ file: 'web/OrderController.java', line: 1 }],
    },
    data: {
      value: 'ORDERS(CRU) · LINEITEM(C)',
      confidence: 'CONFIRMED',
      evidence: [{ file: 'mapper/OrderMapper.xml', line: 8 }],
    },
    rules: [
      { reqId: 'REQ-002', acId: 'AC-2', text: '재고 부족 시 주문 거부', kind: 'exception', confidence: 'INFERRED' },
      { reqId: 'REQ-001', acId: 'AC-1', text: '미로그인 시 로그인 페이지로', kind: 'exception', confidence: 'INFERRED' },
      { reqId: 'REQ-001', acId: 'AC-3', text: '주문 금액은 합계와 일치', kind: 'rule', confidence: 'INFERRED' },
    ],
  })
  const bare = fnRow({ id: 'common/help', featureId: 'FN-002', name: '도움말' })
  return {
    schemaVersion: 2,
    gitCommit: null,
    domains: [{ id: 'account', name: '계정', functionCount: 2 }],
    functions: [rich, bare],
    requirements: [],
    testScenarios: [],
    customFields: [],
  }
}

describe('buildTestScenarios — 결정론 템플릿 생성', () => {
  it('행당 정상 1 + 예외(AC 수 또는 일반형 1) + 경계 1 — 0건 행 없음(수용 ①)', () => {
    const ts = buildTestScenarios(model())
    // rich: N1,E1,E2,B1 / bare: N1,E1,B1
    expect(ts.map((s) => s.id)).toEqual([
      'TS-FN-001-N1',
      'TS-FN-001-E1',
      'TS-FN-001-E2',
      'TS-FN-001-B1',
      'TS-FN-002-N1',
      'TS-FN-002-E1',
      'TS-FN-002-B1',
    ])
    const byFn = new Map<string, number>()
    for (const s of ts) byFn.set(s.fnId, (byFn.get(s.fnId) ?? 0) + 1)
    for (const f of model().functions) expect(byFn.get(f.id) ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('전부 INFERRED([추정]) + 원천 셀 evidence 승계(진입점 우선)', () => {
    const ts = buildTestScenarios(model())
    expect(ts.every((s) => s.confidence === 'INFERRED')).toBe(true)
    const n1 = ts.find((s) => s.id === 'TS-FN-001-N1')!
    expect(n1.evidence).toEqual([{ file: 'web/OrderController.java', line: 12 }])
    expect(n1.when).toContain('POST /order')
    expect(n1.then).toContain('ORDERS(CRU)')
  })

  it('예외 시나리오는 exception AC 만, acId ASC — reqId/acId 추적선 보존', () => {
    const ts = buildTestScenarios(model())
    const es = ts.filter((s) => s.fnId === 'order/create' && s.kind === 'exception')
    expect(es.map((s) => s.acId)).toEqual(['AC-1', 'AC-2']) // rule(AC-3) 제외, ASC.
    expect(es[0].reqId).toBe('REQ-001')
    expect(es[0].given).toContain('미로그인')
  })

  it('시드 없는 행은 축소형 + [미확인] 사유(침묵 누락 금지)', () => {
    const ts = buildTestScenarios(model())
    const bare = ts.filter((s) => s.fnId === 'common/help')
    expect(bare.every((s) => s.notes.some((n) => n.includes('[미확인] 진입점 없음')))).toBe(true)
    const e1 = bare.find((s) => s.kind === 'exception')!
    expect(e1.notes.some((n) => n.includes('예외 AC 없음'))).toBe(true)
    const b1 = bare.find((s) => s.kind === 'boundary')!
    expect(b1.notes.some((n) => n.includes('데이터 근거 없음'))).toBe(true)
  })

  it('결정론: 2회 생성 byte-identical + attach 시 coverage.scenarios 롤업', () => {
    const a = attachTestScenarios(model())
    const b = attachTestScenarios(model())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.coverage?.scenarios).toEqual({
      total: 7,
      confirmed: 0,
      byKind: { normal: 2, exception: 3, boundary: 2 },
    })
  })
})

describe('applyOverlay — _scenarios 확정 라운드트립 + _fields(R7)', () => {
  it('시나리오 편집·확정: 값 덮기 + CONFIRMED 승격 + coverage 반영(수용 ②)', () => {
    const m = attachTestScenarios(model())
    const merged = applyOverlay(m, {
      _scenarios: {
        'TS-FN-001-E1': {
          editedCells: { given: '세션 만료 상태에서', then: '401 + 로그인 리다이렉트' },
          approver: '홍길동',
          at: '2026-07-05',
          audit: [],
        },
      },
    })
    const s = merged.testScenarios.find((x) => x.id === 'TS-FN-001-E1')!
    expect(s.confidence).toBe('CONFIRMED')
    expect(s.given).toBe('세션 만료 상태에서')
    expect(s.then).toBe('401 + 로그인 리다이렉트')
    expect(s.title).toBe('주문 생성 예외 처리 1') // 미편집 셀 보존.
    expect(merged.coverage?.scenarios?.confirmed).toBe(1)
    // 나머지는 초안 유지.
    expect(merged.testScenarios.filter((x) => x.confidence === 'INFERRED')).toHaveLength(6)
  })

  it('재생성으로 사라진 tsId 오버레이 → SCENARIO_OVERRIDE_ORPHAN warn(조용한 손실 금지)', () => {
    const m = attachTestScenarios(model())
    const merged = applyOverlay(m, {
      _scenarios: { 'TS-FN-999-N1': { editedCells: {}, approver: 'a', at: 't', audit: [] } },
    })
    expect(
      merged.diagnostics?.some(
        (d) => d.code === 'SCENARIO_OVERRIDE_ORPHAN' && d.ref === 'TS-FN-999-N1' && d.level === 'warn',
      ),
    ).toBe(true)
  })

  it('_fields 정의 + 기능 editedCells custom:* 값 병합(R7) — 비 custom 네임스페이스 거부', () => {
    const m = attachTestScenarios(model())
    const merged = applyOverlay(m, {
      'order/create': {
        editedCells: { 'custom:owner': '김PM', name: '주문 생성(개명)' },
        approver: '홍길동',
        at: '2026-07-05',
        audit: [],
      },
      _fields: {
        'custom:owner': { label: '담당자', createdBy: '홍길동', at: '2026-07-05' },
        'custom:release': { label: '릴리스', createdBy: '홍길동', at: '2026-07-05' },
        'entryPoint': { label: '코어 키 침범 시도', createdBy: 'x', at: 't' },
      },
    })
    expect(merged.customFields.map((f) => f.id)).toEqual(['custom:owner', 'custom:release'])
    const fn = merged.functions.find((f) => f.id === 'order/create')!
    expect(fn.custom['custom:owner']).toBe('김PM')
    expect(fn.name).toBe('주문 생성(개명)')
    // 정의 없는 값도 보존(비파괴 — 재등록 시 복원), 코어 키는 필드 정의로 안 들어감.
    expect(merged.customFields.some((f) => f.id === 'entryPoint')).toBe(false)
  })

  it('구버전 모델(testScenarios 없음)도 오버레이 적용이 죽지 않음(방어적 접근)', () => {
    const legacy = { ...model() } as Record<string, unknown>
    delete legacy.testScenarios
    delete legacy.customFields
    const merged = applyOverlay(legacy as unknown as RtmModel, {})
    expect(merged.testScenarios).toEqual([])
    expect(merged.coverage?.scenarios?.total).toBe(0)
  })
})
