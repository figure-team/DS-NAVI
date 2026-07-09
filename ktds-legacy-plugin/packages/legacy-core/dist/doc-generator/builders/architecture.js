/**
 * 02_architecture.md — 아키텍처 빌더(template §1).
 *
 * 섹션 순서·헤딩(AC-36): 레이어 / 의존 방향 / 순환 의존 후보.
 *
 * 그래프 모델 매핑(정직성): UaGraphEdge 종류는 contains_flow/flow_step/calls 다.
 * 의존 방향·순환 탐지는 `calls`(단계→단계 호출) 엣지로 한다 — 이 모델에서 의존을
 * 표현하는 유일한 엣지다(블루프린트의 depends_on/imports 에 대응). file-단위
 * import 의존(edges.json)은 별도 산출물이므로 여기서 합성하지 않는다(grounding 보존).
 *
 * 레이어는 node.layer(ground-truth 신호 기반, 하드코딩 4계층 아님) 그룹에서 도출한다.
 * 레이어/순환은 구조 추론이므로 INFERRED/UNVERIFIED([추정]/[확인 필요]).
 */
import { claim } from '../claims.js';
import { edgesOfType, inferred, sortNodes } from './shared.js';
/** (source→target) 쌍 인접에서 사이클 노드열을 결정론적으로 반환(정렬 DFS). */
function cyclesFromPairs(pairs) {
    const adj = new Map();
    for (const e of pairs) {
        const list = adj.get(e.source) ?? [];
        list.push(e.target);
        adj.set(e.source, list);
    }
    for (const [k, list] of adj)
        adj.set(k, list.slice().sort());
    const cycles = [];
    const state = new Map(); // 1=gray(stack), 2=black(done)
    const stack = [];
    const dfs = (u) => {
        state.set(u, 1);
        stack.push(u);
        for (const v of adj.get(u) ?? []) {
            if (state.get(v) === 1) {
                const i = stack.indexOf(v);
                if (i >= 0)
                    cycles.push(stack.slice(i));
            }
            else if (!state.has(v)) {
                dfs(v);
            }
        }
        stack.pop();
        state.set(u, 2);
    };
    for (const u of [...adj.keys()].sort())
        if (!state.has(u))
            dfs(u);
    return cycles;
}
/**
 * `calls` 엣지(단계 호출) 위 사이클 — 도메인 그래프 폴백용.
 * byte-identical 재실행을 위해 인접/진입 순서를 정렬한다.
 */
export function detectCycles(edges) {
    return cyclesFromPairs(edgesOfType(edges, 'calls'));
}
/** 파일 의존 엣지(edges.json) 위 사이클 — 파일 경로 단위. */
function detectFileCycles(fileEdges) {
    return cyclesFromPairs(fileEdges.map((e) => ({ source: e.source, target: e.target })));
}
/** EdgeRecord 자연키 정렬(source, target, kind) — 결정론 렌더. */
function sortFileEdges(edges) {
    return [...edges].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
        (a.target < b.target ? -1 : a.target > b.target ? 1 : 0) ||
        (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}
/** 아키텍처 문서 모델을 조립한다(결정론: 노드 id / 엣지 자연키 정렬). */
export function buildArchitecture(input) {
    // 레이어: node.layer 그룹(신호 보유분만). 'unknown'/미상은 제외(끼워맞춤 금지).
    const byLayer = new Map();
    for (const n of sortNodes(input.nodes)) {
        if (typeof n.layer === 'string' && n.layer !== 'unknown') {
            byLayer.set(n.layer, (byLayer.get(n.layer) ?? 0) + 1);
        }
    }
    const layerClaims = [...byLayer.keys()]
        .sort()
        .map((name) => inferred(`레이어: ${name} (${byLayer.get(name) ?? 0}개 구성요소)`));
    // 의존 방향 — 파일 의존 엣지(edges.json) 있으면 file:line 근거로 CONFIRMED(import/injection/
    // mapper-xml 등 종류 표기). 없으면 도메인 calls 엣지(합성) INFERRED 폴백.
    const fileEdges = input.fileEdges ?? [];
    const depClaims = fileEdges.length > 0
        ? sortFileEdges(fileEdges).map((e) => claim(`의존: ${e.source} → ${e.target} (${e.kind})`, 'CONFIRMED', [
            { file: e.source, line: e.line },
        ]))
        : edgesOfType(input.edges, 'calls').map((e) => inferred(`의존: ${e.source} → ${e.target} (calls)`));
    // 순환 의존 후보 — 파일 의존 그래프(있으면) 또는 calls 폴백. 구조 추론이므로 [확인 필요].
    const cycles = fileEdges.length > 0 ? detectFileCycles(fileEdges) : detectCycles(input.edges);
    const cycleClaims = cycles.map((c) => claim(`순환 의존 후보: ${c.join(' → ')} → ${c[0]}`, 'UNVERIFIED'));
    return {
        docId: '02_architecture',
        title: '아키텍처',
        methodology: 'as-built',
        sections: [
            { heading: '레이어', key: 'layers', claims: layerClaims },
            { heading: '의존 방향', key: 'dependencies', claims: depClaims },
            { heading: '순환 의존 후보', key: 'cycles', claims: cycleClaims },
        ],
    };
}
//# sourceMappingURL=architecture.js.map