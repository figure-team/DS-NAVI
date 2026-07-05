import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectCitations,
  scoreCitations,
  extractDomainGraphUnits,
  extractDomainGraphKeyItems,
  extractRtmUnits,
  scoreStructure,
  scoreRecall,
  scoreGoldenArtifact,
} from './index.js'

/** 합성 domain-graph — 도메인 노드 1 + 채움 없는 flow 노드 1(골든 현실 재현). */
function makeGraph() {
  return {
    nodes: [
      {
        id: 'domain:account',
        type: 'domain',
        summary: '계정 도메인 요약',
        domainMeta: {
          businessRules: ['로그인은 "특수문자" 와 \\s+ 패턴을 검증한다.'],
          entities: [{ name: 'Account' }],
          ktdsClaims: [
            {
              text: '요약 주장',
              citations: [{ filePath: 'src/A.java', line: 2, snippet: 'class A', status: 'ok' }],
            },
          ],
        },
      },
      { id: 'flow:x', type: 'flow', summary: '흐름', domainMeta: {} },
    ],
  }
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'w10-golden-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/A.java'), '// header\npublic class A {}\n', 'utf8')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('golden 채점기 — 근거 유효율(기계 검증)', () => {
  it('수집기: file/filePath 양식을 모두 걷는다', () => {
    const g = makeGraph()
    const cits = collectCitations(g)
    expect(cits).toHaveLength(1)
    expect(cits[0]).toMatchObject({ file: 'src/A.java', line: 2 })
    expect(collectCitations({ evidence: [{ file: 'x.java', line: 3 }] })).toHaveLength(1)
  })

  it('파일 없음·라인 범위 밖·스니펫 불일치를 각각 무효로 판정한다', () => {
    const s = scoreCitations(
      [
        { file: 'src/A.java', line: 2, snippet: 'class A' }, // 유효(±2 윈도)
        { file: 'src/없음.java', line: 1, snippet: null }, // 파일 없음
        { file: 'src/A.java', line: 99, snippet: null }, // 라인 범위 밖
        { file: 'src/A.java', line: 1, snippet: '전혀 다른 코드' }, // 스니펫 불일치
      ],
      root,
    )
    expect(s).toMatchObject({ total: 4, valid: 1 })
    expect(s.invalidSamples.map((x) => x.reason).sort()).toEqual([
      '라인 범위 밖(파일 3줄)', // 끝 개행 포함 split 기준
      '스니펫 불일치(±2줄)',
      '파일 없음',
    ])
  })

  it('인용 0건은 rate=null(측정 불가 ≠ 0점)', () => {
    expect(scoreCitations([], root).rate).toBeNull()
  })
})

describe('golden 채점기 — 구조 일치율', () => {
  it('자기 채점 100%: 골든이 비운 필드(flow 노드)는 요구하지 않는다', () => {
    const units = extractDomainGraphUnits(makeGraph())
    const s = scoreStructure(units, units)
    expect(s).toMatchObject({ total: 2, matched: 2, rate: 1 })
  })

  it('노드 삭제·필드 소실이 각각 하락으로 잡힌다', () => {
    const golden = extractDomainGraphUnits(makeGraph())
    const degraded = makeGraph()
    degraded.nodes[0].domainMeta.businessRules = [] // 필드 소실
    degraded.nodes.pop() // flow 노드 삭제
    const s = scoreStructure(golden, extractDomainGraphUnits(degraded))
    expect(s.matched).toBe(0)
    expect(s.missingSamples.map((m) => m.reason)).toEqual([
      '골든이 채운 필드 소실(businessRules)',
      '후보에 없음',
    ])
  })

  it('rtm 단위: 요구사항/기능/시나리오가 종류 접두 키로 추출된다', () => {
    const units = extractRtmUnits({
      requirements: [{ id: 'REQ-1', text: '카카오 로그인' }],
      functions: [{ id: 'flow:a', name: '로그인', entryPoint: { value: 'x' } }],
      testScenarios: [{ id: 'TS-1' }],
    })
    expect(units.map((u) => u.key)).toEqual(['fn:flow:a', 'req:REQ-1', 'ts:TS-1'])
  })
})

describe('golden 채점기 — 핵심 항목 재현율', () => {
  it('자기 채점 100%: 따옴표/역슬래시 포함 규칙도 원시 문자열 대조로 통과', () => {
    const g = makeGraph()
    const items = extractDomainGraphKeyItems(g)
    expect(items.length).toBe(2) // businessRule 1 + entity 1
    expect(scoreRecall(items, g)).toMatchObject({ total: 2, found: 2, rate: 1 })
  })

  it('업무규칙 문장 변조가 누락으로 잡힌다', () => {
    const golden = makeGraph()
    const degraded = makeGraph()
    degraded.nodes[0].domainMeta.businessRules = ['다른 내용으로 바뀐 규칙.']
    const s = scoreRecall(extractDomainGraphKeyItems(golden), degraded)
    expect(s.found).toBe(1) // entity 만 재현
    expect(s.missingSamples[0].kind).toBe('domain:account businessRule')
  })
})

describe('golden 채점기 — 종합·결정론', () => {
  it('동일 입력 2회 채점은 byte-identical', () => {
    const g = makeGraph()
    const a = scoreGoldenArtifact('domain-graph', g, g, root)
    const b = scoreGoldenArtifact('domain-graph', g, g, root)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.structure.rate).toBe(1)
    expect(a.citations.rate).toBe(1)
    expect(a.recall.rate).toBe(1)
  })
})
