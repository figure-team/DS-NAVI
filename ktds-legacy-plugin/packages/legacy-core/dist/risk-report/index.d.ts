import { z } from 'zod';
import type { CensusReport, EdgesReport, SlicesReport } from '../domain-map/types.js';
import type { ProgramInventory } from '../program-inventory/index.js';
import type { ScanCacheSession } from '../scan-cache/index.js';
import type { ChurnMap } from './churn.js';
export { countJavaComplexity, measureJavaComplexity } from './complexity.js';
export { collectGitChurn, type ChurnEntry, type ChurnMap } from './churn.js';
/** `.spec/map/` 위험 리포트 파일명. */
export declare const RISK_REPORT_FILENAME = "risk-report.json";
/**
 * 지표 가중치(§3.3) — 리포트 meta 에 그대로 기록(재현 근거). **휴리스틱 seam** —
 * 점수는 서수(순위)로만 읽는다(보정된 절대치 아님, 리뷰 C7). 복잡도·변경빈도가 주
 * (각 0.25): 레거시 위험의 1차 신호. 구조 결합(팬인/팬아웃)과 규모(LOC)는 보조.
 * 미도달은 점수 지표가 아니다(리뷰 C3) — 도달성 스캐너가 뷰 forward(JSP 등)를
 * 추적하지 못하는 한계의 반사가 랭킹 상단을 지배하는 것을 막기 위해 비점수
 * 플래그(metrics.unreached 열)로만 표기한다. 합이 1 일 필요 없음(가중합/가중치합).
 */
export declare const RISK_WEIGHTS: {
    readonly complexity: 0.25;
    readonly churn: 0.25;
    readonly loc: 0.15;
    readonly fanIn: 0.15;
    readonly fanOut: 0.1;
};
export type RiskMetricKey = keyof typeof RISK_WEIGHTS;
/** md 문서(Top N 절단) 기본값 — json items 는 항상 전수. */
export declare const RISK_DEFAULT_TOP_N = 20;
export declare const RiskGradeSchema: z.ZodEnum<{
    상: "상";
    중: "중";
    하: "하";
}>;
export type RiskGrade = z.infer<typeof RiskGradeSchema>;
export declare const RiskItemSchema: z.ZodObject<{
    programId: z.ZodString;
    name: z.ZodString;
    filePath: z.ZodString;
    type: z.ZodEnum<{
        api: "api";
        "mapper-xml": "mapper-xml";
        service: "service";
        dao: "dao";
        db: "db";
        common: "common";
        test: "test";
        screen: "screen";
        batch: "batch";
    }>;
    layer: z.ZodString;
    domain: z.ZodNullable<z.ZodString>;
    metrics: z.ZodObject<{
        loc: z.ZodNumber;
        complexity: z.ZodNullable<z.ZodNumber>;
        fanIn: z.ZodNumber;
        fanOut: z.ZodNumber;
        churnCommits: z.ZodNullable<z.ZodNumber>;
        churnLines: z.ZodNullable<z.ZodNumber>;
        unreached: z.ZodBoolean;
    }, z.core.$strip>;
    normalized: z.ZodObject<{
        loc: z.ZodNumber;
        complexity: z.ZodNullable<z.ZodNumber>;
        fanIn: z.ZodNumber;
        fanOut: z.ZodNumber;
        churn: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    score: z.ZodNumber;
    grade: z.ZodEnum<{
        상: "상";
        중: "중";
        하: "하";
    }>;
    factors: z.ZodArray<z.ZodString>;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type RiskItem = z.infer<typeof RiskItemSchema>;
export declare const RiskReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    meta: z.ZodObject<{
        weights: z.ZodObject<{
            complexity: z.ZodNumber;
            churn: z.ZodNumber;
            loc: z.ZodNumber;
            fanIn: z.ZodNumber;
            fanOut: z.ZodNumber;
        }, z.core.$strip>;
        edgeKinds: z.ZodArray<z.ZodString>;
        churnAvailable: z.ZodBoolean;
        degenerateMetrics: z.ZodArray<z.ZodString>;
        topN: z.ZodNumber;
    }, z.core.$strip>;
    stats: z.ZodObject<{
        programs: z.ZodNumber;
        excluded: z.ZodObject<{
            test: z.ZodNumber;
        }, z.core.$strip>;
        measured: z.ZodObject<{
            complexity: z.ZodNumber;
            churn: z.ZodNumber;
        }, z.core.$strip>;
        complexityUnmeasured: z.ZodArray<z.ZodObject<{
            ext: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
        unreached: z.ZodNumber;
    }, z.core.$strip>;
    items: z.ZodArray<z.ZodObject<{
        programId: z.ZodString;
        name: z.ZodString;
        filePath: z.ZodString;
        type: z.ZodEnum<{
            api: "api";
            "mapper-xml": "mapper-xml";
            service: "service";
            dao: "dao";
            db: "db";
            common: "common";
            test: "test";
            screen: "screen";
            batch: "batch";
        }>;
        layer: z.ZodString;
        domain: z.ZodNullable<z.ZodString>;
        metrics: z.ZodObject<{
            loc: z.ZodNumber;
            complexity: z.ZodNullable<z.ZodNumber>;
            fanIn: z.ZodNumber;
            fanOut: z.ZodNumber;
            churnCommits: z.ZodNullable<z.ZodNumber>;
            churnLines: z.ZodNullable<z.ZodNumber>;
            unreached: z.ZodBoolean;
        }, z.core.$strip>;
        normalized: z.ZodObject<{
            loc: z.ZodNumber;
            complexity: z.ZodNullable<z.ZodNumber>;
            fanIn: z.ZodNumber;
            fanOut: z.ZodNumber;
            churn: z.ZodNullable<z.ZodNumber>;
        }, z.core.$strip>;
        score: z.ZodNumber;
        grade: z.ZodEnum<{
            상: "상";
            중: "중";
            하: "하";
        }>;
        factors: z.ZodArray<z.ZodString>;
        notes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type RiskReport = z.infer<typeof RiskReportSchema>;
export interface RiskReportInputs {
    census: CensusReport;
    edges: EdgesReport;
    slices: SlicesReport;
    programInventory: ProgramInventory;
    /** collectGitChurn 산출(주입식) — null = git 불가. 픽스처 테스트는 고정 주입. */
    churn: ChurnMap | null;
}
/** 프로젝트 전체 위험 리포트(파일 기록 없음 — 호출자가 writeMapArtifact). */
export declare function buildRiskReport(projectRoot: string, inputs: RiskReportInputs, cache?: ScanCacheSession): Promise<RiskReport>;
//# sourceMappingURL=index.d.ts.map