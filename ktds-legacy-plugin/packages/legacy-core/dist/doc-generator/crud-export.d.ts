export declare const CRUD_MATRIX_FILENAME = "crud-matrix.json";
export interface CrudMatrixExport {
    schemaVersion: 1;
    gitCommit: string | null;
    heading: string;
    prose: string | null;
    columns: unknown[];
    rows: unknown[];
}
export interface CrudExportResult {
    outPath: string;
    columns: number;
    rows: number;
}
/**
 * `.spec/map/crud-matrix.json` 을 쓴다. domain-graph.json 이 입력이므로 emit 이후에만
 * 의미가 있다 — 없으면 null(호출자가 정직하게 보고할 몫, 조용한 성공 금지).
 *
 * 표 섹션이 없으면(그래프에 flow 없음) null 을 돌려준다 — 빈 표를 쓰지 않는다.
 */
export declare function exportCrudMatrix(projectRoot: string): CrudExportResult | null;
//# sourceMappingURL=crud-export.d.ts.map