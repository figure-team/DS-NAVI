/**
 * W9 언어 커버리지 매트릭스 — 스캐너 지원 수준의 **단일 진실 소스**.
 *
 * `docs/ktds/COVERAGE_MATRIX.md` 는 이 선언에서 생성되고(손편집 금지, drift 는 CI 가
 * 잡는다), 실측 검증(scripts/qa-coverage-matrix.mjs)이 "none 주장인데 산출물 존재"
 * 모순을 두 타깃(jpetstore·eGov cop)에서 자동 검출한다 — 설계:
 * docs/ktds/COVERAGE_MATRIX_DESIGN.md.
 *
 * degrade 정의:
 *   - full    : 그 언어의 일반 코드에서 동작(남는 한계는 note 에 명기)
 *   - partial : 특정 관용구/프레임워크/파일 관례만(범위를 note 에 명기)
 *   - none    : 산출물에 절대 나타나지 않아야 함(실측 검증 대상) — 명시 없는 언어의 기본값
 *
 * 정직성: 분석 유관 소스 언어(ANALYSIS_RELEVANT_LANGS)인데 핵심 구조분석
 * (CORE_CAPABILITIES 전부 none)이 안 되는 파일은 coverage.json `langSupport` 로
 * "미지원 N건 [미확인]" 계상된다 — files.byLang 숫자에 묻히는 침묵 누락 금지.
 */
import type { CensusReport } from '../domain-map/types.js';
export type CoverageTier = 'full' | 'partial' | 'none';
export interface LangCoverage {
    tier: CoverageTier;
    /** 근거/범위/한계 요약(문서 표에 그대로 노출). */
    note: string;
}
/** 스캔 기능 키 — .spec/map 산출물과 1:1 대응(검증 스크립트가 이 키로 대조). */
export type CapabilityKey = 'routes' | 'batch' | 'edges' | 'method-calls' | 'interfaces' | 'jpa' | 'db-schema' | 'complexity';
export interface CapabilityCoverage {
    key: CapabilityKey;
    label: string;
    /** 명시되지 않은 언어는 none. */
    byLang: Record<string, LangCoverage>;
    /** 언어 축으로 못 싣는 예외 관례(검증 스크립트의 면제 규칙과 짝). */
    exceptions?: string;
}
/**
 * 지원 수준 선언 — 변경 시 반드시:
 *  1) 해당 스캐너의 실코드 근거 확인, 2) `qa-coverage-matrix.mjs --write` 로 문서 재생성,
 *  3) 두 타깃 실측 검증 통과.
 */
export declare const COVERAGE_MATRIX: CapabilityCoverage[];
/**
 * 계상 **제외** 언어(denylist) — 문서/마크업/자산/데이터/순수 설정.
 * 미지원 판정은 "여기 없는 모든 언어"가 대상이다: 화이트리스트였던 초기 설계는
 * 미등재 레거시 언어(asp·vb·jcl·rpg 등)가 계상 밖으로 새는 새 침묵 사각을 만들었다
 * (리뷰 C3) — 방향을 뒤집어 **모르는 언어일수록 표면화**되게 한다.
 * (census 는 미지 확장자를 확장자 자체로 lang 화하므로 .vb 가 오면 lang='vb' 로 등장
 * → 여기 없음 → 미지원 계상.)
 *
 * 알려진 한계(정직): 확장자 없는 파일(lang='other' — LICENSE/Makefile/Dockerfile/
 * crontab 등)은 소스/비소스가 섞여 계상하지 않는다. crontab 은 batch 가 경로 관례로
 * 별도 탐지(매트릭스 exceptions).
 */
export declare const NON_ANALYSIS_LANGS: ReadonlySet<string>;
/** 핵심 구조분석 기능 — 전부 none 인 언어의 파일이 "핵심 미지원" 카운트 대상. */
export declare const CORE_CAPABILITIES: readonly CapabilityKey[];
/** (capability, lang) tier 조회 — 명시 없으면 none. */
export declare function tierOf(capability: CapabilityKey, lang: string): CoverageTier;
/** 언어의 핵심(CORE_CAPABILITIES) 요약 tier — 최고 tier. */
export declare function coreTierOf(lang: string): CoverageTier;
/** 언어의 전 기능 통틀어 최고 tier — none 이면 "어떤 스캐너도 안 덮는" 언어. */
export declare function bestTierOf(lang: string): CoverageTier;
export interface LangSupportRow {
    lang: string;
    files: number;
    /** 전 기능 통틀어 최고 tier — none = 완전 미지원(헤드라인 카운트 대상). */
    best: CoverageTier;
    /** 핵심 구조분석(routes·edges·complexity) 요약 tier — 행 상세용(예: sql 은 best=full 이지만 core=none). */
    core: CoverageTier;
    capabilities: Array<{
        key: CapabilityKey;
        tier: CoverageTier;
    }>;
}
export interface LangSupport {
    /**
     * **어떤 기능도 덮지 않는**(best=none) 소스 언어 파일 총수 — 진짜 침묵 사각.
     * (sql 처럼 구조분석은 없어도 db-schema 가 덮는 언어는 여기 안 센다 — 실측에서
     *  sql/cmd 오보로 드러난 초기 정의(core 기준)를 정정.)
     */
    unsupportedFiles: number;
    /**
     * 부분 지원(best=partial) 언어 파일 총수 — "좁은 관용구만 스캔"을 지원으로
     * 오독하지 않게 별도 표면화(리뷰 C6: 500줄 셸 + java 실행 1줄 = '지원' 착시 방지).
     */
    partialFiles: number;
    /** census 에 존재하는 계상 대상 언어만(lang 정렬). */
    byLang: LangSupportRow[];
}
/** census × 매트릭스 → 언어 지원 현황(결정론: lang 정렬). */
export declare function computeLangSupport(census: CensusReport): LangSupport;
/**
 * 사람용 매트릭스 문서(`docs/ktds/COVERAGE_MATRIX.md`) 렌더 — 결정론.
 * 갱신: `node ktds-legacy-plugin/scripts/qa-coverage-matrix.mjs --write`.
 */
export declare function renderCoverageMatrixMd(): string;
//# sourceMappingURL=matrix.d.ts.map