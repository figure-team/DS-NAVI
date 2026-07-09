/**
 * HTML export (P4.4) — GeneratedDoc -> 결정론 최소 HTML(의존성 0, 손편 escape).
 *
 * - 제목/상태/섹션 헤딩, claim 목록(신뢰도 태그 + file:line), 표(table) 렌더.
 * - HTML escape 는 손으로(& < > " ' ) — 새 의존성 없음.
 * - timestamp 없음(meta 는 호출자 주입). 동일 입력 -> byte-identical.
 */
import { confidenceTag } from '../doc-generator/claims.js';
/** HTML 텍스트 노드 escape — & < > " ' (손편, 의존성 0). 순서상 & 먼저. */
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/** Evidence -> 표시 텍스트(file:line 또는 file). escape 는 호출부에서. */
function evidenceText(e) {
    return e.line === null ? e.file : `${e.file}:${e.line}`;
}
/** claim 의 근거 목록 -> escape 된 <code> span(없으면 빈 문자열). */
function evidenceSpan(evidence) {
    if (evidence.length === 0)
        return '';
    const codes = evidence.map((e) => `<code>${escapeHtml(evidenceText(e))}</code>`).join(', ');
    return ` <span class="evidence">근거: ${codes}</span>`;
}
/** 단일 claim -> <li>[tag] text 근거 ...</li>(escape 적용). */
function renderClaimLi(claim) {
    const tag = `<span class="confidence">${escapeHtml(confidenceTag(claim.confidence))}</span>`;
    return `<li>${tag} ${escapeHtml(claim.text)}${evidenceSpan(claim.evidence)}</li>`;
}
/** 표(table) -> <table>...</table>(도메인 열 + 신뢰도 + 근거 열, escape 적용). */
function renderTable(table) {
    const header = [...table.columns, '신뢰도', '근거'];
    const lines = ['<table>', '<thead>', '<tr>'];
    for (const col of header)
        lines.push(`<th>${escapeHtml(col)}</th>`);
    lines.push('</tr>', '</thead>', '<tbody>');
    for (const row of table.rows) {
        lines.push('<tr>');
        for (const cell of row.cells)
            lines.push(`<td>${escapeHtml(cell)}</td>`);
        lines.push(`<td>${escapeHtml(confidenceTag(row.confidence))}</td>`);
        const ev = row.evidence.map((e) => `<code>${escapeHtml(evidenceText(e))}</code>`).join(', ');
        lines.push(`<td>${ev}</td>`);
        lines.push('</tr>');
    }
    lines.push('</tbody>', '</table>');
    return lines;
}
/** 섹션 본문 — 표가 있으면 표를, 없으면 claim 목록(<ul>). 빈 섹션은 _(항목 없음)_. */
function renderSectionBody(section) {
    if (section.table)
        return renderTable(section.table);
    if (section.claims.length === 0)
        return ['<p><em>(항목 없음)</em></p>'];
    return ['<ul>', ...section.claims.map(renderClaimLi), '</ul>'];
}
/** 한 섹션 -> <h2> + 선택 prose + 본문. */
function renderSection(section) {
    const lines = [`<h2>${escapeHtml(section.heading)}</h2>`];
    if (typeof section.prose === 'string' && section.prose.trim().length > 0) {
        lines.push(`<p>${escapeHtml(section.prose.trim())}</p>`);
    }
    lines.push(...renderSectionBody(section));
    return lines;
}
/**
 * GeneratedDoc + DocMeta -> 결정론 HTML 문서(완전한 <html>...). meta 는 호출자 주입
 * (timestamp 없음). 모든 텍스트는 escape 된다. 동일 입력 -> byte-identical.
 */
export function exportHtml(doc, meta) {
    const lines = [
        '<!DOCTYPE html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        `<title>${escapeHtml(doc.title)}</title>`,
        '</head>',
        '<body>',
        `<h1>${escapeHtml(doc.title)}</h1>`,
        `<p class="status">상태: ${escapeHtml(meta.status)} · docId: ${escapeHtml(meta.docId)}` +
            ` · methodology: ${escapeHtml(meta.methodology)}` +
            ` · sourceCommit: ${escapeHtml(meta.sourceCommit ?? 'null')}` +
            ` · evidenceRate: ${escapeHtml(String(meta.evidenceRate))}</p>`,
    ];
    for (const section of doc.sections)
        lines.push(...renderSection(section));
    lines.push('</body>', '</html>');
    return lines.join('\n') + '\n';
}
/**
 * WikiVault -> docId 별 HTML 파일 목록(.html). 각 파일은 vault 파일 path 의 .md 를
 * .html 로 치환. index.md 같은 마크다운 전용 파일은 minimal HTML 로 감싼다.
 * meta 는 호출자가 docId 별로 주입(WikiVault 자체는 meta 를 들고 있지 않음).
 *
 * 주: 이 헬퍼는 vault 의 GeneratedDoc 원본이 아니라 렌더된 마크다운만 받으므로,
 * 본문을 <pre> 로 안전하게 감싸 결정론·escape 를 보장한다(구조화 HTML 은 exportHtml 사용).
 */
export function exportVaultHtml(vault) {
    const files = vault.files.map((f) => ({
        path: f.path.replace(/\.md$/, '.html'),
        content: wrapMarkdownAsHtml(f.path, f.content),
    }));
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { files };
}
/** 마크다운 본문을 결정론 minimal HTML(<pre>)로 감싼다(escape 적용, timestamp 없음). */
function wrapMarkdownAsHtml(path, markdown) {
    const title = path.replace(/\.md$/, '');
    return ([
        '<!DOCTYPE html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        `<title>${escapeHtml(title)}</title>`,
        '</head>',
        '<body>',
        `<pre>${escapeHtml(markdown)}</pre>`,
        '</body>',
        '</html>',
    ].join('\n') + '\n');
}
//# sourceMappingURL=html.js.map