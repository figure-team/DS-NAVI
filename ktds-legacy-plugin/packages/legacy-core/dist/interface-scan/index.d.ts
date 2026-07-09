import type { ScanCacheSession } from '../scan-cache/index.js';
import type { CensusReport } from '../domain-map/types.js';
import { type InterfaceReport } from './types.js';
export * from './types.js';
export { scanJavaInterfaces } from './java-scan.js';
export type { InvocationSpec, RawInterfaceSignal } from './java-scan.js';
export { scanDbLinks } from './text-scan.js';
export { buildPropertyIndex, resolvePlaceholders } from './properties.js';
/** 프로젝트 전체에서 인터페이스 신호를 추출해 InterfaceReport 를 만든다(파일 기록 없음). */
export declare function extractInterfaces(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): Promise<InterfaceReport>;
//# sourceMappingURL=index.d.ts.map