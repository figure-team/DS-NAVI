/**
 * DB 스키마 추출(정책서 P0) 공개 표면 — 정적 .sql 스캐너(DDL+dataload, 3-Tier).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { specMapDir, stableJson } from '../domain-map/persist.js'
import { DB_SCHEMA_FILENAME } from './types.js'
import type { DbSchemaModel } from './types.js'

export {
  DB_SCHEMA_FILENAME,
  DATALOAD_ROW_CAP,
  DbSchemaModelSchema,
  DbTableSchema,
  DbColumnSchema,
  DbForeignKeySchema,
  DbCheckSchema,
  DbIndexSchema,
  DbRowSchema,
  DbSchemaTierSchema,
} from './types.js'
export type {
  DbSchemaModel,
  DbTable,
  DbColumn,
  DbForeignKey,
  DbCheck,
  DbIndex,
  DbRow,
  DbSchemaTier,
} from './types.js'
export { extractDbSchema } from './extract.js'
export { extractDdlFromSource } from './ddl-scan.js'
export type { DdlScanResult, CommentOn } from './ddl-scan.js'
export { extractDataloadFromSource } from './dataload-scan.js'
export type { InsertRow } from './dataload-scan.js'

/** db-schema.json 기록(`.spec/map/` mkdir -p 선행). */
export function writeDbSchema(projectRoot: string, model: DbSchemaModel): void {
  const dir = specMapDir(projectRoot)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, DB_SCHEMA_FILENAME), stableJson(model), 'utf8')
}
