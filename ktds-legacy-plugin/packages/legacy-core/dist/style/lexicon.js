/**
 * 표기 통일 렉시콘(lexicon) — fill-merge 가 산문 필드에 적용하는 **결정론 문자열 치환**.
 *
 * 위치: LLM 문체 계층의 마지막 보조 수단이다. 문맥 판단(번역투 재작성 등)은 팬아웃
 * 워크플로의 문체 검수 라운드(LLM) 몫이고, 여기는 **문맥 없이도 항상 옳은 표기**
 * (이중 피동·음차·맞춤법 통일)만 담는다. 오폭 위험이 있는 항목은 렉시콘에 넣지 않는다.
 *
 * doc-template.ts 와 동형 철학: 파서는 순수(IO 없음), 렉시콘 .md 는 플러그인 동봉
 * (`templates/style/ko-lexicon.md`) + 프로젝트 override — 로드는 호출자(.mjs)가 한다.
 *
 * 불변식: 인용 계열 서브트리(citations/evidence/preCite/snippet)는 **절대 건드리지
 * 않는다** — snippet 은 verbatim 근거라 한 글자만 바뀌어도 기계검증이 강등시킨다.
 */
/** 산문으로 취급해 치환을 적용하는 키(전 병합 스키마 공통 화이트리스트). */
const PROSE_KEYS = new Set(['text', 'statement', 'description', 'note', 'title', 'label', 'name']);
/** 이 키 아래 서브트리는 통째로 불변(근거 verbatim 계약). */
const SKIP_KEYS = new Set(['citations', 'evidence', 'preCite', 'snippet']);
/**
 * 렉시콘 .md 의 표(`| 금지 표기 | 통일 표기 | 비고? |`)를 파싱한다.
 * - 헤더 행(다음 줄이 구분선인 행)과 구분선 행은 건너뛴다.
 * - `(삭제)` 는 빈 문자열 치환(제거)이다.
 * - 긴 표기 우선 정렬 — 짧은 항목이 긴 항목의 부분 문자열을 먼저 먹는 것을 막는다.
 */
export function parseLexicon(md) {
    const lines = md.split(/\r?\n/);
    const isRow = (l) => l.trim().startsWith('|');
    const isSeparator = (l) => /^\|?\s*:?-{2,}/.test(l.trim().replace(/^\|/, '').trim());
    const entries = [];
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!isRow(line))
            continue;
        if (isSeparator(line))
            continue;
        // 헤더 행: 바로 다음 줄이 구분선.
        if (i + 1 < lines.length && isRow(lines[i + 1]) && isSeparator(lines[i + 1]))
            continue;
        const cells = line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
        if (cells.length < 2)
            continue;
        const from = cells[0];
        const to = cells[1] === '(삭제)' ? '' : cells[1];
        if (!from || from === to || seen.has(from))
            continue;
        seen.add(from);
        entries.push({ from, to });
    }
    return entries.sort((a, b) => b.from.length - a.from.length || (a.from < b.from ? -1 : 1));
}
/** 문자열 하나에 렉시콘을 적용한다. hits = 치환 발생 횟수(항목×등장 수). */
export function applyLexiconToText(text, entries) {
    let out = text;
    let hits = 0;
    for (const { from, to } of entries) {
        if (!out.includes(from))
            continue;
        const parts = out.split(from);
        hits += parts.length - 1;
        out = parts.join(to);
    }
    return { text: out, hits };
}
/**
 * 값 트리를 깊이 순회하며 **산문 키의 문자열 값에만** 렉시콘을 적용한다(불변 —
 * 새 값 반환). SKIP_KEYS 서브트리는 참조 그대로 보존한다. id·경로·코드 심볼 필드는
 * PROSE_KEYS 밖이라 자연히 불변이다.
 */
export function applyLexiconDeep(value, entries) {
    if (entries.length === 0)
        return { value, hits: 0 };
    let hits = 0;
    const walk = (node, keyInParent) => {
        if (node === null || node === undefined)
            return node;
        if (Array.isArray(node))
            return node.map((item) => walk(item, keyInParent));
        if (typeof node === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(node)) {
                if (SKIP_KEYS.has(k)) {
                    out[k] = v;
                    continue;
                }
                if (typeof v === 'string' && PROSE_KEYS.has(k)) {
                    const r = applyLexiconToText(v, entries);
                    hits += r.hits;
                    out[k] = r.text;
                    continue;
                }
                out[k] = walk(v, k);
            }
            return out;
        }
        return node;
    };
    return { value: walk(value, null), hits };
}
//# sourceMappingURL=lexicon.js.map