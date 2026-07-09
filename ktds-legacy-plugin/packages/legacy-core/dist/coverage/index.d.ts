/**
 * 통합 커버리지 리포트(보완 D-c, AC-30) — "분석이 코드의 몇 %를 정직하게 덮었나".
 *
 * 흩어진 신호(스캔 파일 수·계층 해소율·grounded vs [확인필요]·미도달/dropped·비-Java
 * 패스스루)를 단일 결정론 리포트로 모은다. 정직성: 침묵 누락 0 — cap-dropped step·
 * unresolved edge·미도달 파일·비-Java 패스스루를 모두 노출한다.
 *
 * 결정론: 모든 배열·맵 정렬, 타임스탬프 없음. 동일 산출물 → byte-identical.
 */
import { z } from 'zod';
import type { CensusReport, EdgesReport, RoutesReport, SkeletonReport, SlicesReport } from '../domain-map/types.js';
import type { JpaModel } from '../jpa/types.js';
export declare const CoverageReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    files: z.ZodObject<{
        total: z.ZodNumber;
        byLang: z.ZodArray<z.ZodObject<{
            lang: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
        nonJavaPassthrough: z.ZodNumber;
    }, z.core.$strip>;
    layers: z.ZodObject<{
        resolved: z.ZodNumber;
        unknown: z.ZodNumber;
        rate: z.ZodNumber;
        byLayer: z.ZodArray<z.ZodObject<{
            layer: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    reachability: z.ZodObject<{
        reached: z.ZodNumber;
        unreached: z.ZodNumber;
        rate: z.ZodNumber;
    }, z.core.$strip>;
    edges: z.ZodObject<{
        resolved: z.ZodNumber;
        unresolved: z.ZodNumber;
        rate: z.ZodNumber;
    }, z.core.$strip>;
    droppedSteps: z.ZodNumber;
    jpa: z.ZodObject<{
        entities: z.ZodNumber;
        repositories: z.ZodNumber;
        tierCQueries: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type CoverageReport = z.infer<typeof CoverageReportSchema>;
export interface CoverageInputs {
    census: CensusReport;
    routes: RoutesReport;
    edges: EdgesReport;
    slices: SlicesReport;
    skeleton?: SkeletonReport | null;
    jpaModel?: JpaModel | null;
}
/** 스캔 산출물에서 통합 커버리지 리포트를 결정론으로 조립(AC-30). */
export declare function buildCoverageReport(inputs: CoverageInputs): CoverageReport;
/** 커버리지 리포트를 한국어 텍스트로 렌더(결정론, 사용자 보고용). */
export declare function renderCoverageReport(r: CoverageReport): string;
//# sourceMappingURL=index.d.ts.map