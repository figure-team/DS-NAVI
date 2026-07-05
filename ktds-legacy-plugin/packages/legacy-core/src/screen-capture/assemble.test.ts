import { describe, it, expect } from 'vitest'
import {
  buildScreensFile,
  computeContentSignature,
  computeMechanicalHash,
  serializeScreens,
  validateScreensFile,
  type BuildScreensInput,
} from './assemble.js'
import type { Annotation, Screen } from './types.js'

function ann(no: number, kind: Annotation['kind'], overrides?: Partial<Annotation>): Annotation {
  return {
    no,
    kind,
    selector: `sel-${kind}-${no}`,
    bbox: { x: 1, y: 2, width: 30, height: 10 },
    label: `L${no}`,
    eventType: kind === 'field' ? 'change' : 'link',
    mechanical: {
      tag: kind === 'field' ? 'input' : 'a',
      inputType: kind === 'field' ? 'text' : null,
      name: null,
      href: kind === 'field' ? null : '/actions/X.action',
      formAction: null,
      formMethod: null,
      onclick: null,
      required: false,
    },
    handler: null,
    description: null,
    note: null,
    ...overrides,
  }
}

function screen(id: string, annotations: Annotation[], overrides?: Partial<Screen>): Screen {
  return {
    id,
    title: id,
    url: 'actions/X.action',
    jspFile: null,
    graphNodeId: null,
    domain: null,
    scenario: null,
    openedFrom: null,
    contentSignature: null,
    capture: {
      path: `screens/${id.replace(/[^A-Za-z0-9._-]+/g, '_')}.png`,
      width: 1280,
      height: 900,
      capturedAt: '2026-07-03T00:00:00.000Z',
      contentHash: 'abc',
    },
    summary: null,
    annotations,
    ...overrides,
  }
}

function input(screens: Screen[], extra?: Partial<BuildScreensInput>): BuildScreensInput {
  return {
    generatedAt: '2026-07-03T00:00:00.000Z',
    gitCommit: 'deadbeef',
    baseUrl: 'http://localhost:8080/jpetstore',
    viewport: { width: 1280, height: 800 },
    screens,
    fragments: [],
    graphJsps: [],
    missing: [],
    ...extra,
  }
}

describe('buildScreensFile', () => {
  it('id ASC 정렬 + unmatchedJsps 대조 + zod 통과', () => {
    const f = buildScreensFile(
      input(
        [
          screen('screen:b', [ann(1, 'field')], { jspFile: 'jsp/b.jsp' }),
          screen('screen:a', [ann(1, 'link')]),
        ],
        { graphJsps: ['jsp/a.jsp', 'jsp/b.jsp', 'jsp/frag.jsp'], fragments: ['jsp/frag.jsp'] },
      ),
    )
    expect(f.screens.map((s) => s.id)).toEqual(['screen:a', 'screen:b'])
    expect(f.unmatchedJsps).toEqual(['jsp/a.jsp'])
    expect(f.fragments).toEqual(['jsp/frag.jsp'])
  })

  it('동일 입력 → 동일 바이트(결정론, byte-diff=0 게이트)', () => {
    const make = () =>
      serializeScreens(
        buildScreensFile(
          input([screen('screen:a', [ann(1, 'field'), ann(1, 'action')])], {
            graphJsps: ['x.jsp'],
          }),
        ),
      )
    expect(make()).toBe(make())
  })

  it('mechanicalHash 는 mechanical 사실에만 반응', () => {
    const base = buildScreensFile(input([screen('screen:a', [ann(1, 'field')])]))
    const filled = buildScreensFile(
      input([
        screen('screen:a', [ann(1, 'field', { description: '설명 채움', label: '바뀐 라벨' })], {
          title: '한국어 제목',
        }),
      ]),
    )
    const moved = buildScreensFile(
      input([screen('screen:a', [ann(1, 'field', { bbox: { x: 9, y: 9, width: 9, height: 9 } })])]),
    )
    expect(filled.mechanicalHash).toBe(base.mechanicalHash)
    expect(moved.mechanicalHash).not.toBe(base.mechanicalHash)
  })
})

describe('validateScreensFile', () => {
  it('정상 파일 통과 + 통계', () => {
    const f = buildScreensFile(
      input([
        screen(
          'screen:a',
          [
            ann(1, 'field', { description: '아이디 입력' }),
            ann(1, 'link', {
              description: '로그인 화면 이동',
              handler: {
                target: 'AccountActionBean#signonForm',
                chain: [],
                evidence: [{ file: 'A.java', line: 149 }],
                confidence: 'CONFIRMED',
              },
            }),
            ann(2, 'link'),
          ],
          { jspFile: 'jsp/a.jsp' },
        ),
      ]),
    )
    const r = validateScreensFile(f)
    expect(r.ok).toBe(true)
    expect(r.stats).toEqual({
      screenCount: 1,
      annotationCount: 3,
      confirmedActionRate: 0.5,
      descriptionRate: 2 / 3,
      jspMappedRate: 1,
      unmatchedJspCount: 0,
    })
  })

  it('CONFIRMED 인데 evidence 없음 → fail-closed', () => {
    const f = buildScreensFile(
      input([
        screen('screen:a', [
          ann(1, 'link', {
            handler: { target: 'X#y', chain: [], evidence: [], confidence: 'CONFIRMED' },
          }),
        ]),
      ]),
    )
    const r = validateScreensFile(f)
    expect(r.ok).toBe(false)
    expect(r.issues[0].code).toBe('confirmed-without-evidence')
  })

  it('mechanical 변조 감지(hash mismatch)', () => {
    const f = buildScreensFile(input([screen('screen:a', [ann(1, 'field')])]))
    const tampered = structuredClone(f)
    tampered.screens[0].annotations[0].mechanical.href = '/tampered'
    const r = validateScreensFile(tampered)
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.code === 'mechanical-hash-mismatch')).toBe(true)
  })

  it('스키마 위반 → schema 이슈', () => {
    const r = validateScreensFile({ schemaVersion: 2 })
    expect(r.ok).toBe(false)
    expect(r.issues.every((i) => i.code === 'schema')).toBe(true)
    expect(r.stats).toBeNull()
  })

  it('주석 키/화면 id 중복 감지', () => {
    const f = buildScreensFile(
      input([screen('screen:a', [ann(1, 'field'), ann(1, 'field', { selector: 'other' })])]),
    )
    const r = validateScreensFile(f)
    expect(r.issues.some((i) => i.code === 'duplicate-annotation-key')).toBe(true)
  })

  it('contentSignature: title 동일해도 주석 집합이 다르면 구분, 같으면 동일(포워드 감지)', () => {
    const signonAnns = [
      ann(1, 'field', { label: 'Username', mechanical: { ...ann(1, 'field').mechanical, name: 'username' } }),
      ann(1, 'action', { label: 'Login', mechanical: { ...ann(1, 'action').mechanical, name: 'signon', formAction: '/actions/Account.action', href: null } }),
    ]
    const itemAnns = [
      ann(1, 'link', { label: 'Add to Cart', mechanical: { ...ann(1, 'link').mechanical, href: '/actions/Cart.action?addItemToCart=' } }),
    ]
    const sig = (anns: Annotation[]) =>
      computeContentSignature({ title: 'JPetStore Demo', headings: [], annotations: anns })
    expect(sig(signonAnns)).not.toBe(sig(itemAnns))
    expect(sig(signonAnns)).toBe(sig([...signonAnns].reverse()))
  })

  it('computeMechanicalHash 는 화면 순서에 민감(정렬 후 호출 전제)', () => {
    const s1 = screen('screen:a', [ann(1, 'field')])
    const s2 = screen('screen:b', [ann(1, 'link')])
    expect(computeMechanicalHash([s1, s2])).not.toBe(computeMechanicalHash([s2, s1]))
  })
})
