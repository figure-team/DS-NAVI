import type { ScanCacheSession } from '../scan-cache/index.js';
import type { CensusReport, EdgeRecord, EdgesReport } from './types.js';
/**
 * W8 캐시 섹션 salt — JavaFileFacts 형태(java-facts.ts)나 mybatis namespace 수집 의미가
 * 바뀌면 bump. `java-facts` 섹션은 method-calls.ts 와 공유(동일 extractJavaFacts 출력).
 * `kotlin-facts` 섹션은 kotlin-facts.ts 출력 전용 — Java 와 독립적으로 salt 를 올린다.
 */
export declare const JAVA_FACTS_SALT = "v1";
export declare const KOTLIN_FACTS_SALT = "v1";
/** edges 산출 — census 기반, 파일 기록 없음. */
export declare function extractEdges(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): Promise<EdgesReport>;
/** 엣지 중복제거 + (source,target,kind,line) 정렬 — api-call 후병합(extract.ts)도 재사용. */
export declare function dedupSortEdges(edges: EdgeRecord[]): EdgeRecord[];
//# sourceMappingURL=edges.d.ts.map