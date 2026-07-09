/**
 * W4 위험 모듈 리포트 — 프로그램별 위험 점수(risk-report.json). 설계: RISK_REPORT_DESIGN.md.
 *
 * 점수 지표 5종(계산 근거 = 설계 §3, 문서 산출물 §산정기준에 사용자 노출):
 *  - 복잡도: 신규(complexity.ts, java AST). 비 java 는 미측정(null) — 표면화.
 *  - LOC: program-inventory 승계(wc -l 관례, 재계산 없음).
 *  - 변경빈도: churn.ts(git log --numstat, gitCommit 앵커 결정론). 랭킹 지표는
 *    커밋 수(빈도) — 변경 라인은 참고치로 병기.
 *  - 팬인: impact/reach.ts computeFanIn(강신호 엣지, distinct-source).
 *  - 팬아웃: 동일 강신호 엣지의 distinct-target(대칭 구현, 자기참조 제외).
 * 비점수 플래그: 미도달(slices.ownership 'unreached', W2 배치 진입점 반영 후 값) —
 * 도달성 스캐너가 뷰 forward 를 못 쫓는 한계(JSP 오탐)가 랭킹을 지배하지 않도록
 * 점수에서 제외하고 열·통계로만 표기(리뷰 C3). 데드코드 판정은 사람 확인.
 *
 * 정규화·합산(§3.3): 측정 집합 내 백분위 랭크(동점 평균 랭크) → 가중 합산.
 * 미측정 지표는 그 프로그램에서 **가중치 재정규화**(null 을 0 취급하면 jsp 가
 * 조직적으로 과소평가되는 왜곡 방지). 무분산 지표는 전 프로그램에서 제외(C2).
 * 등급은 상대 밴드(상위 10%/30%, C1). 동점 정렬 (score desc, filePath asc) 결정론.
 * 스코프: program-inventory 프로그램 중 type='test' 제외(제외 수 stats.excluded 표면화).
 * 한계(문서화): 복잡도·LOC 는 작업트리 파일 기준 — dirty 트리에선 gitCommit 앵커만으로
 * 재현 불가(clean 트리 전제). shallow clone 은 churn 수집기가 감지해 null degrade.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProgramTypeSchema } from '../program-inventory/index.js';
import { computeFanIn } from '../impact/reach.js';
import { STRONG_EDGE_KINDS } from '../impact/types.js';
import { cmp } from '../utils/cmp.js';
import { measureJavaComplexity } from './complexity.js';
/** W8 캐시 섹션 salt — countJavaComplexity 의 계상 규칙이 바뀌면 bump. */
const COMPLEXITY_SALT = 'v1';
export { countJavaComplexity, measureJavaComplexity } from './complexity.js';
export { collectGitChurn } from './churn.js';
/** `.spec/map/` 위험 리포트 파일명. */
export const RISK_REPORT_FILENAME = 'risk-report.json';
/**
 * 지표 가중치(§3.3) — 리포트 meta 에 그대로 기록(재현 근거). **휴리스틱 seam** —
 * 점수는 서수(순위)로만 읽는다(보정된 절대치 아님, 리뷰 C7). 복잡도·변경빈도가 주
 * (각 0.25): 레거시 위험의 1차 신호. 구조 결합(팬인/팬아웃)과 규모(LOC)는 보조.
 * 미도달은 점수 지표가 아니다(리뷰 C3) — 도달성 스캐너가 뷰 forward(JSP 등)를
 * 추적하지 못하는 한계의 반사가 랭킹 상단을 지배하는 것을 막기 위해 비점수
 * 플래그(metrics.unreached 열)로만 표기한다. 합이 1 일 필요 없음(가중합/가중치합).
 */
export const RISK_WEIGHTS = {
    complexity: 0.25,
    churn: 0.25,
    loc: 0.15,
    fanIn: 0.15,
    fanOut: 0.1,
};
/** md 문서(Top N 절단) 기본값 — json items 는 항상 전수. */
export const RISK_DEFAULT_TOP_N = 20;
export const RiskGradeSchema = z.enum(['상', '중', '하']);
export const RiskItemSchema = z.object({
    /** program-inventory 의 안정 id 승계(PGM-*). */
    programId: z.string(),
    name: z.string(),
    filePath: z.string(),
    type: ProgramTypeSchema,
    layer: z.string(),
    domain: z.string().nullable(),
    /** 원시 지표 — null = 미측정([미확인], notes 에 사유). */
    metrics: z.object({
        loc: z.number().int().nonnegative(),
        complexity: z.number().int().nonnegative().nullable(),
        fanIn: z.number().int().nonnegative(),
        fanOut: z.number().int().nonnegative(),
        churnCommits: z.number().int().nonnegative().nullable(),
        churnLines: z.number().int().nonnegative().nullable(),
        unreached: z.boolean(),
    }),
    /** 백분위(0~1, 소수 4자리) — null = 미측정. 무분산 지표도 값은 기록(0.5). */
    normalized: z.object({
        loc: z.number(),
        complexity: z.number().nullable(),
        fanIn: z.number(),
        fanOut: z.number(),
        churn: z.number().nullable(),
    }),
    /** 가중 합산(측정·유분산 지표만, 가중치 재정규화) 0~1 — 서수 해석 전용. */
    score: z.number(),
    /** 프로젝트 내 상대 밴드(점수 순위 재인코딩, 리뷰 C1) — 절대 품질 판정 아님. */
    grade: RiskGradeSchema,
    /** 주요 요인 — 점수에 기여한 정규화값 상위 2개 지표 키(0·무분산 제외), (값 desc, 키 asc). */
    factors: z.array(z.string()),
    /** [미확인] 마킹 등 — 정렬. */
    notes: z.array(z.string()),
});
export const RiskReportSchema = z.object({
    schemaVersion: z.literal(1),
    /** 결정론 앵커 — census.gitCommit(churn 이력의 고정점). */
    gitCommit: z.string().nullable(),
    meta: z.object({
        weights: z.object({
            complexity: z.number(),
            churn: z.number(),
            loc: z.number(),
            fanIn: z.number(),
            fanOut: z.number(),
        }),
        /** 팬인/팬아웃에 계상한 엣지 종류(강신호, impact 관례와 동일). */
        edgeKinds: z.array(z.string()),
        /** false = git 불가/shallow clone — 전 항목 churn 미측정. */
        churnAvailable: z.boolean(),
        /**
         * 무분산(전 측정값 동일) 지표 — 랭킹 변별 기여가 0 이라 가중합에서 제외했다
         * (리뷰 C2: 단일 벤더링 커밋 등에서 churn 이 전부 같으면 "측정됨"이 신호를
         * 담은 것처럼 읽히는 착시 방지). 정렬됨.
         */
        degenerateMetrics: z.array(z.string()),
        topN: z.number().int().positive(),
    }),
    stats: z.object({
        /** 랭킹 대상 프로그램 수(test 제외 후). */
        programs: z.number().int().nonnegative(),
        /** 침묵 누락 방지 — 랭킹에서 제외한 부류 카운트. */
        excluded: z.object({ test: z.number().int().nonnegative() }),
        /** 지표별 측정 커버리지(미측정 = programs - measured). */
        measured: z.object({
            complexity: z.number().int().nonnegative(),
            churn: z.number().int().nonnegative(),
        }),
        /**
         * 복잡도 미측정 분해(확장자별, ext asc) — "비 java" 뭉뚱그림이 kotlin 같은
         * 1급 언어의 침묵 누락을 가리지 않게 표면화(리뷰 C8).
         */
        complexityUnmeasured: z.array(z.object({ ext: z.string(), count: z.number().int().nonnegative() })),
        unreached: z.number().int().nonnegative(),
    }),
    /** 전 프로그램(랭킹 대상 전수) — Top N 절단은 문서 렌더에서만. */
    items: z.array(RiskItemSchema),
});
const round4 = (x) => Math.round(x * 10000) / 10000;
/** 정렬 배열에서 target 미만/이하 원소 수(이진 탐색) — O(n²) 회피(리뷰 R8). */
function countBelow(sorted, target, inclusive) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < target || (inclusive && sorted[mid] === target))
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
/**
 * 백분위 랭크(동점 평균): (미만 수 + (동수-1)/2) / (n-1). n<=1 → 0.
 * null(미측정)은 랭크 집합에서 제외하고 null 을 돌려준다.
 * degenerate = 측정값이 존재하는데 전부 동일(분산 0) — 이 지표는 랭킹 변별 기여가
 * 없으므로 호출자가 가중합에서 제외한다(값 자체는 0.5 상수로 기록, 리뷰 C2).
 */
function percentileRanks(values) {
    const measured = values.filter((v) => v !== null).sort((a, b) => a - b);
    const n = measured.length;
    const degenerate = n > 0 && measured[0] === measured[n - 1];
    const ranks = values.map((v) => {
        if (v === null)
            return null;
        if (n <= 1)
            return 0;
        const below = countBelow(measured, v, false);
        const equal = countBelow(measured, v, true) - below;
        return round4((below + (equal - 1) / 2) / (n - 1));
    });
    return { ranks, degenerate };
}
/**
 * 등급 = 프로젝트 내 상대 밴드(점수 순위 재인코딩, 리뷰 C1) — 상 = 상위 10%(최소 1),
 * 중 = 상위 30%, 하 = 나머지. 동점은 묶음 선두 순위를 공유(상향). 백분위 가중평균은
 * 0.5 로 수축해 고정 임계(0.66/0.33)로는 변별이 없다(실측 상1·중51·하0)는 비평 반영.
 */
function assignGrades(sortedScores) {
    const n = sortedScores.length;
    const topCount = Math.max(1, Math.ceil(n * 0.1));
    const midCount = Math.max(topCount, Math.ceil(n * 0.3));
    const grades = [];
    let groupStart = 0;
    for (let i = 0; i < n; i++) {
        if (i > 0 && sortedScores[i] !== sortedScores[i - 1])
            groupStart = i;
        grades.push(groupStart < topCount ? '상' : groupStart < midCount ? '중' : '하');
    }
    return grades;
}
/** 팬아웃 — computeFanIn 의 대칭(source 별 distinct-target, 자기참조 제외). */
function computeFanOut(edges, allowedKinds) {
    const targets = new Map();
    for (const e of edges) {
        if (!allowedKinds.has(e.kind))
            continue;
        if (e.source === e.target)
            continue;
        let set = targets.get(e.source);
        if (!set) {
            set = new Set();
            targets.set(e.source, set);
        }
        set.add(e.target);
    }
    const out = new Map();
    for (const [f, set] of targets)
        out.set(f, set.size);
    return out;
}
/** 프로젝트 전체 위험 리포트(파일 기록 없음 — 호출자가 writeMapArtifact). */
export async function buildRiskReport(projectRoot, inputs, cache) {
    const { census, edges, slices, programInventory, churn } = inputs;
    // W8: 파일단위 복잡도 캐시 — {c:null} = 판독/파싱 실패(노트 재생). 백분위·등급은 매회 재계산.
    const cxSec = cache?.section('complexity', COMPLEXITY_SALT);
    const allowedKinds = new Set(STRONG_EDGE_KINDS);
    const ranked = programInventory.programs.filter((p) => p.type !== 'test');
    const excludedTest = programInventory.programs.length - ranked.length;
    const unreachedSet = new Set(slices.ownership.filter((o) => o.status === 'unreached').map((o) => o.relPath));
    const fanInMap = computeFanIn(edges.edges, allowedKinds);
    const fanOutMap = computeFanOut(edges.edges, allowedKinds);
    // 원시 지표 수집(프로그램 순서 = ranked 순서 유지 — 정규화 배열 인덱스 대응).
    const rows = await Promise.all(ranked.map(async (p) => {
        const notes = [];
        let complexity = null;
        if (p.filePath.endsWith('.java')) {
            const hit = cxSec?.get(p.filePath);
            if (hit !== undefined) {
                complexity = hit.c;
                if (hit.c === null)
                    notes.push('[미확인] 복잡도 미측정(판독/파싱 실패)');
            }
            else {
                try {
                    complexity = await measureJavaComplexity(readFileSync(join(projectRoot, p.filePath), 'utf8'));
                    cxSec?.put(p.filePath, { c: complexity });
                }
                catch {
                    notes.push('[미확인] 복잡도 미측정(판독/파싱 실패)');
                    cxSec?.put(p.filePath, { c: null });
                }
            }
        }
        else {
            const ext = p.filePath.includes('.') ? p.filePath.slice(p.filePath.lastIndexOf('.') + 1) : '?';
            notes.push(`[미확인] 복잡도 미측정(${ext} — java 전용 근사)`);
        }
        let churnCommits = null;
        let churnLines = null;
        if (churn === null) {
            notes.push('[미확인] 변경빈도 미측정(git 이력 없음)');
        }
        else {
            // 이력에 없는 파일(미커밋 신규)은 0 — 사실 그대로.
            const c = churn.get(p.filePath);
            churnCommits = c?.commits ?? 0;
            churnLines = c?.linesChanged ?? 0;
        }
        return {
            p,
            notes,
            loc: p.loc,
            complexity,
            fanIn: fanInMap.get(p.filePath) ?? 0,
            fanOut: fanOutMap.get(p.filePath) ?? 0,
            churnCommits,
            churnLines,
            unreached: unreachedSet.has(p.filePath),
        };
    }));
    const normLoc = percentileRanks(rows.map((r) => r.loc));
    const normComplexity = percentileRanks(rows.map((r) => r.complexity));
    const normFanIn = percentileRanks(rows.map((r) => r.fanIn));
    const normFanOut = percentileRanks(rows.map((r) => r.fanOut));
    const normChurn = percentileRanks(rows.map((r) => r.churnCommits));
    const degenerate = new Set();
    if (normLoc.degenerate)
        degenerate.add('loc');
    if (normComplexity.degenerate)
        degenerate.add('complexity');
    if (normFanIn.degenerate)
        degenerate.add('fanIn');
    if (normFanOut.degenerate)
        degenerate.add('fanOut');
    if (normChurn.degenerate)
        degenerate.add('churn');
    const items = rows.map((r, i) => {
        const normalized = {
            loc: normLoc.ranks[i] ?? 0,
            complexity: normComplexity.ranks[i],
            fanIn: normFanIn.ranks[i] ?? 0,
            fanOut: normFanOut.ranks[i] ?? 0,
            churn: normChurn.ranks[i],
        };
        // 측정 + 유분산 지표만 가중 합산(가중치 재정규화 — null 을 0 취급하면 jsp 가
        // 조직적으로 과소평가, 무분산을 포함하면 상수 오프셋이 변별 없는 점수를 올린다).
        const scored = [];
        const push = (k, v) => {
            if (v !== null && !degenerate.has(k))
                scored.push([k, v]);
        };
        push('loc', normalized.loc);
        push('fanIn', normalized.fanIn);
        push('fanOut', normalized.fanOut);
        push('complexity', normalized.complexity);
        push('churn', normalized.churn);
        const weightSum = scored.reduce((s, [k]) => s + RISK_WEIGHTS[k], 0);
        // 유효 지표 0(전 지표 미측정/무분산)이면 score 0 — NaN 방지 + 사유 표면화.
        const notes = [...r.notes];
        if (scored.length === 0)
            notes.push('[미확인] 유효 지표 없음(전 지표 미측정/무분산)');
        const score = scored.length === 0
            ? 0
            : round4(scored.reduce((s, [k, v]) => s + RISK_WEIGHTS[k] * v, 0) / weightSum);
        const factors = scored
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
            .slice(0, 2)
            .map(([k]) => k);
        return {
            programId: r.p.id,
            name: r.p.name,
            filePath: r.p.filePath,
            type: r.p.type,
            layer: r.p.layer,
            domain: r.p.domain,
            metrics: {
                loc: r.loc,
                complexity: r.complexity,
                fanIn: r.fanIn,
                fanOut: r.fanOut,
                churnCommits: r.churnCommits,
                churnLines: r.churnLines,
                unreached: r.unreached,
            },
            normalized,
            score,
            grade: '하', // 정렬 후 상대 밴드로 재부여(아래).
            factors,
            notes: notes.sort(cmp),
        };
    });
    items.sort((a, b) => b.score - a.score || cmp(a.filePath, b.filePath));
    const grades = assignGrades(items.map((it) => it.score));
    for (let i = 0; i < items.length; i++)
        items[i].grade = grades[i];
    // 복잡도 미측정 확장자 분해(C8) — kotlin 처럼 문법 미탑재 1급 언어의 침묵 누락 방지.
    const unmeasuredByExt = new Map();
    for (const it of items) {
        if (it.metrics.complexity !== null)
            continue;
        const fp = it.filePath;
        const ext = fp.includes('.') ? fp.slice(fp.lastIndexOf('.') + 1) : '?';
        unmeasuredByExt.set(ext, (unmeasuredByExt.get(ext) ?? 0) + 1);
    }
    return RiskReportSchema.parse({
        schemaVersion: 1,
        gitCommit: census.gitCommit,
        meta: {
            weights: { ...RISK_WEIGHTS },
            edgeKinds: [...STRONG_EDGE_KINDS].sort(cmp),
            churnAvailable: churn !== null,
            degenerateMetrics: [...degenerate].sort(cmp),
            topN: RISK_DEFAULT_TOP_N,
        },
        stats: {
            programs: items.length,
            excluded: { test: excludedTest },
            measured: {
                complexity: items.filter((it) => it.metrics.complexity !== null).length,
                churn: items.filter((it) => it.metrics.churnCommits !== null).length,
            },
            complexityUnmeasured: [...unmeasuredByExt.entries()]
                .map(([ext, count]) => ({ ext, count }))
                .sort((a, b) => cmp(a.ext, b.ext)),
            unreached: items.filter((it) => it.metrics.unreached).length,
        },
        items,
    });
}
//# sourceMappingURL=index.js.map