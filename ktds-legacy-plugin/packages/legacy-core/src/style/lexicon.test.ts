import { describe, expect, it } from 'vitest'
import { applyLexiconDeep, applyLexiconToText, parseLexicon } from './lexicon.js'

const SAMPLE_MD = `# 표기 통일 렉시콘

안내 산문.

| 금지 표기 | 통일 표기 | 비고 |
|---|---|---|
| 되어진다 | 된다 | 이중 피동 |
| 되어지는 | 되는 | 이중 피동 |
| 데이타 | 데이터 | 표기 통일 |
| 성공적으로 | (삭제) | 군더더기 |
| 데이타 | 중복무시 | 중복 항목 |
`

describe('parseLexicon', () => {
  it('표 행을 파싱하고 헤더/구분선을 건너뛴다', () => {
    const entries = parseLexicon(SAMPLE_MD)
    expect(entries).toHaveLength(4)
    expect(entries.find((e) => e.from === '금지 표기')).toBeUndefined()
  })

  it('(삭제) 는 빈 문자열 치환이다', () => {
    const entries = parseLexicon(SAMPLE_MD)
    expect(entries.find((e) => e.from === '성공적으로')?.to).toBe('')
  })

  it('중복 from 은 첫 항목이 이긴다', () => {
    const entries = parseLexicon(SAMPLE_MD)
    expect(entries.filter((e) => e.from === '데이타')).toHaveLength(1)
    expect(entries.find((e) => e.from === '데이타')?.to).toBe('데이터')
  })

  it('긴 표기 우선 정렬 — 부분 문자열 선점 방지', () => {
    const entries = parseLexicon('| a | x |\n| ab | y |\n')
    expect(entries[0].from).toBe('ab')
  })
})

describe('applyLexiconToText', () => {
  it('등장 횟수만큼 hits 를 센다', () => {
    const entries = parseLexicon(SAMPLE_MD)
    const r = applyLexiconToText('주문이 처리되어진다. 재고도 갱신되어진다.', entries)
    expect(r.text).toBe('주문이 처리된다. 재고도 갱신된다.')
    expect(r.hits).toBe(2)
  })
})

describe('applyLexiconDeep', () => {
  const entries = parseLexicon(SAMPLE_MD)

  it('산문 키만 치환하고 인용 서브트리는 참조 그대로 보존한다', () => {
    const citations = [{ filePath: 'a.java', line: 3, snippet: '데이타 저장 되어진다' }]
    const frag = {
      chunkId: 'dom-000',
      flows: [
        {
          flowId: 'flow:데이타-1',
          name: '데이타 조회',
          summary: { text: '데이타가 조회되어진다.', citations },
        },
      ],
    }
    const { value, hits } = applyLexiconDeep(frag, entries)
    expect(value.flows[0].name).toBe('데이터 조회')
    expect(value.flows[0].summary.text).toBe('데이터가 조회된다.')
    // 인용은 byte 불변(verbatim 계약) — 참조까지 동일.
    expect(value.flows[0].summary.citations).toBe(citations)
    // id 류(비산문 키)는 불변.
    expect(value.flows[0].flowId).toBe('flow:데이타-1')
    expect(hits).toBe(3)
  })

  it('statement/description/note/title/label 도 산문 키다', () => {
    const { value } = applyLexiconDeep(
      {
        statement: '성공적으로 저장되어진다.',
        description: '데이타 입력',
        note: '※ 데이타 없음',
        title: '데이타 관리',
        label: '데이타 확인',
      },
      entries,
    )
    expect(value.statement).toBe(' 저장된다.')
    expect(value.description).toBe('데이터 입력')
    expect(value.note).toBe('※ 데이터 없음')
    expect(value.title).toBe('데이터 관리')
    expect(value.label).toBe('데이터 확인')
  })

  it('evidence/preCite/snippet 서브트리는 불변이다', () => {
    const evidence = [{ file: 'b.java', line: 1, snippet: '되어진다' }]
    const { value, hits } = applyLexiconDeep({ handler: { target: 'x', evidence } }, entries)
    expect(value.handler.evidence).toBe(evidence)
    expect(hits).toBe(0)
  })

  it('빈 렉시콘이면 원본 그대로다', () => {
    const input = { name: '데이타' }
    const r = applyLexiconDeep(input, [])
    expect(r.value).toBe(input)
    expect(r.hits).toBe(0)
  })
})
