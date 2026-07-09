export interface WorkLogFile {
    /** projectRoot 기준 relPath(접두어 제거 후). */
    path: string;
    added: number;
    deleted: number;
}
export interface WorkLogCommit {
    sha: string;
    /** committer date, ISO(%cI). */
    dateIso: string;
    /** 작성자 이름(%an) — 이메일 미수집. */
    author: string;
    subject: string;
    /** 부모 2개 이상 — numstat 무발행이라 파일 통계엔 자연 제외. */
    isMerge: boolean;
    /** path ASC 정렬. 바이너리 diff '-' 는 0 계상(churn 관례). */
    files: WorkLogFile[];
}
export type WorkLogResult = {
    kind: 'ok';
    headSha: string;
    /** HEAD 의 committer date — 상대 기간(weeks) 앵커(벽시계 금지). */
    headDateIso: string;
    prefix: string;
    commits: WorkLogCommit[];
}
/** git 불가/이력 없음/범위 해석 실패 — 호출자가 [미확인] 표면화(침묵 누락 금지). */
 | {
    kind: 'no-git';
}
/** shallow clone — 잘린 이력은 같은 커밋에서도 클론마다 달라 결정론을 깬다. */
 | {
    kind: 'shallow';
}
/** 출력 256MB 초과 — no-git 과 사유를 구분 표면화(대형 레포는 sinceIso 바운드 권장, 리뷰 C3). */
 | {
    kind: 'too-large';
};
export interface CollectWorkLogOptions {
    /** `A..B` rev 범위 — 해당 집합만 수집. `-` 시작 문자열은 거부(git 옵션 인젝션 방지, 리뷰 R2). */
    revRange?: string;
    /**
     * `git log --since` 하한(ISO) — 상대 기간 모드에서 전체 이력 수집을 바운드(리뷰 C3:
     * 대형 레포 256MB 절벽 방지). 윈도 필터는 build 단계에서 다시 적용되므로 호출자는
     * 윈도 하한보다 여유(예: −1일)를 두고 넘긴다 — 같은 HEAD·같은 인자면 결과 동일(결정론).
     */
    sinceIso?: string;
}
/**
 * 커밋+numstat 수집. revRange(`A..B`)를 주면 해당 집합만, sinceIso 를 주면 그 이후만,
 * 둘 다 없으면 전체 이력. 잘못된 revRange 는 no-git 으로 수렴한다 — 호출자(스크립트)가
 * rev-parse 로 사전 검증해 사용자 오류를 구분 표면화한다.
 * 한계(리뷰 R7/R8, 백로그): 커밋 제목에 RS(\x1e) 제어문자가 있으면 해당 레코드가 중간
 * 분할되고, 경로에 탭/개행 등 제어문자가 있으면 git 이 C-스타일 인용을 해 매칭이
 * 어긋난다 — 소스 제목/파일명에선 사실상 미발생(churn R7 과 동일 판단).
 */
export declare function collectWorkLog(projectRoot: string, opts?: CollectWorkLogOptions): WorkLogResult;
//# sourceMappingURL=collect.d.ts.map