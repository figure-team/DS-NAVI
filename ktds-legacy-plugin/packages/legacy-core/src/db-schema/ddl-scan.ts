/**
 * DDL 정적 파서(Tier 1) — CREATE TABLE / ALTER / COMMENT ON 을 정규식으로 파싱.
 *
 * SQL tree-sitter 그래머가 없어(Java/TS/TSX 만 로드) 텍스트 파싱한다. MySQL·Oracle·
 * PostgreSQL·H2/HSQLDB 공통 부분집합을 커버: 컬럼(타입/NOT NULL/PK/UNIQUE/DEFAULT/
 * inline COMMENT·REFERENCES), 테이블 제약(PRIMARY KEY/UNIQUE/FOREIGN KEY/CHECK/INDEX),
 * 테이블·컬럼 주석(MySQL inline·COMMENT=, Oracle/PG COMMENT ON).
 *
 * 결정론: 라인은 1-기반(원문 newline 카운트). 컬럼은 선언 순서 보존. 실패는 throw 하지
 * 않고 호출자(extract)가 unresolved 로 격리한다.
 */
import type { DbColumn, DbForeignKey, DbCheck, DbIndex, DbTable } from './types.js'
import { lineAt, bareIdent, unquote, splitTopLevel, matchParen, parenIdentList } from './sql-util.js'

/** COMMENT ON 산출 — extract 가 매칭 테이블/컬럼에 부착. */
export interface CommentOn {
  table: string
  column: string | null
  text: string
}

/** ddl-scan 단일 파일 산출 — 구조(rows/isCodeTable 는 dataload·extract 가 채움). */
export interface DdlScanResult {
  tables: DbTable[]
  comments: CommentOn[]
}

/** 컬럼 정의 1개 파싱(테이블 제약이 아닌 요소). null 이면 파싱 불가. */
function parseColumnDef(element: string, line: number): DbColumn | null {
  const trimmed = element.trim()
  const nameMatch = trimmed.match(/^([`"[\]\w.]+)\s+(.*)$/s)
  if (!nameMatch) return null
  const name = bareIdent(nameMatch[1])
  if (name.length === 0) return null
  const rest = nameMatch[2]

  // 타입: 식별자 + 선택적 (크기[,스케일]) + UNSIGNED/ZEROFILL 등.
  const typeMatch = rest.match(/^([A-Za-z][A-Za-z0-9_]*(\s*\([^)]*\))?(\s+(UNSIGNED|ZEROFILL))*)/i)
  const type = typeMatch ? typeMatch[1].replace(/\s+/g, ' ').trim() : 'UNKNOWN'

  const upper = rest.toUpperCase()
  const primaryKey = /\bPRIMARY\s+KEY\b/.test(upper)
  const notNull = /\bNOT\s+NULL\b/.test(upper)
  const unique = /\bUNIQUE\b/.test(upper)

  const defMatch = rest.match(/\bDEFAULT\s+('(?:[^']|'')*'|[A-Za-z0-9_]+\s*\([^)]*\)|[^\s,]+)/i)
  const defaultVal = defMatch ? defMatch[1].trim() : null

  const commentMatch = rest.match(/\bCOMMENT\s+'((?:[^']|'')*)'/i)
  const comment = commentMatch ? unquote(`'${commentMatch[1]}'`) : null

  return {
    name,
    type,
    nullable: !notNull && !primaryKey,
    primaryKey,
    unique,
    default: defaultVal,
    comment,
    line,
  }
}

/** 단일 CREATE TABLE 블록 파싱(body=괄호 내부, options=괄호 뒤 꼬리). */
function parseCreateTable(
  name: string,
  relPath: string,
  tableLine: number,
  body: string,
  options: string,
  source: string,
  bodyStart: number,
): DbTable {
  const columns: DbColumn[] = []
  const primaryKey: string[] = []
  const uniques: string[][] = []
  const foreignKeys: DbForeignKey[] = []
  const checks: DbCheck[] = []
  const indexes: DbIndex[] = []

  const elements = splitTopLevel(body)
  let offset = bodyStart
  for (const raw of elements) {
    const elemLine = lineAt(source, offset + (raw.length - raw.trimStart().length))
    offset += raw.length + 1 // +1 for the consumed comma
    let el = raw.trim()
    if (el.length === 0) continue

    // CONSTRAINT <name> <rest> → 이름 벗기고 재디스패치.
    const consMatch = el.match(/^CONSTRAINT\s+[`"[\]\w.]+\s+(.*)$/is)
    if (consMatch) el = consMatch[1].trim()

    const upper = el.toUpperCase()

    if (/^PRIMARY\s+KEY\b/.test(upper)) {
      const open = el.indexOf('(')
      const close = open >= 0 ? matchParen(el, open) : -1
      if (open >= 0 && close > open) primaryKey.push(...parenIdentList(el.slice(open + 1, close)))
      continue
    }
    if (/^FOREIGN\s+KEY\b/.test(upper)) {
      const m = el.match(/FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([`"[\]\w.]+)\s*\(([^)]*)\)/is)
      if (m) {
        foreignKeys.push({
          columns: parenIdentList(m[1]),
          refTable: bareIdent(m[2]),
          refColumns: parenIdentList(m[3]),
          line: elemLine,
        })
      }
      continue
    }
    if (/^(UNIQUE)\b/.test(upper)) {
      const open = el.indexOf('(')
      const close = open >= 0 ? matchParen(el, open) : -1
      if (open >= 0 && close > open) {
        const cols = parenIdentList(el.slice(open + 1, close))
        uniques.push(cols)
        indexes.push({ name: null, columns: cols, unique: true, line: elemLine })
      }
      continue
    }
    if (/^CHECK\b/.test(upper)) {
      const open = el.indexOf('(')
      const close = open >= 0 ? matchParen(el, open) : -1
      if (open >= 0 && close > open) checks.push({ expression: el.slice(open + 1, close).trim(), line: elemLine })
      continue
    }
    if (/^(KEY|INDEX|FULLTEXT)\b/.test(upper)) {
      const nameM = el.match(/^(?:KEY|INDEX|FULLTEXT(?:\s+KEY|\s+INDEX)?)\s+([`"[\]\w.]+)?\s*\(/i)
      const open = el.indexOf('(')
      const close = open >= 0 ? matchParen(el, open) : -1
      if (open >= 0 && close > open) {
        indexes.push({
          name: nameM && nameM[1] ? bareIdent(nameM[1]) : null,
          columns: parenIdentList(el.slice(open + 1, close)),
          unique: false,
          line: elemLine,
        })
      }
      continue
    }

    const col = parseColumnDef(el, elemLine)
    if (col) {
      columns.push(col)
      if (col.primaryKey && !primaryKey.includes(col.name)) primaryKey.push(col.name)
      if (col.unique) uniques.push([col.name])
      // inline REFERENCES → FK.
      const fkM = el.match(/\bREFERENCES\s+([`"[\]\w.]+)\s*\(([^)]*)\)/is)
      if (fkM) {
        foreignKeys.push({
          columns: [col.name],
          refTable: bareIdent(fkM[1]),
          refColumns: parenIdentList(fkM[2]),
          line: elemLine,
        })
      }
    }
  }

  // 테이블 주석: MySQL `) ... COMMENT='...'` 또는 `COMMENT '...'`.
  const tcM = options.match(/\bCOMMENT\s*=?\s*'((?:[^']|'')*)'/i)
  const comment = tcM ? unquote(`'${tcM[1]}'`) : null

  return {
    name,
    relPath,
    line: tableLine,
    comment,
    columns,
    primaryKey,
    uniques,
    foreignKeys,
    checks,
    indexes,
    isCodeTable: false, // extract 가 데이터·휴리스틱으로 재산정.
    rows: [],
    rowCount: 0,
  }
}

/** 한 .sql 소스에서 DDL(테이블 + COMMENT ON) 추출. */
export function extractDdlFromSource(source: string, relPath: string): DdlScanResult {
  const tables: DbTable[] = []
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"[\]\w.]+)\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const openIdx = source.indexOf('(', m.index + m[0].length - 1)
    if (openIdx < 0) continue
    const closeIdx = matchParen(source, openIdx)
    if (closeIdx < 0) continue
    const body = source.slice(openIdx + 1, closeIdx)
    // 옵션 꼬리: ')' 뒤 ~ 다음 ';' 까지.
    const semi = source.indexOf(';', closeIdx)
    const options = source.slice(closeIdx + 1, semi < 0 ? source.length : semi)
    tables.push(
      parseCreateTable(bareIdent(m[1]), relPath, lineAt(source, m.index), body, options, source, openIdx + 1),
    )
    re.lastIndex = closeIdx + 1
  }

  // COMMENT ON TABLE/COLUMN (Oracle/PG).
  const comments: CommentOn[] = []
  const tcRe = /COMMENT\s+ON\s+TABLE\s+([`"[\]\w.]+)\s+IS\s+'((?:[^']|'')*)'/gi
  let tc: RegExpExecArray | null
  while ((tc = tcRe.exec(source)) !== null) {
    comments.push({ table: bareIdent(tc[1]), column: null, text: unquote(`'${tc[2]}'`) })
  }
  const ccRe = /COMMENT\s+ON\s+COLUMN\s+([`"[\]\w.]+)\.([`"[\]\w]+)\s+IS\s+'((?:[^']|'')*)'/gi
  let cc: RegExpExecArray | null
  while ((cc = ccRe.exec(source)) !== null) {
    comments.push({ table: bareIdent(cc[1]), column: bareIdent(cc[2]), text: unquote(`'${cc[3]}'`) })
  }

  return { tables, comments }
}
