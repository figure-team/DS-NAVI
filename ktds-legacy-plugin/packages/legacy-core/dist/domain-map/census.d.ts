import type { CensusReport } from './types.js';
/** 확장자(소문자, 점 제외) -> 언어. */
export declare const SOURCE_LANG_BY_EXT: Record<string, string>;
/** 프로젝트 파일 인구조사를 만든다. */
export declare function buildCensus(projectRoot: string): CensusReport;
//# sourceMappingURL=census.d.ts.map