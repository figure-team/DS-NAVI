import type { CensusReport } from '../domain-map/types.js';
import type { FingerprintMap } from '../stale/index.js';
/** 캐시 파일 골격 버전 — 이 파일 구조 자체가 바뀔 때 bump. */
export declare const SCAN_CACHE_SCHEMA_VERSION = 1;
/** 캐시 파일 경로: `<projectRoot>/.spec/cache/scan-facts.json` (파생물 — gitignore 권장). */
export declare const SCAN_CACHE_FILENAME = "scan-facts.json";
/** 섹션별 재사용/재추출 통계(정직성 — scan 출력에 표기). */
export interface SectionStats {
    reused: number;
    recomputed: number;
}
/** 한 섹션에 대한 get/put 핸들 — get 은 깊은 복사, put 도 깊은 복사로 저장. */
export interface ScanCacheSection<T> {
    /** hash 일치 캐시값(깊은 복사) 또는 undefined(미스/불일치). */
    get(relPath: string): T | undefined;
    /** 이번 실행의 추출 결과 기록(추출 직후에 호출할 것 — 전역 변조 이전 상태 저장). */
    put(relPath: string, value: T): void;
}
/**
 * 스캔 1회분의 캐시 세션. scanDomainMap 이 census 직후 생성해 각 스캐너에 전달하고,
 * 스캔 말미에 finalize 로 기록한다. **전체 스캔 단위 전용** — 일부 스캐너만 도는 부분
 * 실행에 물리면 finalize 의 관측 기반 유지가 미실행 섹션을 이월 규칙(해시 일치)으로만
 * 보존하므로, 세션 생성은 scanDomainMap/buildMap 경로에 한정한다.
 */
export declare class ScanCacheSession {
    /** census 전 파일의 내용 해시 — 캐시 검증과 fingerprints.json 기록에 공용(1회 계산). */
    readonly fingerprints: FingerprintMap;
    private readonly projectRoot;
    private readonly prev;
    /** 이번 실행에서 관측(재사용/재기록)된 섹션·엔트리. */
    private readonly next;
    private readonly stats;
    /** get 히트로 재사용 집계된 (섹션, relPath) — 이후 put 되면 재사용을 되돌린다. */
    private readonly reusedKeys;
    /** put 이 일어난 (섹션, relPath) — 같은 키 중복 put 을 재추출 1회로 세기 위함. */
    private readonly putKeys;
    constructor(projectRoot: string, census: CensusReport, opts?: {
        read?: boolean;
    });
    /** 파일이 census fingerprint 기준으로도 판독 불가('absent')인가 — null 캐시 동의 조건(리뷰 R2). */
    isAbsent(relPath: string): boolean;
    /**
     * 섹션 핸들. salt 는 추출기 버전(+config 해시 등 파일 외 의존)을 인코드 —
     * 저장본과 다르면 섹션 전체 미스. 같은 세션에서 같은 섹션명을 다른 salt 로 다시
     * 열면 앞선 소비자의 기록이 소실되므로 개발 오류로 즉시 던진다(리뷰 R3).
     */
    section<T>(name: string, salt: string): ScanCacheSection<T>;
    /** 섹션별·합계 통계(정직성 표기용). */
    statsSummary(): {
        reused: number;
        recomputed: number;
        sections: Record<string, SectionStats>;
    };
    /**
     * 캐시 기록(결정론: 섹션명·relPath 정렬, 타임스탬프 없음). 여러 번 호출해도 안전 —
     * 마지막 호출 시점까지의 관측 상태를 기록한다(buildMap 이 method-calls 후 재호출).
     * 이월 규칙(열린/미개방 섹션 공통): 관측분 ∪ (salt 일치 + 현재 해시 일치 + 미관측
     * prev 엔트리) — 부분 실행/도중 예외(예: risk-report degrade)가 캐시를 침묵 침식하지
     * 않는다(비평 C5). 삭제·변경 파일은 해시 검증에서 자연 프루닝.
     * 기록은 임시 파일 + rename 으로 원자적(동시 실행 torn write 방지, 비평 C6).
     */
    finalize(): void;
}
/** 세션 생성 헬퍼 — read:false 는 `--no-cache`(저장본 무시, 전체 재추출 후 재구축). */
export declare function createScanCacheSession(projectRoot: string, census: CensusReport, opts?: {
    read?: boolean;
}): ScanCacheSession;
//# sourceMappingURL=index.d.ts.map