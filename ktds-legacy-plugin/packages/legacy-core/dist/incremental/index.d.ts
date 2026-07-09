import type { CensusReport } from '../domain-map/types.js';
import type { FingerprintMap } from '../stale/index.js';
import type { GeneratedDoc } from '../doc-generator/types.js';
/** census 전체에 대한 파일 fingerprint 맵(relPath → content hash). 결정론. */
export declare function computeFileFingerprints(projectRoot: string, census: CensusReport): FingerprintMap;
/** 직전/현재 fingerprint 비교 결과 — 변경/추가/삭제 파일(정렬). */
export interface FileChangeSet {
    changed: string[];
    added: string[];
    removed: string[];
}
/** prev → curr fingerprint 차이를 가린다(변경/추가/삭제). 결정론(정렬). */
export declare function diffFingerprints(prev: FingerprintMap, curr: FingerprintMap): FileChangeSet;
/** 변경/추가/삭제가 하나도 없으면 true(재도출 불필요). */
export declare function isUnchanged(diff: FileChangeSet): boolean;
/**
 * 파일 fingerprint 를 문서 claim 앵커 fingerprint 로 투영한다(브리지).
 * detectStaleClaims 는 앵커 단위(file 또는 file:line) prev/curr 를 비교하므로, 각 앵커를
 * 그 파일의 content hash 로 매핑하면 "근거 파일이 바뀐 claim" 이 STALE 로 잡힌다(AC-26 연결).
 * 앵커의 파일 부분이 fileFingerprints 에 없으면 생략(미추적 근거는 STALE 비교 대상 아님).
 */
export declare function anchorFingerprints(doc: GeneratedDoc, fileFingerprints: FingerprintMap): FingerprintMap;
//# sourceMappingURL=index.d.ts.map