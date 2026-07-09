/** 표 신뢰도/근거 열 헤더(우리 생성물 형식) — ingest 시 진술에서 제외할 후보. */
const META_COLUMNS = new Set(['신뢰도', '근거', 'confidence', 'evidence']);
/** 셀 텍스트 정규화 — 백틱/굵게 마크 제거, 공백 정리. */
function cleanCell(s) {
    return s
        .replace(/`/g, '')
        .replace(/\*\*/g, '')
        .trim();
}
/** 마크다운 표 한 블록을 항목으로(헤더 인지, 신뢰도/근거 열 제외). */
function parseTable(lines, startIdx, category, out) {
    const header = lines[startIdx];
    const cols = header.split('|').slice(1, -1).map((c) => cleanCell(c));
    // 다음 줄이 구분선(--- )이어야 표.
    const sep = lines[startIdx + 1] ?? '';
    if (!/^\s*\|?\s*:?-{2,}/.test(sep))
        return startIdx;
    // 진술에 포함할 열 인덱스(첫 열=주제 제외, 메타 열 제외).
    const keepIdx = cols.map((c, i) => (i > 0 && !META_COLUMNS.has(c.toLowerCase()) && !META_COLUMNS.has(c) ? i : -1)).filter((i) => i >= 0);
    let i = startIdx + 2;
    for (; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('|'))
            break;
        const cells = line.split('|').slice(1, -1).map((c) => cleanCell(c));
        if (cells.length === 0 || cells.every((c) => c.length === 0))
            continue;
        const subject = cells[0] ?? '';
        if (subject.length === 0)
            continue;
        const statement = keepIdx.map((k) => cells[k] ?? '').filter((s) => s.length > 0).join(' / ');
        out.push({ category, subject, statement, sourceLine: i + 1 });
    }
    return i - 1;
}
/**
 * 한 정책서 마크다운을 PolicyItem[] 으로 파싱. category 는 호출자(파일명→카테고리)가 부여.
 */
export function parseExistingPolicy(markdown, category) {
    const out = [];
    const seen = new Set();
    // frontmatter(--- ... ---) 제거.
    const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 표 헤더(| a | b |) 후보.
        if (/^\s*\|.*\|\s*$/.test(line)) {
            const before = out.length;
            const end = parseTable(lines, i, category, out);
            if (out.length > before) {
                i = end;
                continue;
            }
        }
        // 불릿: `- 주제: 진술` / `- **주제**: 진술`.
        const m = line.match(/^\s*[-*]\s+(?:\*\*(.+?)\*\*|(.+?))\s*[:：]\s*(.+?)\s*$/);
        if (m) {
            const subject = cleanCell(m[1] ?? m[2] ?? '');
            const statement = cleanCell(m[3] ?? '');
            if (subject.length > 0)
                out.push({ category, subject, statement, sourceLine: i + 1 });
        }
    }
    // 주제 중복 제거(첫 항목 유지).
    return out.filter((it) => {
        const k = it.subject.toLowerCase();
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}
//# sourceMappingURL=ingest.js.map