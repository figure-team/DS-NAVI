import { type RejectedItem } from './fill.js';
import { type VerifyReport } from './verify.js';
import { type EmitOptions } from './emit.js';
export interface FillPipelineResult {
    /** fill 파일이 아직 없는 도메인 key. */
    pending: string[];
    /** fill 파일이 있으나 스키마/파싱/domainId 실패 — 재생성 대상. */
    invalid: Array<{
        key: string;
        error: string;
    }>;
    /** 구조 read-only 위반으로 항목 기각된 참조. */
    rejected: RejectedItem[];
    /** 여전히 빈칸(채움 전)인 노드 id (pending/기각의 결과). */
    unfilled: string[];
    /** skeleton 생성 commit ≠ 현재 HEAD — 라인이 밀려 인용이 어긋날 수 있다. */
    staleSkeleton: boolean;
    report: VerifyReport;
    verifyReportPath: string;
    domainGraphPath: string;
}
export declare function runFillPipeline(projectRoot: string, options?: EmitOptions): Promise<FillPipelineResult>;
//# sourceMappingURL=fill-pipeline.d.ts.map