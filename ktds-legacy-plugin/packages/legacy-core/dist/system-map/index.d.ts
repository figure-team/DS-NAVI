import { z } from 'zod';
import type { InterfaceReport } from '../interface-scan/types.js';
import type { DbSchemaModel } from '../db-schema/types.js';
import type { BatchJobsReport } from '../batch-scan/report.js';
export declare const SYSTEM_MAP_FILENAME = "system-map.json";
/** 연계 1건 요약 — 정의서(IF_ID) 참조가 가능하도록 안정 id 를 유지한다. */
export declare const SystemMapInterfaceSchema: z.ZodObject<{
    id: z.ZodString;
    protocol: z.ZodString;
    endpoint: z.ZodNullable<z.ZodString>;
    unresolved: z.ZodBoolean;
}, z.core.$strip>;
export declare const SystemMapSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    generatedFromCommit: z.ZodNullable<z.ZodString>;
    interfaces: z.ZodObject<{
        scanned: z.ZodLiteral<true>;
        outbound: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            protocol: z.ZodString;
            endpoint: z.ZodNullable<z.ZodString>;
            unresolved: z.ZodBoolean;
        }, z.core.$strip>>;
        inbound: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            protocol: z.ZodString;
            endpoint: z.ZodNullable<z.ZodString>;
            unresolved: z.ZodBoolean;
        }, z.core.$strip>>;
        outboundCount: z.ZodNumber;
        inboundCount: z.ZodNumber;
        suspectCount: z.ZodNumber;
    }, z.core.$strip>;
    db: z.ZodNullable<z.ZodObject<{
        vendor: z.ZodNullable<z.ZodString>;
        embedded: z.ZodBoolean;
        tier: z.ZodString;
        tableCount: z.ZodNumber;
        tables: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    batch: z.ZodObject<{
        scanned: z.ZodLiteral<true>;
        jobCount: z.ZodNumber;
        jobs: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            trigger: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type SystemMap = z.infer<typeof SystemMapSchema>;
/** scan 산출물 3종 → system-map (파일 기록 없음 — 조인·요약만, 결정론). */
export declare function buildSystemMap(input: {
    interfaces: InterfaceReport;
    dbSchema: DbSchemaModel;
    batchJobs: BatchJobsReport;
}): SystemMap;
/**
 * `.understand-anything/system-map.json` 기록(대시보드 fetch 경로 — impact-overlay 와
 * 동일한 브리지 위치). 기록한 절대 경로를 반환한다.
 */
export declare function writeSystemMap(projectRoot: string, systemMap: SystemMap): string;
//# sourceMappingURL=index.d.ts.map