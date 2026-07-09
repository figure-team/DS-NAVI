/**
 * API/배치 진입점 영향 — 2단 계산(정확도 + 교차검증).
 *
 *   1차 ownership: slices.ownership[seed].owners = 시드에 도달하는 root(진입점 선언
 *     파일). depthCap·전 간선종류로 계산된 캡일관 인덱스 재사용.
 *   2차 reverse:  reach 의 upstream 파일집합 ∩ {route/batch 선언 파일}.
 * both(양쪽 일치)=CONFIRMED_AI, ownership-only=INFERRED(약간선 경유 가능),
 * reverse-only=UNVERIFIED(ownership 이 못 본 이상치). 불일치는 crossCheckDiff 로 표면화.
 */
import type { BatchEntry, Ownership, RouteEntry } from '../domain-map/types.js';
import type { ApiImpact } from './types.js';
export interface ApiImpactResult {
    api: ApiImpact[];
    crossCheckDiff: Array<{
        id: string;
        side: 'ownership-only' | 'reverse-only';
    }>;
}
export declare function computeApiImpact(seeds: readonly string[], 
/** reach upstream 의 relPath 목록(시드 제외). */
reverseFiles: readonly string[], ownership: readonly Ownership[], routes: readonly RouteEntry[], batchEntries: readonly BatchEntry[]): ApiImpactResult;
//# sourceMappingURL=api.d.ts.map