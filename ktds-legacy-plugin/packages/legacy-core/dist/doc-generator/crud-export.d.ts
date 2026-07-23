export declare const CRUD_MATRIX_FILENAME = "crud-matrix.json";
/** 데이터축 퇴화 사유(조용한 퇴화 금지) — 열이 '기능' 하나뿐일 때 왜인지 명시. */
export type CrudDataAxisReason = 'no-mybatis-no-dao-no-sql' | 'no-db-schema' | 'no-jpa-tables-resolved';
export interface CrudMatrixExport {
    schemaVersion: 1;
    gitCommit: string | null;
    heading: string;
    prose: string | null;
    columns: unknown[];
    rows: unknown[];
    /** 데이터축이 비어(열='기능'만) 퇴화했나 + 사유(대시보드/emit 정직 보고). */
    degraded: boolean;
    degradedReason: CrudDataAxisReason | null;
    /** 판정에 쓴 소스(진단용). */
    source: 'mybatis' | 'raw-sql' | 'jpa' | 'dao' | 'none';
}
export interface CrudExportResult {
    outPath: string;
    columns: number;
    rows: number;
    degraded: boolean;
    degradedReason: CrudDataAxisReason | null;
    source: 'mybatis' | 'raw-sql' | 'jpa' | 'dao' | 'none';
}
/**
 * `.spec/map/crud-matrix.json` 을 쓴다. domain-graph.json 이 입력이므로 emit 이후에만
 * 의미가 있다 — 없으면 null(호출자가 정직하게 보고할 몫, 조용한 성공 금지).
 *
 * 표 섹션이 없으면(그래프에 flow 없음) null 을 돌려준다 — 빈 표를 쓰지 않는다.
 */
export declare function exportCrudMatrix(projectRoot: string): CrudExportResult | null;
//# sourceMappingURL=crud-export.d.ts.map