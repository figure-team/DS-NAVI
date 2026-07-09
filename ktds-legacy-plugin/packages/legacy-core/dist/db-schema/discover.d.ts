import type { CensusReport } from '../domain-map/types.js';
import type { LiveDbSignal } from './types.js';
/**
 * census 에서 라이브 DB 연결 신호를 정적 수집한다(무연결).
 * @returns 정렬된 LiveDbSignal[] (relPath, line, vendor, kind).
 */
export declare function discoverLiveDbSignals(projectRoot: string, census: CensusReport): LiveDbSignal[];
//# sourceMappingURL=discover.d.ts.map