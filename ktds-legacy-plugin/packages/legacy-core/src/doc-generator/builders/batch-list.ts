/**
 * 08_batch-list.md — 배치 작업 목록 빌더(D2).
 *
 * routes 추출의 batchEntries(scheduled/quartz/task-xml/main) 1건 = 표 1행.
 * 트리거/진입점/위치는 추출 사실 → CONFIRMED + 근거(file:line). 스케줄(cron)은 추출되면
 * 표기, 없으면 [추정]. BAT-001.. (entryId 정렬). 배치 진입점이 없으면 0행(정직, 합성 금지).
 */
import type { GeneratedDoc, TableRow } from '../types.js'
import type { DocInput } from './shared.js'

const COLUMNS = ['배치ID', '작업명', '트리거', '진입점', '스케줄', '설명']
const INFERRED_CELL = '[추정]'

export function buildBatchList(input: DocInput): GeneratedDoc {
  const entries = [...(input.routes?.batchEntries ?? [])].sort((a, b) =>
    a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
  )
  const rows: TableRow[] = entries.map((b, i): TableRow => ({
    cells: [
      `BAT-${String(i + 1).padStart(3, '0')}`,
      b.entryId,
      b.trigger,
      b.handler && b.handler.length > 0 ? b.handler : INFERRED_CELL,
      b.schedule && b.schedule.length > 0 ? b.schedule : INFERRED_CELL,
      '',
    ],
    confidence: 'CONFIRMED',
    evidence: [{ file: b.filePath, line: b.line }],
  }))

  return {
    docId: '08_batch-list',
    title: '배치 작업 목록',
    methodology: 'as-built',
    sections: [{ heading: '배치 작업 목록', key: 'batch-list', claims: [], table: { columns: COLUMNS, rows } }],
  }
}
