/**
 * 04_api-spec.md — API 명세 빌더(template §1).
 *
 * 섹션 순서·헤딩(AC-36): 엔드포인트 / 라우팅 · 미들웨어.
 *
 * grounding(§3.4): endpoint/route 노드는 노드 근거(file:line) 승계. routes 리포트의
 * 각 RouteEntry 는 filePath+line 을 보유하므로 CONFIRMED + 앵커. middleware 엣지는
 * 그래프 모델에 별도 종류가 없어 routes 리포트를 권위로 삼는다(합성 금지).
 */
import { claim } from '../claims.js';
import { displayName, nodeClaim, nodesWithTag, sortedRoutes, summarySuffix, } from './shared.js';
/** API 명세 문서 모델을 조립한다(결정론: 노드 id / routeId 정렬). */
export function buildApiSpec(input) {
    // 엔드포인트: endpoint/route 태그 노드(노드 근거 승계).
    const endpoints = nodesWithTag(input.nodes, 'endpoint', 'route').map((n) => nodeClaim(n, `엔드포인트: ${displayName(n)}${summarySuffix(n)}`));
    // 라우팅/미들웨어: routes 리포트의 각 라우트는 file:line 근거 -> CONFIRMED.
    const routing = sortedRoutes(input).map((r) => {
        const handler = typeof r.handler === 'string' && r.handler.length > 0 ? r.handler : '?';
        return claim(`라우팅/미들웨어: ${r.method} ${r.path} → ${handler}`, 'CONFIRMED', [
            { file: r.filePath, line: r.line },
        ]);
    });
    return {
        docId: '04_api-spec',
        title: 'API 명세',
        methodology: 'as-built',
        sections: [
            { heading: '엔드포인트', claims: endpoints },
            { heading: '라우팅 / 미들웨어', claims: routing },
        ],
    };
}
//# sourceMappingURL=api-spec.js.map