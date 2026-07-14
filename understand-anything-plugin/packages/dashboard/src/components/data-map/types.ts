/**
 * 데이터 맵 공용 타입 — db-schema.json / crud-matrix.json 서브셋(대시보드 소비 관점).
 * severity·codeTableReason 은 스캐너 개편(legacy-core 0.3.4+) 필드 — 구버전 산출물 부재 허용.
 */

/* ── db-schema.json 서브셋 ── */
export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  default: string | null;
  comment: string | null;
  line: number;
}
export interface DbForeignKey {
  columns: string[];
  refColumns: string[];
  refTable: string;
  line: number;
}
export interface DbRow {
  line: number;
  values: Record<string, string>;
}
export interface DbTable {
  name: string;
  line: number;
  isCodeTable: boolean;
  codeTableReason?: string | null;
  comment: string | null;
  columns: DbColumn[];
  primaryKey: string[] | null;
  foreignKeys: DbForeignKey[] | null;
  checks: unknown[] | null;
  uniques: unknown[] | null;
  indexes: unknown[] | null;
  relPath: string | null;
  rowCount: number;
  rows: DbRow[];
  /** 출처(legacy-core 0.3.10+): 'sql'(DDL 권위) | 'mybatis'|'jpa'(코드 역추론 근사). 부재 = sql. */
  origin?: string;
}
export interface DbUnresolved {
  reason: string;
  ref: string;
  /** 부재 = 'warn'(구버전 하위호환). */
  severity?: "warn" | "info";
}
export interface DbSchema {
  tier: string;
  sqlFileCount: number;
  gitCommit?: string;
  tables: DbTable[];
  unresolved?: DbUnresolved[];
}

/* ── crud-matrix.json 서브셋 ── */
export interface CrudEvidence {
  file: string;
  line: number;
}
export interface CrudRow {
  cells: string[];
  confidence: string;
  evidence: CrudEvidence[];
}
export interface CrudMatrix {
  heading?: string;
  prose?: string;
  columns: string[];
  rows: CrudRow[];
}

/* ── 공용 헬퍼 ── */
export const baseName = (p: string): string => p.split("/").pop() ?? p;
/** 역추론 테이블 배지 라벨(tier=code-inferred) — 권위 DDL 아님을 상시 표기. */
export const originBadge = (t: DbTable): string | null =>
  t.origin === "mybatis" ? "역추론 · MyBatis" : t.origin === "jpa" ? "역추론 · JPA" : null;
/** 컬럼이 PK인가 — 컬럼 플래그 또는 테이블 primaryKey 배열 멤버십(스캐너에 따라 한쪽만 채워짐). */
export const isPk = (t: DbTable, c: DbColumn): boolean =>
  c.primaryKey || (t.primaryKey?.includes(c.name) ?? false);
export const len = (a: unknown[] | null | undefined): number => (Array.isArray(a) ? a.length : 0);
