import { describe, it, expect } from 'vitest'
import type { BatchEntry, Ownership, RouteEntry } from '../domain-map/types.js'
import { computeApiImpact } from './api.js'

function route(id: string, filePath: string, line: number): RouteEntry {
  return {
    routeId: id,
    method: 'GET',
    path: '/' + id,
    rawPath: '/' + id,
    kind: 'api',
    framework: 'spring',
    filePath,
    line,
    handler: 'h',
    notes: [],
  }
}

const routes: RouteEntry[] = [
  route('route:GET:/acct', 'web/AccountController.java', 12),
  route('route:GET:/cat', 'web/CatalogController.java', 9),
  route('route:GET:/rev', 'web/RevOnlyController.java', 4),
]
const batches: BatchEntry[] = []
// ownership: 시드(svc)에 도달하는 root = AccountController. (캡일관 1차 신호)
const ownership: Ownership[] = [
  { relPath: 'service/AccountServiceImpl.java', status: 'sole', owners: ['web/AccountController.java'] },
]

describe('computeApiImpact', () => {
  it('both(ownership ∩ reverse) → CONFIRMED_AI, crossCheckDiff 없음', () => {
    const seeds = ['service/AccountServiceImpl.java']
    const reverse = ['web/AccountController.java'] // reach upstream
    const { api, crossCheckDiff } = computeApiImpact(seeds, reverse, ownership, routes, batches)
    const acct = api.find((a) => a.id === 'route:GET:/acct')!
    expect(acct.via).toBe('both')
    expect(acct.confidence).toBe('CONFIRMED_AI')
    expect(crossCheckDiff.find((d) => d.id === 'route:GET:/acct')).toBeUndefined()
  })

  it('ownership-only → INFERRED + crossCheckDiff(ownership-only)', () => {
    const seeds = ['service/AccountServiceImpl.java']
    const reverse: string[] = [] // reverse 가 컨트롤러를 못 봄
    const { api, crossCheckDiff } = computeApiImpact(seeds, reverse, ownership, routes, batches)
    const acct = api.find((a) => a.id === 'route:GET:/acct')!
    expect(acct.via).toBe('ownership')
    expect(acct.confidence).toBe('INFERRED')
    expect(crossCheckDiff).toContainEqual({ id: 'route:GET:/acct', side: 'ownership-only' })
  })

  it('reverse-only → UNVERIFIED(blueprint NEEDS_REVIEW 매핑) + crossCheckDiff(reverse-only)', () => {
    const seeds = ['service/AccountServiceImpl.java']
    const reverse = ['web/RevOnlyController.java'] // ownership 엔 없는 파일
    const { api, crossCheckDiff } = computeApiImpact(seeds, reverse, ownership, routes, batches)
    const rev = api.find((a) => a.id === 'route:GET:/rev')!
    expect(rev.via).toBe('reverse')
    expect(rev.confidence).toBe('UNVERIFIED')
    expect(crossCheckDiff).toContainEqual({ id: 'route:GET:/rev', side: 'reverse-only' })
  })

  it('무관 라우트(catalog)는 산출 안 함', () => {
    const { api } = computeApiImpact(
      ['service/AccountServiceImpl.java'],
      ['web/AccountController.java'],
      ownership,
      routes,
      batches,
    )
    expect(api.find((a) => a.id === 'route:GET:/cat')).toBeUndefined()
  })

  it('결정론: api 는 (targetKind,id) 정렬', () => {
    const { api } = computeApiImpact(
      ['service/AccountServiceImpl.java'],
      ['web/AccountController.java', 'web/RevOnlyController.java'],
      ownership,
      routes,
      batches,
    )
    const ids = api.map((a) => a.id)
    expect(ids).toEqual([...ids].sort())
  })
})
