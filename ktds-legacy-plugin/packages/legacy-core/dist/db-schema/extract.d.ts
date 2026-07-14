import type { CensusReport } from '../domain-map/types.js';
import type { ScanCacheSession } from '../scan-cache/index.js';
import type { JpaModel } from '../jpa/types.js';
import type { DbSchemaModel } from './types.js';
/**
 * census 의 .sql 파일을 파싱해 DB 스키마 모델 생성.
 * jpaModel 은 code-inferred 폴백의 JPA 소스(선택 — 없으면 MyBatis 역추론만).
 */
export declare function extractDbSchema(projectRoot: string, census: CensusReport, cache?: ScanCacheSession, jpaModel?: JpaModel | null): DbSchemaModel;
//# sourceMappingURL=extract.d.ts.map