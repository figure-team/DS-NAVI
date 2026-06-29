/**
 * DB 스키마 추출 데이터 계약(정책서 P0) — zod 스키마 + z.infer 타입.
 *
 * 소스 트리의 .sql 을 정적 파싱한 결과(라이브 DB 커넥터 없음). 3-Tier 신뢰 모델:
 *  - Tier 1 (DDL): CREATE TABLE → 컬럼/제약/FK/인덱스/주석. CONFIRMED 가능.
 *  - Tier 2 (dataload): INSERT → 공통코드/상태/요율 행. CONFIRMED 가능.
 *  - Tier 3 (없음): .sql 부재 → 소비자(정책 신호 스캐너)가 JPA/MyBatis 코드역추론 폴백.
 *
 * 결정론: 모든 배열은 생산자에서 명시 키로 정렬(컬럼은 선언 순서 보존). 라인은 1-기반.
 * 신뢰도/근거 모델은 JpaModel(보완 B)과 동형(schemaVersion·gitCommit·unresolved).
 */
import { z } from 'zod'

/** `.spec/map/` 정규 산출물 파일명. */
export const DB_SCHEMA_FILENAME = 'db-schema.json'

/** 분석 등급 — 발견한 .sql 자산에 따라 결정(자산 게이팅). */
export const DbSchemaTierSchema = z.enum(['ddl+data', 'ddl', 'code-only'])
export type DbSchemaTier = z.infer<typeof DbSchemaTierSchema>

/** 컬럼 한 개 — DDL 컬럼 정의에서 파싱. line 은 컬럼 선언 라인(1-기반). */
export const DbColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  primaryKey: z.boolean(),
  unique: z.boolean(),
  /** DEFAULT 절 원문(없으면 null). */
  default: z.string().nullable(),
  /** 컬럼 주석(MySQL inline COMMENT / Oracle·PG COMMENT ON COLUMN). 용어사전 근거. */
  comment: z.string().nullable(),
  line: z.number().int().positive(),
})
export type DbColumn = z.infer<typeof DbColumnSchema>

/** 외래키 — 테이블/컬럼 제약. */
export const DbForeignKeySchema = z.object({
  columns: z.array(z.string()),
  refTable: z.string(),
  refColumns: z.array(z.string()),
  line: z.number().int().positive(),
})
export type DbForeignKey = z.infer<typeof DbForeignKeySchema>

/** CHECK 제약 — 원문 식 보존(업무규칙·상태값 정책 근거). */
export const DbCheckSchema = z.object({
  expression: z.string(),
  line: z.number().int().positive(),
})
export type DbCheck = z.infer<typeof DbCheckSchema>

/** 인덱스 — UNIQUE 여부 포함. */
export const DbIndexSchema = z.object({
  name: z.string().nullable(),
  columns: z.array(z.string()),
  unique: z.boolean(),
  line: z.number().int().positive(),
})
export type DbIndex = z.infer<typeof DbIndexSchema>

/** 코드테이블 데이터 행(Tier 2) — 컬럼명→값 매핑. 결정론 위해 INSERT 순서 보존. */
export const DbRowSchema = z.object({
  values: z.record(z.string(), z.string()),
  line: z.number().int().positive(),
})
export type DbRow = z.infer<typeof DbRowSchema>

/** 테이블 한 개 — DDL(구조) + dataload(데이터) 병합 결과. */
export const DbTableSchema = z.object({
  name: z.string(),
  relPath: z.string(),
  line: z.number().int().positive(),
  /** 테이블 주석(MySQL COMMENT= / Oracle·PG COMMENT ON TABLE). */
  comment: z.string().nullable(),
  columns: z.array(DbColumnSchema),
  /** 기본키 컬럼(컬럼-레벨 PRIMARY KEY 또는 테이블 제약 통합). */
  primaryKey: z.array(z.string()),
  /** UNIQUE 그룹 목록(각 그룹 = 컬럼명 배열). */
  uniques: z.array(z.array(z.string())),
  foreignKeys: z.array(DbForeignKeySchema),
  checks: z.array(DbCheckSchema),
  indexes: z.array(DbIndexSchema),
  /** 코드/룩업 테이블 휴리스틱(상태값·과금 정책 근거 후보). */
  isCodeTable: z.boolean(),
  /** dataload INSERT 행(캡 적용). rowCount 가 실제 총 행수(캡 초과 보고). */
  rows: z.array(DbRowSchema),
  rowCount: z.number().int().nonnegative(),
})
export type DbTable = z.infer<typeof DbTableSchema>

/**
 * 라이브 DB "연결 신호" — 정적 탐지 결과(연결하지 않음, PA1).
 * pom/gradle 의 JDBC 드라이버 의존성 또는 application.{yml,properties}/xml 의 jdbc: URL.
 * SKILL(PA-gate)이 이 신호로 사용자에게 .sql 덤프를 권장한다(라이브 연결은 추후).
 */
export const LiveDbSignalSchema = z.object({
  /** 벤더(mysql/oracle/postgresql/sqlserver/mariadb/db2/h2/hsqldb/sqlite/derby/unknown). */
  vendor: z.string(),
  /** 내장형(h2/hsqldb/sqlite/derby) — 보통 .sql 로딩형이라 외부 라이브 DB 아님(게이트가 약하게 취급). */
  embedded: z.boolean(),
  /** 신호 종류. */
  kind: z.enum(['driver', 'datasource-url']),
  /** 근거 토큰(드라이버 좌표 / jdbc URL 스킴) — 합성 아님, 소스 원문. */
  detail: z.string(),
  relPath: z.string(),
  line: z.number().int().positive(),
})
export type LiveDbSignal = z.infer<typeof LiveDbSignalSchema>

/** 내장형 DB 벤더(외부 라이브 연결 아님 — .sql 로딩형). */
export const EMBEDDED_DB_VENDORS = new Set(['h2', 'hsqldb', 'sqlite', 'derby'])

/** DB 스키마 모델 — .spec/map/db-schema.json 의 단일 소스. */
export const DbSchemaModelSchema = z.object({
  schemaVersion: z.literal(1),
  gitCommit: z.string().nullable(),
  /** 분석 등급(자산 게이팅 결과). code-only 면 tables 는 비고 소비자가 코드역추론. */
  tier: DbSchemaTierSchema,
  /** 파싱한 .sql 파일 수(0 이면 tier=code-only). */
  sqlFileCount: z.number().int().nonnegative(),
  tables: z.array(DbTableSchema),
  /** 라이브 DB 연결 신호(정적 탐지, 무연결). 비어있지 않으면 SKILL 이 .sql 덤프를 권장. */
  liveDbSignals: z.array(LiveDbSignalSchema),
  /** 파싱 못한 신호(보고, 누락 금지). */
  unresolved: z.array(z.object({ ref: z.string(), reason: z.string() })),
})
export type DbSchemaModel = z.infer<typeof DbSchemaModelSchema>

/** dataload 행 캡(테이블당). 초과분은 rowCount 로만 보고. */
export const DATALOAD_ROW_CAP = 50
