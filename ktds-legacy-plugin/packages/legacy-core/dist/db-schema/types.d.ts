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
import { z } from 'zod';
/** `.spec/map/` 정규 산출물 파일명. */
export declare const DB_SCHEMA_FILENAME = "db-schema.json";
/** 분석 등급 — 발견한 .sql 자산에 따라 결정(자산 게이팅). */
export declare const DbSchemaTierSchema: z.ZodEnum<{
    "ddl+data": "ddl+data";
    ddl: "ddl";
    "code-only": "code-only";
}>;
export type DbSchemaTier = z.infer<typeof DbSchemaTierSchema>;
/** 컬럼 한 개 — DDL 컬럼 정의에서 파싱. line 은 컬럼 선언 라인(1-기반). */
export declare const DbColumnSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
    nullable: z.ZodBoolean;
    primaryKey: z.ZodBoolean;
    unique: z.ZodBoolean;
    default: z.ZodNullable<z.ZodString>;
    comment: z.ZodNullable<z.ZodString>;
    line: z.ZodNumber;
}, z.core.$strip>;
export type DbColumn = z.infer<typeof DbColumnSchema>;
/** 외래키 — 테이블/컬럼 제약. */
export declare const DbForeignKeySchema: z.ZodObject<{
    columns: z.ZodArray<z.ZodString>;
    refTable: z.ZodString;
    refColumns: z.ZodArray<z.ZodString>;
    line: z.ZodNumber;
}, z.core.$strip>;
export type DbForeignKey = z.infer<typeof DbForeignKeySchema>;
/** CHECK 제약 — 원문 식 보존(업무규칙·상태값 정책 근거). */
export declare const DbCheckSchema: z.ZodObject<{
    expression: z.ZodString;
    line: z.ZodNumber;
}, z.core.$strip>;
export type DbCheck = z.infer<typeof DbCheckSchema>;
/** 인덱스 — UNIQUE 여부 포함. */
export declare const DbIndexSchema: z.ZodObject<{
    name: z.ZodNullable<z.ZodString>;
    columns: z.ZodArray<z.ZodString>;
    unique: z.ZodBoolean;
    line: z.ZodNumber;
}, z.core.$strip>;
export type DbIndex = z.infer<typeof DbIndexSchema>;
/** 코드테이블 데이터 행(Tier 2) — 컬럼명→값 매핑. 결정론 위해 INSERT 순서 보존. */
export declare const DbRowSchema: z.ZodObject<{
    values: z.ZodRecord<z.ZodString, z.ZodString>;
    line: z.ZodNumber;
}, z.core.$strip>;
export type DbRow = z.infer<typeof DbRowSchema>;
/** 테이블 한 개 — DDL(구조) + dataload(데이터) 병합 결과. */
export declare const DbTableSchema: z.ZodObject<{
    name: z.ZodString;
    relPath: z.ZodString;
    line: z.ZodNumber;
    comment: z.ZodNullable<z.ZodString>;
    columns: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        nullable: z.ZodBoolean;
        primaryKey: z.ZodBoolean;
        unique: z.ZodBoolean;
        default: z.ZodNullable<z.ZodString>;
        comment: z.ZodNullable<z.ZodString>;
        line: z.ZodNumber;
    }, z.core.$strip>>;
    primaryKey: z.ZodArray<z.ZodString>;
    uniques: z.ZodArray<z.ZodArray<z.ZodString>>;
    foreignKeys: z.ZodArray<z.ZodObject<{
        columns: z.ZodArray<z.ZodString>;
        refTable: z.ZodString;
        refColumns: z.ZodArray<z.ZodString>;
        line: z.ZodNumber;
    }, z.core.$strip>>;
    checks: z.ZodArray<z.ZodObject<{
        expression: z.ZodString;
        line: z.ZodNumber;
    }, z.core.$strip>>;
    indexes: z.ZodArray<z.ZodObject<{
        name: z.ZodNullable<z.ZodString>;
        columns: z.ZodArray<z.ZodString>;
        unique: z.ZodBoolean;
        line: z.ZodNumber;
    }, z.core.$strip>>;
    isCodeTable: z.ZodBoolean;
    codeTableReason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    rows: z.ZodArray<z.ZodObject<{
        values: z.ZodRecord<z.ZodString, z.ZodString>;
        line: z.ZodNumber;
    }, z.core.$strip>>;
    rowCount: z.ZodNumber;
}, z.core.$strip>;
export type DbTable = z.infer<typeof DbTableSchema>;
/**
 * 라이브 DB "연결 신호" — 정적 탐지 결과(연결하지 않음, PA1).
 * pom/gradle 의 JDBC 드라이버 의존성 또는 application.{yml,properties}/xml 의 jdbc: URL.
 * SKILL(PA-gate)이 이 신호로 사용자에게 .sql 덤프를 권장한다(라이브 연결은 추후).
 */
export declare const LiveDbSignalSchema: z.ZodObject<{
    vendor: z.ZodString;
    embedded: z.ZodBoolean;
    kind: z.ZodEnum<{
        driver: "driver";
        "datasource-url": "datasource-url";
    }>;
    detail: z.ZodString;
    relPath: z.ZodString;
    line: z.ZodNumber;
}, z.core.$strip>;
export type LiveDbSignal = z.infer<typeof LiveDbSignalSchema>;
/** 내장형 DB 벤더(외부 라이브 연결 아님 — .sql 로딩형). */
export declare const EMBEDDED_DB_VENDORS: Set<string>;
/** DB 스키마 모델 — .spec/map/db-schema.json 의 단일 소스. */
export declare const DbSchemaModelSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    tier: z.ZodEnum<{
        "ddl+data": "ddl+data";
        ddl: "ddl";
        "code-only": "code-only";
    }>;
    sqlFileCount: z.ZodNumber;
    tables: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        relPath: z.ZodString;
        line: z.ZodNumber;
        comment: z.ZodNullable<z.ZodString>;
        columns: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            nullable: z.ZodBoolean;
            primaryKey: z.ZodBoolean;
            unique: z.ZodBoolean;
            default: z.ZodNullable<z.ZodString>;
            comment: z.ZodNullable<z.ZodString>;
            line: z.ZodNumber;
        }, z.core.$strip>>;
        primaryKey: z.ZodArray<z.ZodString>;
        uniques: z.ZodArray<z.ZodArray<z.ZodString>>;
        foreignKeys: z.ZodArray<z.ZodObject<{
            columns: z.ZodArray<z.ZodString>;
            refTable: z.ZodString;
            refColumns: z.ZodArray<z.ZodString>;
            line: z.ZodNumber;
        }, z.core.$strip>>;
        checks: z.ZodArray<z.ZodObject<{
            expression: z.ZodString;
            line: z.ZodNumber;
        }, z.core.$strip>>;
        indexes: z.ZodArray<z.ZodObject<{
            name: z.ZodNullable<z.ZodString>;
            columns: z.ZodArray<z.ZodString>;
            unique: z.ZodBoolean;
            line: z.ZodNumber;
        }, z.core.$strip>>;
        isCodeTable: z.ZodBoolean;
        codeTableReason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        rows: z.ZodArray<z.ZodObject<{
            values: z.ZodRecord<z.ZodString, z.ZodString>;
            line: z.ZodNumber;
        }, z.core.$strip>>;
        rowCount: z.ZodNumber;
    }, z.core.$strip>>;
    liveDbSignals: z.ZodArray<z.ZodObject<{
        vendor: z.ZodString;
        embedded: z.ZodBoolean;
        kind: z.ZodEnum<{
            driver: "driver";
            "datasource-url": "datasource-url";
        }>;
        detail: z.ZodString;
        relPath: z.ZodString;
        line: z.ZodNumber;
    }, z.core.$strip>>;
    unresolved: z.ZodArray<z.ZodObject<{
        ref: z.ZodString;
        reason: z.ZodString;
        severity: z.ZodOptional<z.ZodEnum<{
            warn: "warn";
            info: "info";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DbSchemaModel = z.infer<typeof DbSchemaModelSchema>;
/** dataload 행 캡(테이블당). 초과분은 rowCount 로만 보고. */
export declare const DATALOAD_ROW_CAP = 50;
//# sourceMappingURL=types.d.ts.map