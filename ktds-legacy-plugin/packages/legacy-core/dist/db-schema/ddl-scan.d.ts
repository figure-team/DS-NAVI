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
import type { DbTable } from './types.js';
/** COMMENT ON 산출 — extract 가 매칭 테이블/컬럼에 부착. */
export interface CommentOn {
    table: string;
    column: string | null;
    text: string;
}
/** ddl-scan 단일 파일 산출 — 구조(rows/isCodeTable 는 dataload·extract 가 채움). */
export interface DdlScanResult {
    tables: DbTable[];
    comments: CommentOn[];
}
/** 한 .sql 소스에서 DDL(테이블 + COMMENT ON) 추출. */
export declare function extractDdlFromSource(source: string, relPath: string): DdlScanResult;
//# sourceMappingURL=ddl-scan.d.ts.map