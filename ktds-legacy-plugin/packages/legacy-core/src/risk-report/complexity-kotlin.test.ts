/**
 * 순환복잡도 근사 단위테스트(kotlin, P4) — 구문별 카운트 정답 고정. java 판
 * (complexity.test.ts)과 동형 케이스로 규약 대칭성을 확인한다.
 * 파일 복잡도 = 함수/부생성자 수 + 결정포인트 수.
 */
import { describe, it, expect } from 'vitest'
import { measureKotlinComplexity } from './complexity-kotlin.js'

// Kotlin 은 java 와 달리 개행이 문장 구분에 관여한다(NL-민감 세미콜론 삽입) — 한 줄에
// `{}` 뒤로 다음 문(특히 for/while/do-while 연쇄)을 붙이면 후행 람다 호출로 오해석되어
// 파스에러가 난다. 문장 사이는 개행으로 분리한다.
const inFun = (body: string) => `class T { fun m() {\n${body}\n} }`

describe('kotlin 복잡도 근사 — 구문별 카운트', () => {
  it('함수 없는 클래스/인터페이스 = 0', async () => {
    expect(await measureKotlinComplexity('class T')).toBe(0)
    expect(await measureKotlinComplexity('interface I { val max: Int }')).toBe(0)
  })

  it('빈 함수 = 1(McCabe 기저), 부생성자도 단위로 계상', async () => {
    expect(await measureKotlinComplexity('class T { fun m() {} }')).toBe(1)
    expect(await measureKotlinComplexity('class T {\nconstructor(x: Int) {}\nfun m() {}\n}')).toBe(2)
  })

  it('주생성자(class_parameters)는 함수 단위로 계상하지 않는다', async () => {
    expect(await measureKotlinComplexity('class T(val x: Int) { fun m() {} }')).toBe(1)
  })

  it('if + else-if = 결정 2 (else 자체는 미계상)', async () => {
    expect(
      await measureKotlinComplexity(inFun('if (a) {} else if (b) {} else {}')),
    ).toBe(1 + 2)
  })

  it('when: 조건 있는 entry 만(else 제외) — entry 2개 = 결정 2', async () => {
    const src = inFun('val w = when (a) { 1 -> "one"; 2 -> "two"; else -> "other" }')
    expect(await measureKotlinComplexity(src)).toBe(1 + 2)
  })

  it('when 콤마 다중 라벨은 항목 1개로 계상(근사 한계, 세분 안 함)', async () => {
    const src = inFun('val w = when (a) { 1, 2 -> "one-two"; else -> "other" }')
    expect(await measureKotlinComplexity(src)).toBe(1 + 1)
  })

  it('&&/|| 는 binary_expression 당 1 — a && b || c = 결정 2', async () => {
    expect(await measureKotlinComplexity(inFun('val x = a && b || c'))).toBe(1 + 2)
  })

  it('elvis(?:) 는 binary_expression 당 1', async () => {
    expect(await measureKotlinComplexity(inFun('val y = a ?: b'))).toBe(1 + 1)
  })

  it('루프 3종(for/while/do-while) = 결정 3', async () => {
    const src = inFun('for (i in 0..10) {}\nwhile (a) {}\ndo {} while (b)')
    expect(await measureKotlinComplexity(src)).toBe(1 + 3)
  })

  it('try-catch: catch 절당 1 (finally 미계상)', async () => {
    const src = inFun('try { f() } catch (e: Exception) { } catch (e: RuntimeException) { } finally { }')
    expect(await measureKotlinComplexity(src)).toBe(1 + 2)
  })

  it('비교 연산만 있는 binary(==, <)는 미계상', async () => {
    expect(await measureKotlinComplexity(inFun('val y = a == b; val z = c < d'))).toBe(1)
  })

  it('표현식 본문 함수(= expr)도 함수 단위로 계상', async () => {
    expect(await measureKotlinComplexity('class T { fun m(): Int = 1 }')).toBe(1)
  })
})

describe('determinism', () => {
  it('동일 소스 → 동일 측정치', async () => {
    const src = inFun('if (a) {}\nfor (i in 0..1) {}\nval x = a && b')
    const r1 = await measureKotlinComplexity(src)
    const r2 = await measureKotlinComplexity(src)
    expect(r1).toBe(r2)
  })
})
