import { describe, it, expect } from 'vitest'
import { applyFills, DomainFillSchema, unfilledNodes, type DomainFill } from './fill.js'
import { SKELETON_BLANK, type SkeletonReport } from './types.js'

// fill.ts — 인용 의무 스키마, 구조 read-only 적용, 항목 단위 기각.

function skeleton(): SkeletonReport {
  return {
    schemaVersion: 1,
    gitCommit: null,
    stepCap: 8,
    nodes: [
      {
        id: 'domain:order',
        type: 'domain',
        name: 'order',
        summary: SKELETON_BLANK,
        tags: ['order'],
        complexity: 'simple',
        domainMeta: {},
      },
      {
        id: 'flow:POST /orders',
        type: 'flow',
        name: SKELETON_BLANK,
        summary: SKELETON_BLANK,
        tags: ['order'],
        complexity: 'simple',
        filePath: 'a/OrderCtrl.java',
        lineRange: [7, 7],
        domainMeta: { entryPoint: 'POST /orders', entryType: 'http' },
      },
      {
        id: 'step:POST /orders:a/OrderCtrl.java',
        type: 'step',
        name: SKELETON_BLANK,
        summary: SKELETON_BLANK,
        tags: ['order'],
        complexity: 'simple',
        filePath: 'a/OrderCtrl.java',
        lineRange: [7, 7],
      },
      {
        id: 'domain:member',
        type: 'domain',
        name: 'member',
        summary: SKELETON_BLANK,
        tags: ['member'],
        complexity: 'simple',
        domainMeta: {},
      },
    ],
    edges: [],
    stepSources: [
      { stepId: 'step:POST /orders:a/OrderCtrl.java', relPath: 'a/OrderCtrl.java', line: 7, className: 'OrderCtrl' },
    ],
    truncatedSteps: [],
  }
}

const CITE = { filePath: 'a/OrderCtrl.java', line: 7, snippet: 'public class OrderCtrl' }

function orderFill(): DomainFill {
  return {
    schemaVersion: 1,
    domainId: 'domain:order',
    name: '주문',
    summary: { text: '주문 생성과 조회를 담당한다.', citations: [CITE] },
    entities: [{ text: 'Order', citations: [CITE] }],
    businessRules: [{ text: '주문은 회원만 생성 가능', citations: [CITE] }],
    crossDomainInteractions: [],
    flows: [{ flowId: 'flow:POST /orders', name: '주문 생성', summary: { text: '신규 주문 접수', citations: [CITE] } }],
    steps: [
      { stepId: 'step:POST /orders:a/OrderCtrl.java', name: '접수', summary: { text: '컨트롤러 진입', citations: [CITE] } },
    ],
  }
}

describe('fill — 채움 계약', () => {
  it('스키마: 사실 주장은 인용 없이 통과 불가(citations min 1)', () => {
    const bad = orderFill()
    bad.businessRules = [{ text: '근거 없는 주장', citations: [] }]
    expect(() => DomainFillSchema.parse(bad)).toThrow()
    expect(() => DomainFillSchema.parse(orderFill())).not.toThrow()
  })

  it('스키마: 8자 미만 스니펫은 거부', () => {
    const bad = orderFill()
    bad.summary = { text: 'x', citations: [{ filePath: 'a.java', line: 1, snippet: 'short' }] }
    expect(() => DomainFillSchema.parse(bad)).toThrow()
  })

  it('적용: 의미 필드만 채워지고 구조 필드 불변, 인용은 ktdsClaims 동봉', () => {
    const sk = skeleton()
    const { nodes, rejected } = applyFills(sk, [orderFill()])
    expect(rejected).toEqual([])

    const domain = nodes.find((n) => n.id === 'domain:order')!
    expect(domain.name).toBe('주문')
    expect(domain.domainMeta?.businessRules).toEqual(['주문은 회원만 생성 가능'])
    expect(Array.isArray(domain.domainMeta?.ktdsClaims)).toBe(true)

    const flow = nodes.find((n) => n.id === 'flow:POST /orders')!
    expect(flow.name).toBe('주문 생성')
    expect(flow.filePath).toBe('a/OrderCtrl.java')
    expect(flow.lineRange).toEqual([7, 7])
    expect(flow.domainMeta?.entryPoint).toBe('POST /orders')

    // 원본 skeleton 비파괴
    expect(sk.nodes.find((n) => n.id === 'domain:order')!.name).toBe('order')
  })

  it('기각: 모르는 ID·다른 도메인 ID 는 항목 단위 보고, 정상 항목은 적용', () => {
    const fill = orderFill()
    fill.flows.push({ flowId: 'flow:GET /ghost', name: '유령', summary: { text: 'x유령', citations: [CITE] } })
    fill.steps.push({
      stepId: 'step:POST /orders:a/OrderCtrl.java'.replace('order', 'member'),
      name: '월경',
      summary: { text: 'x월경', citations: [CITE] },
    })
    const { nodes, rejected } = applyFills(skeleton(), [fill])
    expect(rejected.map((r) => r.reason).sort()).toEqual(['unknown-flow', 'unknown-step'])
    expect(nodes.find((n) => n.id === 'domain:order')!.name).toBe('주문')
  })

  it('기각: 다른 도메인 소속 노드를 채우려는 시도(flow-outside-domain)', () => {
    const fill = orderFill()
    fill.flows = []
    fill.steps = []
    const sk = skeleton()
    sk.nodes.push({
      id: 'flow:GET /members',
      type: 'flow',
      name: SKELETON_BLANK,
      summary: SKELETON_BLANK,
      tags: ['member'],
      complexity: 'simple',
      domainMeta: {},
    })
    fill.flows.push({ flowId: 'flow:GET /members', name: '침범', summary: { text: 'x침범', citations: [CITE] } })
    const { nodes, rejected } = applyFills(sk, [fill])
    expect(rejected).toEqual([
      { domainId: 'domain:order', ref: 'flow:GET /members', reason: 'flow-outside-domain', kind: 'flow' },
    ])
    expect(nodes.find((n) => n.id === 'flow:GET /members')!.name).toBe(SKELETON_BLANK)
  })

  it('기각: 모르는 도메인 fill(unknown-domain)', () => {
    const fill = orderFill()
    fill.domainId = 'domain:ghost'
    fill.flows = []
    fill.steps = []
    const { rejected } = applyFills(skeleton(), [fill])
    expect(rejected).toEqual([{ domainId: 'domain:ghost', ref: 'domain:ghost', reason: 'unknown-domain', kind: 'domain' }])
  })

  it('unfilledNodes: 빈칸 잔여 노드 식별', () => {
    const { nodes } = applyFills(skeleton(), [orderFill()])
    expect(unfilledNodes(nodes)).toEqual(['domain:member'])
  })
})
