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
export type CrudLetter = 'C' | 'R' | 'U' | 'D';
/** 코드 SQL 접근 1건 — 테이블 1개에 대한 CRUD 판정 + 근거 라인. */
export interface RawSqlAccess {
    table: string;
    crud: CrudLetter;
    line: number;
}
/** 파일(relPath) → 코드 SQL 접근 목록. 도달 파일만 담긴다(grounding). */
export interface RawSqlModel {
    byFile: Record<string, RawSqlAccess[]>;
}
/**
 * 한 소스 파일의 raw SQL 에서 (table, crud, line) 을 추출한다.
 * knownTables(소문자) 에 없는 테이블명은 버린다 — 노이즈를 축으로 삼지 않는다.
 * 같은 (table, crud) 는 최초 등장 라인만 남긴다(결정론·중복 근거 방지).
 */
export declare function extractSqlCrud(source: string, knownTables: ReadonlySet<string>): RawSqlAccess[];
/**
 * 여러 소스 파일 → RawSqlModel. SQL 접근이 있는 파일만 담는다(빈 파일은 배제 = 결정론 축소).
 * knownTables 는 db-schema 의 테이블명 집합(소문자).
 */
export declare function buildRawSqlModel(files: Array<{
    relPath: string;
    content: string;
}>, knownTables: ReadonlySet<string>): RawSqlModel;
/** 모델이 비었나(축을 세울 SQL 신호가 하나도 없음). */
export declare function isRawSqlModelEmpty(model: RawSqlModel | null | undefined): boolean;
//# sourceMappingURL=raw-sql.d.ts.map