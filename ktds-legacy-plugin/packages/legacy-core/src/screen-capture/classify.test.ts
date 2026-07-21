import { describe, it, expect } from 'vitest'
import { badgeGlyph, classifyElements, classifyKind, pickLabel } from './classify.js'
import type { RawElement } from './types.js'

function el(partial: Partial<RawElement>): RawElement {
  return {
    tag: 'input',
    inputType: 'text',
    name: null,
    domId: null,
    text: null,
    value: null,
    alt: null,
    title: null,
    placeholder: null,
    href: null,
    onclick: null,
    formAction: null,
    formMethod: null,
    required: false,
    disabled: false,
    visible: true,
    bbox: { x: 0, y: 0, width: 100, height: 20 },
    selector: `sel-${Math.abs(JSON.stringify(partial).length)}`,
    ...partial,
  }
}

describe('classifyKind', () => {
  it('a[href] → link, javascript: href → action', () => {
    expect(classifyKind(el({ tag: 'a', href: '/actions/Catalog.action' }))).toEqual({
      kind: 'link',
      eventType: 'link',
    })
    expect(classifyKind(el({ tag: 'a', href: 'javascript:void(0)' }))).toEqual({
      kind: 'action',
      eventType: 'click',
    })
  })

  it('input 분류: submit/image → action(submit), button/reset → action(click), hidden 제외, 그 외 field', () => {
    expect(classifyKind(el({ inputType: 'submit' }))?.eventType).toBe('submit')
    expect(classifyKind(el({ inputType: 'image' }))?.kind).toBe('action')
    expect(classifyKind(el({ inputType: 'reset' }))?.eventType).toBe('click')
    expect(classifyKind(el({ inputType: 'hidden' }))).toBeNull()
    expect(classifyKind(el({ inputType: 'password' }))).toEqual({
      kind: 'field',
      eventType: 'change',
    })
  })

  it('select/textarea → field, onclick 요소 → action, 나머지 → null', () => {
    expect(classifyKind(el({ tag: 'select', inputType: null }))?.kind).toBe('field')
    expect(classifyKind(el({ tag: 'textarea', inputType: null }))?.kind).toBe('field')
    expect(classifyKind(el({ tag: 'div', inputType: null, onclick: 'go()' }))?.kind).toBe('action')
    expect(classifyKind(el({ tag: 'div', inputType: null }))).toBeNull()
  })

  it('button: form 컨텍스트 있으면 submit, 없으면 click', () => {
    expect(
      classifyKind(el({ tag: 'button', inputType: null, formAction: '/a.action' }))?.eventType,
    ).toBe('submit')
    expect(classifyKind(el({ tag: 'button', inputType: null }))?.eventType).toBe('click')
  })
})

describe('classifyElements', () => {
  it('읽기 순서 정렬 + 종류별 독립 번호(field/action/link 각각 1부터)', () => {
    const out = classifyElements([
      el({ tag: 'a', href: '/b', selector: 'a2', bbox: { x: 10, y: 300, width: 50, height: 20 } }),
      el({ inputType: 'text', selector: 'i1', bbox: { x: 10, y: 100, width: 100, height: 20 } }),
      el({
        inputType: 'submit',
        name: 'signon',
        formAction: '/a.action',
        selector: 's1',
        bbox: { x: 10, y: 200, width: 80, height: 24 },
      }),
      el({ inputType: 'password', selector: 'i2', bbox: { x: 10, y: 140, width: 100, height: 20 } }),
      el({ tag: 'a', href: '/c', selector: 'a3', bbox: { x: 10, y: 320, width: 50, height: 20 } }),
    ])
    // link 는 action 과 카운터를 공유하지 않고 독립적으로 1,2 로 매겨진다.
    expect(out.map((a) => [a.kind, a.no, a.selector])).toEqual([
      ['field', 1, 'i1'],
      ['field', 2, 'i2'],
      ['action', 1, 's1'],
      ['link', 1, 'a2'],
      ['link', 2, 'a3'],
    ])
  })

  it('비가시/미세/disabled/중복 selector 제외', () => {
    const out = classifyElements([
      el({ selector: 'x', visible: false }),
      el({ selector: 'y', bbox: { x: 0, y: 0, width: 1, height: 1 } }),
      el({ selector: 'z', disabled: true }),
      el({ selector: 'dup' }),
      el({ selector: 'dup' }),
    ])
    expect(out.map((a) => a.selector)).toEqual(['dup'])
  })

  it('동일 입력 → 동일 출력(결정론)', () => {
    const input = [
      el({ tag: 'a', href: '/x', selector: 'a1', bbox: { x: 5, y: 50, width: 40, height: 16 } }),
      el({ inputType: 'text', selector: 'i1', bbox: { x: 5, y: 20, width: 90, height: 20 } }),
    ]
    expect(JSON.stringify(classifyElements(input))).toBe(JSON.stringify(classifyElements(input)))
  })

  it('mechanical 사실 보존(formMethod 대문자 정규화 포함)', () => {
    const [a] = classifyElements([
      el({
        inputType: 'submit',
        name: 'newOrder',
        formAction: '/actions/Order.action',
        formMethod: 'post',
        required: true,
        selector: 's',
      }),
    ])
    expect(a.mechanical).toEqual({
      tag: 'input',
      inputType: 'submit',
      name: 'newOrder',
      href: null,
      formAction: '/actions/Order.action',
      formMethod: 'POST',
      onclick: null,
      required: true,
    })
    expect(a.handler).toBeNull()
    expect(a.description).toBeNull()
  })
})

describe('pickLabel / badgeGlyph', () => {
  it('라벨 우선순위 text→value→alt→title→placeholder→name, 공백 축약·80자 절단', () => {
    expect(pickLabel(el({ text: '  로그인  \n버튼 ' }), 'field')).toBe('로그인 버튼')
    expect(pickLabel(el({ inputType: 'submit', value: 'Sign On' }), 'action')).toBe('Sign On')
    expect(pickLabel(el({ placeholder: 'user id', name: 'uid' }), 'field')).toBe('user id')
    expect(pickLabel(el({ text: 'x'.repeat(120) }), 'field')).toHaveLength(80)
  })

  it('field 의 value 는 라벨 후보에서 제외 — 입력 데이터("ABC")가 항목명이 되면 안 된다', () => {
    // jpetstore Account 편집 실측: 입력 17개 중 14개가 "ABC"/"Palo Alto" 같은 기존 값이었다.
    expect(pickLabel(el({ value: 'ABC', name: 'account.firstName' }), 'field')).toBe(
      'account.firstName',
    )
    expect(pickLabel(el({ value: 'Palo Alto', placeholder: 'city' }), 'field')).toBe('city')
    // 버튼(action)의 value 는 화면 캡션이므로 그대로 라벨.
    expect(pickLabel(el({ inputType: 'button', value: 'Clear' }), 'action')).toBe('Clear')
  })

  it('앵커 텍스트 부재 시 title/alt 폴백 — 태그명 "a" 라벨 방지', () => {
    expect(pickLabel(el({ tag: 'a', href: '/cart', title: '장바구니 보기' }), 'link')).toBe(
      '장바구니 보기',
    )
    expect(pickLabel(el({ tag: 'a', href: '/cart', alt: 'Cart', title: 'x' }), 'link')).toBe('Cart')
    // text/alt/title 전부 없으면 여전히 태그명 — 대시보드 href 유도 폴백이 받는다.
    expect(pickLabel(el({ tag: 'a', href: '/cart' }), 'link')).toBe('a')
  })

  it('배지 글리프: field=①②③, action=ⓐⓑⓒ, link=ⒶⒷⒸ, 범위 밖 폴백', () => {
    expect(badgeGlyph('field', 1)).toBe('①')
    expect(badgeGlyph('field', 21)).toBe('㉑')
    expect(badgeGlyph('action', 1)).toBe('ⓐ')
    expect(badgeGlyph('action', 3)).toBe('ⓒ')
    expect(badgeGlyph('link', 1)).toBe('Ⓐ')
    expect(badgeGlyph('link', 3)).toBe('Ⓒ')
    expect(badgeGlyph('region', 2)).toBe('②')
    expect(badgeGlyph('action', 27)).toBe('(27)')
    expect(badgeGlyph('link', 27)).toBe('(27)')
    expect(badgeGlyph('field', 51)).toBe('(51)')
  })
})
