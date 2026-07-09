/** XML 주석을 공백으로 치환(줄 번호 보존). */
function stripXmlComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}
/** SQL 라인 주석(`-- …`)을 공백으로 치환(줄 번호 보존). */
function stripSqlComments(text) {
    return text
        .replace(/--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}
function lineAt(text, index) {
    let line = 1;
    for (let i = 0; i < index && i < text.length; i++) {
        if (text[i] === '\n')
            line++;
    }
    return line;
}
/**
 * `FROM|JOIN|INTO|UPDATE <table>@<link>` 참조 + 콤마 조인 후속(`FROM a@l1, b@l2`).
 * 콤마 규칙은 `식별자@식별자` 형태에만 걸려 이메일 등 일반 텍스트와 충돌하지 않는다
 * (XML 주석은 사전 제거, SQL 문자열 밖 `x@y` 콤마 나열은 SQL 에서 조인 목록뿐).
 */
const DBLINK_REF_RE = /(?:\b(?:FROM|JOIN|INTO|UPDATE)\s+|,\s*)([A-Za-z_][\w$#.]*)@([A-Za-z_][\w$#.]*)/gi;
/** `CREATE [PUBLIC] DATABASE LINK <name>` DDL. */
const DBLINK_DDL_RE = /\bCREATE\s+(?:PUBLIC\s+)?DATABASE\s+LINK\s+([A-Za-z_"][\w$#."]*)/gi;
const PROTOCOL = 'db-link';
/**
 * 단일 텍스트 파일(mapper XML / .sql)에서 DB link 신호를 추출한다.
 * @param lang census lang ('xml' | 'sql')
 */
export function scanDbLinks(rawText, filePath, lang) {
    const text = lang === 'xml' ? stripXmlComments(rawText) : stripSqlComments(rawText);
    const out = [];
    const seen = new Set();
    let m;
    DBLINK_REF_RE.lastIndex = 0;
    while ((m = DBLINK_REF_RE.exec(text)) !== null) {
        const table = m[1];
        const link = m[2];
        const line = lineAt(text, m.index);
        const key = `${line}|${link}|${table}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({
            protocol: PROTOCOL,
            direction: 'outbound',
            clientType: 'dblink',
            endpointRaw: `${table}@${link}`,
            dataHint: null,
            file: filePath,
            line,
            symbol: link,
        });
    }
    DBLINK_DDL_RE.lastIndex = 0;
    while ((m = DBLINK_DDL_RE.exec(text)) !== null) {
        const link = m[1].replace(/"/g, '');
        const line = lineAt(text, m.index);
        const key = `${line}|ddl|${link}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({
            protocol: PROTOCOL,
            direction: 'outbound',
            clientType: 'dblink(DDL)',
            endpointRaw: link,
            dataHint: null,
            file: filePath,
            line,
            symbol: link,
        });
    }
    return out;
}
//# sourceMappingURL=text-scan.js.map