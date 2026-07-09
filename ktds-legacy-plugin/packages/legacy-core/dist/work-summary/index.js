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
import { cmp } from '../utils/cmp.js';
export { collectWorkLog } from './collect.js';
/** `.spec/map/` 실적 요약 파일명. */
export const WORK_SUMMARY_FILENAME = 'work-summary.json';
/**
 * 생성물/산출물 경로 패턴(리뷰 C1) — churn 은 사실이지만 실적이 아니다: 도구가 생성해
 * 커밋한 산출물(분석 JSON·doc-output·lock 파일)이 헤드라인 "변경 상위 모듈"을 지배하면
 * 사람 작업 실적이 왜곡된다(이 레포 실측: screens.json 13,230줄이 1위). 제외가 아니라
 * **분리 집계**한다 — totals.generated 로 표면화(침묵 누락 금지). 패턴은 meta 에 박제.
 */
export const GENERATED_PATH_PATTERNS = [
    '.understand-anything/',
    '.spec/',
    'dist/',
    'node_modules/',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
];
/** 경로가 생성물 패턴에 걸리는가 — 디렉터리 패턴(`x/`)은 세그먼트 접두, 파일 패턴은 basename 일치. */
export function isGeneratedPath(path) {
    for (const pat of GENERATED_PATH_PATTERNS) {
        if (pat.endsWith('/')) {
            if (path.startsWith(pat) || path.includes(`/${pat}`))
                return true;
        }
        else if (path === pat || path.endsWith(`/${pat}`)) {
            return true;
        }
    }
    return false;
}
/** 확정 이벤트 어휘 — 기록처(대시보드 dev 서버)의 audit event 문자열과 일치해야 한다. */
export const CONFIRM_EVENTS = new Set(['CONFIRMED', 'CONFIRMED_NO_EDIT']);
const EDIT_EVENT = 'EDITED';
export const ResolvedRangeSchema = z.object({
    mode: z.enum(['weeks', 'month', 'range']),
    /** 사용자 인자 원문(재현 근거). */
    rawArg: z.string(),
    /** weeks: 개구간 하한(미포함) / month: 폐구간 하한(포함) / range: null. */
    fromIso: z.string().nullable(),
    /** weeks: 폐구간 상한(포함) / month: 개구간 상한(미포함) / range: null. */
    toIso: z.string().nullable(),
    /** weeks 앵커 커밋(HEAD) — month/range 는 null. */
    anchorSha: z.string().nullable(),
});
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * 기간 해석. weeks 는 HEAD committer date 앵커가 필요 — git 불가 시 fromIso/toIso
 * null(윈도 미해석, 진척 집계도 null 로 degrade).
 */
export function resolveRange(spec, head) {
    if (spec.mode === 'range') {
        return { mode: 'range', rawArg: spec.range, fromIso: null, toIso: null, anchorSha: null };
    }
    if (spec.mode === 'month') {
        const m = /^(\d{4})-(\d{2})$/.exec(spec.month);
        if (!m)
            throw new Error(`잘못된 월 형식(YYYY-MM 필요): ${spec.month}`);
        const year = Number(m[1]);
        const month = Number(m[2]);
        if (month < 1 || month > 12)
            throw new Error(`잘못된 월: ${spec.month}`);
        const fromMs = Date.UTC(year, month - 1, 1);
        const toMs = Date.UTC(year, month, 1);
        return {
            mode: 'month',
            rawArg: spec.month,
            fromIso: new Date(fromMs).toISOString(),
            toIso: new Date(toMs).toISOString(),
            anchorSha: null,
        };
    }
    if (!Number.isInteger(spec.weeks) || spec.weeks < 1) {
        throw new Error(`잘못된 주 수(1 이상 정수 필요): ${spec.weeks}`);
    }
    if (head === null) {
        return { mode: 'weeks', rawArg: String(spec.weeks), fromIso: null, toIso: null, anchorSha: null };
    }
    const toMs = Date.parse(head.dateIso);
    if (Number.isNaN(toMs)) {
        return { mode: 'weeks', rawArg: String(spec.weeks), fromIso: null, toIso: null, anchorSha: head.sha };
    }
    return {
        mode: 'weeks',
        rawArg: String(spec.weeks),
        fromIso: new Date(toMs - spec.weeks * WEEK_MS).toISOString(),
        toIso: new Date(toMs).toISOString(),
        anchorSha: head.sha,
    };
}
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
export function resolvePreviousRange(range) {
    if (range.mode === 'range' || range.fromIso === null || range.toIso === null)
        return null;
    if (range.mode === 'weeks') {
        const fromMs = Date.parse(range.fromIso);
        const toMs = Date.parse(range.toIso);
        return {
            mode: 'weeks',
            rawArg: range.rawArg,
            fromIso: new Date(fromMs - (toMs - fromMs)).toISOString(),
            toIso: range.fromIso,
            anchorSha: range.anchorSha,
        };
    }
    const m = /^(\d{4})-(\d{2})$/.exec(range.rawArg);
    if (!m)
        return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    // 직전 달(1월 → 전년 12월 롤오버). rawArg 도 직전 달로 — 창과 라벨 불일치 방지(리뷰 T3).
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    return {
        mode: 'month',
        rawArg: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
        fromIso: new Date(Date.UTC(prevYear, prevMonth - 1, 1)).toISOString(),
        toIso: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
        anchorSha: null,
    };
}
export function makeWindow(range) {
    if (range.mode === 'range')
        return null;
    if (range.fromIso === null || range.toIso === null)
        return null;
    const fromMs = Date.parse(range.fromIso);
    const toMs = Date.parse(range.toIso);
    if (range.mode === 'weeks') {
        return (iso) => {
            const t = Date.parse(iso);
            return !Number.isNaN(t) && t > fromMs && t <= toMs;
        };
    }
    return (iso) => {
        const t = Date.parse(iso);
        return !Number.isNaN(t) && t >= fromMs && t < toMs;
    };
}
// ── 산출물 스키마 ────────────────────────────────────────────────────────────
export const WorkCommitSchema = z.object({
    sha: z.string(),
    dateIso: z.string(),
    author: z.string(),
    subject: z.string(),
    isMerge: z.boolean(),
    files: z.array(z.object({
        path: z.string(),
        added: z.number().int().nonnegative(),
        deleted: z.number().int().nonnegative(),
    })),
});
export const WorkModuleSchema = z.object({
    key: z.string(),
    /** program-inventory = 도메인 조인(근거 보유), dir = 최상위 디렉터리 폴백([추정]). */
    source: z.enum(['program-inventory', 'dir']),
    commits: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    linesChanged: z.number().int().nonnegative(),
    /** 변경 상위 파일(변경라인 DESC, path ASC, 최대 3) — 문서 행의 file 근거 승계용. */
    topFiles: z.array(z.string()),
});
/** 전환 엔티티 id 나열 상한 — 초과분은 count 로만(문서 표 폭주 방지, 리뷰 C4). */
export const CONFIRMED_IDS_CAP = 20;
export const RtmProgressSchema = z.object({
    /** 윈도 내 최초 확정 엔티티 수(추정→확정 전환). */
    functionsConfirmed: z.number().int().nonnegative(),
    scenariosConfirmed: z.number().int().nonnegative(),
    requirementsConfirmed: z.number().int().nonnegative(),
    /** 전환 엔티티 id(ASC, 상한 CONFIRMED_IDS_CAP) — "무엇이 확정됐나"(리뷰 C4, approvedDocs 대칭). */
    functionsConfirmedIds: z.array(z.string()),
    scenariosConfirmedIds: z.array(z.string()),
    requirementsConfirmedIds: z.array(z.string()),
    /** 윈도 내 이벤트 총수(재확정 포함) — 전환 수와 구분. */
    confirmEvents: z.number().int().nonnegative(),
    editEvents: z.number().int().nonnegative(),
    /** audit[] 없는 구원장 엔티티 — at 필드로 폴백 집계(표면화). */
    auditlessEntities: z.number().int().nonnegative(),
    /**
     * 확정 이벤트의 at 파싱 실패로 최초 확정 시각을 알 수 없는 엔티티 — 전환 집계에서
     * 보수적으로 제외(리뷰 R3: 손상된 과거 확정이 이번 기간 전환으로 오계상되는 것 방지).
     */
    suspectEntities: z.number().int().nonnegative(),
    /** at 파싱 실패 이벤트 수 — 드롭하지 않고 표면화(침묵 누락 금지). */
    unparsableAt: z.number().int().nonnegative(),
});
export const DocProgressSchema = z.object({
    submitted: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    /** 윈도 내 APPROVED 이벤트가 있는 docId(ASC). */
    approvedDocs: z.array(z.string()),
    unparsableAt: z.number().int().nonnegative(),
});
export const WorkTotalsSchema = z.object({
    commits: z.number().int().nonnegative(),
    mergeCommits: z.number().int().nonnegative(),
    authors: z.number().int().nonnegative(),
    /** files/added/deleted 는 생성물 제외분(실적 근사) — 생성물은 generated 로 분리(리뷰 C1). */
    files: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    /** 생성물/산출물(GENERATED_PATH_PATTERNS) 분리 집계 — 제외가 아니라 표면화. */
    generated: z.object({
        files: z.number().int().nonnegative(),
        added: z.number().int().nonnegative(),
        deleted: z.number().int().nonnegative(),
    }),
});
/**
 * 직전 기간(W6-b, 설계 §13) — 현재 윈도와 동일 길이·인접(반개구간 방향 동일). 증감은
 * 저장하지 않는다(문서 빌더가 파생 계산 — 원천 중복 금지). 원장 진척 추이도 **현재
 * 원장 상태**에서 두 윈도를 각각 집계한 것(§3.4 재현 경계 동일).
 */
export const PreviousWindowSchema = z.object({
    fromIso: z.string(),
    toIso: z.string(),
    totals: WorkTotalsSchema,
    rtmProgress: RtmProgressSchema.nullable(),
    docProgress: DocProgressSchema.nullable(),
});
export const WorkSummaryReportSchema = z.object({
    schemaVersion: z.literal(1),
    /** 결정론 앵커 — 수집 시점 HEAD. null = git 불가. */
    gitCommit: z.string().nullable(),
    range: ResolvedRangeSchema,
    /** 윈도 내 커밋만(dateIso DESC, sha ASC). */
    commits: z.array(WorkCommitSchema),
    totals: WorkTotalsSchema,
    /** 다주 추이(W6-b) — null = range 모드(시각 축 없음)/git 불가/윈도 미해석. */
    previous: PreviousWindowSchema.nullable(),
    /** linesChanged DESC, key ASC. */
    modules: z.array(WorkModuleSchema),
    /** null = 원장 없음 또는 윈도 미해석([미확인] — 0 과 구분). */
    rtmProgress: RtmProgressSchema.nullable(),
    docProgress: DocProgressSchema.nullable(),
    meta: z.object({
        gitAvailable: z.boolean(),
        /** gitAvailable=false 의 사유 구분 — 잘린 이력(shallow)/git 부재/출력 256MB 초과(too-large). */
        gitStatus: z.enum(['ok', 'no-git', 'shallow', 'too-large']),
        prefix: z.string(),
        moduleSource: z.enum(['program-inventory', 'dir']),
        /** 생성물 분리에 쓴 패턴 박제(재현 근거, 리뷰 C1). */
        generatedPatterns: z.array(z.string()),
    }),
});
/** audit 이벤트 배열을 방어적으로 정규화(zod 미경유 원장 — 손상 항목은 카운트로 표면화). */
function auditEvents(entity) {
    if (!Array.isArray(entity.audit))
        return [];
    const out = [];
    for (const e of entity.audit) {
        if (e !== null && typeof e === 'object' && typeof e.event === 'string') {
            const at = e.at;
            out.push({ event: e.event, at: typeof at === 'string' ? at : '' });
        }
    }
    return out;
}
/**
 * 원장 섹션(엔티티 id → override) 하나의 전환/이벤트 집계.
 * 전환 = 최초 확정 이벤트 at ∈ 윈도. audit 이 빈 구원장 엔티티는 at 필드로 폴백
 * (auditless 로 표면화 — at 은 마지막 수정 시각이라 **확정 여부 자체를 구분할 수
 * 없다**(편집만 된 구원장도 전환 계상 가능, 리뷰 C6 — 과대계상 방향을 수치로 노출).
 * 확정 이벤트의 at 이 파싱 불가한 엔티티는 최초 확정 시각 미상 — 전환에서 보수적으로
 * 제외하고 suspect 로 표면화(리뷰 R3: 과거 확정의 손상이 이번 기간 전환으로 오계상 방지).
 */
function scanSection(section, inWindow) {
    const convertedIds = [];
    let confirmEvents = 0;
    let editEvents = 0;
    let auditless = 0;
    let suspect = 0;
    let unparsable = 0;
    for (const key of Object.keys(section)) {
        const entity = section[key];
        // 배열도 typeof 'object' — 원장 형식이 아니므로 제외(리뷰 R10).
        if (entity === null || typeof entity !== 'object' || Array.isArray(entity))
            continue;
        const events = auditEvents(entity);
        if (events.length === 0) {
            auditless += 1;
            const at = typeof entity.at === 'string' ? entity.at : '';
            if (Number.isNaN(Date.parse(at)))
                unparsable += 1;
            else if (inWindow(at)) {
                convertedIds.push(key);
                confirmEvents += 1;
            }
            continue;
        }
        let firstConfirm = null;
        let confirmAtBroken = false;
        for (const e of events) {
            if (Number.isNaN(Date.parse(e.at))) {
                unparsable += 1;
                // 확정 이벤트인데 시각 미상 — 이 엔티티의 "최초 확정"은 알 수 없다(리뷰 R3).
                if (CONFIRM_EVENTS.has(e.event))
                    confirmAtBroken = true;
                continue;
            }
            if (CONFIRM_EVENTS.has(e.event)) {
                if (firstConfirm === null || Date.parse(e.at) < Date.parse(firstConfirm))
                    firstConfirm = e.at;
                if (inWindow(e.at))
                    confirmEvents += 1;
            }
            else if (e.event === EDIT_EVENT && inWindow(e.at)) {
                editEvents += 1;
            }
        }
        if (confirmAtBroken) {
            suspect += 1;
        }
        else if (firstConfirm !== null && inWindow(firstConfirm)) {
            convertedIds.push(key);
        }
    }
    convertedIds.sort(cmp);
    return {
        converted: convertedIds.length,
        convertedIds: convertedIds.slice(0, CONFIRMED_IDS_CAP),
        confirmEvents,
        editEvents,
        auditless,
        suspect,
        unparsable,
    };
}
/** rtm-overrides.json(파싱된 객체) → 윈도 내 RTM 진척. 원장 형식이 아니면 0 집계. */
export function scanRtmProgress(rawOverlay, inWindow) {
    const overlay = rawOverlay !== null && typeof rawOverlay === 'object' && !Array.isArray(rawOverlay)
        ? rawOverlay
        : {};
    const sectionOf = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
    // 최상위 fnId 키(예약 섹션 _* 제외) = 기능 행 오버레이 — `_` 접두 예약은 온디스크
    // 스키마 관례(apply-overlay.ts 헤더)에 의존한다(리뷰 R9: 비-_ 메타키 신설 시 재검토).
    const fnSection = {};
    for (const key of Object.keys(overlay)) {
        if (key.startsWith('_'))
            continue;
        fnSection[key] = overlay[key];
    }
    const fn = scanSection(fnSection, inWindow);
    const sc = scanSection(sectionOf(overlay['_scenarios']), inWindow);
    const rq = scanSection(sectionOf(overlay['_requirements']), inWindow);
    return RtmProgressSchema.parse({
        functionsConfirmed: fn.converted,
        scenariosConfirmed: sc.converted,
        requirementsConfirmed: rq.converted,
        functionsConfirmedIds: fn.convertedIds,
        scenariosConfirmedIds: sc.convertedIds,
        requirementsConfirmedIds: rq.convertedIds,
        confirmEvents: fn.confirmEvents + sc.confirmEvents + rq.confirmEvents,
        editEvents: fn.editEvents + sc.editEvents + rq.editEvents,
        auditlessEntities: fn.auditless + sc.auditless + rq.auditless,
        suspectEntities: fn.suspect + sc.suspect + rq.suspect,
        unparsableAt: fn.unparsable + sc.unparsable + rq.unparsable,
    });
}
/** .spec/docs/*.state.json 목록 → 윈도 내 문서 진척(SUBMITTED/APPROVED/RETURNED). */
export function scanDocProgress(states, inWindow) {
    let submitted = 0;
    let approved = 0;
    let returned = 0;
    let unparsable = 0;
    const approvedDocs = new Set();
    for (const s of states) {
        for (const e of auditEvents(s.raw !== null && typeof s.raw === 'object' ? s.raw : {})) {
            if (Number.isNaN(Date.parse(e.at))) {
                unparsable += 1;
                continue;
            }
            if (!inWindow(e.at))
                continue;
            if (e.event === 'SUBMITTED')
                submitted += 1;
            else if (e.event === 'APPROVED') {
                approved += 1;
                approvedDocs.add(s.docId);
            }
            else if (e.event === 'RETURNED')
                returned += 1;
        }
    }
    return DocProgressSchema.parse({
        submitted,
        approved,
        returned,
        approvedDocs: [...approvedDocs].sort(cmp),
        unparsableAt: unparsable,
    });
}
/** 변경 파일 → 모듈 키 귀속(§3.3) — inventory 조인 우선, 미포함은 디렉터리 버킷. */
function moduleKeyOf(path, byPath) {
    const joined = byPath?.get(path);
    if (joined !== undefined)
        return { key: joined, source: 'program-inventory' };
    const slash = path.indexOf('/');
    return { key: slash === -1 ? '(root)' : path.slice(0, slash), source: 'dir' };
}
function buildModules(commits, inventory) {
    const byPath = inventory
        ? new Map(inventory.programs.map((p) => [p.filePath, p.domain ?? '(도메인 미지정)']))
        : null;
    const acc = new Map();
    for (const c of commits) {
        for (const f of c.files) {
            // 생성물은 모듈 실적에서 제외(totals.generated 로 분리 표면화, 리뷰 C1).
            if (isGeneratedPath(f.path))
                continue;
            const { key, source } = moduleKeyOf(f.path, byPath);
            const mapKey = `${source}\x1f${key}`;
            let cur = acc.get(mapKey);
            if (!cur) {
                cur = { source, commits: new Set(), fileLines: new Map(), lines: 0 };
                acc.set(mapKey, cur);
            }
            cur.commits.add(c.sha);
            cur.fileLines.set(f.path, (cur.fileLines.get(f.path) ?? 0) + f.added + f.deleted);
            cur.lines += f.added + f.deleted;
        }
    }
    return [...acc.entries()]
        .map(([mapKey, v]) => ({
        key: mapKey.slice(mapKey.indexOf('\x1f') + 1),
        source: v.source,
        commits: v.commits.size,
        files: v.fileLines.size,
        linesChanged: v.lines,
        topFiles: [...v.fileLines.entries()]
            .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
            .slice(0, 3)
            .map(([path]) => path),
    }))
        // key 동일·동점에서도 결정론(리뷰 R4) — 도메인명과 디렉터리명이 겹칠 수 있어 source 로 최종 tie-break.
        .sort((a, b) => b.linesChanged - a.linesChanged || cmp(a.key, b.key) || cmp(a.source, b.source));
}
/** 윈도 커밋 집합의 합계 — 생성물 분리 포함(리뷰 C1). 현재/직전 윈도 공용(W6-b). */
function computeTotals(commits) {
    const fileSet = new Set();
    const genFileSet = new Set();
    const authorSet = new Set();
    let added = 0;
    let deleted = 0;
    let genAdded = 0;
    let genDeleted = 0;
    let merges = 0;
    for (const c of commits) {
        authorSet.add(c.author);
        if (c.isMerge)
            merges += 1;
        for (const f of c.files) {
            // 생성물 분리 집계(리뷰 C1) — churn 은 사실이지만 실적이 아니다.
            if (isGeneratedPath(f.path)) {
                genFileSet.add(f.path);
                genAdded += f.added;
                genDeleted += f.deleted;
            }
            else {
                fileSet.add(f.path);
                added += f.added;
                deleted += f.deleted;
            }
        }
    }
    return {
        commits: commits.length,
        mergeCommits: merges,
        authors: authorSet.size,
        files: fileSet.size,
        added,
        deleted,
        generated: { files: genFileSet.size, added: genAdded, deleted: genDeleted },
    };
}
/**
 * 실적 요약 조립(파일 기록 없음 — 호출자가 writeMapArtifact). 순수 함수:
 * 모든 입력은 주입, 시계 미사용 — 동일 입력 ⇒ byte 동일 출력.
 */
export function buildWorkSummary(inputs) {
    const { spec, collected, programInventory, rtmOverlay, docStates } = inputs;
    const ok = collected.kind === 'ok' ? collected : null;
    const range = resolveRange(spec, ok ? { sha: ok.headSha, dateIso: ok.headDateIso } : null);
    const inWindow = makeWindow(range);
    // range 모드는 수집기가 이미 rev-list 집합으로 좁혔다(시각 필터 없음).
    const selected = ok === null
        ? []
        : range.mode === 'range'
            ? ok.commits
            : inWindow === null
                ? []
                : ok.commits.filter((c) => inWindow(c.dateIso));
    const commits = [...selected].sort((a, b) => {
        const ta = Date.parse(a.dateIso);
        const tb = Date.parse(b.dateIso);
        return tb - ta || cmp(a.sha, b.sha);
    });
    // 직전 기간(W6-b) — git 가용 + 시각 윈도 해석 가능일 때만. 수집이 --since 로
    // 바운드된 경우 스크립트가 두 윈도를 덮게 확장한다(설계 §13).
    const prevRange = ok !== null ? resolvePreviousRange(range) : null;
    const prevWindow = prevRange !== null ? makeWindow(prevRange) : null;
    const prevCommits = ok !== null && prevWindow !== null ? ok.commits.filter((c) => prevWindow(c.dateIso)) : null;
    return WorkSummaryReportSchema.parse({
        schemaVersion: 1,
        gitCommit: ok?.headSha ?? null,
        range,
        commits,
        totals: computeTotals(commits),
        previous: prevRange === null || prevWindow === null || prevCommits === null
            ? null
            : {
                fromIso: prevRange.fromIso,
                toIso: prevRange.toIso,
                totals: computeTotals(prevCommits),
                rtmProgress: rtmOverlay === null ? null : scanRtmProgress(rtmOverlay, prevWindow),
                docProgress: docStates === null ? null : scanDocProgress(docStates, prevWindow),
            },
        modules: buildModules(commits, programInventory),
        // 윈도 미해석(git 불가한 weeks 모드)이면 원장이 있어도 집계 불가 — null degrade.
        rtmProgress: rtmOverlay === null || inWindow === null ? null : scanRtmProgress(rtmOverlay, inWindow),
        docProgress: docStates === null || inWindow === null ? null : scanDocProgress(docStates, inWindow),
        meta: {
            gitAvailable: ok !== null,
            gitStatus: collected.kind,
            prefix: ok?.prefix ?? '',
            moduleSource: programInventory ? 'program-inventory' : 'dir',
            generatedPatterns: [...GENERATED_PATH_PATTERNS],
        },
    });
}
//# sourceMappingURL=index.js.map