import { describe, it, expect } from 'vitest'
import {
  capturePathFor,
  detectFragments,
  domainForJsp,
  listJspFilesFromGraph,
  normalizeUrl,
  reconcileJsps,
  screenIdFor,
  screenKey,
  shouldVisit,
  slugify,
} from './discover.js'

const BASE = new URL('http://localhost:8080/jpetstore/')

describe('normalizeUrl', () => {
  it('same-origin 상대/절대 해석 + jsessionid·hash 제거', () => {
    const u = normalizeUrl(
      '/jpetstore/actions/Catalog.action;jsessionid=ABC123?viewCategory=&categoryId=FISH#x',
      BASE,
    )
    expect(u?.pathname).toBe('/jpetstore/actions/Catalog.action')
    expect(u?.hash).toBe('')
    expect([...u!.searchParams.keys()]).toEqual(['viewCategory', 'categoryId'])
  })

  it('외부 origin / 비 http(s) → null', () => {
    expect(normalizeUrl('https://evil.example.com/x', BASE)).toBeNull()
    expect(normalizeUrl('mailto:a@b.c', BASE)).toBeNull()
  })
})

describe('screenKey / screenIdFor / capturePathFor', () => {
  it('쿼리 "이름" 집합으로 동일 화면 수렴(값 상이 무시)', () => {
    const a = normalizeUrl('/jpetstore/actions/Catalog.action?viewProduct=&productId=FI-SW-01', BASE)!
    const b = normalizeUrl('/jpetstore/actions/Catalog.action?productId=K9-DL-01&viewProduct=', BASE)!
    expect(screenKey(a, '/jpetstore')).toBe(screenKey(b, '/jpetstore'))
    expect(screenKey(a, '/jpetstore')).toBe('actions/Catalog.action?productId&viewProduct')
  })

  it('화면 id 와 캡처 경로 규칙', () => {
    const u = normalizeUrl('/jpetstore/actions/Account.action?signonForm=', BASE)!
    const id = screenIdFor(u, '/jpetstore')
    expect(id).toBe('screen:actions/Account.action__signonForm')
    expect(capturePathFor(id)).toBe('screens/actions_Account.action__signonForm.png')
  })

  it('루트 경로 처리', () => {
    const u = normalizeUrl('/jpetstore/', BASE)!
    expect(screenIdFor(u, '/jpetstore')).toBe('screen:(root)')
    expect(capturePathFor('screen:(root)')).toBe('screens/root.png')
  })
})

describe('slugify / shouldVisit', () => {
  it('slug 는 파일명 안전 문자만', () => {
    expect(slugify('actions/Account.action__signonForm')).toBe(
      'actions_Account.action__signonForm',
    )
    expect(slugify('///')).toBe('root')
  })

  it('자산 확장자·exclude 정규식 제외, 잘못된 정규식은 무시', () => {
    expect(shouldVisit(new URL('http://h/x/style.css'), [])).toBe(false)
    expect(shouldVisit(new URL('http://h/img/logo.png?v=1'), [])).toBe(false)
    expect(shouldVisit(new URL('http://h/actions/Cart.action'), [])).toBe(true)
    expect(shouldVisit(new URL('http://h/actions/Cart.action'), ['Cart\\.action'])).toBe(false)
    expect(shouldVisit(new URL('http://h/actions/Cart.action'), ['[invalid'])).toBe(true)
  })
})

describe('detectFragments / listJspFilesFromGraph / domainForJsp / reconcileJsps', () => {
  it('<html> 없는 JSP 는 fragment', () => {
    expect(
      detectFragments([
        { path: 'a/Full.jsp', content: '<!doctype html>\n<HTML>\n<body>x</body></html>' },
        { path: 'a/IncludeFields.jsp', content: '<%@ taglib %>\n<table>...</table>' },
      ]),
    ).toEqual(['a/IncludeFields.jsp'])
  })

  it('그래프 file 노드에서 JSP 만 추출(정렬·중복 제거)', () => {
    expect(
      listJspFilesFromGraph([
        { id: 'file:src/main/webapp/WEB-INF/jsp/cart/Cart.jsp' },
        { id: 'file:src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp', filePath: 'src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp' },
        { id: 'file:src/main/java/Foo.java' },
        { id: 'class:Foo' },
        { id: 'file:src/main/webapp/WEB-INF/jsp/cart/Cart.jsp' },
      ]),
    ).toEqual([
      'src/main/webapp/WEB-INF/jsp/account/SignonForm.jsp',
      'src/main/webapp/WEB-INF/jsp/cart/Cart.jsp',
    ])
  })

  it('JSP 폴더 → 도메인', () => {
    expect(domainForJsp('src/main/webapp/WEB-INF/jsp/order/NewOrderForm.jsp')).toBe('order')
    expect(domainForJsp('src/main/webapp/index.jsp')).toBeNull()
  })

  it('unmatched = 그래프 JSP − 매핑됨 − fragment', () => {
    expect(
      reconcileJsps(
        ['a.jsp', 'b.jsp', 'c.jsp', 'd.jsp'],
        [{ jspFile: 'a.jsp' }, { jspFile: null }],
        ['c.jsp'],
      ),
    ).toEqual(['b.jsp', 'd.jsp'])
  })
})
