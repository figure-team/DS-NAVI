/** 파싱한 INSERT 행 한 개(미매핑 원시 값). */
export interface InsertRow {
    table: string;
    /** 명시된 컬럼 목록(없으면 null → extract 가 DDL 순서로 매핑). */
    columns: string[] | null;
    values: string[];
    line: number;
}
/** 한 .sql 소스에서 INSERT 행 추출(등장 순서). */
export declare function extractDataloadFromSource(source: string): InsertRow[];
//# sourceMappingURL=dataload-scan.d.ts.map