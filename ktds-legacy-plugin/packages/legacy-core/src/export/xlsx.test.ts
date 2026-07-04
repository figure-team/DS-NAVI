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

  it('시트명 재충돌(리뷰 F4)·따옴표/예약명(리뷰 F7): 항상 유일·유효', () => {
    // 연번 부여 결과가 기존 입력과 충돌하면 증가 — 중복 시트명은 워크북 손상.
    const collided = sanitizeSheetNames(['같음', '같음', '같음 (2)'])
    expect(new Set(collided.map((n) => n.toLowerCase())).size).toBe(3)
    // 선행/후행 작은따옴표 제거, 예약명 History 회피.
    expect(sanitizeSheetNames(["'leading", "trailing'"])).toEqual(['leading', 'trailing'])
    expect(sanitizeSheetNames(['History'])).toEqual(['History_'])
  })

  it('숫자 셀 15자리 초과는 문자열 유지(리뷰 F6 — 엑셀 정밀도 손상 방지)', () => {
    const xml = buildXlsxWorkbook([
      { name: 'num', rows: [{ cells: ['123456789012345', '1234567890123456'] }] },
    ]).toString('utf8')
    expect(xml).toContain('<v>123456789012345</v>') // 15자리 — 숫자 유지
    expect(xml).toContain('<t>1234567890123456</t>') // 16자리 — 문자열
  })

  it('헤더 행 보유 시트: 틀고정 + 자동필터(발주처 서식 관례)', () => {
    const xml = buildXlsxWorkbook(probeSheets()).toString('utf8')
    expect(xml).toContain('state="frozen"')
    expect(xml).toContain('<autoFilter ref="A1:B4"/>')
  })

  it('빈 시트 배열은 거부(fail-closed)', () => {
    expect(() => buildXlsxWorkbook([])).toThrow()
  })

  it('XML 1.0 불법 제어문자는 제거, 탭/개행은 보존(임의 입력 방어 — RTM 텍스트 등)', () => {
    const xml = buildXlsxWorkbook([
      { name: 'ctl', rows: [{ cells: ['앞\u0001\u0008뒤', '개행\n탭\t유지'] }] },
    ]).toString('utf8')
    expect(xml).toContain('앞뒤') // 불법 제어문자 제거 — 남으면 파일 전체가 안 열린다
    expect(xml).toContain('개행\n탭\t유지') // 합법 제어문자는 보존
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

  it('문서정보 표지 + 표 보유 섹션 시트화 + 헤더(도메인 열+신뢰도+근거) + 근거 f:l', () => {
    const sheets = docToSheets(doc, { sourceCommit: 'abc123' })
    expect(sheets.map((s) => s.name)).toEqual(['문서정보', '규모산정(FP) 기초'])
    // 표지: 지위(스캔 스냅샷)·신뢰도 태그 의미·소스 커밋 — 오독 방지(W7 비평).
    const info = sheets[0].rows.map((r) => r.cells.join('|')).join('\n')
    expect(info).toContain('abc123')
    expect(info).toContain('스냅샷')
    expect(info).toContain('사람 검수/사인오프 여부와 무관')
    expect(sheets[1].rows[0]).toEqual({ cells: ['구분', '대상', '신뢰도', '근거'], style: 'header' })
    expect(sheets[1].rows[1].cells).toEqual(['EQ [추정]', 'route:R1', '[확정]', 'src/A.java:3, src/B.java'])
  })

  it('표 섹션 없으면 빈 배열(표지만 있는 xlsx 금지)', () => {
    const noTable: GeneratedDoc = { ...doc, sections: [doc.sections[0]] }
    expect(docToSheets(noTable)).toEqual([])
  })

  it('집계 행(INFERRED + 집계 시작)은 강조행(W3 리뷰 L5)', () => {
    const sheets = docToSheets(doc)
    expect(sheets[1].rows[2].style).toBe('bold')
  })

  it('RTM: 문서정보+요구/기능/커버리지 4시트, 검수·시험 열(검증 스파인), 빈 원장도 헤더', () => {
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
    expect(sheets.map((s) => s.name)).toEqual([
      '문서정보',
      '요구사항 원장',
      '기능(AS-IS) 원장',
      '커버리지 현황',
    ])
    expect(sheets[1].rows[1].cells).toEqual([
      'REQ-001', '카카오 로그인', 'functional', '', 'HIGH', 'RECEIVED', 'ACTIVE', '', 'customer: 카카오 로그인 추가', '2', '미검수',
    ])
    expect(sheets[2].rows[1].cells).toEqual([
      'FN-001', '계정 진입', '계정/회원', 'AccountActionBean#signonForm', 'AccountActionBean', '미시험', 'CHANGED', 'REQ-001', 'src/A.java:149',
    ])
    const empty = rtmToSheets({})
    expect(empty[1].rows).toHaveLength(1)
    expect(empty[2].rows).toHaveLength(1)
    expect(empty[3].rows).toHaveLength(1)
  })

  it('RTM: 검수 사인오프·커버리지 현황 평탄화(감리 "검수 근거" 대응 — W7 비평 2)', () => {
    const sheets = rtmToSheets({
      requirements: [
        { id: 'REQ-001', text: 't', signoff: { approver: '이준경', at: '2026-07-01' }, acceptanceCriteria: [] },
      ],
      coverage: {
        requirements: { total: 2, signedOff: 1 },
        gaps: { unimplemented: ['REQ-002'] },
      },
    })
    expect(sheets[1].rows[1].cells[10]).toBe('검수(이준경 @ 2026-07-01)')
    const cov = sheets[3].rows.map((r) => r.cells.join('|'))
    expect(cov).toContain('requirements|total|2')
    expect(cov).toContain('requirements|signedOff|1')
    expect(cov).toContain('gaps|unimplemented|REQ-002')
  })
})
