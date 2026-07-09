import type { ScanCacheSession } from '../scan-cache/index.js';
import type { CensusReport, EdgesReport } from './types.js';
/**
 * W8 캐시 섹션 salt — JavaFileFacts 형태(java-facts.ts)나 mybatis namespace 수집 의미가
 * 바뀌면 bump. `java-facts` 섹션은 method-calls.ts 와 공유(동일 extractJavaFacts 출력).
 */
export declare const JAVA_FACTS_SALT = "v1";
/** edges 산출 — census 기반, 파일 기록 없음. */
export declare function extractEdges(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): Promise<EdgesReport>;
//# sourceMappingURL=edges.d.ts.map