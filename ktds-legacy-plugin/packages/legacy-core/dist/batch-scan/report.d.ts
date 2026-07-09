import { z } from 'zod';
import type { BatchEntry, CensusReport, EdgesReport } from '../domain-map/types.js';
/** `.spec/map/` 배치 인벤토리 파일명. */
export declare const BATCH_JOBS_FILENAME = "batch-jobs.json";
export declare const BatchJobSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    trigger: z.ZodString;
    schedule: z.ZodNullable<z.ZodString>;
    handler: z.ZodNullable<z.ZodString>;
    handlerFile: z.ZodNullable<z.ZodString>;
    unresolvedHandler: z.ZodBoolean;
    evidence: z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
    }, z.core.$strip>;
    sliceRoot: z.ZodString;
    reachableFiles: z.ZodNumber;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BatchJob = z.infer<typeof BatchJobSchema>;
export declare const BatchJobsReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    jobs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        trigger: z.ZodString;
        schedule: z.ZodNullable<z.ZodString>;
        handler: z.ZodNullable<z.ZodString>;
        handlerFile: z.ZodNullable<z.ZodString>;
        unresolvedHandler: z.ZodBoolean;
        evidence: z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
        }, z.core.$strip>;
        sliceRoot: z.ZodString;
        reachableFiles: z.ZodNumber;
        notes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    stats: z.ZodObject<{
        total: z.ZodNumber;
        byTrigger: z.ZodArray<z.ZodObject<{
            trigger: z.ZodString;
            count: z.ZodNumber;
        }, z.core.$strip>>;
        unresolvedHandlers: z.ZodNumber;
    }, z.core.$strip>;
    suspectSignals: z.ZodObject<{
        count: z.ZodNumber;
        samples: z.ZodArray<z.ZodObject<{
            file: z.ZodString;
            kind: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type BatchJobsReport = z.infer<typeof BatchJobsReportSchema>;
/**
 * batchEntries + edges + census → BatchJobsReport(파일 기록 없음).
 * @param projectRoot 구조 기반 의심신호(java 파일 판독)와 억제 config 로드에 사용.
 */
export declare function buildBatchJobs(projectRoot: string, batchEntries: BatchEntry[], edges: Pick<EdgesReport, 'edges'>, census: CensusReport): BatchJobsReport;
//# sourceMappingURL=report.d.ts.map