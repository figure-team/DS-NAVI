/**
 * TS/TSX 순환복잡도 근사 단위테스트(P5) — java 판(complexity.test.ts)과 동형 구문별 카운트.
 */
import { describe, it, expect } from 'vitest'
import { measureTsComplexity } from './complexity-ts.js'

const inFn = (body: string) => `function m() { ${body} }`

describe('ts 복잡도 근사 — 구문별 카운트', () => {
  it('함수 없는 파일 = 0', async () => {
    expect(await measureTsComplexity('const x = 1')).toBe(0)
    expect(await measureTsComplexity('interface I { x: number }')).toBe(0)
  })

  it('빈 함수 = 1(McCabe 기저), 화살표함수/메서드/함수식도 단위로 계상', async () => {
    expect(await measureTsComplexity('function m() {}')).toBe(1)
    expect(await measureTsComplexity('const f = () => {}')).toBe(1)
    expect(await measureTsComplexity('class C { m() {} }')).toBe(1)
    expect(await measureTsComplexity('const f = function () {}')).toBe(1)
    expect(await measureTsComplexity('function a() {} function b() {}')).toBe(2)
  })

  it('if + else-if = 결정 2(else 자체는 미계상)', async () => {
    expect(await measureTsComplexity(inFn('if (a) {} else if (b) {} else {}'))).toBe(1 + 2)
  })

  it('switch: case 라벨만(default 제외) — case 3 = 결정 3', async () => {
    const src = inFn('switch (x) { case 1: break; case 2: break; case 3: break; default: break; }')
    expect(await measureTsComplexity(src)).toBe(1 + 3)
  })

  it('&&/||/?? 는 binary_expression 당 1(중첩 3개) + 삼항 1 = 결정 4', async () => {
    // a && b || c ?? d 는 중첩 binary_expression 3개((a&&b)||c 다음 ??d) — 각 1개씩.
    expect(await measureTsComplexity(inFn('const x = a && b || c ?? d ? 1 : 2;'))).toBe(1 + 4)
  })

  it('루프 4종(for/for-in/for-of/while/do) = 결정 5', async () => {
    const src = inFn(
      'for (let i = 0; i < n; i++) {} for (const k in o) {} for (const v of xs) {} while (a) {} do {} while (b);',
    )
    expect(await measureTsComplexity(src)).toBe(1 + 5)
  })

  it('try-catch: catch 절당 1(finally 미계상)', async () => {
    const src = inFn('try { f(); } catch (e) { } try { g(); } catch (e) { } finally { }')
    expect(await measureTsComplexity(src)).toBe(1 + 2)
  })

  it('비교 연산만 있는 binary(===, <)는 미계상', async () => {
    expect(await measureTsComplexity(inFn('const y = a === b; const z = c < d;'))).toBe(1)
  })

  it('tsx 소스(JSX 포함)도 lang=tsx 로 측정 가능', async () => {
    const src = `function C(props) { if (props.on) { return <div>{props.on ? 'y' : 'n'}</div> } return null }`
    // JSX 자체는 결정 포인트가 아니다 — if 1 + 삼항 1.
    expect(await measureTsComplexity(src, 'tsx')).toBe(1 + 2)
  })
})
