import { z } from 'zod';
import type { ImpactResult } from './types.js';
export declare const IMPACT_OVERLAY_FILENAME = "impact-overlay.json";
export declare const ImpactOverlaySchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    changedNodeIds: z.ZodArray<z.ZodString>;
    affectedNodeIds: z.ZodArray<z.ZodString>;
    unresolved: z.ZodArray<z.ZodString>;
    ktdsImpact: z.ZodObject<{
        gitCommit: z.ZodNullable<z.ZodString>;
        seedCount: z.ZodNumber;
        upstreamFileCount: z.ZodNumber;
        downstreamFileCount: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ImpactOverlay = z.infer<typeof ImpactOverlaySchema>;
/** KG 노드 배열 → relPath → nodeId 인덱스. 파일성 노드 우선순위로 대표 노드 선택. */
export declare function buildKgNodeIndex(nodes: ReadonlyArray<{
    id?: unknown;
    type?: unknown;
    filePath?: unknown;
}>): Map<string, string>;
/**
 * 순수 변환: impact 결과 + KG 인덱스 → 오버레이. IO 없음(테스트 가능).
 * affected 에서 시드(changed)는 제외한다(이중 색칠 방지). 매핑 실패 relPath 는 unresolved.
 */
export declare function buildImpactOverlay(result: ImpactResult, kgIndex: ReadonlyMap<string, string>): ImpactOverlay;
/** knowledge-graph.json 로드 → 노드 인덱스. 없거나 깨지면 빈 인덱스(graceful). */
export declare function loadKgNodeIndex(projectRoot: string): Map<string, string>;
/**
 * 오버레이를 `.understand-anything/impact-overlay.json` 에 쓴다(대시보드 fetch 경로).
 * stableJson 으로 결정론 직렬화. 기록한 절대 경로 반환. KG 인덱스가 비어 changedNodeIds
 * 가 0건이면(KG 미조인) 그대로 쓴다 — 대시보드 store 가 빈 채널로 보고 토글을 비활성한다.
 */
export declare function writeImpactOverlay(projectRoot: string, overlay: ImpactOverlay): string;
/**
 * 편의 IO 래퍼: KG 인덱스 로드 → 오버레이 빌드 → 기록. analyze 흐름에서 호출.
 * KG 부재 시 빈 인덱스로 진행(unresolved 에 전부 적재 + changed 0 → 비활성 오버레이).
 */
export declare function emitImpactOverlay(projectRoot: string, result: ImpactResult): {
    overlay: ImpactOverlay;
    overlayPath: string;
};
//# sourceMappingURL=overlay.d.ts.map