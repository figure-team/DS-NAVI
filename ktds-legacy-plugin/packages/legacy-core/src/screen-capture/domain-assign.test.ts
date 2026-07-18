import { describe, expect, it } from 'vitest'
import {
  assignScreenDomains,
  deriveFolderGroups,
  type DomainAssignContext,
} from './domain-assign.js'
import { computeMechanicalHash } from './assemble.js'
import type { Annotation, Screen } from './types.js'

// ── 픽스처(fill-fanout.test.ts 관례) ────────────────────────────────────────

function ann(no: number, evidenceFiles: string[] = []): Annotation {
  return {
    no,
    kind: 'action',
    label: `버튼${no}`,
    selector: `#btn${no}`,
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    eventType: 'click',
    mechanical: {
      tag: 'button',
      inputType: null,
      name: null,
      href: null,
      formAction: null,
      formMethod: null,
      onclick: null,
      required: false,
    },
    handler:
      evidenceFiles.length > 0
        ? {
            target: 'X#y',
            chain: ['X#y'],
            confidence: 'CONFIRMED',
            evidence: evidenceFiles.map((file) => ({ file, line: 1, snippet: 'x' })),
          }
        : null,
    description: null,
    note: null,
  }
}

function screen(id: string, annotations: Annotation[], over: Partial<Screen> = {}): Screen {
  return {
    id,
    title: over.title ?? `화면 ${id}`,
    url: over.url ?? `http://localhost/${id}`,
    jspFile: over.jspFile ?? null,
    graphNodeId: over.graphNodeId ?? null,
    domain: over.domain ?? null,
    scenario: null,
    openedFrom: null,
    contentSignature: null,
    capture: {
      path: `screens/${id.replace(/[^A-Za-z0-9._-]/g, '_')}.png`,
      width: 800,
      height: 600,
      capturedAt: '2026-07-13T00:00:00.000Z',
      contentHash: 'abc123',
    },
    summary: null,
    annotations,
  }
}

function ctx(over: Partial<DomainAssignContext> = {}): DomainAssignContext {
  return {
    domainByRoot: over.domainByRoot ?? new Map(),
    ownersByFile: over.ownersByFile ?? new Map(),
    planDomainCount: over.planDomainCount ?? 0,
  }
}

const ROOTS = new Map([
  ['web/AccountBean.java', 'account'],
  ['web/CartBean.java', 'cart'],
  ['web/OrderBean.java', 'order'],
  ['web/CatalogBean.java', 'catalog'],
])

// ── ① 핸들러 근거 조인 ─────────────────────────────────────────────────────

describe('assignScreenDomains — 핸들러 근거 조인', () => {
  it('근거 파일이 플랜 roots 에 직접 일치하면 다수결로 배정한다', () => {
    const s = screen('screen:a', [
      ann(1, ['web/AccountBean.java']),
      ann(2, ['web/AccountBean.java']),
      ann(3, ['web/CartBean.java']),
    ])
    const r = assignScreenDomains([s], ctx({ domainByRoot: ROOTS }))
    expect(r.screens[0].domain).toBe('account')
    expect(r.summary.byMethod.handlerJoin).toBe(1)
  })

  it('직접 일치 표가 있으면 소유권 조인 표는 무시한다(공유 유틸 소음 차단)', () => {
    const s = screen('screen:a', [
      ann(1, ['web/CartBean.java']),
      ann(2, ['common/Util.java']),
      ann(3, ['common/Util.java']),
    ])
    const r = assignScreenDomains(
      [s],
      ctx({
        domainByRoot: ROOTS,
        ownersByFile: new Map([['common/Util.java', ['web/AccountBean.java']]]),
      }),
    )
    expect(r.screens[0].domain).toBe('cart')
  })

  it('직접 일치가 없으면 소유권 경유로 배정하되, 모호(도메인 4+ 공유) 파일은 버린다', () => {
    const shared = ['web/AccountBean.java', 'web/CartBean.java', 'web/OrderBean.java', 'web/CatalogBean.java']
    const s = screen('screen:a', [
      ann(1, ['svc/CartService.java']),
      ann(2, ['common/Base.java']), // 4개 도메인 공유 → 표 없음
    ])
    const r = assignScreenDomains(
      [s],
      ctx({
        domainByRoot: ROOTS,
        ownersByFile: new Map([
          ['svc/CartService.java', ['web/CartBean.java']],
          ['common/Base.java', shared],
        ]),
      }),
    )
    expect(r.screens[0].domain).toBe('cart')
  })

  it('최다 득표가 과반 미만이면 배정하지 않는다(다음 단계 폴백)', () => {
    const s = screen('screen:a', [
      ann(1, ['web/AccountBean.java']),
      ann(2, ['web/CartBean.java']),
      ann(3, ['web/OrderBean.java']),
    ])
    const r = assignScreenDomains([s], ctx({ domainByRoot: ROOTS }))
    expect(r.screens[0].domain).toBeNull()
  })

  it('뷰 폴더가 플랜 키와 일치하면 핸들러 표보다 우선한다(상품 상세→cart 오배정 교정)', () => {
    const screens = [
      screen('screen:item', [ann(1, ['web/CartBean.java']), ann(2, ['web/CartBean.java'])], {
        jspFile: 'webapp/jsp/catalog/Item.jsp',
      }),
      screen('screen:cart', [ann(1)], { jspFile: 'webapp/jsp/cart/Cart.jsp' }),
    ]
    const r = assignScreenDomains(screens, ctx({ domainByRoot: ROOTS }))
    expect(r.screens[0].domain).toBe('catalog')
  })

  it('공통 크롬(전 화면 반복 링크/폼)의 표는 제외한다 — jpetstore catalog 쏠림 회귀', () => {
    // 4화면 전부에 같은 카탈로그 링크(GNB) — 화면 고유 신호는 각자 1표뿐.
    const navLink = (): Annotation => {
      const a = ann(9, ['web/CatalogBean.java'])
      return { ...a, kind: 'link', mechanical: { ...a.mechanical, href: '/catalog/main' } }
    }
    const screens = [
      screen('screen:acc', [ann(1, ['web/AccountBean.java']), navLink()]),
      screen('screen:cart', [ann(1, ['web/CartBean.java']), navLink()]),
      screen('screen:ord', [ann(1, ['web/OrderBean.java']), navLink()]),
      screen('screen:cat', [ann(1, ['web/CatalogBean.java']), navLink()]),
    ]
    const r = assignScreenDomains(screens, ctx({ domainByRoot: ROOTS }))
    expect(r.screens.map((s) => s.domain)).toEqual(['account', 'cart', 'order', 'catalog'])
  })

  it('동률은 키 사전순으로 결정론 tie-break 한다', () => {
    const s = screen('screen:a', [ann(1, ['web/CartBean.java']), ann(2, ['web/AccountBean.java'])])
    const r = assignScreenDomains([s], ctx({ domainByRoot: ROOTS }))
    expect(r.screens[0].domain).toBe('account')
  })
})

// ── ② 뷰 파일 조인 ─────────────────────────────────────────────────────────

describe('assignScreenDomains — 뷰 파일 조인', () => {
  it('핸들러 근거가 없으면 jspFile 을 소유권으로 조인한다(폴더명이 플랜 키가 아닐 때)', () => {
    const s = screen('screen:a', [ann(1)], { jspFile: 'webapp/views/v1/CartView.jsp' })
    const r = assignScreenDomains(
      [s],
      ctx({
        domainByRoot: ROOTS,
        ownersByFile: new Map([['webapp/views/v1/CartView.jsp', ['web/CartBean.java']]]),
      }),
    )
    expect(r.screens[0].domain).toBe('cart')
    expect(r.summary.byMethod.viewFileJoin).toBe(1)
  })

  it('graphNodeId 의 file: 접두를 벗겨 대조한다', () => {
    const s = screen('screen:a', [ann(1)], { graphNodeId: 'file:webapp/jsp/order/Order.jsp' })
    const r = assignScreenDomains(
      [s],
      ctx({
        domainByRoot: ROOTS,
        ownersByFile: new Map([['webapp/jsp/order/Order.jsp', ['web/OrderBean.java']]]),
      }),
    )
    expect(r.screens[0].domain).toBe('order')
  })
})

// ── ③④ 폴더 파생 ──────────────────────────────────────────────────────────

describe('deriveFolderGroups', () => {
  it('공통 디렉터리 접두를 걷어낸 첫 세그먼트로 그룹핑한다', () => {
    const out = deriveFolderGroups(
      ['webapp/jsp/account/A.jsp', 'webapp/jsp/account/B.jsp', 'webapp/jsp/cart/C.jsp'],
      24,
    )
    expect(out).toEqual(['account', 'account', 'cart'])
  })

  it('전 화면이 한 폴더뿐이면(접두가 의미 세그먼트를 먹음) 접두를 되물려 폴더명을 살린다', () => {
    const out = deriveFolderGroups(['jsp/account/A.jsp', 'jsp/account/B.jsp'], 24)
    expect(out).toEqual(['account', 'account'])
  })

  it('그룹 수가 상한을 넘으면 접두를 되물려 접고, 끝내 못 맞추면 전부 null', () => {
    const paths = ['a/x/F.jsp', 'b/y/F.jsp', 'c/z/F.jsp']
    expect(deriveFolderGroups(paths, 3)).toEqual(['a', 'b', 'c'])
    expect(deriveFolderGroups(paths, 2)).toEqual([null, null, null])
  })

  it('디렉터리가 없는 경로(파일명뿐)와 null 은 후보 없이 통과한다', () => {
    const out = deriveFolderGroups(['help.html', null, 'jsp/cart/C.jsp'], 24)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
  })
})

describe('assignScreenDomains — 파생 폴백', () => {
  it('조인 실패 화면은 jspFile 뷰 폴더 파생으로 채운다', () => {
    const screens = [
      screen('screen:a', [ann(1)], { jspFile: 'webapp/jsp/account/A.jsp' }),
      screen('screen:b', [ann(1)], { jspFile: 'webapp/jsp/cart/C.jsp' }),
    ]
    const r = assignScreenDomains(screens, ctx())
    expect(r.screens.map((s) => s.domain)).toEqual(['account', 'cart'])
    expect(r.summary.byMethod.viewFolder).toBe(2)
  })

  it('jspFile 도 없으면 화면 id(URL 경로)에서 파생한다("__변형" 접미 제거)', () => {
    const screens = [
      screen('screen:sym/tbm/tbr/list.do', [ann(1)]),
      screen('screen:sym/tbm/tbp/view.do__q_1', [ann(1)]),
      screen('screen:uss/umt/main.do', [ann(1)]),
    ]
    const r = assignScreenDomains(screens, ctx())
    expect(r.screens.map((s) => s.domain)).toEqual(['sym', 'sym', 'uss'])
    expect(r.summary.byMethod.urlFolder).toBe(3)
  })

  it('URL 경로의 "."-조인이 플랜 키와 일치하면 일반 폴더 파생보다 우선한다(egov 모듈 URL)', () => {
    const r = assignScreenDomains(
      [screen('screen:sym/tbm/tbr/list.do', [ann(1)]), screen('screen:sym/tbm/tbp/view.do', [ann(1)])],
      ctx({ domainByRoot: new Map([['web/Troubl.java', 'sym.tbm.tbr']]) }),
    )
    expect(r.screens[0].domain).toBe('sym.tbm.tbr')
    expect(r.screens[1].domain).toBe('tbp') // 키 불일치 → 일반 폴더 파생 폴백
  })

  it('(root) 등 경로꼴이 아닌 id 는 미배정(null)으로 남긴다 — 지어내지 않음', () => {
    const r = assignScreenDomains([screen('screen:(root)', [ann(1)])], ctx())
    expect(r.screens[0].domain).toBeNull()
    expect(r.summary.byMethod.unassigned).toBe(1)
  })
})

// ── 불변식 ─────────────────────────────────────────────────────────────────

describe('assignScreenDomains — 불변식', () => {
  it('멱등: 재실행해도 같은 결과', () => {
    const screens = [
      screen('screen:a', [ann(1, ['web/AccountBean.java'])]),
      screen('screen:b', [ann(1)], { jspFile: 'webapp/jsp/cart/C.jsp' }),
    ]
    const c = ctx({ domainByRoot: ROOTS })
    const once = assignScreenDomains(screens, c)
    const twice = assignScreenDomains(once.screens, c)
    expect(twice.screens).toEqual(once.screens)
  })

  it('기존 domain 값을 보지 않고 항상 재계산한다(낡은 값 잔존 방지)', () => {
    const s = screen('screen:a', [ann(1, ['web/CartBean.java'])], { domain: 'stale' })
    const r = assignScreenDomains([s], ctx({ domainByRoot: ROOTS }))
    expect(r.screens[0].domain).toBe('cart')
  })

  it('mechanicalHash 를 바꾸지 않는다(domain 은 채움 필드)', () => {
    const screens = [screen('screen:a', [ann(1, ['web/AccountBean.java'])])]
    const before = computeMechanicalHash(screens)
    const r = assignScreenDomains(screens, ctx({ domainByRoot: ROOTS }))
    expect(computeMechanicalHash(r.screens)).toBe(before)
  })
})
