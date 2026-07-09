import { claim } from '../claims.js';
/** node.id ASC 안정 정렬(결정론 tie-break). */
export function sortNodes(nodes) {
    return [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** routeId 자연키 안정 정렬(결정론) — api-spec / si-인터페이스정의서 공용. */
export function sortedRoutes(input) {
    const routes = input.routes?.routes ?? [];
    return [...routes].sort((a, b) => (a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0));
}
/** edges (source, target, type) 자연키 안정 정렬(결정론). */
export function sortEdges(edges) {
    return [...edges].sort((a, b) => {
        if (a.source !== b.source)
            return a.source < b.source ? -1 : 1;
        if (a.target !== b.target)
            return a.target < b.target ? -1 : 1;
        if (a.type !== b.type)
            return a.type < b.type ? -1 : 1;
        return 0;
    });
}
/** type 으로 노드를 거른 뒤 id 정렬. */
export function nodesOfType(nodes, ...types) {
    const set = new Set(types);
    return sortNodes(nodes.filter((n) => set.has(n.type)));
}
/** tag 로 노드를 거른 뒤 id 정렬(endpoint/table/schema/module 등 비-core 종류 식별). */
export function nodesWithTag(nodes, ...tags) {
    const set = new Set(tags);
    return sortNodes(nodes.filter((n) => n.tags.some((t) => set.has(t))));
}
/** type 으로 엣지를 거른 뒤 자연키 정렬. */
export function edgesOfType(edges, ...types) {
    const set = new Set(types);
    return sortEdges(edges.filter((e) => set.has(e.type)));
}
/** 노드의 filePath+lineRange 를 Evidence[] 로 변환(없으면 []). */
export function nodeEvidence(node) {
    if (typeof node.filePath !== 'string')
        return [];
    const line = node.lineRange ? node.lineRange[0] : null;
    return [{ file: node.filePath, line }];
}
/**
 * 노드 기반 claim — grounded(filePath 보유) -> CONFIRMED + 근거, 아니면 INFERRED.
 * grounding 보존: 근거 없는 노드를 CONFIRMED 로 올리지 않는다.
 */
export function nodeClaim(node, text) {
    const ev = nodeEvidence(node);
    return ev.length > 0 ? claim(text, 'CONFIRMED', ev) : claim(text, 'INFERRED');
}
/** 구조/관례 추론 claim — 근거 없음, 검토 권장(INFERRED). */
export function inferred(text) {
    return claim(text, 'INFERRED');
}
/** 동적/불명 claim — 근거 미확보(UNVERIFIED). */
export function unverified(text) {
    return claim(text, 'UNVERIFIED');
}
/** 노드 표시명 — name 이 공란(SKELETON_BLANK)이면 id 로 폴백(빈 텍스트 방지). */
export function displayName(node) {
    return node.name.length > 0 ? node.name : node.id;
}
/** summary 가 있으면 " — {summary}" 접미사, 없으면 빈 문자열. */
export function summarySuffix(node) {
    return node.summary.length > 0 ? ` — ${node.summary}` : '';
}
/**
 * domainMeta 의 문자열/문자열배열 필드를 결정론적으로 평탄화(정렬).
 * feature-spec / si-기능명세서 공용 — 배열은 문자열만 골라 정렬, 단일 문자열은 1원소.
 */
export function metaList(meta, key) {
    const v = meta?.[key];
    if (Array.isArray(v)) {
        return v.filter((x) => typeof x === 'string').slice().sort();
    }
    if (typeof v === 'string' && v.length > 0)
        return [v];
    return [];
}
//# sourceMappingURL=shared.js.map