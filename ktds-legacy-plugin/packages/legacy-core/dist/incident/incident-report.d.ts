/**
 * DS-APM 장애 RCA 리포트 파서 + 시드 판정 — 순수 결정론(IO 없음).
 *
 * 계약: docs/ktds/INCIDENT_DROP_CONTRACT.md (실물 예시 `2026-06-23_rca_checkout.md` 실측 고정).
 * 형식 = YAML frontmatter(runId/service/createdAt/confidence/baselineCommit) +
 * 한국어 h2 섹션(근본 원인[필수]/수정 제안/한계). file:line 근거는 산문 인라인이라
 * 여기서 결정론 추출한다. IO(드롭 폴더·census 로드)는 scripts/incident.mjs 가 담당.
 */
/** 수용 게이트 통과에 필요한 본문 섹션(h2 정확일치). */
export declare const INCIDENT_SECTION_ROOT_CAUSE = "\uADFC\uBCF8 \uC6D0\uC778";
export declare const INCIDENT_SECTION_FIX = "\uC218\uC815 \uC81C\uC548";
export declare const INCIDENT_SECTION_LIMITS = "\uD55C\uACC4";
export interface IncidentFrontmatter {
    runId: string;
    service: string;
    createdAt: string | null;
    /** high|medium|low — 그 외/누락은 low 클램프(ds-apm rcaresult.go:89-98 과 동일 규칙). */
    confidence: 'high' | 'medium' | 'low';
    baselineCommit: string | null;
}
/** 본문에서 추출한 file:line 후보(산문 인라인 표기 그대로). */
export interface IncidentFileRef {
    /** 표기된 경로 텍스트(레포 상대경로 또는 basename 축약). */
    path: string;
    line: number;
    /** 추출 출처 섹션. */
    section: typeof INCIDENT_SECTION_ROOT_CAUSE | typeof INCIDENT_SECTION_FIX;
}
export interface ParsedIncidentReport {
    /** 수용 게이트: runId+service+근본 원인 섹션 존재. false 면 나머지 필드는 참고용. */
    parseable: boolean;
    /** 게이트 불합격 사유(사람이 읽는 한국어) — parseable=true 면 빈 배열. */
    reasons: string[];
    frontmatter: IncidentFrontmatter | null;
    /** 섹션 제목 → 본문 텍스트(제목 줄 제외, 트림). 없는 섹션은 키 부재. */
    sections: Record<string, string>;
    /** 원장·UI 표시용 제목 = 근본 원인 첫 비어있지 않은 줄(없으면 null). */
    title: string | null;
    /** 근본 원인·수정 제안에서 추출한 file:line 후보(중복 제거, 출현 순). */
    refs: IncidentFileRef[];
}
/**
 * 임의 텍스트에서 file:line 후보를 추출한다(섹션 무관 — resolution.md 인용 검증 등
 * 문서 전체를 훑어야 하는 소비처용). URL 내 경로는 제외, 중복 제거·출현 순.
 */
export declare function extractFileLineRefs(text: string): {
    path: string;
    line: number;
}[];
/**
 * 드롭 파일 원문 → 구조화 파싱 + 수용 게이트 판정.
 * 불합격이어도 throw 하지 않는다 — 호출자가 unparseable 로 원장 기록(원문 보존)한다.
 */
export declare function parseIncidentReport(raw: string): ParsedIncidentReport;
export type IncidentSeedVerdict = 'matched' | 'not-in-project' | 'ambiguous';
export interface IncidentSeedResolution {
    ref: IncidentFileRef;
    verdict: IncidentSeedVerdict;
    /** matched 일 때 census 상대경로(축약 표기는 basename 유일 매칭으로 해소). */
    relPath: string | null;
    /** matched 근거: 'path'=상대경로 정확일치 · 'basename'=basename 유일. */
    via: 'path' | 'basename' | null;
    /** ambiguous 일 때 동명 후보(전량 나열 — 조용한 절삭 금지). */
    candidates: string[];
}
export interface IncidentSeedResult {
    resolutions: IncidentSeedResolution[];
    /** matched 상대경로 중복 제거(출현 순) — understand-impact analyze --path 입력. */
    seeds: string[];
    /**
     * ★ 전량 not-in-project — 타 프로젝트 리포트일 수 있음(DS-APM 서비스→레포 매핑 오류를
     * 우리 쪽에서 감지하는 유일한 지점, 실물 checkout 예시가 이 케이스). 침묵 진행 금지.
     */
    allNotInProject: boolean;
}
/**
 * 추출 후보를 census 실존 파일과 대조한다(fail-closed — LLM 추측 시드 없음).
 * 실물 리포트의 `수정 제안`은 basename 축약 표기를 쓴다(P1 픽스처 검증 실측) —
 * basename 이 census 에서 유일하면 해소, 다의면 ambiguous.
 */
export declare function resolveIncidentSeeds(refs: IncidentFileRef[], censusRelPaths: string[]): IncidentSeedResult;
//# sourceMappingURL=incident-report.d.ts.map