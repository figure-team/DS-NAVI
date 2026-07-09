/**
 * batch-jobs.json 빌더(W2 P2-c) — routes.batchEntries 를 배치 인벤토리로 승격한다.
 *
 * - id: 내용 파생 `BAT-<sha256 8hex>`(trigger|handler|schedule|filePath) — 재스캔 안정(W1 교훈).
 * - reachableFiles: handlerFile(없으면 filePath)에서 파일 엣지 BFS 도달 수(루트 포함) —
 *   "이 배치가 건드리는 코드 범위"의 결정론 요약.
 * - unresolvedHandler: XML 계열(quartz/task-xml/spring-batch)인데 잡 클래스 파일 해석 실패
 *   — 정의서에 [미확인]으로 표면화. shell/crontab 은 프로젝트 내 핸들러 개념이 없어 제외.
 * - suspectSignals: *Job/*Batch/*Tasklet 명명 java 파일인데 어떤 엔트리에도 안 물림 —
 *   "배치 0건/N건"이 놓친 잡의 존재 가능성 지표(테스트 경로 제외, W1 교훈).
 *
 * 결정론: jobs (trigger, handler, file, line) 정렬, stats/suspects 정렬. 0건도 기록.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from '../config/index.js';
import { DEFAULT_DEPTH_CAP } from '../domain-map/slices.js';
/** `.spec/map/` 배치 인벤토리 파일명. */
export const BATCH_JOBS_FILENAME = 'batch-jobs.json';
export const BatchJobSchema = z.object({
    id: z.string(),
    /** handler 기반 표기 초안(사람 확정 전) — crontab/shell 은 실행체 basename. */
    name: z.string(),
    trigger: z.string(),
    schedule: z.string().nullable(),
    handler: z.string().nullable(),
    handlerFile: z.string().nullable(),
    unresolvedHandler: z.boolean(),
    evidence: z.object({ file: z.string(), line: z.number().int() }),
    /**
     * 도달성 BFS 루트(handlerFile ?? filePath) — slices.json 의 slice.root 와 조인하는 키.
     * P3(프로그램 목록)가 배치 경계 멤버 파일 목록을 slices 에서 얻을 때 사용.
     */
    sliceRoot: z.string(),
    /** sliceRoot 에서 파일 엣지 BFS 도달 수(루트 포함, slices 와 동일 depthCap). */
    reachableFiles: z.number().int().nonnegative(),
    notes: z.array(z.string()),
});
export const BatchJobsReportSchema = z.object({
    schemaVersion: z.literal(1),
    gitCommit: z.string().nullable(),
    jobs: z.array(BatchJobSchema),
    stats: z.object({
        total: z.number().int().nonnegative(),
        byTrigger: z.array(z.object({ trigger: z.string(), count: z.number().int().nonnegative() })),
        unresolvedHandlers: z.number().int().nonnegative(),
    }),
    suspectSignals: z.object({
        count: z.number().int().nonnegative(),
        samples: z.array(z.object({ file: z.string(), kind: z.string() })),
    }),
});
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** XML 계열(핸들러 해석이 기대되는) 트리거. */
const XML_TRIGGERS = new Set(['quartz', 'task-xml', 'spring-batch']);
const SUSPECT_SAMPLE_CAP = 10;
/** 파일 엣지 BFS 도달 수(루트 포함) — slices 와 동일 depthCap(두 '도달' 숫자의 의미 정합). */
function reachableCount(root, adj) {
    const reached = new Set([root]);
    let frontier = [root];
    let depth = 0;
    while (frontier.length > 0 && depth < DEFAULT_DEPTH_CAP) {
        const next = [];
        for (const cur of frontier) {
            for (const t of adj.get(cur) ?? []) {
                if (reached.has(t))
                    continue;
                reached.add(t);
                next.push(t);
            }
        }
        frontier = next;
        depth++;
    }
    return reached.size;
}
/** crontab/shell 실행체 표기 초안 — 명령 첫 토큰의 basename(운영자 가독). */
function commandBasename(command) {
    const first = command.trim().split(/\s+/)[0] ?? command;
    const seg = first.split('/');
    return seg[seg.length - 1] || first;
}
/** 트리거 → id 태그(W1 IF-<PROTO>- 관례 정합 — 카테고리 육안 스캔 가능). */
const TRIGGER_TAG = {
    scheduled: 'SCHED',
    main: 'MAIN',
    quartz: 'QUARTZ',
    'task-xml': 'TASK',
    'spring-batch': 'SB',
    'quartz-java': 'QJAVA',
    executor: 'EXEC',
    timer: 'TIMER',
    shell: 'SHELL',
    crontab: 'CRON',
};
/**
 * batchEntries + edges + census → BatchJobsReport(파일 기록 없음).
 * @param projectRoot 구조 기반 의심신호(java 파일 판독)와 억제 config 로드에 사용.
 */
export function buildBatchJobs(projectRoot, batchEntries, edges, census) {
    const adj = new Map();
    for (const e of edges.edges) {
        const list = adj.get(e.source) ?? [];
        list.push(e.target);
        adj.set(e.source, list);
    }
    // 동일 seed(완전 중복 정의: 같은 파일·핸들러·스케줄)가 여러 번 나오면 연번을 붙여
    // id 유일성을 지킨다 — line 을 seed 에 넣지 않는 이유는 재스캔 안정성(행 이동 무관).
    const seedCounts = new Map();
    const jobs = batchEntries.map((b) => {
        const handlerFile = b.handlerFile ?? null;
        const baseSeed = `${b.trigger}|${b.handler ?? ''}|${b.schedule ?? ''}|${b.filePath}`;
        const n = (seedCounts.get(baseSeed) ?? 0) + 1;
        seedCounts.set(baseSeed, n);
        const seed = n === 1 ? baseSeed : `${baseSeed}|dup${n}`;
        const root = handlerFile ?? b.filePath;
        const entryTail = b.entryId.slice(b.entryId.indexOf('#') + 1);
        const name = b.trigger === 'spring-batch'
            ? entryTail // 잡 id 가 업무명 — handler(실행체 빈)보다 우선.
            : b.trigger === 'crontab' || b.trigger === 'shell'
                ? commandBasename(b.handler ?? entryTail) // 명령 전문 대신 실행체 basename.
                : (b.handler ?? entryTail);
        return {
            id: `BAT-${TRIGGER_TAG[b.trigger] ?? b.trigger.toUpperCase()}-${createHash('sha256').update(seed).digest('hex').slice(0, 8)}`,
            name,
            trigger: b.trigger,
            schedule: b.schedule,
            handler: b.handler,
            handlerFile,
            unresolvedHandler: XML_TRIGGERS.has(b.trigger) && handlerFile === null,
            evidence: { file: b.filePath, line: b.line },
            sliceRoot: root,
            reachableFiles: reachableCount(root, adj),
            notes: [...b.notes].sort(cmp),
        };
    });
    jobs.sort((a, b) => cmp(a.trigger, b.trigger) ||
        cmp(a.handler ?? '￿', b.handler ?? '￿') ||
        cmp(a.evidence.file, b.evidence.file) ||
        a.evidence.line - b.evidence.line);
    const trigCounts = new Map();
    for (const j of jobs)
        trigCounts.set(j.trigger, (trigCounts.get(j.trigger) ?? 0) + 1);
    const byTrigger = [...trigCounts.entries()]
        .map(([trigger, count]) => ({ trigger, count }))
        .sort((a, b) => cmp(a.trigger, b.trigger));
    // 의심 신호 — 어떤 엔트리(파일/핸들러)에도 안 물린 잡 후보.
    //  · job-structure: 배치 API 사용 흔적(org.quartz / QuartzJobBean / JobExecutionContext /
    //    springframework.batch) — 명명 관례가 없는 레거시에서도 걸리는 구조 신호(1급).
    //  · job-named-class: *Job/*Batch/*Tasklet 명명 관례(2급, 위양성 가능 — 예: DeptJob=직무).
    //  억제: understanding.config.json `batchScan.ignoreSuspects`(relPath 정확 일치)로
    //  확인 완료된 위양성을 재발 없이 잠재운다(W1 interfaceScan.clients seam 과 동일 철학).
    const covered = new Set();
    for (const j of jobs) {
        covered.add(j.evidence.file);
        if (j.handlerFile)
            covered.add(j.handlerFile);
    }
    const ignore = new Set(loadConfig(projectRoot)?.batchScan?.ignoreSuspects ?? []);
    const isTestPath = (p) => p.split('/').some((seg) => seg === 'test' || seg === 'tests');
    const STRUCTURE_RE = /org\.quartz|QuartzJobBean|JobExecutionContext|springframework\.batch/;
    const suspects = [];
    for (const f of census.files) {
        if (f.lang !== 'java' || covered.has(f.relPath) || isTestPath(f.relPath) || ignore.has(f.relPath))
            continue;
        let structural = false;
        try {
            structural = STRUCTURE_RE.test(readFileSync(join(projectRoot, f.relPath), 'utf8'));
        }
        catch {
            // 판독 실패 파일은 구조 신호 판단 불가 — 명명 신호만 적용.
        }
        if (structural)
            suspects.push({ file: f.relPath, kind: 'job-structure' });
        else if (/(Job|Batch|Tasklet)\.java$/.test(f.relPath))
            suspects.push({ file: f.relPath, kind: 'job-named-class' });
    }
    suspects.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.file, b.file));
    return BatchJobsReportSchema.parse({
        schemaVersion: 1,
        gitCommit: census.gitCommit,
        jobs,
        stats: {
            total: jobs.length,
            byTrigger,
            unresolvedHandlers: jobs.filter((j) => j.unresolvedHandler).length,
        },
        suspectSignals: { count: suspects.length, samples: suspects.slice(0, SUSPECT_SAMPLE_CAP) },
    });
}
//# sourceMappingURL=report.js.map