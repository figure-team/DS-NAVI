/**
 * xlsx 라이터/변환 테스트(W7) — 구조·결정론·정제·집계행·RTM 시트.
 * 심층 라운드트립(zip CRC·XML 재판독)은 python 스크립트(실측 단계) 소관이고,
 * 여기서는 STORE zip 특성(본문 평문 포함)을 이용해 XML 조각을 직접 단언한다.
 */
import { describe, it, expect } from 'vitest'
import { buildXlsxWorkbook, sanitizeSheetNames, type XlsxSheet } from './xlsx.js'
import { docToSheets, rtmToSheets } from './xlsx-docs.js'
import type { GeneratedDoc } from '../doc-generator/types.js'

function probeSheets(): XlsxSheet[] {
  return [
    {
      name: '규모산정(FP) 기초 [t/]:*?',
      rows: [
        { cells: ['구분', '대상'], style: 'header' },
        { cells: ['EQ [추정]', 'GET & <b> "q"'] },
        { cells: ['집계 [추정]', '잠정 FP ≥ 97.5'], style: 'bold' },
        { cells: ['97.5', '0042'] },
      ],
    },
  ]
}

describe('xlsx 라이터', () => {
  it('결정론: 동일 입력 2회 → byte-identical', () => {
    expect(Buffer.compare(buildXlsxWorkbook(probeSheets()), buildXlsxWorkbook(probeSheets()))).toBe(0)
  })

  it('zip 구조: 로컬 헤더/EOCD 엔트리 수(고정 5 + 시트 수)', () => {
    const buf = buildXlsxWorkbook(probeSheets())
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    const eocd = buf.subarray(buf.length - 22)
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50)
    expect(eocd.readUInt16LE(10)).toBe(5 + 1) // Content_Types, .rels, workbook(+rels), styles + sheet1
  })

  it('셀 인코딩: XML escape·숫자 셀·선행0 문자열 유지·스타일 인덱스', () => {
    const xml = buildXlsxWorkbook(probeSheets()).toString('utf8')
    expect(xml).toContain('GET &amp; &lt;b&gt; &quot;q&quot;')
    expect(xml).toContain('<v>97.5</v>') // 숫자 셀
    expect(xml).toContain('<t>0042</t>') // 선행 0 은 식별자 — 문자열 유지
    expect(xml).toContain('s="1" t="inlineStr"') // 헤더 스타일
    expect(xml).toContain('s="2" t="inlineStr"') // 집계(bold) 스타일
  })

  it('시트명 정제: 금지문자 제거·31자 절단·중복 연번·빈 이름 폴백', () => {
    expect(sanitizeSheetNames(['a[b]/c\\d:e*f?g'])).toEqual(['a b c d e f g'])
    expect(sanitizeSheetNames(['가'.repeat(40)])[0]).toHaveLength(31)
    expect(sanitizeSheetNames(['같음', '같음', '같음'])).toEqual(['같음', '같음 (2)', '같음 (3)'])
    expect(sanitizeSheetNames(['[/]'])).toEqual(['Sheet1'])
  })

  it('빈 시트 배열은 거부(fail-closed)', () => {
    expect(() => buildXlsxWorkbook([])).toThrow()
  })
})

describe('docToSheets / rtmToSheets', () => {
  const doc: GeneratedDoc = {
    docId: 'si-프로그램목록',
    title: 'SI 프로그램목록',
    methodology: 'si-standard',
    sections: [
      { heading: '서문(표 없음)', key: 'k0', claims: [], prose: '표 없는 섹션' },
      {
        heading: '규모산정(FP) 기초',
        key: 'fp-basis',
        claims: [],
        table: {
          columns: ['구분', '대상'],
          rows: [
            {
              cells: ['EQ [추정]', 'route:R1'],
              confidence: 'CONFIRMED',
              evidence: [{ file: 'src/A.java', line: 3 }, { file: 'src/B.java', line: null }],
            },
            { cells: ['집계 [추정]', '잠정 FP ≥ 1'], confidence: 'INFERRED', evidence: [] },
          ],
        },
      },
    ],
  }

  it('표 보유 섹션만 시트화 + 헤더(도메인 열+신뢰도+근거) + 근거 셀 f:l 나열', () => {
    const sheets = docToSheets(doc)
    expect(sheets).toHaveLength(1)
    expect(sheets[0].name).toBe('규모산정(FP) 기초')
    expect(sheets[0].rows[0]).toEqual({ cells: ['구분', '대상', '신뢰도', '근거'], style: 'header' })
    expect(sheets[0].rows[1].cells).toEqual(['EQ [추정]', 'route:R1', '[확정]', 'src/A.java:3, src/B.java'])
  })

  it('집계 행(INFERRED + 집계 시작)은 강조행(W3 리뷰 L5)', () => {
    const sheets = docToSheets(doc)
    expect(sheets[0].rows[2].style).toBe('bold')
  })

  it('RTM: 요구/기능 2시트, 원장 매핑, 빈 원장도 헤더 출력', () => {
    const sheets = rtmToSheets({
      requirements: [
        {
          id: 'REQ-001',
          text: '카카오 로그인',
          type: 'functional',
          priority: 'HIGH',
          lifecycle: 'RECEIVED',
          status: 'ACTIVE',
          dependsOn: [],
          source: { kind: 'customer', raw: '카카오 로그인 추가' },
          acceptanceCriteria: [{}, {}],
        },
      ],
      functions: [
        {
          featureId: 'FN-001',
          name: '계정 진입',
          domainName: '계정/회원',
          entryPoint: { value: 'AccountActionBean#signonForm', evidence: [{ file: 'src/A.java', line: 149 }] },
          implementation: { value: 'AccountActionBean', evidence: [] },
          state: 'CHANGED',
          requirementHistory: ['REQ-001'],
        },
      ],
    })
    expect(sheets.map((s) => s.name)).toEqual(['요구사항 원장', '기능(AS-IS) 원장'])
    expect(sheets[0].rows[1].cells).toEqual([
      'REQ-001', '카카오 로그인', 'functional', '', 'HIGH', 'RECEIVED', 'ACTIVE', '', 'customer: 카카오 로그인 추가', '2',
    ])
    expect(sheets[1].rows[1].cells).toEqual([
      'FN-001', '계정 진입', '계정/회원', 'AccountActionBean#signonForm', 'AccountActionBean', 'CHANGED', 'REQ-001', 'src/A.java:149',
    ])
    const empty = rtmToSheets({})
    expect(empty[0].rows).toHaveLength(1)
    expect(empty[1].rows).toHaveLength(1)
  })
})
