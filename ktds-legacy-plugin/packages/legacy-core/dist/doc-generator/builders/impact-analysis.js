const HOTSPOT_COLUMNS = ['컴포넌트', '피의존수(fan-in)', '의존수(fan-out)', '전이 영향(파일수)', '레이어'];
const CROSS_COLUMNS = ['출발 도메인', '도착 도메인', '가중치', '근거 건수'];
const SEP = '\u0001'; // 도메인쌍 키 구분자(도메인 태그에 없는 제어문자).
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const addTo = (m, k, v) => {
    const s = m.get(k) ?? new Set();
    s.add(v);
    m.set(k, s);
};
export function buildImpactAnalysis(input) {
    // step id → filePath / domain(첫 태그). 파일 → layer / line.
    const file = new Map();
    const domain = new Map();
    const fileLayer = new Map();
    const fileLine = new Map();
    for (const n of input.nodes) {
        if (n.type !== 'step' || typeof n.filePath !== 'string')
            continue;
        file.set(n.id, n.filePath);
        domain.set(n.id, n.tags[0] ?? '');
        if (!fileLayer.has(n.filePath))
            fileLayer.set(n.filePath, n.layer ?? '');
        if (!fileLine.has(n.filePath))
            fileLine.set(n.filePath, n.lineRange ? n.lineRange[0] : null);
    }
    // 도메인 키 → 표시명(domain 노드 name).
    const domainName = new Map();
    for (const n of input.nodes) {
        if (n.type === 'domain')
            domainName.set(n.tags[0] ?? '', n.name.length > 0 ? n.name : n.id);
    }
    const showDomain = (key) => domainName.get(key) ?? key;
    // 파일 단위 인접(calls step→step, 다른 파일만) + 도메인쌍 집계.
    const outAdj = new Map();
    const inAdj = new Map();
    const pairFiles = new Map();
    const pairCalls = new Map();
    const pairEvidence = new Map();
    for (const e of input.edges) {
        if (e.type !== 'calls')
            continue;
        const sf = file.get(e.source);
        const tf = file.get(e.target);
        if (!sf || !tf)
            continue;
        if (sf !== tf) {
            addTo(outAdj, sf, tf);
            addTo(inAdj, tf, sf);
        }
        const sd = domain.get(e.source);
        const td = domain.get(e.target);
        if (sd && td && sd !== td) {
            const k = `${sd}${SEP}${td}`;
            addTo(pairFiles, k, `${sf}>${tf}`);
            pairCalls.set(k, (pairCalls.get(k) ?? 0) + 1);
            if (!pairEvidence.has(k) || sf < pairEvidence.get(k))
                pairEvidence.set(k, sf);
        }
    }
    // 전이 영향(reach): outAdj BFS 로 파일에서 도달 가능한 파일 수(자기 제외).
    const reach = (start) => {
        const seen = new Set();
        const q = [start];
        while (q.length > 0) {
            const c = q.shift();
            for (const nx of outAdj.get(c) ?? []) {
                if (!seen.has(nx)) {
                    seen.add(nx);
                    q.push(nx);
                }
            }
        }
        seen.delete(start);
        return seen.size;
    };
    // 핫스팟 = calls 에 참여한 모든 파일(fan-in 또는 fan-out > 0). fan-in desc → 경로 asc.
    const hotFiles = new Set([...inAdj.keys(), ...outAdj.keys()]);
    const hotRows = [...hotFiles]
        .map((fp) => ({ fp, fin: inAdj.get(fp)?.size ?? 0, fout: outAdj.get(fp)?.size ?? 0, r: reach(fp) }))
        .sort((a, b) => b.fin - a.fin || cmp(a.fp, b.fp))
        .map((x) => ({
        cells: [x.fp, String(x.fin), String(x.fout), String(x.r), fileLayer.get(x.fp) ?? ''],
        confidence: 'CONFIRMED',
        evidence: [{ file: x.fp, line: fileLine.get(x.fp) ?? null }],
    }));
    // 도메인 간 의존: calls 건수 desc → 도메인쌍 asc.
    const crossRows = [...pairCalls.keys()]
        .sort((a, b) => pairCalls.get(b) - pairCalls.get(a) || cmp(a, b))
        .map((k) => {
        const [sd, td] = k.split(SEP);
        return {
            cells: [showDomain(sd), showDomain(td), String(pairFiles.get(k)?.size ?? 0), String(pairCalls.get(k) ?? 0)],
            confidence: 'CONFIRMED',
            evidence: [{ file: pairEvidence.get(k), line: null }],
        };
    });
    return {
        docId: '09_impact-analysis',
        title: '영향도 분석서',
        methodology: 'as-built',
        sections: [
            { heading: '고영향 컴포넌트', key: 'impact-hotspots', claims: [], table: { columns: HOTSPOT_COLUMNS, rows: hotRows } },
            { heading: '도메인 간 의존', key: 'cross-domain-deps', claims: [], table: { columns: CROSS_COLUMNS, rows: crossRows } },
        ],
    };
}
//# sourceMappingURL=impact-analysis.js.map