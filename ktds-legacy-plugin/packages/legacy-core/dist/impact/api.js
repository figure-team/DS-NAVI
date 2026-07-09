import { cmp } from '../utils/cmp.js';
export function computeApiImpact(seeds, 
/** reach upstream 의 relPath 목록(시드 제외). */
reverseFiles, ownership, routes, batchEntries) {
    const ownByFile = new Map(ownership.map((o) => [o.relPath, o.owners]));
    // 1차: 시드들에 도달하는 모든 root(진입점 선언 파일).
    const ownershipRoots = new Set();
    for (const seed of seeds) {
        for (const owner of ownByFile.get(seed) ?? [])
            ownershipRoots.add(owner);
    }
    // 2차: 시드 자신 + 역방향 영향 파일(시드가 곧 진입점일 수 있으므로 포함).
    const reverseSet = new Set([...seeds, ...reverseFiles]);
    const api = [];
    const crossCheckDiff = [];
    const classify = (filePath) => {
        const ownHit = ownershipRoots.has(filePath);
        const revHit = reverseSet.has(filePath);
        if (ownHit && revHit)
            return { via: 'both', confidence: 'CONFIRMED_AI' };
        if (ownHit)
            return { via: 'ownership', confidence: 'INFERRED' };
        if (revHit)
            return { via: 'reverse', confidence: 'UNVERIFIED' };
        return null;
    };
    for (const route of routes) {
        const c = classify(route.filePath);
        if (!c)
            continue;
        api.push({
            targetKind: 'route',
            id: route.routeId,
            filePath: route.filePath,
            line: route.line,
            handler: route.handler,
            via: c.via,
            confidence: c.confidence,
        });
        if (c.via !== 'both') {
            crossCheckDiff.push({
                id: route.routeId,
                side: c.via === 'ownership' ? 'ownership-only' : 'reverse-only',
            });
        }
    }
    for (const batch of batchEntries) {
        const c = classify(batch.filePath);
        if (!c)
            continue;
        api.push({
            targetKind: 'batch',
            id: batch.entryId,
            filePath: batch.filePath,
            line: batch.line,
            handler: batch.handler,
            via: c.via,
            confidence: c.confidence,
        });
        if (c.via !== 'both') {
            crossCheckDiff.push({
                id: batch.entryId,
                side: c.via === 'ownership' ? 'ownership-only' : 'reverse-only',
            });
        }
    }
    api.sort((a, b) => cmp(a.targetKind, b.targetKind) || cmp(a.id, b.id));
    crossCheckDiff.sort((a, b) => cmp(a.id, b.id) || cmp(a.side, b.side));
    return { api, crossCheckDiff };
}
//# sourceMappingURL=api.js.map