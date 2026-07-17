import type { CensusReport } from './types.js';
/** 확장자(소문자, 점 제외) -> 언어. */
export declare const SOURCE_LANG_BY_EXT: Record<string, string>;
/**
 * 경로 세그먼트가 skip 대상이면 true. 베이스명은 정확일치 또는 구분자로 시작하는
 * 접미사가 붙은 변형까지 포함한다(`.specs`·`.specification` 같은 남의 디렉터리는 제외).
 */
export declare function isSkippedSegment(seg: string): boolean;
/** 프로젝트 파일 인구조사를 만든다. */
export declare function buildCensus(projectRoot: string): CensusReport;
//# sourceMappingURL=census.d.ts.map