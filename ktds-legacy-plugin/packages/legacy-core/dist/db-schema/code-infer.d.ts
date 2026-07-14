import type { CensusReport } from '../domain-map/types.js';
import type { JpaModel } from '../jpa/types.js';
import type { ScanCacheSession } from '../scan-cache/index.js';
import type { DbTable } from './types.js';
export interface CodeInferResult {
    tables: DbTable[];
    /** 역추론에 기여한 매퍼 XML 수(안내 문구용). */
    mapperCount: number;
    /** origin 별 테이블 수(안내 문구용). */
    fromJpa: number;
    fromMyBatis: number;
}
/**
 * census 의 매퍼 XML + jpa-model 엔티티 → 역추론 DbTable 목록.
 * 정렬·codeTable 판정은 호출자(extract.ts)의 공용 패스가 수행한다.
 */
export declare function inferTablesFromCode(projectRoot: string, census: CensusReport, jpaModel: JpaModel | null | undefined, cache?: ScanCacheSession): CodeInferResult;
//# sourceMappingURL=code-infer.d.ts.map