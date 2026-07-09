/**
 * W6 주간/월간 실적 요약 — 기간(git 범위) 작업 실적·변경 모듈·RTM/문서 진척의
 * 결정론 집계(work-summary.json). 설계: WORK_SUMMARY_DESIGN.md.
 *
 * 기간 해석(§3.1) — 벽시계 금지(엔진은 Date.now()/무인자 new Date() 를 호출하지 않는다):
 *  - weeks N: 앵커 = HEAD 커밋의 committer date. 윈도 = 반개구간 (anchor−N×7일, anchor].
 *  - month YYYY-MM: [당월 1일 00:00Z, 익월 1일 00:00Z) 반개구간.
 *  - range A..B: git rev-list 집합 그대로(날짜 무관 — 수집기에 revRange 로 전달됨).
 * 같은 HEAD 면 언제 실행해도 같은 결과 — meta 에 해석 결과를 박제한다.
 *
 * RTM/문서 진척(§3.4) — 시점 합계(coverage.confirmed)는 윈도 내 전환 수를 주지
 * 못한다. 타임스탬프가 있는 원장(rtm-overrides.json 의 audit[], .spec/docs/*.state.json
 * 의 audit[])만이 근거다. 전환 수 = 엔티티별 **최초** 확정 이벤트가 윈도 안인 수
 * (재확정 중복 집계 방지). 원장 부재는 null — 0(이벤트 없음)과 구분해 [미확인] 표기.
 * 주의: 원장은 git 이력이 아니라 작업트리의 현재 상태 — 과거 스냅샷 복원은 안 한다.
 *
 * 날조 0(수용 기준): 이 모듈 산출은 전부 수집 사실의 재배열이다 — 사람 말 요약도
 * 문서 빌더가 이 수치를 고정 문형에 끼우는 결정론 조립(LLM 산문 불개입).
 */
import { z } from 'zod';
import type { ProgramInventory } from '../program-inventory/index.js';
import type { WorkLogResult } from './collect.js';
export { collectWorkLog } from './collect.js';
export type { CollectWorkLogOptions, WorkLogCommit, WorkLogFile, WorkLogResult } from './collect.js';
/** `.spec/map/` 실적 요약 파일명. */
export declare const WORK_SUMMARY_FILENAME = "work-summary.json";
/**
 * 생성물/산출물 경로 패턴(리뷰 C1) — churn 은 사실이지만 실적이 아니다: 도구가 생성해
 * 커밋한 산출물(분석 JSON·doc-output·lock 파일)이 헤드라인 "변경 상위 모듈"을 지배하면
 * 사람 작업 실적이 왜곡된다(이 레포 실측: screens.json 13,230줄이 1위). 제외가 아니라
 * **분리 집계**한다 — totals.generated 로 표면화(침묵 누락 금지). 패턴은 meta 에 박제.
 */
export declare const GENERATED_PATH_PATTERNS: readonly string[];
/** 경로가 생성물 패턴에 걸리는가 — 디렉터리 패턴(`x/`)은 세그먼트 접두, 파일 패턴은 basename 일치. */
export declare function isGeneratedPath(path: string): boolean;
/** 확정 이벤트 어휘 — 기록처(대시보드 dev 서버)의 audit event 문자열과 일치해야 한다. */
export declare const CONFIRM_EVENTS: ReadonlySet<string>;
export type RangeSpec = {
    mode: 'weeks';
    weeks: number;
} | {
    mode: 'month';
    month: string;
} | {
    mode: 'range';
    range: string;
};
export declare const ResolvedRangeSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        weeks: "weeks";
        month: "month";
        range: "range";
    }>;
    rawArg: z.ZodString;
    fromIso: z.ZodNullable<z.ZodString>;
    toIso: z.ZodNullable<z.ZodString>;
    anchorSha: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type ResolvedRange = z.infer<typeof ResolvedRangeSchema>;
/**
 * 기간 해석. weeks 는 HEAD committer date 앵커가 필요 — git 불가 시 fromIso/toIso
 * null(윈도 미해석, 진척 집계도 null 로 degrade).
 */
export declare function resolveRange(spec: RangeSpec, head: {
    sha: string;
    dateIso: string;
} | null): ResolvedRange;
/**
 * ISO 시각이 윈도 안인가. weeks=(from,to], month=[from,to) — 반개구간 방향이 다른
 * 이유: weeks 는 앵커(HEAD 커밋)를 반드시 포함해야 하고, month 는 달력 경계라
 * 하한 포함이 자연스럽다. range 모드는 **시각 윈도가 없다**(rev-list 집합이 곧
 * 멤버십) — 원장(RTM/문서) 진척은 시각 축이라 교차 불가, null 로 degrade 해
 * [미확인] 표기한다(커밋 집합으로 시각 범위를 지어내지 않는다 — 날조 금지).
 * 윈도 미해석(fromIso/toIso null)도 null — 호출자가 집계 자체를 null 로 degrade.
 */
/**
 * 직전 기간(W6-b, 설계 §13) — 현재 윈도와 동일 길이·인접. weeks 는 (from−길이, from],
 * month 는 직전 달력 월 [전월 1일, 당월 1일). 반개구간 방향이 모드별로 유지되므로
 * 현재 하한 경계의 커밋은 정확히 한쪽에만 속한다(이중 계상 0). range/미해석은 null.
 */
export declare function resolvePreviousRange(range: ResolvedRange): ResolvedRange | null;
export declare function makeWindow(range: ResolvedRange): ((iso: string) => boolean) | null;
export declare const WorkCommitSchema: z.ZodObject<{
    sha: z.ZodString;
    dateIso: z.ZodString;
    author: z.ZodString;
    subject: z.ZodString;
    isMerge: z.ZodBoolean;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        added: z.ZodNumber;
        deleted: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const WorkModuleSchema: z.ZodObject<{
    key: z.ZodString;
    source: z.ZodEnum<{
        "program-inventory": "program-inventory";
        dir: "dir";
    }>;
    commits: z.ZodNumber;
    files: z.ZodNumber;
    linesChanged: z.ZodNumber;
    topFiles: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type WorkModule = z.infer<typeof WorkModuleSchema>;
/** 전환 엔티티 id 나열 상한 — 초과분은 count 로만(문서 표 폭주 방지, 리뷰 C4). */
export declare const CONFIRMED_IDS_CAP = 20;
export declare const RtmProgressSchema: z.ZodObject<{
    functionsConfirmed: z.ZodNumber;
    scenariosConfirmed: z.ZodNumber;
    requirementsConfirmed: z.ZodNumber;
    functionsConfirmedIds: z.ZodArray<z.ZodString>;
    scenariosConfirmedIds: z.ZodArray<z.ZodString>;
    requirementsConfirmedIds: z.ZodArray<z.ZodString>;
    confirmEvents: z.ZodNumber;
    editEvents: z.ZodNumber;
    auditlessEntities: z.ZodNumber;
    suspectEntities: z.ZodNumber;
    unparsableAt: z.ZodNumber;
}, z.core.$strip>;
export type RtmProgress = z.infer<typeof RtmProgressSchema>;
export declare const DocProgressSchema: z.ZodObject<{
    submitted: z.ZodNumber;
    approved: z.ZodNumber;
    returned: z.ZodNumber;
    approvedDocs: z.ZodArray<z.ZodString>;
    unparsableAt: z.ZodNumber;
}, z.core.$strip>;
export type DocProgress = z.infer<typeof DocProgressSchema>;
export declare const WorkTotalsSchema: z.ZodObject<{
    commits: z.ZodNumber;
    mergeCommits: z.ZodNumber;
    authors: z.ZodNumber;
    files: z.ZodNumber;
    added: z.ZodNumber;
    deleted: z.ZodNumber;
    generated: z.ZodObject<{
        files: z.ZodNumber;
        added: z.ZodNumber;
        deleted: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WorkTotals = z.infer<typeof WorkTotalsSchema>;
/**
 * 직전 기간(W6-b, 설계 §13) — 현재 윈도와 동일 길이·인접(반개구간 방향 동일). 증감은
 * 저장하지 않는다(문서 빌더가 파생 계산 — 원천 중복 금지). 원장 진척 추이도 **현재
 * 원장 상태**에서 두 윈도를 각각 집계한 것(§3.4 재현 경계 동일).
 */
export declare const PreviousWindowSchema: z.ZodObject<{
    fromIso: z.ZodString;
    toIso: z.ZodString;
    totals: z.ZodObject<{
        commits: z.ZodNumber;
        mergeCommits: z.ZodNumber;
        authors: z.ZodNumber;
        files: z.ZodNumber;
        added: z.ZodNumber;
        deleted: z.ZodNumber;
        generated: z.ZodObject<{
            files: z.ZodNumber;
            added: z.ZodNumber;
            deleted: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    rtmProgress: z.ZodNullable<z.ZodObject<{
        functionsConfirmed: z.ZodNumber;
        scenariosConfirmed: z.ZodNumber;
        requirementsConfirmed: z.ZodNumber;
        functionsConfirmedIds: z.ZodArray<z.ZodString>;
        scenariosConfirmedIds: z.ZodArray<z.ZodString>;
        requirementsConfirmedIds: z.ZodArray<z.ZodString>;
        confirmEvents: z.ZodNumber;
        editEvents: z.ZodNumber;
        auditlessEntities: z.ZodNumber;
        suspectEntities: z.ZodNumber;
        unparsableAt: z.ZodNumber;
    }, z.core.$strip>>;
    docProgress: z.ZodNullable<z.ZodObject<{
        submitted: z.ZodNumber;
        approved: z.ZodNumber;
        returned: z.ZodNumber;
        approvedDocs: z.ZodArray<z.ZodString>;
        unparsableAt: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PreviousWindow = z.infer<typeof PreviousWindowSchema>;
export declare const WorkSummaryReportSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    gitCommit: z.ZodNullable<z.ZodString>;
    range: z.ZodObject<{
        mode: z.ZodEnum<{
            weeks: "weeks";
            month: "month";
            range: "range";
        }>;
        rawArg: z.ZodString;
        fromIso: z.ZodNullable<z.ZodString>;
        toIso: z.ZodNullable<z.ZodString>;
        anchorSha: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    commits: z.ZodArray<z.ZodObject<{
        sha: z.ZodString;
        dateIso: z.ZodString;
        author: z.ZodString;
        subject: z.ZodString;
        isMerge: z.ZodBoolean;
        files: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            added: z.ZodNumber;
            deleted: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    totals: z.ZodObject<{
        commits: z.ZodNumber;
        mergeCommits: z.ZodNumber;
        authors: z.ZodNumber;
        files: z.ZodNumber;
        added: z.ZodNumber;
        deleted: z.ZodNumber;
        generated: z.ZodObject<{
            files: z.ZodNumber;
            added: z.ZodNumber;
            deleted: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    previous: z.ZodNullable<z.ZodObject<{
        fromIso: z.ZodString;
        toIso: z.ZodString;
        totals: z.ZodObject<{
            commits: z.ZodNumber;
            mergeCommits: z.ZodNumber;
            authors: z.ZodNumber;
            files: z.ZodNumber;
            added: z.ZodNumber;
            deleted: z.ZodNumber;
            generated: z.ZodObject<{
                files: z.ZodNumber;
                added: z.ZodNumber;
                deleted: z.ZodNumber;
            }, z.core.$strip>;
        }, z.core.$strip>;
        rtmProgress: z.ZodNullable<z.ZodObject<{
            functionsConfirmed: z.ZodNumber;
            scenariosConfirmed: z.ZodNumber;
            requirementsConfirmed: z.ZodNumber;
            functionsConfirmedIds: z.ZodArray<z.ZodString>;
            scenariosConfirmedIds: z.ZodArray<z.ZodString>;
            requirementsConfirmedIds: z.ZodArray<z.ZodString>;
            confirmEvents: z.ZodNumber;
            editEvents: z.ZodNumber;
            auditlessEntities: z.ZodNumber;
            suspectEntities: z.ZodNumber;
            unparsableAt: z.ZodNumber;
        }, z.core.$strip>>;
        docProgress: z.ZodNullable<z.ZodObject<{
            submitted: z.ZodNumber;
            approved: z.ZodNumber;
            returned: z.ZodNumber;
            approvedDocs: z.ZodArray<z.ZodString>;
            unparsableAt: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    modules: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        source: z.ZodEnum<{
            "program-inventory": "program-inventory";
            dir: "dir";
        }>;
        commits: z.ZodNumber;
        files: z.ZodNumber;
        linesChanged: z.ZodNumber;
        topFiles: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    rtmProgress: z.ZodNullable<z.ZodObject<{
        functionsConfirmed: z.ZodNumber;
        scenariosConfirmed: z.ZodNumber;
        requirementsConfirmed: z.ZodNumber;
        functionsConfirmedIds: z.ZodArray<z.ZodString>;
        scenariosConfirmedIds: z.ZodArray<z.ZodString>;
        requirementsConfirmedIds: z.ZodArray<z.ZodString>;
        confirmEvents: z.ZodNumber;
        editEvents: z.ZodNumber;
        auditlessEntities: z.ZodNumber;
        suspectEntities: z.ZodNumber;
        unparsableAt: z.ZodNumber;
    }, z.core.$strip>>;
    docProgress: z.ZodNullable<z.ZodObject<{
        submitted: z.ZodNumber;
        approved: z.ZodNumber;
        returned: z.ZodNumber;
        approvedDocs: z.ZodArray<z.ZodString>;
        unparsableAt: z.ZodNumber;
    }, z.core.$strip>>;
    meta: z.ZodObject<{
        gitAvailable: z.ZodBoolean;
        gitStatus: z.ZodEnum<{
            ok: "ok";
            "no-git": "no-git";
            shallow: "shallow";
            "too-large": "too-large";
        }>;
        prefix: z.ZodString;
        moduleSource: z.ZodEnum<{
            "program-inventory": "program-inventory";
            dir: "dir";
        }>;
        generatedPatterns: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WorkSummaryReport = z.infer<typeof WorkSummaryReportSchema>;
/** rtm-overrides.json(파싱된 객체) → 윈도 내 RTM 진척. 원장 형식이 아니면 0 집계. */
export declare function scanRtmProgress(rawOverlay: unknown, inWindow: (iso: string) => boolean): RtmProgress;
/** .spec/docs/*.state.json 목록 → 윈도 내 문서 진척(SUBMITTED/APPROVED/RETURNED). */
export declare function scanDocProgress(states: Array<{
    docId: string;
    raw: unknown;
}>, inWindow: (iso: string) => boolean): DocProgress;
export interface WorkSummaryInputs {
    spec: RangeSpec;
    /** collectWorkLog 산출(주입식) — 픽스처 테스트는 고정 주입. */
    collected: WorkLogResult;
    /** 모듈 귀속용(W3) — null 이면 최상위 디렉터리 버킷 폴백. */
    programInventory: ProgramInventory | null;
    /** rtm-overrides.json 파싱 결과 — null = 원장 파일 없음(0 과 구분). */
    rtmOverlay: unknown | null;
    /** .spec/docs/*.state.json — null = 디렉터리 없음. */
    docStates: Array<{
        docId: string;
        raw: unknown;
    }> | null;
}
/**
 * 실적 요약 조립(파일 기록 없음 — 호출자가 writeMapArtifact). 순수 함수:
 * 모든 입력은 주입, 시계 미사용 — 동일 입력 ⇒ byte 동일 출력.
 */
export declare function buildWorkSummary(inputs: WorkSummaryInputs): WorkSummaryReport;
//# sourceMappingURL=index.d.ts.map