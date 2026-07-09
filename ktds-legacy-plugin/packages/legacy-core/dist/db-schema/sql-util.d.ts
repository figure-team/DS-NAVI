/**
 * SQL 텍스트 파싱 공용 헬퍼(ddl-scan·dataload-scan 공유). SQL tree-sitter 그래머가
 * 없어 텍스트 기반으로 처리한다. 모든 함수는 결정론(부수효과 없음).
 */
/** 원문 index 의 1-기반 라인 번호. */
export declare function lineAt(source: string, index: number): number;
/** 식별자 정규화 — 백틱/쌍따옴표/대괄호 제거 + 스키마 접두 제거. */
export declare function bareIdent(raw: string): string;
/** SQL 문자열/값 리터럴 정규화 — '' 이스케이프 처리, 따옴표 제거. */
export declare function unquote(s: string): string;
/** 괄호 깊이 0 의 콤마로 분할(따옴표 내부·중첩 괄호 무시). */
export declare function splitTopLevel(body: string): string[];
/** open '(' 인덱스에서 균형 잡힌 ')' 인덱스 반환(없으면 -1). 따옴표 무시. */
export declare function matchParen(source: string, openIdx: number): number;
/** 괄호 안 콤마 구분 식별자 목록 → 정규화 식별자 배열(ASC/DESC 제거). */
export declare function parenIdentList(inner: string): string[];
//# sourceMappingURL=sql-util.d.ts.map