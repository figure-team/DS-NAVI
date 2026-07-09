import type { BranchSignal, BranchSignalSet } from './types.js';
/**
 * 한 Java 파일에서 분기 신호를 추출한다(순수, 파싱 포함). 소스 순서 보존.
 */
export declare function extractBranches(relPath: string, src: string): Promise<BranchSignal[]>;
/** Java enum 1개 — 상태값(코드) 후보. 이름=코드 그룹, 상수=코드값. */
export interface EnumFact {
    enumName: string;
    constants: string[];
    relPath: string;
    line: number;
}
/** 한 Java 파일의 enum 선언을 추출한다(이름 + 상수 목록). §3 상태값·§2 용어 시드. */
export declare function extractEnums(relPath: string, src: string): Promise<EnumFact[]>;
/**
 * 여러 Java 파일(relPaths)을 스캔해 분기 신호 집합을 만든다(IO).
 * 호출자가 대상 파일을 한정(PD3: 도메인 경계 = skeleton.stepSources 의 클래스 파일).
 * 읽기 실패는 조용히 건너뛰되(파일 누락 방어) fileCount 에는 미포함.
 */
export declare function scanBranches(projectRoot: string, relPaths: string[]): Promise<BranchSignalSet>;
//# sourceMappingURL=branch-scanner.d.ts.map