/**
 * 코드 내 raw SQL → 테이블×CRUD 결정론 추출(비-MyBatis·비-JPA 폴백).
 *
 * 배경(2026-07-23): m-project 처럼 MyBatis 매퍼도 JPA 엔티티도 없이 손수 짠 JDBC/Kotlin
 * 영속화(예: PostgresXxxStore.kt) 프로젝트는 CRUD 매트릭스의 데이터축을 만들 신호가 없어
 * `buildByDao` 가 열 하나('기능')로 퇴화했다. 영속화 파일엔 raw SQL 이 실재하므로, 문자열의
 * SQL 동사에서 테이블·CRUD 를 뽑아 데이터축을 세운다(egov MyBatis 경로와 대칭).
 *
 * 결정론·정직성:
 *  - 추출 테이블명은 **db-schema 의 알려진 테이블 집합으로 필터**한다 — LATERAL·서브쿼리 별칭·
 *    CTE 이름 같은 노이즈를 지어내지 않는다(알려진 테이블만 축이 된다).
 *  - 라인 1-기반, 등장 순서 보존. (table, crud) 쌍은 최초 등장 라인만 근거로 남긴다.
 */

/** CRUD 글자 — 'C'(insert) 'R'(select/join) 'U'(update) 'D'(delete). */
export type CrudLetter = 'C' | 'R' | 'U' | 'D'

/** 코드 SQL 접근 1건 — 테이블 1개에 대한 CRUD 판정 + 근거 라인. */
export interface RawSqlAccess {
  table: string
  crud: CrudLetter
  line: number
}

/** 파일(relPath) → 코드 SQL 접근 목록. 도달 파일만 담긴다(grounding). */
export interface RawSqlModel {
  byFile: Record<string, RawSqlAccess[]>
}

/** SQL 동사 → 테이블 참조 패턴. 위→아래 순서로 전수 매치(각 패턴이 crud 를 결정). */
const SQL_PATTERNS: Array<{ re: RegExp; crud: CrudLetter }> = [
  { re: /\bINSERT\s+(?:IGNORE\s+)?INTO\s+([A-Za-z_][\w.$"`]*)/gi, crud: 'C' },
  { re: /\bDELETE\s+FROM\s+([A-Za-z_][\w.$"`]*)/gi, crud: 'D' },
  { re: /\bUPDATE\s+([A-Za-z_][\w.$"`]*)/gi, crud: 'U' },
  // FROM = 읽기. 단, `DELETE FROM` 의 FROM 은 D 가 이미 잡으므로 제외(중복 R 방지).
  { re: /(?<!\bDELETE\s{1,40})\bFROM\s+([A-Za-z_][\w.$"`]*)/gi, crud: 'R' },
  { re: /\bJOIN\s+([A-Za-z_][\w.$"`]*)/gi, crud: 'R' },
]

/** 스키마 접두·따옴표·백틱을 걷어낸 bare 테이블명(소문자). */
function bareTable(raw: string): string {
  const noQuote = raw.replace(/["`]/g, '')
  const last = noQuote.split('.').pop() ?? noQuote
  return last.toLowerCase()
}

/** 문자열 오프셋 → 1-기반 라인 번호. */
function lineAt(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === '\n') line++
  return line
}

/**
 * 한 소스 파일의 raw SQL 에서 (table, crud, line) 을 추출한다.
 * knownTables(소문자) 에 없는 테이블명은 버린다 — 노이즈를 축으로 삼지 않는다.
 * 같은 (table, crud) 는 최초 등장 라인만 남긴다(결정론·중복 근거 방지).
 */
export function extractSqlCrud(source: string, knownTables: ReadonlySet<string>): RawSqlAccess[] {
  if (knownTables.size === 0) return []
  const firstLine = new Map<string, number>() // `${table}|${crud}` → line
  for (const { re, crud } of SQL_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      const table = bareTable(m[1])
      if (!knownTables.has(table)) continue
      const line = lineAt(source, m.index)
      const key = `${table}|${crud}`
      const prev = firstLine.get(key)
      if (prev === undefined || line < prev) firstLine.set(key, line)
    }
  }
  return [...firstLine.entries()]
    .map(([key, line]) => {
      const [table, crud] = key.split('|')
      return { table, crud: crud as CrudLetter, line }
    })
    .sort((a, b) => (a.table < b.table ? -1 : a.table > b.table ? 1 : a.crud < b.crud ? -1 : a.crud > b.crud ? 1 : 0))
}

/**
 * 여러 소스 파일 → RawSqlModel. SQL 접근이 있는 파일만 담는다(빈 파일은 배제 = 결정론 축소).
 * knownTables 는 db-schema 의 테이블명 집합(소문자).
 */
export function buildRawSqlModel(
  files: Array<{ relPath: string; content: string }>,
  knownTables: ReadonlySet<string>,
): RawSqlModel {
  const byFile: Record<string, RawSqlAccess[]> = {}
  for (const { relPath, content } of files) {
    const accesses = extractSqlCrud(content, knownTables)
    if (accesses.length > 0) byFile[relPath] = accesses
  }
  return { byFile }
}

/** 모델이 비었나(축을 세울 SQL 신호가 하나도 없음). */
export function isRawSqlModelEmpty(model: RawSqlModel | null | undefined): boolean {
  return !model || Object.keys(model.byFile).length === 0
}
