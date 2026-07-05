/**
 * export 패키지 진입점 — 전부 의존성 0·결정론.
 *
 * exportHtml: GeneratedDoc + DocMeta -> minimal HTML. escapeHtml: 손편 escape.
 * buildXlsxWorkbook(W7): 시트 -> xlsx(zip STORE·고정 타임스탬프·byte-identical).
 * docToSheets / rtmToSheets(W7): GeneratedDoc·RTM 원장 -> xlsx 시트.
 */
export { exportHtml, exportVaultHtml, escapeHtml } from './html.js'
export { buildXlsxWorkbook, sanitizeSheetNames } from './xlsx.js'
export type { XlsxSheet, XlsxRow } from './xlsx.js'
export { docToSheets, rtmToSheets } from './xlsx-docs.js'
export type { RtmLike } from './xlsx-docs.js'
