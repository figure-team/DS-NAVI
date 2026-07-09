export interface ChurnEntry {
    /** 이 파일을 변경한 커밋 수(전체 이력, merge 커밋 제외 — numstat 무발행). */
    commits: number;
    /** 추가+삭제 라인 누계(바이너리 diff '-' 는 0 계상). */
    linesChanged: number;
}
/** relPath(projectRoot 기준) → churn. */
export type ChurnMap = Map<string, ChurnEntry>;
/**
 * 전체 이력 numstat 을 파일별로 집계. git 불가 시 null.
 * shallow clone(--depth) 도 null — 잘린 이력의 churn 은 같은 커밋에서도 클론마다
 * 달라져 "동일 commit byte-diff=0" 결정론 보장을 깬다(리뷰 R1). 침묵 왜곡 대신
 * 미측정([미확인]) degrade 를 택한다.
 * 한계: git 이 경로를 인용부호로 감싸는 파일명(제어문자·따옴표 등)은 매칭 실패로
 * churn 0 처리(R7 — 소스 파일명에선 사실상 미발생). 출력 256MB 초과 시 전량 null
 * (R5 — 스트리밍 파서는 백로그).
 */
export declare function collectGitChurn(projectRoot: string): ChurnMap | null;
//# sourceMappingURL=churn.d.ts.map