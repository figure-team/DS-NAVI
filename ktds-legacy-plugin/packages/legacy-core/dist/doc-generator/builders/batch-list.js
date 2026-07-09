const COLUMNS = ['배치ID', '작업명', '트리거', '진입점', '스케줄', '설명'];
const INFERRED_CELL = '[추정]';
export function buildBatchList(input) {
    const entries = [...(input.routes?.batchEntries ?? [])].sort((a, b) => a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0);
    const rows = entries.map((b, i) => ({
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
    }));
    return {
        docId: '08_batch-list',
        title: '배치 작업 목록',
        methodology: 'as-built',
        sections: [{ heading: '배치 작업 목록', key: 'batch-list', claims: [], table: { columns: COLUMNS, rows } }],
    };
}
//# sourceMappingURL=batch-list.js.map