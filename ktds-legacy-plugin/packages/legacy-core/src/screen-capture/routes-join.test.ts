import { describe, it, expect } from 'vitest'
import type { RouteEntry } from '../domain-map/types.js'
import { joinRoutes, normalizeActionPath } from './routes-join.js'
import type { Annotation } from './types.js'

/** jpetstore routes.json 실물 축약 픽스처. */
const ROUTES: RouteEntry[] = [
  {
    routeId: 'route:ANY *.action',
    method: 'ANY',
    path: '*.action',
    rawPath: '*.action',
    kind: 'servlet',
    framework: 'webxml',
    filePath: 'src/main/webapp/WEB-INF/web.xml',
    line: 60,
    handler: null,
    notes: ['dispatcher'],
  },
  {
    routeId: 'route:ANY /actions/Account.action',
    method: 'ANY',
    path: '/actions/Account.action',
    rawPath: '/actions/Account.action',
    kind: 'form',
    framework: 'stripes',
    filePath: 'src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java',
    line: 149,
    handler: 'AccountActionBean#signonForm',
    notes: ['stripes-event'],
  },
  {
    routeId: 'route:ANY /actions/Account.action?signon',
    method: 'ANY',
    path: '/actions/Account.action?signon',
    rawPath: '/actions/Account.action?signon',
    kind: 'form',
    framework: 'stripes',
    filePath: 'src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java',
    line: 159,
    handler: 'AccountActionBean#signon',
    notes: ['stripes-event'],
  },
  {
    routeId: 'route:ANY /actions/Account.action?signonForm',
    method: 'ANY',
    path: '/actions/Account.action?signonForm',
    rawPath: '/actions/Account.action?signonForm',
    kind: 'form',
    framework: 'stripes',
    filePath: 'src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java',
    line: 149,
    handler: 'AccountActionBean#signonForm',
    notes: ['stripes-event'],
  },
] as RouteEntry[]

function ann(partial: Partial<Annotation> & { mechanical?: Partial<Annotation['mechanical']> }): Annotation {
  return {
    no: 1,
    kind: 'link',
    selector: 's',
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    label: 'l',
    eventType: 'link',
    description: null,
    note: null,
    handler: null,
    ...partial,
    mechanical: {
      tag: 'a',
      inputType: null,
      name: null,
      href: null,
      formAction: null,
      formMethod: null,
      onclick: null,
      required: false,
      ...(partial.mechanical ?? {}),
    },
  }
}

describe('normalizeActionPath', () => {
  it('컨텍스트/오리진/jsessionid/fragment 제거 + 쿼리 키 추출', () => {
    expect(
      normalizeActionPath(
        'http://localhost:8080/jpetstore/actions/Account.action;jsessionid=ABC?signonForm=&x=1#top',
        '/jpetstore',
      ),
    ).toEqual({ path: '/actions/Account.action', queryKeys: ['signonForm', 'x'] })
  })

  it('상대 경로·컨텍스트 없음도 처리', () => {
    expect(normalizeActionPath('actions/Catalog.action?viewCategory=', null)).toEqual({
      path: '/actions/Catalog.action',
      queryKeys: ['viewCategory'],
    })
  })

  it('javascript:/mailto:/fragment/빈 값 → null', () => {
    expect(normalizeActionPath('javascript:void(0)')).toBeNull()
    expect(normalizeActionPath('mailto:a@b.c')).toBeNull()
    expect(normalizeActionPath('#anchor')).toBeNull()
    expect(normalizeActionPath('  ')).toBeNull()
  })
})

describe('joinRoutes', () => {
  it('링크 href 이벤트 쿼리키 → CONFIRMED handler(file:line 근거)', () => {
    const [out] = joinRoutes(
      [ann({ mechanical: { href: '/jpetstore/actions/Account.action?signonForm=' } })],
      { routes: ROUTES, contextPath: '/jpetstore' },
    )
    expect(out.handler).toEqual({
      target: 'AccountActionBean#signonForm',
      chain: [],
      evidence: [
        {
          file: 'src/main/java/org/mybatis/jpetstore/web/actions/AccountActionBean.java',
          line: 149,
        },
      ],
      confidence: 'CONFIRMED',
    })
  })

  it('submit name = Stripes 이벤트 → 이벤트 라우트 우선 매칭', () => {
    const [out] = joinRoutes(
      [
        ann({
          kind: 'action',
          eventType: 'submit',
          mechanical: {
            tag: 'input',
            inputType: 'submit',
            name: 'signon',
            formAction: '/jpetstore/actions/Account.action',
          },
        }),
      ],
      { routes: ROUTES, contextPath: '/jpetstore' },
    )
    expect(out.handler?.target).toBe('AccountActionBean#signon')
    expect(out.handler?.evidence[0].line).toBe(159)
  })

  it('이벤트 미매칭 시 기본 라우트 폴백', () => {
    const [out] = joinRoutes(
      [ann({ mechanical: { href: '/jpetstore/actions/Account.action?unknownEvent=' } })],
      { routes: ROUTES, contextPath: '/jpetstore' },
    )
    expect(out.handler?.target).toBe('AccountActionBean#signonForm')
  })

  it('미등록 경로 / handler=null 라우트 / javascript: → handler null 유지', () => {
    const outs = joinRoutes(
      [
        ann({ mechanical: { href: '/jpetstore/actions/Nope.action' } }),
        ann({ mechanical: { href: 'javascript:go()' } }),
      ],
      { routes: ROUTES, contextPath: '/jpetstore' },
    )
    expect(outs.every((a) => a.handler === null)).toBe(true)
  })

  it('이미 handler 가 있으면 보존(멱등)', () => {
    const pre = ann({ mechanical: { href: '/jpetstore/actions/Account.action?signon=' } })
    pre.handler = {
      target: 'Custom#kept',
      chain: ['a'],
      evidence: [{ file: 'x.java', line: 1 }],
      confidence: 'CONFIRMED_AI',
    }
    const [out] = joinRoutes([pre], { routes: ROUTES, contextPath: '/jpetstore' })
    expect(out.handler?.target).toBe('Custom#kept')
  })
})
