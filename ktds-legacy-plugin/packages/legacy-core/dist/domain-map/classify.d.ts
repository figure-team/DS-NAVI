/**
 * CLASSIFY 단계(S4-5) — 결정론적 도메인 후보 분류.
 *
 * 신호 우선순위: 도달성(reachability, 주) > 디렉토리(directory, 교차검증) > prefix(파일명, 폴백).
 * - 도달성: 각 슬라이스 루트가 도메인 후보다(루트 파일에서 파생한 자연키로 키잉).
 *   sole 소유 파일은 그 루트의 도메인에 'reachability' 신호로 합류한다(간선이 곧 증거).
 * - 디렉토리: 과반(>50%) 하강으로 도메인 부모 디렉토리를 찾고, 구조/레이어 세그먼트를
 *   건너뛴 첫 세그먼트를 토큰으로 삼는다. 퇴화(클러스터 <2 / 단일 집중 >50%) 시 폴백.
 * - prefix(폴백): 클래스/파일 base 명을 CamelCase 로 쪼개 STOP_TOKENS 를 버리고
 *   선행 도메인 토큰으로 클러스터링한다.
 * - 시드 확신도(confidence): high(디렉터리 정합) > medium(접두어 분할) > low(폴백).
 *   키잉 후 2패스로 분할 파편을 본체 디렉터리 도메인에 재흡수하고, 3패스로 low 시드를
 *   격리한다(quarantined — 상위 신호 도메인이 있을 때만; 퇴화 프로젝트는 기존 동작 유지).
 * - 관용 접두어(conventionPrefixes): 여러 디렉터리 그룹에 반복되는 파일명 첫 토큰
 *   (벤더 접두어 Egov·Co 류)은 키 후보에서 제외.
 * - ambiguous: 도달성과 디렉토리가 서로 다른 도메인으로 분류한 파일(자동 미해소, 사람 게이트行).
 * - common: shared 소유 파일.
 * - unresolved: 어떤 신호도 없는 파일(절대 조용히 누락하지 않음).
 *
 * 모든 산출 배열은 자연키로 정렬되어 byte-identical 재실행을 보장한다.
 */
import type { CandidatesReport, CensusReport, RoutesReport, SlicesReport } from './types.js';
export interface DirectoryClassification {
    /** relPath → 도메인 토큰(신호 없는 파일은 미포함). */
    tokenByFile: Map<string, string>;
    degenerate: {
        reason: 'too-few-clusters' | 'single-cluster-concentration';
    } | null;
}
/**
 * 과반 하강: 루트에서 시작해 한 자식 디렉토리가 전체 파일의 >50%를 담는 동안
 * 내려간다. 멈춘 지점(prefix 안정화) 이후 첫 비-구조·비-레이어 세그먼트가 그 파일의
 * 도메인 토큰이다. 퇴화(클러스터 <2 또는 단일 클러스터가 전체의 >50% 집중) 시
 * degenerate 를 세팅하고 호출측이 prefix 로 폴백한다.
 */
export declare function classifyByDirectory(relPaths: string[]): DirectoryClassification;
/** "AccountActionBean.java" → ["account","action","bean"], "line_item.sql" → ["line","item"]. */
export declare function tokenizeBasename(relPath: string): string[];
/**
 * 첫 비-STOP 토큰 = prefix. 전부 STOP 이면 null(도메인 신호 없음).
 * 1글자 토큰은 디렉터리 세그먼트 규칙(isStructureOrLayer)과 동형으로 제외 —
 * FCommonController 의 'f' 같은 무의미 키를 막는다. skip(관용 접두어)도 건너뛴다.
 */
export declare function prefixToken(relPath: string, skip?: ReadonlySet<string>): string | null;
/** census/routes/slices 로 도메인 후보(candidates.json)를 만든다. */
export declare function buildCandidates(census: CensusReport, routes: Pick<RoutesReport, 'routes' | 'batchEntries'>, slices: SlicesReport): CandidatesReport;
//# sourceMappingURL=classify.d.ts.map