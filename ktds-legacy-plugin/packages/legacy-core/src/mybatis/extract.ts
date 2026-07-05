/**
 * MyBatis Mapper XML 추출기(Tier B) — 정규식 기반 결정론 파서(외부 XML 의존 없음).
 *
 * jpetstore 류 매퍼는 `<sql>`/`<include>` 없이 문마다 완결 SQL. 동적 태그(<if>/<where>/<bind>)는
 * 텍스트만 남기고 제거 후 테이블/컬럼을 정규식으로 추출한다. 추출 불가/모호하면 누락(합성 금지).
 */
import { MyBatisModelSchema } from './types.js'
import type { Crud, MyBatisMapper, MyBatisModel, MyBatisStatement } from './types.js'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const uniqSort = (xs: string[]) => [...new Set(xs)].sort(cmp)

const TAG_CRUD: Record<string, Crud> = { select: 'R', insert: 'C', update: 'U', delete: 'D' }

/** 동적 태그/바인딩 파라미터/주석 제거 후 평문 SQL. */
function plainSql(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ') // <if>/<where>/<foreach>/<bind> 등 제거(내부 텍스트는 보존).
    .replace(/[#$]\{[^}]*\}/g, '?') // #{...}/${...} → 플레이스홀더.
    .replace(/\s+/g, ' ')
}

/** SQL 에서 참조 테이블 추출(FROM 다중·JOIN·INSERT INTO·UPDATE·DELETE FROM). */
function tablesInSql(sql: string): string[] {
  const out: string[] = []
  const ident = '[A-Za-z_][A-Za-z0-9_]*'
  // FROM a, b, c  (서브쿼리 "FROM (" 는 ident 불일치로 자연 제외)
  for (const m of sql.matchAll(new RegExp(`\\bFROM\\s+(${ident}(?:\\s*,\\s*${ident})*)`, 'gi'))) {
    for (const t of m[1].split(',')) out.push(t.trim())
  }
  for (const m of sql.matchAll(new RegExp(`\\bJOIN\\s+(${ident})`, 'gi'))) out.push(m[1])
  for (const m of sql.matchAll(new RegExp(`\\bINTO\\s+(${ident})`, 'gi'))) out.push(m[1])
  for (const m of sql.matchAll(new RegExp(`\\bUPDATE\\s+(${ident})`, 'gi'))) out.push(m[1])
  return uniqSort(out.map((t) => t.toUpperCase()))
}

/** INSERT 컬럼리스트 + UPDATE SET 컬럼에서 컬럼명 추출(베스트에포트). */
function columnsInSql(sql: string, crud: Crud): string[] {
  const cols: string[] = []
  const ident = '[A-Za-z_][A-Za-z0-9_]*'
  if (crud === 'C') {
    // INSERT INTO T (c1, c2, ...) — 첫 괄호 그룹.
    const m = new RegExp(`\\bINTO\\s+${ident}\\s*\\(([^)]*)\\)`, 'i').exec(sql)
    if (m) for (const c of m[1].split(',')) cols.push(c.trim())
  } else if (crud === 'U') {
    // UPDATE T SET c1 = ?, c2 = ? [WHERE ...] — SET~WHERE 구간의 'col =' 패턴(WHERE 절 제외).
    const upper = sql.toUpperCase()
    const setIdx = upper.indexOf(' SET ')
    if (setIdx >= 0) {
      const whereIdx = upper.indexOf(' WHERE ', setIdx)
      const region = sql.slice(setIdx + 5, whereIdx >= 0 ? whereIdx : undefined)
      for (const m of region.matchAll(new RegExp(`(${ident})\\s*=`, 'g'))) cols.push(m[1])
    }
  }
  return uniqSort(cols.filter((c) => /^[A-Za-z_]/.test(c)).map((c) => c.toUpperCase()))
}

/** 1-기반 라인 번호(문자열 인덱스 기준). */
function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/**
 * Mapper XML 판별 — **루트 요소**가 `<mapper>` 인 문서만 참(선언/주석/DOCTYPE 허용).
 *
 * `includes('<mapper')` 류 부분 문자열 검사는 문서 **본문의 코드 예제**에 매퍼 조각이
 * 실린 파일(maven xdoc 등 — jpetstore src/site 하위 xdoc/index.xml 실측 오탐 4건)을
 * 매퍼로 오분류해 프로그램 목록·위험 Top N 을 오염시킨다(W4 실측에서 발견).
 * 한계: DOCTYPE 내부 서브셋(`[...]`)은 미지원 — 매퍼 DTD 선언 관례상 등장하지 않음.
 * 처리 명령(PI)은 xml 선언 외 것(xml-stylesheet 등)도 허용·반복 매칭(리뷰 R4).
 */
const MAPPER_ROOT_RE = new RegExp(
  '^\\uFEFF?\\s*(?:(?:<\\?[^>]*\\?>|<!--[\\s\\S]*?-->|<!DOCTYPE[^>]*>)\\s*)*<mapper[\\s>]',
  'i',
)

export function isMapperXmlDocument(content: string): boolean {
  return MAPPER_ROOT_RE.test(content)
}

/** 한 Mapper XML 내용 → MyBatisMapper. 루트가 `<mapper namespace>` 가 아니면 null. */
export function parseMapperXml(content: string, relPath: string): MyBatisMapper | null {
  if (!isMapperXmlDocument(content)) return null
  const ns = /<mapper\s+[^>]*\bnamespace\s*=\s*"([^"]+)"/i.exec(content)
  if (!ns) return null
  const statements: MyBatisStatement[] = []
  const re = /<(select|insert|update|delete)\b[^>]*\bid\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi
  for (const m of content.matchAll(re)) {
    const crud = TAG_CRUD[m[1].toLowerCase()]
    const sql = plainSql(m[3])
    statements.push({
      id: m[2],
      crud,
      tables: tablesInSql(sql),
      columns: columnsInSql(sql, crud),
      line: lineAt(content, m.index ?? 0),
    })
  }
  statements.sort((a, b) => cmp(a.id, b.id))
  return { namespace: ns[1], relPath, statements }
}

/** 매퍼 XML 파일들 → MyBatisModel(결정론: namespace/문/테이블 정렬). */
export function buildMyBatisModel(files: Array<{ relPath: string; content: string }>): MyBatisModel {
  const mappers: MyBatisMapper[] = []
  for (const f of files) {
    const m = parseMapperXml(f.content, f.relPath)
    if (m) mappers.push(m)
  }
  mappers.sort((a, b) => cmp(a.namespace, b.namespace))
  const tables = uniqSort(mappers.flatMap((m) => m.statements.flatMap((s) => s.tables)))
  return MyBatisModelSchema.parse({ schemaVersion: 1, mappers, tables })
}

/** namespace basename(마지막 '.' 뒤) — 매퍼 인터페이스 클래스명과 매칭용. */
export function namespaceBaseName(namespace: string): string {
  const i = namespace.lastIndexOf('.')
  return i >= 0 ? namespace.slice(i + 1) : namespace
}
