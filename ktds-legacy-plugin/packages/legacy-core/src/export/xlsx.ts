/**
 * xlsx 라이터(W7) — 의존성 0·결정론. html.ts(P4.4)와 동일 철학:
 * 새 패키지 없이(폐쇄망 SI·vendor-deps 무증가) 최소 OOXML(SpreadsheetML)을 손으로 쓴다.
 *
 * - ZIP: STORE(무압축) + 수제 CRC32 + 고정 DOS 타임스탬프(1980-01-01) —
 *   동일 입력 → byte-identical(레포 결정론 불변식).
 * - 시트: inlineStr 문자열(sharedStrings 생략), 숫자 패턴은 숫자 셀.
 * - 스타일: 기본 / 헤더(굵게+회색) / 강조행(굵게) 3종만.
 * - 시트명: 엑셀 금지문자 제거·31자 절단·중복 연번(정제 규칙 결정론).
 */

export interface XlsxRow {
  cells: string[]
  /** header = 굵게+회색 채움, bold = 굵게(집계 행 등). 기본은 일반. */
  style?: 'header' | 'bold'
}

export interface XlsxSheet {
  name: string
  rows: XlsxRow[]
}

// ── CRC32 ────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── ZIP(STORE) ───────────────────────────────────────────────────────────

interface ZipEntry {
  name: string
  data: Buffer
}

/** 고정 DOS 날짜(1980-01-01 00:00) — 타임스탬프 결정론. */
const DOS_TIME = 0
const DOS_DATE = 0x21

function zipStore(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 flag
    local.writeUInt16LE(0, 8) // method: STORE
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(e.data.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, name, e.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4) // made by
    cd.writeUInt16LE(20, 6) // needed
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(DOS_TIME, 12)
    cd.writeUInt16LE(DOS_DATE, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(e.data.length, 20)
    cd.writeUInt32LE(e.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    // extra/comment/disk/attrs = 0
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += 30 + name.length + e.data.length
  }
  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, cdBuf, eocd])
}

// ── SpreadsheetML ────────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return (
    s
      // XML 1.0 불법 제어문자 제거(탭/개행/CR 은 합법이라 보존) — RTM 요구사항 텍스트 등
      // 임의 입력이 셀에 오므로, 하나라도 남으면 파일 전체가 열리지 않는다.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** 셀 값이 숫자 셀 자격인지(정수/소수, 지수·앞자리0 제외 — 코드/ID 오변환 방지). */
function isNumericCell(v: string): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(v)) return false
  // 선행 0(01, 007 등)은 식별자일 가능성 — 문자열 유지.
  if (/^-?0\d/.test(v)) return false
  // 엑셀 유효자리 15 초과(계좌·대형 ID)는 반올림 손상 — 문자열 유지(리뷰 F6).
  return v.replace(/[-.]/g, '').length <= 15
}

/** 열 번호(0-based) → A, B, …, AA. */
function colLetter(n: number): string {
  let s = ''
  let i = n
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s
    i = Math.floor(i / 26) - 1
  }
  return s
}

const STYLE_INDEX: Record<NonNullable<XlsxRow['style']> | 'normal', number> = {
  normal: 0,
  header: 1,
  bold: 2,
}

function sheetXml(sheet: XlsxSheet): string {
  const colCount = sheet.rows.reduce((n, r) => Math.max(n, r.cells.length), 0)
  // 열너비 — 셀 최대 길이 기반 [8..60], 결정론(한글 등 넓은 문자는 근사 1.7배).
  const widths: number[] = []
  for (let c = 0; c < colCount; c++) {
    let w = 8
    for (const row of sheet.rows) {
      const v = row.cells[c] ?? ''
      let len = 0
      for (const ch of v) len += ch.charCodeAt(0) > 0x2e7f ? 1.7 : 1
      w = Math.max(w, Math.min(60, Math.ceil(len) + 2))
    }
    widths.push(w)
  }
  const cols =
    colCount > 0
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : ''
  // 발주처 서식 관례(W7 비평 반영): 첫 행이 헤더면 틀고정(1행) + 자동필터.
  const hasHeader = sheet.rows[0]?.style === 'header'
  const sheetViews = hasHeader
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const autoFilter =
    hasHeader && colCount > 0 && sheet.rows.length > 1
      ? `<autoFilter ref="A1:${colLetter(colCount - 1)}${sheet.rows.length}"/>`
      : ''
  const rowsXml = sheet.rows
    .map((row, ri) => {
      const s = STYLE_INDEX[row.style ?? 'normal']
      const cells = row.cells
        .map((v, ci) => {
          const ref = `${colLetter(ci)}${ri + 1}`
          const styleAttr = s > 0 ? ` s="${s}"` : ''
          if (v === '') return `<c r="${ref}"${styleAttr}/>`
          if (isNumericCell(v)) return `<c r="${ref}"${styleAttr}><v>${v}</v></c>`
          const preserve = /^\s|\s$/.test(v) ? ' xml:space="preserve"' : ''
          return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t${preserve}>${xmlEscape(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}">${cells}</row>`
    })
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    sheetViews +
    cols +
    `<sheetData>${rowsXml}</sheetData>` +
    autoFilter +
    '</worksheet>'
  )
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs></styleSheet>'

/**
 * 시트명 정제 — 금지문자 제거, 선행/후행 작은따옴표 제거·예약명(History) 회피(리뷰 F7),
 * 31자 절단, 빈 이름 폴백, 중복 연번(연번 부여 결과가 기존 이름과 재충돌하면 증가 —
 * 리뷰 F4: `['같음','같음','같음 (2)']` 류 입력에서 중복 시트명이 나오면 워크북 손상).
 */
export function sanitizeSheetNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((raw, i) => {
    let name = raw
      .replace(/[\\/:*?\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^'+|'+$/g, '')
      .slice(0, 31)
      .trim()
    if (name.length === 0) name = `Sheet${i + 1}`
    if (name.toLowerCase() === 'history') name = `${name}_` // 엑셀 예약명
    let candidate = name
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      const suffix = ` (${n})`
      candidate = name.slice(0, 31 - suffix.length) + suffix
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

/** 시트들을 xlsx(zip) 버퍼로 만든다 — 동일 입력 → byte-identical. */
export function buildXlsxWorkbook(sheets: XlsxSheet[]): Buffer {
  if (sheets.length === 0) throw new Error('xlsx: 시트가 최소 1개 필요합니다')
  const names = sanitizeSheetNames(sheets.map((s) => s.name))

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets
      .map(
        (_s, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    '</Types>'

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    names
      .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    '</sheets></workbook>'

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets
      .map(
        (_s, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML, 'utf8') },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(s), 'utf8'),
    })),
  ]
  return zipStore(entries)
}
