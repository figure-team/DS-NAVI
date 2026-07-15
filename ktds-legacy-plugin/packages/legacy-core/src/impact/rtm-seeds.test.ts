import { describe, it, expect } from 'vitest'
import type { RtmFunctionRow, RtmTraceCell } from '../rtm/types.js'
import type { Confidence } from '../types.js'
import { resolveFlowSeeds } from './rtm-seeds.js'

function cell(files: string[], confidence: Confidence = 'CONFIRMED'): RtmTraceCell {
  return {
    value: files.join(', '),
    confidence: files.length > 0 ? confidence : 'INFERRED',
    evidence: files.map((file) => ({ file, line: 1 })),
  }
}

function fn(id: string, entry: string[], impl: string[] = [], conf: Confidence = 'CONFIRMED'): RtmFunctionRow {
  return {
    id,
    featureId: 'FN-000',
    name: id,
    domainId: 'domain:account',
    domainName: 'account',
    entryPoint: cell(entry, conf),
    implementation: cell(impl),
    data: cell([]),
    test: cell([]),
    origin: 'AS_IS',
    state: 'IMPLEMENTED',
    requirementHistory: [],
    nfrTags: [],
    rules: [],
    deliverableRefs: [],
    custom: {},
  }
}

const AAB = 'src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java'
const CAT = 'src/main/java/org/mybatis/jpetstore/service/CatalogService.java'

describe('resolveFlowSeeds — flow→시드 결정론 조인(P6)', () => {
  const functions = [
    fn('flow:ANY /actions/Account.action', [AAB], [AAB]),
    fn('flow:ANY /actions/Account.action?signon', [AAB], [AAB, CAT]),
    fn('flow:ANY /actions/Cart.action', ['src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java']),
  ]

  it('modified(flow) → entryPoint 근거 파일을 시드로 낸다', () => {
    const r = resolveFlowSeeds(functions, ['flow:ANY /actions/Account.action?signon'])
    expect(r.seeds).toEqual([{ relPath: AAB, origin: 'route', confidence: 'CONFIRMED' }])
  })

  it('★ 시드 범위 = entryPoint 만 — implementation 의 협력자는 시드가 아니다(§7 C4 시드 폭발)', () => {
    // signon 의 implementation 은 CatalogService(로그인 후 카탈로그 포워드 협력자)를 포함하지만
    // 그건 변경 대상이 아니다 — 시드로 넣으면 catalog 도메인 전체가 거짓 양성으로 딸려온다.
    const r = resolveFlowSeeds(functions, ['flow:ANY /actions/Account.action?signon'])
    expect(r.seeds.map((s) => s.relPath)).not.toContain(CAT)
  })

  it('여러 flow 가 같은 진입 파일을 가리키면 시드는 1개로 합쳐진다', () => {
    const r = resolveFlowSeeds(functions, [
      'flow:ANY /actions/Account.action',
      'flow:ANY /actions/Account.action?signon',
    ])
    expect(r.seeds).toHaveLength(1)
    expect(r.bySource).toEqual([
      { fnId: 'flow:ANY /actions/Account.action', relPaths: [AAB] },
      { fnId: 'flow:ANY /actions/Account.action?signon', relPaths: [AAB] },
    ])
  })

  it('`to-be:` 는 제외한다 — 아직 파일이 없다', () => {
    const r = resolveFlowSeeds(functions, ['to-be:account/카카오-로그인-진입', 'flow:ANY /actions/Cart.action'])
    expect(r.skippedToBe).toEqual(['to-be:account/카카오-로그인-진입'])
    expect(r.seeds).toHaveLength(1)
  })

  it('rtm.json 에 없는 fnId 는 unknown 으로 보고(조용한 드롭 금지)', () => {
    const r = resolveFlowSeeds(functions, ['flow:ANY /nope'])
    expect(r.unknownFnIds).toEqual(['flow:ANY /nope'])
    expect(r.seeds).toEqual([])
  })

  it('entryPoint 근거 0건은 ungrounded 로 보고 — 조용히 떨구지 않는다', () => {
    const r = resolveFlowSeeds([fn('flow:ANY /bare', [])], ['flow:ANY /bare'])
    expect(r.ungroundedFnIds).toEqual(['flow:ANY /bare'])
    expect(r.seeds).toEqual([])
  })

  it('같은 파일을 강·약 신뢰도가 함께 가리키면 강한 쪽이 남는다(강등 금지)', () => {
    const r = resolveFlowSeeds(
      [fn('flow:a', [AAB], [], 'INFERRED'), fn('flow:b', [AAB], [], 'CONFIRMED')],
      ['flow:a', 'flow:b'],
    )
    expect(r.seeds).toEqual([{ relPath: AAB, origin: 'route', confidence: 'CONFIRMED' }])
  })

  it('결정론 — 입력 순서가 달라도 동일 출력', () => {
    const a = resolveFlowSeeds(functions, ['flow:ANY /actions/Cart.action', 'flow:ANY /actions/Account.action'])
    const b = resolveFlowSeeds(functions, ['flow:ANY /actions/Account.action', 'flow:ANY /actions/Cart.action'])
    expect(a).toEqual(b)
  })

  it('중복 fnId 는 한 번만 센다', () => {
    const r = resolveFlowSeeds(functions, ['flow:ANY /actions/Cart.action', 'flow:ANY /actions/Cart.action'])
    expect(r.bySource).toHaveLength(1)
  })
})
