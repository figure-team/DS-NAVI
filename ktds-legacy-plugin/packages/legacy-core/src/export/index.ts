/**
 * HTML export (P4.4) 패키지 진입점.
 *
 * exportHtml: GeneratedDoc + DocMeta -> 결정론 minimal HTML(의존성 0, escape).
 * exportVaultHtml: WikiVault -> .html 파일 집합. escapeHtml: 손편 텍스트 escape.
 */
export { exportHtml, exportVaultHtml, escapeHtml } from './html.js'
