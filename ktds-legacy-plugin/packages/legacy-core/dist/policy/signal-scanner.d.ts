import type { CensusReport } from '../domain-map/types.js';
import type { JavaFileFacts } from '../domain-map/java-facts.js';
import type { ScanCacheSession } from '../scan-cache/index.js';
import type { DbSchemaModel } from '../db-schema/types.js';
import type { PolicySignalSet } from './types.js';
/** 정책 신호 스캐너 입력(이미 추출된 모델 — 순수 함수, 테스트 용이). */
export interface PolicySignalInput {
    javaFacts: JavaFileFacts[];
    dbSchema: DbSchemaModel;
    gitCommit?: string | null;
}
/** 코드/DB 모델에서 정책 신호를 결정론으로 추출(순수). */
export declare function buildPolicySignals(input: PolicySignalInput, seedUnresolved?: Array<{
    ref: string;
    reason: string;
}>): PolicySignalSet;
/** census 의 Java 파일을 파싱해 정책 신호를 추출(IO 래퍼). */
export declare function scanPolicySignals(projectRoot: string, census: CensusReport, dbSchema: DbSchemaModel, cache?: ScanCacheSession): Promise<PolicySignalSet>;
//# sourceMappingURL=signal-scanner.d.ts.map