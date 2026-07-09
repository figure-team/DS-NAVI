import { z } from 'zod';
import type { CandidatesReport, CensusReport, EdgesReport, RoutesReport } from '../domain-map/types.js';
import type { JpaModel } from '../jpa/types.js';
import type { DbSchemaModel } from '../db-schema/types.js';
import type { InterfaceReport } from '../interface-scan/types.js';
import type { BatchJobsReport } from '../batch-scan/report.js';
/** `.spec/map/` 프로그램 인벤토리 파일명. */
export declare const PROGRAM_INVENTORY_FILENAME = "program-inventory.json";
export declare const ProgramTypeSchema: z.ZodEnum<{
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
export type ProgramType = z.infer<typeof ProgramTypeSchema>;
export declare const ProgramSchema: z.ZodObject<{
    id: z.ZodString;
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
    loc: z.ZodNumber;
    domain: z.ZodNullable<z.ZodString>;
    domainVia: z.ZodNullable<z.ZodString>;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type Program = z.infer<typeof ProgramSchema>;
export declare const FpTransactionSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        EI: "EI";
        EQ: "EQ";
        UNCLASSIFIED: "UNCLASSIFIED";
    }>;
    routeId: z.ZodString;
    method: z.ZodString;
    path: z.ZodString;
    evidence: z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type FpTransaction = z.infer<typeof FpTransactionSchema>;
export declare const FpDataFunctionSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        ILF: "ILF";
        EIF: "EIF";
    }>;
    name: z.ZodString;
    evidence: z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type FpDataFunction = z.infer<typeof FpDataFunctionSchema>;
export declare const ProgramInventorySchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    programs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
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
        loc: z.ZodNumber;
        domain: z.ZodNullable<z.ZodString>;
        domainVia: z.ZodNullable<z.ZodString>;
        notes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    fp: z.ZodObject<{
        transactions: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                EI: "EI";
                EQ: "EQ";
                UNCLASSIFIED: "UNCLASSIFIED";
            }>;
            routeId: z.ZodString;
            method: z.ZodString;
            path: z.ZodString;
            evidence: z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNumber;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        dataFunctions: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                ILF: "ILF";
                EIF: "EIF";
            }>;
            name: z.ZodString;
            evidence: z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNumber;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        summary: z.ZodObject<{
            ei: z.ZodNumber;
            eo: z.ZodNumber;
            eq: z.ZodNumber;
            unclassified: z.ZodNumber;
            ilf: z.ZodNumber;
            eif: z.ZodNumber;
            unadjustedFp: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    stats: z.ZodObject<{
        total: z.ZodNumber;
        byType: z.ZodArray<z.ZodObject<{
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
            count: z.ZodNumber;
        }, z.core.$strip>>;
        excluded: z.ZodObject<{
            configXml: z.ZodNumber;
            otherLang: z.ZodArray<z.ZodObject<{
                lang: z.ZodString;
                count: z.ZodNumber;
            }, z.core.$strip>>;
            unreadable: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ProgramInventory = z.infer<typeof ProgramInventorySchema>;
/** 간이법 평균복잡도 가중치(미조정). */
export declare const FP_WEIGHTS: {
    readonly ei: 4;
    readonly eo: 5.2;
    readonly eq: 3.9;
    readonly ilf: 7.5;
    readonly eif: 5.4;
};
export interface ProgramInventoryInputs {
    census: CensusReport;
    routes: RoutesReport;
    edges: EdgesReport;
    /** 도메인 후보(candidates.json) — 프로그램의 소속 도메인 결정론 조인. */
    candidates?: CandidatesReport | null;
    jpaModel?: JpaModel | null;
    dbSchema?: DbSchemaModel | null;
    interfaces?: InterfaceReport | null;
    batchJobs?: BatchJobsReport | null;
}
/** 프로젝트 전체에서 프로그램 인벤토리 + FP 기초를 만든다(파일 기록 없음). */
export declare function buildProgramInventory(projectRoot: string, inputs: ProgramInventoryInputs): ProgramInventory;
//# sourceMappingURL=index.d.ts.map