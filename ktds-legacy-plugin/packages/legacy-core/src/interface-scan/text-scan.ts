/**
 * DB link 텍스트 스캔(T1/T2) — mapper XML·.sql 의 `table@dblink` 참조와
 * `CREATE DATABASE LINK` DDL 을 결정론으로 탐지한다.
 *
 * 오탐 억제: `@` 토큰 전체가 아니라 SQL 문맥 키워드(FROM/JOIN/INTO/UPDATE) 바로 뒤의
 * `식별자@식별자` 만 잡는다(XML 주석은 사전 제거 — 이메일 등 배제).
 */
import type { InterfaceProtocol } from './types.js'
import type { RawInterfaceSignal } from './java-scan.js'

/** XML 주석을 공백으로 치환(줄 번호 보존). */
function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
}

/** SQL 라인 주석(`-- …`)을 공백으로 치환(줄 번호 보존). */
function stripSqlComments(text: string): string {
  return text
    .replace(/--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/** `FROM|JOIN|INTO|UPDATE <table>@<link>` 참조. */
const DBLINK_REF_RE =
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+([A-Za-z_][\w$#.]*)@([A-Za-z_][\w$#.]*)/gi

/** `CREATE [PUBLIC] DATABASE LINK <name>` DDL. */
const DBLINK_DDL_RE = /\bCREATE\s+(?:PUBLIC\s+)?DATABASE\s+LINK\s+([A-Za-z_"][\w$#."]*)/gi

const PROTOCOL: InterfaceProtocol = 'db-link'

/**
 * 단일 텍스트 파일(mapper XML / .sql)에서 DB link 신호를 추출한다.
 * @param lang census lang ('xml' | 'sql')
 */
export function scanDbLinks(rawText: string, filePath: string, lang: string): RawInterfaceSignal[] {
  const text = lang === 'xml' ? stripXmlComments(rawText) : stripSqlComments(rawText)
  const out: RawInterfaceSignal[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  DBLINK_REF_RE.lastIndex = 0
  while ((m = DBLINK_REF_RE.exec(text)) !== null) {
    const table = m[1]
    const link = m[2]
    const line = lineAt(text, m.index)
    const key = `${line}|${link}|${table}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      protocol: PROTOCOL,
      direction: 'outbound',
      clientType: 'dblink',
      endpointRaw: `${table}@${link}`,
      dataHint: null,
      file: filePath,
      line,
      symbol: link,
    })
  }

  DBLINK_DDL_RE.lastIndex = 0
  while ((m = DBLINK_DDL_RE.exec(text)) !== null) {
    const link = m[1].replace(/"/g, '')
    const line = lineAt(text, m.index)
    const key = `${line}|ddl|${link}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      protocol: PROTOCOL,
      direction: 'outbound',
      clientType: 'dblink(DDL)',
      endpointRaw: link,
      dataHint: null,
      file: filePath,
      line,
      symbol: link,
    })
  }

  return out
}
