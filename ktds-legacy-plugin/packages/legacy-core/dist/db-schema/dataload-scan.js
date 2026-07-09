/**
 * dataload 정적 파서(Tier 2) — INSERT INTO … VALUES … 를 정규식으로 파싱.
 *
 * 공통코드/상태/요율 테이블의 실제 데이터 행이 정책값의 결정론 근거다(상태값·과금 정책).
 * 컬럼 목록이 명시되면 그대로, 없으면 columns=null 로 두고 extract 가 DDL 컬럼 순서로 매핑.
 *
 * 결정론: 등장 순서 보존(라인 1-기반). 한 INSERT 가 여러 VALUES 튜플을 가지면 각 행으로 전개.
 */
import { lineAt, bareIdent, unquote, splitTopLevel, matchParen } from './sql-util.js';
/** 한 .sql 소스에서 INSERT 행 추출(등장 순서). */
export function extractDataloadFromSource(source) {
    const rows = [];
    const re = /INSERT\s+(?:IGNORE\s+)?INTO\s+([`"[\]\w.]+)\s*(\([^)]*\))?\s*VALUES\s*/gi;
    let m;
    while ((m = re.exec(source)) !== null) {
        const table = bareIdent(m[1]);
        const columns = m[2] ? splitTopLevel(m[2].slice(1, -1)).map((c) => bareIdent(c)) : null;
        // VALUES 뒤의 튜플들을 ';' 까지 순회.
        let i = re.lastIndex;
        while (i < source.length) {
            // 다음 '(' 까지 공백/콤마만 허용.
            while (i < source.length && /[\s,]/.test(source[i]))
                i++;
            if (source[i] !== '(')
                break;
            const close = matchParen(source, i);
            if (close < 0)
                break;
            const inner = source.slice(i + 1, close);
            const values = splitTopLevel(inner).map((v) => normalizeValue(v));
            rows.push({ table, columns, values, line: lineAt(source, i) });
            i = close + 1;
            // 튜플 뒤가 ';' 이면 이 INSERT 종료.
            let j = i;
            while (j < source.length && /\s/.test(source[j]))
                j++;
            if (source[j] === ';')
                break;
        }
        re.lastIndex = i;
    }
    return rows;
}
/** 값 리터럴 정규화 — 문자열은 따옴표 해제, NULL/숫자/함수는 원문 유지. */
function normalizeValue(raw) {
    const t = raw.trim();
    if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'")
        return unquote(t);
    return t;
}
//# sourceMappingURL=dataload-scan.js.map