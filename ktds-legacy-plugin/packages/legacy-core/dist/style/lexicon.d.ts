/**
 * 표기 통일 렉시콘(lexicon) — fill-merge 가 산문 필드에 적용하는 **결정론 문자열 치환**.
 *
 * 위치: LLM 문체 계층의 마지막 보조 수단이다. 문맥 판단(번역투 재작성 등)은 팬아웃
 * 워크플로의 문체 검수 라운드(LLM) 몫이고, 여기는 **문맥 없이도 항상 옳은 표기**
 * (이중 피동·음차·맞춤법 통일)만 담는다. 오폭 위험이 있는 항목은 렉시콘에 넣지 않는다.
 *
 * doc-template.ts 와 동형 철학: 파서는 순수(IO 없음), 렉시콘 .md 는 플러그인 동봉
 * (`templates/style/ko-lexicon.md`) + 프로젝트 override — 로드는 호출자(.mjs)가 한다.
 *
 * 불변식: 인용 계열 서브트리(citations/evidence/preCite/snippet)는 **절대 건드리지
 * 않는다** — snippet 은 verbatim 근거라 한 글자만 바뀌어도 기계검증이 강등시킨다.
 */
export interface LexiconEntry {
    /** 치환 대상 표기(정규식 아님 — 리터럴). */
    from: string;
    /** 통일 표기. 빈 문자열이면 제거(테이블에서 `(삭제)`). */
    to: string;
}
/**
 * 렉시콘 .md 의 표(`| 금지 표기 | 통일 표기 | 비고? |`)를 파싱한다.
 * - 헤더 행(다음 줄이 구분선인 행)과 구분선 행은 건너뛴다.
 * - `(삭제)` 는 빈 문자열 치환(제거)이다.
 * - 긴 표기 우선 정렬 — 짧은 항목이 긴 항목의 부분 문자열을 먼저 먹는 것을 막는다.
 */
export declare function parseLexicon(md: string): LexiconEntry[];
/** 문자열 하나에 렉시콘을 적용한다. hits = 치환 발생 횟수(항목×등장 수). */
export declare function applyLexiconToText(text: string, entries: LexiconEntry[]): {
    text: string;
    hits: number;
};
/**
 * 값 트리를 깊이 순회하며 **산문 키의 문자열 값에만** 렉시콘을 적용한다(불변 —
 * 새 값 반환). SKIP_KEYS 서브트리는 참조 그대로 보존한다. id·경로·코드 심볼 필드는
 * PROSE_KEYS 밖이라 자연히 불변이다.
 */
export declare function applyLexiconDeep<T>(value: T, entries: LexiconEntry[]): {
    value: T;
    hits: number;
};
//# sourceMappingURL=lexicon.d.ts.map