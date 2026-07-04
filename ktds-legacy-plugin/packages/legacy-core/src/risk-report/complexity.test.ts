/**
 * 순환복잡도 근사 단위테스트(W4) — 구문별 카운트 정답 고정(설계 §7).
 * 파일 복잡도 = 메서드/생성자 수 + 결정포인트 수.
 */
import { describe, it, expect } from 'vitest'
import { measureJavaComplexity } from './complexity.js'

const inMethod = (body: string) => `class T { void m() { ${body} } }`

describe('java 복잡도 근사 — 구문별 카운트', () => {
  it('메서드 없는 클래스/인터페이스 = 0', async () => {
    expect(await measureJavaComplexity('class T {}')).toBe(0)
    expect(await measureJavaComplexity('interface I { int MAX = 1; }')).toBe(0)
  })

  it('빈 메서드 = 1(McCabe 기저), 생성자도 단위로 계상', async () => {
    expect(await measureJavaComplexity('class T { void m() {} }')).toBe(1)
    expect(await measureJavaComplexity('class T { T() {} void m() {} }')).toBe(2)
  })

  it('if + else-if = 결정 2 (else 자체는 미계상)', async () => {
    expect(await measureJavaComplexity(inMethod('if (a) {} else if (b) {} else {}'))).toBe(1 + 2)
  })

  it('switch: case 라벨만(default 제외) — case 3 = 결정 3', async () => {
    const src = inMethod('switch (x) { case 1: break; case 2: break; case 3: break; default: break; }')
    expect(await measureJavaComplexity(src)).toBe(1 + 3)
  })

  it('&&/|| 는 binary_expression 당 1 — a && b || c = 결정 2 + 삼항 1', async () => {
    expect(await measureJavaComplexity(inMethod('int x = a && b || c ? 1 : 2;'))).toBe(1 + 3)
  })

  it('루프 4종(for/enhanced-for/while/do) = 결정 4', async () => {
    const src = inMethod(
      'for (int i = 0; i < n; i++) {} for (String s : xs) {} while (a) {} do {} while (b);',
    )
    expect(await measureJavaComplexity(src)).toBe(1 + 4)
  })

  it('try-catch: catch 절당 1 (finally 미계상)', async () => {
    const src = inMethod('try { f(); } catch (A e) { } catch (B e) { } finally { }')
    expect(await measureJavaComplexity(src)).toBe(1 + 2)
  })

  it('비교 연산만 있는 binary(==, <)는 미계상', async () => {
    expect(await measureJavaComplexity(inMethod('boolean y = a == b; boolean z = c < d;'))).toBe(1)
  })
})
