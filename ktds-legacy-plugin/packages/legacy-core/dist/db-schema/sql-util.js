/**
 * SQL 텍스트 파싱 공용 헬퍼(ddl-scan·dataload-scan 공유). SQL tree-sitter 그래머가
 * 없어 텍스트 기반으로 처리한다. 모든 함수는 결정론(부수효과 없음).
 */
/** 원문 index 의 1-기반 라인 번호. */
export function lineAt(source, index) {
    let line = 1;
    const end = Math.min(index, source.length);
    for (let i = 0; i < end; i++) {
        if (source.charCodeAt(i) === 10)
            line++;
    }
    return line;
}
/** 식별자 정규화 — 백틱/쌍따옴표/대괄호 제거 + 스키마 접두 제거. */
export function bareIdent(raw) {
    const last = raw.trim().split('.').pop() ?? raw;
    return last.replace(/[`"[\]]/g, '').trim();
}
/** SQL 문자열/값 리터럴 정규화 — '' 이스케이프 처리, 따옴표 제거. */
export function unquote(s) {
    const t = s.trim();
    if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
        return t.slice(1, -1).replace(/''/g, "'");
    }
    return t;
}
/** 괄호 깊이 0 의 콤마로 분할(따옴표 내부·중첩 괄호 무시). */
export function splitTopLevel(body) {
    const parts = [];
    let depth = 0;
    let inStr = false;
    let cur = '';
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (inStr) {
            cur += c;
            if (c === "'") {
                if (body[i + 1] === "'") {
                    cur += "'";
                    i++;
                }
                else
                    inStr = false;
            }
            continue;
        }
        if (c === "'") {
            inStr = true;
            cur += c;
        }
        else if (c === '(') {
            depth++;
            cur += c;
        }
        else if (c === ')') {
            depth--;
            cur += c;
        }
        else if (c === ',' && depth === 0) {
            parts.push(cur);
            cur = '';
        }
        else
            cur += c;
    }
    if (cur.trim().length > 0)
        parts.push(cur);
    return parts;
}
/** open '(' 인덱스에서 균형 잡힌 ')' 인덱스 반환(없으면 -1). 따옴표 무시. */
export function matchParen(source, openIdx) {
    let depth = 0;
    let inStr = false;
    for (let i = openIdx; i < source.length; i++) {
        const c = source[i];
        if (inStr) {
            if (c === "'") {
                if (source[i + 1] === "'")
                    i++;
                else
                    inStr = false;
            }
            continue;
        }
        if (c === "'")
            inStr = true;
        else if (c === '(')
            depth++;
        else if (c === ')') {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return -1;
}
/** 괄호 안 콤마 구분 식별자 목록 → 정규화 식별자 배열(ASC/DESC 제거). */
export function parenIdentList(inner) {
    return splitTopLevel(inner)
        .map((s) => bareIdent(s.replace(/\s+(ASC|DESC)\s*$/i, '')))
        .filter((s) => s.length > 0);
}
//# sourceMappingURL=sql-util.js.map