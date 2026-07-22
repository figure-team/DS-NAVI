import { describe, expect, it } from 'vitest'
import { parseIncidentReport, resolveIncidentSeeds } from './incident-report.js'

/** 실물 예시(2026-06-23_rca_checkout.md)와 동형의 픽스처 — 타 프로젝트 경로. */
const CHECKOUT_REPORT = `---
runId: 7f5b371025e124c4d42d7081aa2835a7
service: checkout
createdAt: 2026-06-23T16:44:02+09:00
confidence: medium
baselineCommit: a8cb69101fa78178a0a1999bd748fda30902fe2f
---

# 코드 RCA 리포트 — checkout

## 근본 원인

SOP 버전을 '문자열'로 크기 비교해서, 리비전이 두 자리(10 이상)가 되면 최신 버전을 못 고른다.
위치: pkg/types/ruletypes/sop_document.go:340 (latestApprovedSOPDocumentByID), 같은 파일 311 (latestSOPDocumentByID), frontend/src/container/CreateAlertV2/CreateAlertHeader/sopMetadata.ts:30 (resolveSopBindingDocument)

## 수정 제안

1. sop_document.go:340 과 :311 — 공용 비교 함수로 교체.
※ 본 제안은 참고용이며 자동 적용되지 않음.

## 한계

- 에러 시그니처/로그가 비어 있어, 방금 바뀐 코드의 잠재 결함을 근거로 추정함.
`

/** jpetstore 정상 건 픽스처와 동형 — 상대경로 + 축약 표기 혼재. */
const JPETSTORE_REPORT = `---
runId: 3c9a1f0b2d4e5a6b7c8d9e0f1a2b3c4d
service: jpetstore
confidence: HIGH
---

## 근본 원인

장바구니에 없는 상품 ID 로 수량 변경 요청이 들어오면 NPE 가 난다.
위치: src/main/java/org/mybatis/jpetstore/domain/Cart.java:110 (setQuantityByItemId)

## 수정 제안

1. Cart.java:110 — 널 가드 추가.
2. CartActionBean.java:125 — containsItemId 선검증.
`

const JPETSTORE_CENSUS = [
  'src/main/java/org/mybatis/jpetstore/domain/Cart.java',
  'src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java',
  'src/main/java/org/mybatis/jpetstore/service/CatalogService.java',
]

describe('parseIncidentReport — 수용 게이트·frontmatter·섹션', () => {
  it('실물 동형 리포트를 파싱한다(게이트 통과·confidence·제목·refs 추출)', () => {
    const p = parseIncidentReport(CHECKOUT_REPORT)
    expect(p.parseable).toBe(true)
    expect(p.reasons).toEqual([])
    expect(p.frontmatter).toMatchObject({
      runId: '7f5b371025e124c4d42d7081aa2835a7',
      service: 'checkout',
      confidence: 'medium',
      baselineCommit: 'a8cb69101fa78178a0a1999bd748fda30902fe2f',
    })
    expect(p.title).toContain('문자열')
    // 근본 원인 2경로 + 수정 제안 축약 1개(중복 sop_document.go:340 은 dedup)
    expect(p.refs.map((r) => `${r.path}:${r.line}`)).toEqual([
      'pkg/types/ruletypes/sop_document.go:340',
      'frontend/src/container/CreateAlertV2/CreateAlertHeader/sopMetadata.ts:30',
      'sop_document.go:340',
    ])
  })

  it('confidence 는 대소문자 정규화(HIGH→high), 미상 값은 low 클램프', () => {
    // ds-apm rcaresult.go 는 lower-case 후 판정 — 동일 규칙 확인.
    expect(parseIncidentReport(JPETSTORE_REPORT).frontmatter?.confidence).toBe('high')
    expect(parseIncidentReport(CHECKOUT_REPORT.replace('medium', '아주높음')).frontmatter?.confidence).toBe('low')
  })

  it('runId·service·근본 원인 중 하나라도 없으면 unparseable(사유 나열, throw 없음)', () => {
    const noRun = parseIncidentReport(CHECKOUT_REPORT.replace(/runId:.*\n/, ''))
    expect(noRun.parseable).toBe(false)
    expect(noRun.reasons.join(' ')).toContain('runId')

    const noSection = parseIncidentReport(CHECKOUT_REPORT.replace('## 근본 원인', '## root cause'))
    expect(noSection.parseable).toBe(false)
    expect(noSection.reasons.join(' ')).toContain('근본 원인')

    expect(parseIncidentReport('그냥 텍스트').parseable).toBe(false)
  })

  it('frontmatter 여분 필드는 무시된다(전방 호환)', () => {
    const withExtra = CHECKOUT_REPORT.replace('confidence: medium', 'confidence: medium\nseverity: critical')
    const p = parseIncidentReport(withExtra)
    expect(p.parseable).toBe(true)
    expect(p.frontmatter?.confidence).toBe('medium')
  })

  it('한계 섹션의 file:line 은 시드 후보로 잡지 않는다', () => {
    const withLimitRef = CHECKOUT_REPORT.replace('추정함.', '추정함. 참고: notes/todo.md:3')
    const p = parseIncidentReport(withLimitRef)
    expect(p.refs.some((r) => r.path.includes('todo.md'))).toBe(false)
  })

  it('코드펜스 안의 `## ` 는 섹션 경계로 보지 않는다(시드 누락 방지)', () => {
    const fenced = `---
runId: r1
service: svc
---

## 근본 원인

첫 근거: src/A.java:10
\`\`\`
## 이건 코드 안의 주석이지 섹션이 아니다
\`\`\`
둘째 근거: src/B.java:20

## 수정 제안

src/C.java:30
`
    const p = parseIncidentReport(fenced)
    // 펜스 안 `## ...` 로 잘렸다면 src/B.java:20 이 유령 섹션으로 빠져 근본 원인에서 누락된다.
    expect(p.sections['근본 원인']).toContain('src/B.java:20')
    expect(p.sections['이건 코드 안의 주석이지 섹션이 아니다']).toBeUndefined()
    expect(p.refs.map((r) => `${r.path}:${r.line}`)).toEqual([
      'src/A.java:10',
      'src/B.java:20',
      'src/C.java:30',
    ])
  })

  it('헤딩 공백 편차(##\\t제목·## \\ 다중공백)를 일관되게 처리한다', () => {
    const p = parseIncidentReport(`---\nrunId: r\nservice: s\n---\n\n##\t근본 원인\n\nsrc/A.java:1\n\n##   수정 제안\n\nsrc/B.java:2\n`)
    expect(p.parseable).toBe(true)
    expect(p.sections['근본 원인']).toContain('src/A.java:1')
    expect(p.sections['수정 제안']).toContain('src/B.java:2')
  })
})

describe('resolveIncidentSeeds — census 대조(fail-closed)', () => {
  it('상대경로 정확일치 + 축약 표기 basename 유일 매칭을 해소한다', () => {
    const p = parseIncidentReport(JPETSTORE_REPORT)
    const res = resolveIncidentSeeds(p.refs, JPETSTORE_CENSUS)
    expect(res.allNotInProject).toBe(false)
    expect(res.seeds).toEqual([
      'src/main/java/org/mybatis/jpetstore/domain/Cart.java',
      'src/main/java/org/mybatis/jpetstore/web/actions/CartActionBean.java',
    ])
    const byPath = Object.fromEntries(res.resolutions.map((r) => [r.ref.path, r]))
    expect(byPath['Cart.java'].via).toBe('basename')
    expect(byPath['CartActionBean.java'].via).toBe('basename')
    expect(byPath['src/main/java/org/mybatis/jpetstore/domain/Cart.java'].via).toBe('path')
  })

  it('★ 전량 not-in-project → 타 프로젝트 리포트 경고 플래그(실물 checkout 예시 케이스)', () => {
    const p = parseIncidentReport(CHECKOUT_REPORT)
    const res = resolveIncidentSeeds(p.refs, JPETSTORE_CENSUS)
    expect(res.seeds).toEqual([])
    expect(res.allNotInProject).toBe(true)
  })

  it('basename 다의는 ambiguous(후보 전량 나열) — 자동 채택 금지', () => {
    const census = ['a/Cart.java', 'b/Cart.java']
    const res = resolveIncidentSeeds(
      [{ path: 'Cart.java', line: 1, section: '근본 원인' }],
      census,
    )
    expect(res.resolutions[0].verdict).toBe('ambiguous')
    expect(res.resolutions[0].candidates).toEqual(census)
    expect(res.seeds).toEqual([])
  })

  it('디렉터리가 붙은 오경로는 basename 으로 구조하지 않는다(타 프로젝트 감지 보존)', () => {
    const res = resolveIncidentSeeds(
      [{ path: 'other/repo/Cart.java', line: 1, section: '근본 원인' }],
      ['src/domain/Cart.java'],
    )
    expect(res.resolutions[0].verdict).toBe('not-in-project')
  })
})
