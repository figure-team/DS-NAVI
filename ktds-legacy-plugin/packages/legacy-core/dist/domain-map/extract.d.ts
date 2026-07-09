import type { DbSchemaModel } from '../db-schema/index.js';
import type { InterfaceReport } from '../interface-scan/index.js';
import type { BatchJobsReport } from '../batch-scan/report.js';
import type { ProgramInventory } from '../program-inventory/index.js';
import type { RiskReport } from '../risk-report/index.js';
import { buildCoverageReport } from '../coverage-report/index.js';
import { type SystemMap } from '../system-map/index.js';
import { ScanCacheSession } from '../scan-cache/index.js';
/** `.spec/map/` 통합 커버리지 리포트 파일명(보완 D-c). */
export declare const COVERAGE_FILENAME = "coverage.json";
/** `.spec/map/` 증분 재스캔용 파일 fingerprint 스냅샷 파일명(보완 D-b). */
export declare const FINGERPRINTS_FILENAME = "fingerprints.json";
import type { BatchEntry, CandidatesReport, CensusReport, ConfirmedPlan, EdgesReport, MethodCallGraph, RouteEntry, SkeletonReport, SlicesReport } from './types.js';
/** 프로젝트 루트에서 라우트/배치 보고를 추출한다(파일 기록 없음). */
export declare function extractRoutes(projectRoot: string, census: CensusReport, cache?: ScanCacheSession): Promise<{
    schemaVersion: 1;
    gitCommit: string | null;
    contextPath: string | null;
    routes: RouteEntry[];
    batchEntries: BatchEntry[];
}>;
/** buildCensus -> extractRoutes -> 기록. census/routes 반환. */
export declare function scanRoutes(projectRoot: string): Promise<{
    census: CensusReport;
    routes: Awaited<ReturnType<typeof extractRoutes>>;
}>;
/**
 * 전체 domain-map 스캔: census -> routes -> edges -> slices -> candidates.
 * 다섯 산출물을 `.spec/map/` 에 기록하고 모두 반환한다(결정론).
 * 후보(candidates)는 빌드/기록만 한다 — 확정(confirm)은 별도 사람 게이트 단계다(자동 확정 금지).
 */
export declare function scanDomainMap(projectRoot: string, opts?: {
    /** false 면 저장 캐시를 읽지 않는다(`--no-cache` — 전체 재추출 후 캐시 재구축). */
    readCache?: boolean;
}): Promise<{
    census: CensusReport;
    routes: Awaited<ReturnType<typeof extractRoutes>>;
    edges: EdgesReport;
    slices: SlicesReport;
    candidates: CandidatesReport;
    dbSchema: DbSchemaModel;
    interfaces: InterfaceReport;
    batchJobs: BatchJobsReport;
    programInventory: ProgramInventory;
    /** 위험 리포트 — 산출 실패 시 null(다른 산출물은 유지, 우아한 degrade). */
    riskReport: RiskReport | null;
    /** W8 캐시 세션 — buildMap 이 method-calls 에 재사용 후 finalize 재호출. */
    scanCache: ScanCacheSession;
    /** W9 통합 커버리지(언어 지원 현황 포함) — CLI 가 미지원 표면화에 사용. */
    coverage: ReturnType<typeof buildCoverageReport>;
    /** 시스템 구성도 브리지(`.understand-anything/system-map.json`) — 대시보드 연동 패널 소스. */
    systemMap: SystemMap;
}>;
/**
 * 전체 도메인 맵 빌드 — 스캔 후 확정 플랜이 있으면 skeleton/emit 까지.
 *
 * 1) scanDomainMap(census→routes→edges→slices→candidates, `.spec/map/` 기록).
 * 2) readConfirmedPlan:
 *    - 플랜 있음  → buildSkeleton + emitDomainGraph + writeSkeleton.
 *                   skeleton.json(`.spec/map/`) + domain-graph.json(`.understand-anything/`).
 *    - 플랜 없음  → 스캔 결과만 반환(needsConfirm=true). 자동 확정하지 않는다
 *                   (사람 게이트 필수 — /understand-map confirm).
 */
export declare function buildMap(projectRoot: string, options?: {
    stepCap?: number;
}): Promise<{
    needsConfirm: true;
    census: CensusReport;
    routes: Awaited<ReturnType<typeof extractRoutes>>;
    edges: EdgesReport;
    slices: SlicesReport;
    candidates: CandidatesReport;
} | {
    needsConfirm: false;
    census: CensusReport;
    routes: Awaited<ReturnType<typeof extractRoutes>>;
    edges: EdgesReport;
    slices: SlicesReport;
    candidates: CandidatesReport;
    plan: ConfirmedPlan;
    skeleton: SkeletonReport;
    methodCallGraph: MethodCallGraph;
    /**
     * 확정 플랜 vs 현재 후보의 루트 드리프트. 비어 있지 않으면 이 skeleton 은
     * '낡은 경계' 기준이다 — 호출측(CLI/스킬)은 반드시 표면화하고 재확정을 안내한다.
     * (분류기 개선 후 낡은 132개 플랜으로 bundle/fill 이 폭주한 사고의 재발 방지.)
     */
    planDrift: {
        addedRoots: string[];
        removedRoots: string[];
    };
}>;
//# sourceMappingURL=extract.d.ts.map