/**
 * 08_batch-list.md — 배치 작업 목록 빌더(D2).
 *
 * routes 추출의 batchEntries(scheduled/quartz/task-xml/main) 1건 = 표 1행.
 * 트리거/진입점/위치는 추출 사실 → CONFIRMED + 근거(file:line). 스케줄(cron)은 추출되면
 * 표기, 없으면 [추정]. BAT-001.. (entryId 정렬). 배치 진입점이 없으면 0행(정직, 합성 금지).
 */
import type { GeneratedDoc } from '../types.js';
import type { DocInput } from './shared.js';
export declare function buildBatchList(input: DocInput): GeneratedDoc;
//# sourceMappingURL=batch-list.d.ts.map