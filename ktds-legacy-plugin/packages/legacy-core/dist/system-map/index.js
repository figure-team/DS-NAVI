/**
 * system-map.json 빌더 (WORK_MAP_DESIGN §5) — 시스템 구성도 랜딩의 "타 시스템 연동"
 * 패널이 소비하는 대시보드 브리지. 재스캔 없이 scan 산출물 3종을 조인만 한다:
 *   interfaces.json → 송신/수신 연계 요약(+suspect 커버리지 경고)
 *   db-schema.json  → 벤더/내장 여부/테이블 수
 *   batch-jobs.json → 잡 수/요약
 *
 * 정직성 규약: 0건도 기록한다 — scanned=true 가 "스캔했고 없음"의 증거다
 * (파일 부재 = 미스캔 degrade 와 구분, impact-overlay 와 같은 위치 `.understand-anything/`).
 * 결정론: 모든 배열 정렬, 타임스탬프 없음 → 동일 commit 재실행 byte-diff=0.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { stableJson, uaDir } from '../domain-map/persist.js';
import { cmp } from '../utils/cmp.js';
export const SYSTEM_MAP_FILENAME = 'system-map.json';
/** 연계 1건 요약 — 정의서(IF_ID) 참조가 가능하도록 안정 id 를 유지한다. */
export const SystemMapInterfaceSchema = z.object({
    id: z.string(),
    protocol: z.string(),
    /** 해석된 엔드포인트(없으면 raw, 그것도 없으면 null = [미확인]). */
    endpoint: z.string().nullable(),
    unresolved: z.boolean(),
});
export const SystemMapSchema = z.object({
    schemaVersion: z.literal(1),
    generatedFromCommit: z.string().nullable(),
    interfaces: z.object({
        /** interfaces.json 존재 = 스캔 수행됨(0건은 음성이지 미탐지가 아님). */
        scanned: z.literal(true),
        outbound: z.array(SystemMapInterfaceSchema),
        inbound: z.array(SystemMapInterfaceSchema),
        outboundCount: z.number().int().nonnegative(),
        inboundCount: z.number().int().nonnegative(),
        /** 카탈로그가 못 잡는 연계 가능성 지표(0건+suspect>0 = "없음" 아닌 "탐지 못함" 가능). */
        suspectCount: z.number().int().nonnegative(),
    }),
    /** DB 정보 — 테이블도 라이브 신호도 없으면 null(패널은 "없음 — 스캔 완료"). */
    db: z
        .object({
        /** 라이브 신호 벤더(dedup·정렬, 복수면 "/" 병기). 신호 없으면 null. */
        vendor: z.string().nullable(),
        /** 전 신호가 내장형(h2/hsqldb/sqlite/derby)일 때만 true — 외부 라이브 DB 아님. */
        embedded: z.boolean(),
        tier: z.string(),
        tableCount: z.number().int().nonnegative(),
        /** 테이블 이름(정렬) — 패널 툴팁/후속 확장용. */
        tables: z.array(z.string()),
    })
        .nullable(),
    batch: z.object({
        scanned: z.literal(true),
        jobCount: z.number().int().nonnegative(),
        /** 잡 요약(id 정렬) — 패널 툴팁/후속 확장용. */
        jobs: z.array(z.object({ id: z.string(), name: z.string(), trigger: z.string() })),
    }),
});
function toIface(item) {
    return {
        id: item.id,
        protocol: item.protocol,
        endpoint: item.endpoint.resolved ?? item.endpoint.raw,
        unresolved: item.unresolved,
    };
}
/** scan 산출물 3종 → system-map (파일 기록 없음 — 조인·요약만, 결정론). */
export function buildSystemMap(input) {
    const { interfaces, dbSchema, batchJobs } = input;
    const outbound = interfaces.items
        .filter((i) => i.direction === 'outbound')
        .map(toIface)
        .sort((a, b) => cmp(a.id, b.id));
    const inbound = interfaces.items
        .filter((i) => i.direction === 'inbound-extra')
        .map(toIface)
        .sort((a, b) => cmp(a.id, b.id));
    // 라이브 신호 벤더 — dedup·정렬 병기(단일 대표를 창작하지 않는다).
    const vendors = [...new Set(dbSchema.liveDbSignals.map((s) => s.vendor))].sort(cmp);
    const embedded = dbSchema.liveDbSignals.length > 0 && dbSchema.liveDbSignals.every((s) => s.embedded);
    const hasDbInfo = dbSchema.tables.length > 0 || dbSchema.liveDbSignals.length > 0;
    return SystemMapSchema.parse({
        schemaVersion: 1,
        generatedFromCommit: interfaces.gitCommit,
        interfaces: {
            scanned: true,
            outbound,
            inbound,
            outboundCount: outbound.length,
            inboundCount: inbound.length,
            suspectCount: interfaces.suspectSignals.count,
        },
        db: hasDbInfo
            ? {
                vendor: vendors.length > 0 ? vendors.join('/') : null,
                embedded,
                tier: dbSchema.tier,
                tableCount: dbSchema.tables.length,
                tables: dbSchema.tables.map((t) => t.name).sort(cmp),
            }
            : null,
        batch: {
            scanned: true,
            jobCount: batchJobs.jobs.length,
            jobs: batchJobs.jobs
                .map((j) => ({ id: j.id, name: j.name, trigger: j.trigger }))
                .sort((a, b) => cmp(a.id, b.id)),
        },
    });
}
/**
 * `.understand-anything/system-map.json` 기록(대시보드 fetch 경로 — impact-overlay 와
 * 동일한 브리지 위치). 기록한 절대 경로를 반환한다.
 */
export function writeSystemMap(projectRoot, systemMap) {
    const dir = uaDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, SYSTEM_MAP_FILENAME);
    writeFileSync(filePath, stableJson(systemMap), 'utf8');
    return filePath;
}
//# sourceMappingURL=index.js.map