import type { CensusReport } from '../domain-map/types.js';
import type { ScanCacheSession } from '../scan-cache/index.js';
import type { DbSchemaModel } from './types.js';
/** census 의 .sql 파일을 파싱해 DB 스키마 모델 생성. */
export declare function extractDbSchema(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): DbSchemaModel;
//# sourceMappingURL=extract.d.ts.map