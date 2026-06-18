import { describe, it, expect } from 'vitest'
import type {
  ConfirmedPlan,
  Ownership,
  RouteEntry,
  SkeletonReport,
} from '../domain-map/types.js'
import { computeFlowImpact } from './flow.js'

function route(id: string, filePath: string): RouteEntry {
  return {
    routeId: id,
    method: 'GET',
    path: '/x',
    rawPath: '/x',
    kind: 'api',
    framework: 'spring',
    filePath,
    line: 1,
    handler: 'h',
    notes: [],
  }
}

const skeleton: SkeletonReport = {
  schemaVersion: 1,
  gitCommit: null,
  stepCap: 8,
  nodes: [],
  edges: [
    { source: 'domain:acct', target: 'flow:GET:/acct', type: 'contains_flow' },
    { source: 'flow:GET:/acct', target: 'step:acct:1', type: 'flow_step' },
  ],
  stepSources: [
    { stepId: 'step:acct:1', relPath: 'service/AccountServiceImpl.java', line: 10, className: 'AccountServiceImpl' },
  ],
  truncatedSteps: [{ flowId: 'flow:GET:/big', dropped: ['service/DroppedSvc.java'] }],
}
const ownership: Ownership[] = [
  { relPath: 'service/Loose.java', status: 'sole', owners: ['web/LooseController.java'] },
]
const routes: RouteEntry[] = [route('route:GET:/loose', 'web/LooseController.java')]
const confirmed: ConfirmedPlan = {
  schemaVersion: 1,
  gitCommit: null,
  decidedBy: 'test',
  domains: [{ key: 'acct', name: '계정', roots: ['web/AccountController.java'], aliasKeys: [] }],
  excludedKeys: [],
}

describe('computeFlowImpact', () => {
  it('step 경로: 파일→step→flow→domain, 확정명 → INFERRED', () => {
    const set = new Set(['service/AccountServiceImpl.java'])
    const out = computeFlowImpact(set, skeleton, ownership, routes, confirmed)
    const fl = out.flows.find((f) => f.flowId === 'flow:GET:/acct')!
    expect(fl.via).toBe('step')
    expect(fl.domainId).toBe('domain:acct')
    expect(fl.domainName).toBe('계정')
    expect(fl.routeId).toBe('route:GET:/acct')
    expect(fl.confidence).toBe('INFERRED')
    const dom = out.domains.find((d) => d.key === 'acct')!
    expect(dom.confidence).toBe('INFERRED') // 이름 있음
  })

  it('ownership 폴백: step 미수록 영향 파일 → via ownership-fallback, 도메인 없음', () => {
    const set = new Set(['service/Loose.java'])
    const out = computeFlowImpact(set, skeleton, ownership, routes, confirmed)
    const fl = out.flows.find((f) => f.flowId === 'flow:GET:/loose')!
    expect(fl.via).toBe('ownership-fallback')
    expect(fl.domainId).toBeNull()
  })

  it('truncatedSteps 의 dropped 파일이 영향집합에 있으면 needsReview', () => {
    const set = new Set(['service/DroppedSvc.java'])
    const out = computeFlowImpact(set, skeleton, ownership, routes, confirmed)
    expect(out.needsReview).toContainEqual({
      ref: 'flow:GET:/big',
      reason: 'cap 절단 파일이 영향집합에 있음 — step 미수록(영향 가능성)',
    })
  })

  it('skeleton=null(confirm 전): throw 안 함, skeleton needsReview + 도메인명 UNVERIFIED', () => {
    const set = new Set(['service/Loose.java'])
    const out = computeFlowImpact(set, null, ownership, routes, null)
    expect(out.needsReview.some((n) => n.ref === 'skeleton')).toBe(true)
    // ownership 폴백 흐름은 도메인 링크 없음
    expect(out.flows.every((f) => f.domainId === null)).toBe(true)
  })

  it('도메인명 없으면(미확정) DomainImpact confidence=UNVERIFIED', () => {
    const noName: ConfirmedPlan = { ...confirmed, domains: [] }
    const set = new Set(['service/AccountServiceImpl.java'])
    const out = computeFlowImpact(set, skeleton, ownership, routes, noName)
    const dom = out.domains.find((d) => d.key === 'acct')
    expect(dom?.confidence).toBe('UNVERIFIED')
    expect(dom?.name).toBeNull()
  })
})
