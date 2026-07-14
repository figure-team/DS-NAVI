import type { DbSchemaModel } from './types.js';
export { DB_SCHEMA_FILENAME, DATALOAD_ROW_CAP, EMBEDDED_DB_VENDORS, DbSchemaModelSchema, DbTableSchema, DbColumnSchema, DbForeignKeySchema, DbCheckSchema, DbIndexSchema, DbRowSchema, DbSchemaTierSchema, DbTableOriginSchema, LiveDbSignalSchema, } from './types.js';
export type { DbSchemaModel, DbTable, DbColumn, DbForeignKey, DbCheck, DbIndex, DbRow, DbSchemaTier, DbTableOrigin, LiveDbSignal, } from './types.js';
export { extractDbSchema } from './extract.js';
export { inferTablesFromCode } from './code-infer.js';
export type { CodeInferResult } from './code-infer.js';
export { discoverLiveDbSignals } from './discover.js';
export { extractDdlFromSource } from './ddl-scan.js';
export type { DdlScanResult, CommentOn } from './ddl-scan.js';
export { extractDataloadFromSource } from './dataload-scan.js';
export type { InsertRow } from './dataload-scan.js';
/** db-schema.json 기록(`.spec/map/` mkdir -p 선행). */
export declare function writeDbSchema(projectRoot: string, model: DbSchemaModel): void;
/**
 * `.spec/map/db-schema.json` 로드(map scan 산출). 없거나 손상/구버전이면 null →
 * 소비자(policy/docs)가 자체 생성 폴백. PA2/PA3 의 "있으면 로드·없으면 생성" 진입점.
 */
export declare function readDbSchema(projectRoot: string): DbSchemaModel | null;
//# sourceMappingURL=index.d.ts.map