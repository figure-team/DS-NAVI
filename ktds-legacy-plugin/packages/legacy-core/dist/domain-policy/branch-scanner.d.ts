import type { BranchSignal, BranchSignalSet } from './types.js';
/** 한 소스 파일에서 분기 신호를 추출한다 — 확장자로 Java/Kotlin 파서를 고른다. */
export declare function extractBranches(relPath: string, src: string): Promise<BranchSignal[]>;
/** Java enum 1개 — 상태값(코드) 후보. 이름=코드 그룹, 상수=코드값. */
export interface EnumFact {
    enumName: string;
    constants: string[];
    relPath: string;
    line: number;
}
/** 한 소스 파일의 enum 을 추출한다 — 확장자로 Java/Kotlin 파서를 고른다. */
export declare function extractEnums(relPath: string, src: string): Promise<EnumFact[]>;
/**
 * 여러 Java 파일(relPaths)을 스캔해 분기 신호 집합을 만든다(IO).
 * 호출자가 대상 파일을 한정(PD3: 도메인 경계 = skeleton.stepSources 의 클래스 파일).
 * 읽기 실패는 조용히 건너뛰되(파일 누락 방어) fileCount 에는 미포함.
 */
export declare function scanBranches(projectRoot: string, relPaths: string[]): Promise<BranchSignalSet>;
//# sourceMappingURL=branch-scanner.d.ts.map