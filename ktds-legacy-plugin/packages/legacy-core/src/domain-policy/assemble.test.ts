import { describe, it, expect } from 'vitest'
import { buildDomainPolicyInputs, type DomainGraphLite } from './assemble.js'
import type { CandidatesReport } from '../domain-map/types.js'
import type { BranchSignal } from './types.js'

const candidates: CandidatesReport = {
  schemaVersion: 1,
  gitCommit: null,
  directoryDegenerate: null,
  candidates: [
    {
      key: 'order',
      roots: [],
      entryCount: 1,
      files: [
        { relPath: 'web/OrderActionBean.java', via: 'reachability' },
        { relPath: 'web/order-mapper.xml', via: 'directory' },
      ],
    },
    { key: 'account', roots: [], entryCount: 1, files: [{ relPath: 'web/AccountActionBean.java', via: 'reachability' }] },
  ],
  common: [],
  ambiguous: [],
  unresolved: [],
}

const domainGraph: DomainGraphLite = {
  nodes: [
    { id: 'domain:order', type: 'domain', name: '주문', summary: '', tags: [], complexity: 'simple' },
    { id: 'flow:checkout', type: 'flow', name: '체크아웃', filePath: 'web/OrderActionBean.java', lineRange: [142, 160], summary: '', tags: [], complexity: 'simple' },
  ],
  edges: [{ source: 'domain:order', target: 'flow:checkout', type: 'contains_flow' }],
}

const branchesByKey = new Map<string, BranchSignal[]>([
  ['order', [{ relPath: 'web/OrderActionBean.java', line: 125, className: 'OrderActionBean', methodName: 'newOrderForm', kind: 'if', condition: '!auth', then: 'return "deny";' }]],
])

describe('도메인 정책 입력 조립 (PD3)', () => {
  it('candidates → 도메인별 입력(key 정렬, .java 만 클래스, xml 제외)', () => {
    const inputs = buildDomainPolicyInputs(candidates, domainGraph, branchesByKey)
    expect(inputs.map((i) => i.key)).toEqual(['account', 'order']) // key 정렬
    const order = inputs.find((i) => i.key === 'order')!
    expect(order.name).toBe('주문') // domain-graph 표시명
    expect(order.classes).toEqual([{ className: 'OrderActionBean', relPath: 'web/OrderActionBean.java' }])
    expect(order.flows).toEqual([{ name: '체크아웃', entry: { file: 'web/OrderActionBean.java', line: 142 } }])
    expect(order.branches.length).toBe(1)
  })

  it('domainGraph 없으면 흐름 빈배열·표시명=key (우아한 degrade)', () => {
    const inputs = buildDomainPolicyInputs(candidates, null, new Map())
    const order = inputs.find((i) => i.key === 'order')!
    expect(order.name).toBe('order')
    expect(order.flows).toEqual([])
    expect(order.branches).toEqual([])
  })
})
