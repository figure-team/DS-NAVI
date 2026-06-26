/**
 * DB 스키마 스캐너(정책서 P0) — census 의 .sql 파일을 정적 파싱해 db-schema.json 생성.
 *
 * 3-Tier 자산 게이팅:
 *  - 사용 가능한 구조(테이블)가 하나라도 추출되면 tier = 'ddl+data'(데이터 행 있음) | 'ddl'.
 *  - .sql 이 없거나 추출 0이면 tier = 'code-only' → 소비자(정책 신호 스캐너)가 JPA/MyBatis 폴백.
 *
 * 정직성: 파일별 파싱 실패는 throw 하지 않고 unresolved 로 격리(jpa/extract 와 동일 규약).
 * 결정론: 테이블은 name 정렬, 컬럼·제약·행은 등장 순서 보존, unresolved 정렬.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitCommitHash } from '../domain-map/persist.js'
import type { CensusReport } from '../domain-map/types.js'
import { extractDdlFromSource } from './ddl-scan.js'
import { extractDataloadFromSource } from './dataload-scan.js'
import { DbSchemaModelSchema, DATALOAD_ROW_CAP } from './types.js'
import type { DbSchemaModel, DbTable, DbSchemaTier } from './types.js'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 코드/룩업 테이블 휴리스틱 — 명명 패턴 또는 (코드컬럼 + 라벨컬럼) 동반. */
function looksLikeCodeTable(table: DbTable): boolean {
  if (/(^|_)(code|cd|codes|type|types|status|common|comm|grp|group|category|categories|lookup|kind)(_|$)/i.test(table.name)) {
    return true
  }
  const cols = table.columns.map((c) => c.name.toLowerCase())
  const hasCode = cols.some((c) => c === 'code' || c === 'cd' || /(_cd|_code|code|cd)$/.test(c))
  const hasLabel = cols.some((c) => /(name|nm|label|desc|title)$/.test(c) || c === 'name')
  return hasCode && hasLabel
}

/** census 의 .sql 파일을 파싱해 DB 스키마 모델 생성. */
export function extractDbSchema(projectRoot: string, census: CensusReport): DbSchemaModel {
  const tableByKey = new Map<string, DbTable>()
  const unresolved: Array<{ ref: string; reason: string }> = []
  let sqlFileCount = 0

  const key = (name: string) => name.toLowerCase()

  // 소스 1회 읽어 캐시(파일 순서 무관한 2-패스를 위해).
  const sources: Array<{ relPath: string; source: string }> = []
  for (const f of census.files) {
    if (f.lang !== 'sql') continue
    sqlFileCount++
    try {
      sources.push({ relPath: f.relPath, source: readFileSync(join(projectRoot, f.relPath), 'utf8') })
    } catch {
      sqlFileCount--
    }
  }

  // 패스 1: 모든 DDL(테이블) 수집 — dataload 합성이 실제 DDL 을 가리지 않게 선행.
  const pendingComments: Array<{ relPath: string; table: string; column: string | null; text: string }> = []
  for (const { relPath, source } of sources) {
    try {
      const { tables, comments } = extractDdlFromSource(source, relPath)
      for (const t of tables) {
        const k = key(t.name)
        if (tableByKey.has(k)) {
          unresolved.push({ ref: `${relPath}:${t.name}`, reason: '중복 CREATE TABLE(첫 정의 유지)' })
          continue
        }
        tableByKey.set(k, t)
      }
      for (const c of comments) pendingComments.push({ relPath, ...c })
    } catch (err) {
      unresolved.push({ ref: relPath, reason: `DDL 파싱 실패: ${(err as Error).message}` })
    }
  }

  // 패스 1b: COMMENT ON 부착(모든 CREATE 수집 후 — 파일 경계 무관).
  for (const c of pendingComments) {
    const t = tableByKey.get(key(c.table))
    if (!t) {
      unresolved.push({ ref: `${c.relPath}:COMMENT ${c.table}`, reason: '미발견 테이블에 COMMENT' })
      continue
    }
    if (c.column === null) {
      if (t.comment === null) t.comment = c.text
    } else {
      const col = t.columns.find((cc) => key(cc.name) === key(c.column as string))
      if (col && col.comment === null) col.comment = c.text
      else if (!col) unresolved.push({ ref: `${c.relPath}:COMMENT ${c.table}.${c.column}`, reason: '미발견 컬럼에 COMMENT' })
    }
  }

  // 패스 2: dataload INSERT(실제 DDL 테이블 존재 후 부착·합성).
  for (const { relPath: f_relPath, source } of sources) {
    try {
      for (const ins of extractDataloadFromSource(source)) {
        const k = key(ins.table)
        let t = tableByKey.get(k)
        if (!t) {
          // DDL 없는 dataload-only 테이블 — 데이터 보존 위해 합성(컬럼은 INSERT 기준).
          t = {
            name: ins.table,
            relPath: f_relPath,
            line: ins.line,
            comment: null,
            columns: (ins.columns ?? ins.values.map((_, i) => `col${i}`)).map((n) => ({
              name: n,
              type: 'UNKNOWN',
              nullable: true,
              primaryKey: false,
              unique: false,
              default: null,
              comment: null,
              line: ins.line,
            })),
            primaryKey: [],
            uniques: [],
            foreignKeys: [],
            checks: [],
            indexes: [],
            isCodeTable: false,
            rows: [],
            rowCount: 0,
          }
          tableByKey.set(k, t)
        }
        const colNames = ins.columns ?? t.columns.map((c) => c.name)
        t.rowCount++
        if (t.rows.length < DATALOAD_ROW_CAP) {
          const values: Record<string, string> = {}
          ins.values.forEach((v, i) => {
            values[colNames[i] ?? `col${i}`] = v
          })
          t.rows.push({ values, line: ins.line })
        }
      }
    } catch (err) {
      unresolved.push({ ref: f_relPath, reason: `dataload 파싱 실패: ${(err as Error).message}` })
    }
  }

  const tables = [...tableByKey.values()]
  for (const t of tables) t.isCodeTable = looksLikeCodeTable(t)
  tables.sort((a, b) => cmp(a.name, b.name) || cmp(a.relPath, b.relPath))
  unresolved.sort((a, b) => cmp(a.ref, b.ref) || cmp(a.reason, b.reason))

  const hasData = tables.some((t) => t.rowCount > 0)
  const tier: DbSchemaTier = tables.length === 0 ? 'code-only' : hasData ? 'ddl+data' : 'ddl'

  return DbSchemaModelSchema.parse({
    schemaVersion: 1,
    gitCommit: gitCommitHash(projectRoot),
    tier,
    sqlFileCount,
    tables,
    unresolved,
  })
}
