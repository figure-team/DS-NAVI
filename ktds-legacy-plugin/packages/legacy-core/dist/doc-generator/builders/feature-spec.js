import { displayName, metaList, nodeClaim, nodesOfType, summarySuffix, } from './shared.js';
/**
 * 다른 문서가 소유하는 종류 태그 — 처리 단계에서 제외(문서 간 중복 claim 방지).
 * endpoint/route -> 04_api-spec, table/schema -> 05_db-spec, module -> 01_tech-stack.
 */
const NON_STEP_TAGS = new Set(['endpoint', 'route', 'table', 'schema', 'module']);
/** 기능 명세 문서 모델을 조립한다(결정론: 노드 id 정렬 + meta 정렬). */
export function buildFeatureSpec(input) {
    const domainNodes = nodesOfType(input.nodes, 'domain');
    const domains = domainNodes.map((n) => nodeClaim(n, `업무 도메인: ${displayName(n)}${summarySuffix(n)}`));
    // 엔터티 · 업무 규칙: domainMeta 에서 도출(grounding 보존: 도메인 노드 근거 승계).
    const metaClaims = [];
    for (const n of domainNodes) {
        for (const ent of metaList(n.domainMeta, 'entities')) {
            metaClaims.push(nodeClaim(n, `엔터티: ${ent}`));
        }
        for (const rule of metaList(n.domainMeta, 'businessRules')) {
            metaClaims.push(nodeClaim(n, `업무 규칙: ${rule}`));
        }
    }
    const flows = nodesOfType(input.nodes, 'flow').map((n) => nodeClaim(n, `흐름: ${displayName(n)}${summarySuffix(n)}`));
    const steps = nodesOfType(input.nodes, 'step')
        .filter((n) => !n.tags.some((t) => NON_STEP_TAGS.has(t)))
        .map((n) => nodeClaim(n, `처리 단계: ${displayName(n)}${summarySuffix(n)}`));
    return {
        docId: '03_feature-spec',
        title: '기능 명세',
        methodology: 'as-built',
        sections: [
            { heading: '업무 도메인', claims: domains },
            { heading: '엔터티 · 업무 규칙', claims: metaClaims },
            { heading: '처리 흐름', claims: flows },
            { heading: '처리 단계', claims: steps },
        ],
    };
}
//# sourceMappingURL=feature-spec.js.map