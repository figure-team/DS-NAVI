import { describe, expect, it } from 'vitest'
import { buildTestLinkModel, isTestFile, isTestLinkModelEmpty } from './test-links.js'

const PROD = new Set(['ContractStore', 'CalcEngine', 'PaymentStore'])

describe('isTestFile', () => {
  it('src/test 소스루트 또는 파일명 관례를 테스트로 본다', () => {
    expect(isTestFile('services/core/src/test/kotlin/com/music/FooTest.kt')).toBe(true)
    expect(isTestFile('a/b/PaymentSpec.kt')).toBe(true)
    expect(isTestFile('a/b/FooIT.java')).toBe(true)
    expect(isTestFile('src/test/Anything.kt')).toBe(true) // 경로가 test 소스루트
  })
  it('프로덕션 소스는 테스트로 보지 않는다', () => {
    expect(isTestFile('src/main/kotlin/ContractStore.kt')).toBe(false)
    expect(isTestFile('src/main/java/Foo.java')).toBe(false)
    expect(isTestFile('README.md')).toBe(false)
  })
})

describe('buildTestLinkModel', () => {
  it('테스트가 참조하는 프로덕션 클래스에 whole-word 로 링크한다', () => {
    const model = buildTestLinkModel(
      [{ relPath: 'src/test/CalcEngineTest.kt', content: 'class CalcEngineTest {\n  val e = CalcEngine()\n}' }],
      PROD,
    )
    expect(model.byProdClass['CalcEngine']).toHaveLength(1)
    const link = model.byProdClass['CalcEngine'][0]
    expect(link.testFile).toBe('src/test/CalcEngineTest.kt')
    // 라인 2 — 라인 1 의 `CalcEngineTest` 는 whole-word 로 CalcEngine 과 다른 토큰이라 매칭 안 됨.
    expect(link.line).toBe(2)
    expect(link.convention).toBe(true) // 파일명 CalcEngineTest → CalcEngine 관례 일치
  })

  it('파일명 관례가 없으면 convention=false(참조-only)', () => {
    const model = buildTestLinkModel(
      [{ relPath: 'src/test/RightsPoolSaveAtomicityTest.kt', content: 'val s = ContractStore()' }],
      PROD,
    )
    expect(model.byProdClass['ContractStore'][0].convention).toBe(false)
  })

  it('부분 일치는 링크하지 않는다(whole-word)', () => {
    // "CalcEngineV2" 는 CalcEngine 을 포함하지만 다른 식별자 → 매칭 안 됨.
    const model = buildTestLinkModel([{ relPath: 'src/test/XTest.kt', content: 'val e = CalcEngineV2()' }], PROD)
    expect(model.byProdClass['CalcEngine']).toBeUndefined()
  })

  it('알려진 프로덕션 클래스 집합이 비면 빈 모델', () => {
    const model = buildTestLinkModel([{ relPath: 'src/test/FooTest.kt', content: 'CalcEngine()' }], new Set())
    expect(isTestLinkModelEmpty(model)).toBe(true)
  })

  it('참조 없는 테스트는 링크 0', () => {
    const model = buildTestLinkModel([{ relPath: 'src/test/FooTest.kt', content: 'val x = 1' }], PROD)
    expect(isTestLinkModelEmpty(model)).toBe(true)
  })
})
