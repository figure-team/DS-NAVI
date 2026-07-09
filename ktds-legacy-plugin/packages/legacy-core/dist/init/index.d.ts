/** `.spec/` 디렉터리명 — ktds 산출물 작업영역(UA cleanup 대상 아님). */
export declare const SPEC_DIR = ".spec";
/** `.spec/00_MASTER.md` — 분석 진행/산출물 인덱스. */
export declare const SPEC_MASTER = "00_MASTER.md";
export interface InitResult {
    /** 새로 생성된 경로(프로젝트 루트 상대). */
    created: string[];
    /** 이미 존재하여 보존된 경로(프로젝트 루트 상대). */
    preserved: string[];
}
/**
 * 프로젝트를 초기화한다.
 * @param projectRoot 대상 프로젝트 루트(절대경로 권장).
 */
export declare function initProject(projectRoot: string): InitResult;
//# sourceMappingURL=index.d.ts.map