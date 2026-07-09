/**
 * 계층(layer) 동적 추론 — ground-truth 신호 우선(AC-2: 하드코딩 4계층 아님).
 *
 * 우선순위: DB > DAO > API > SERVICE > unknown.
 * 신호(LayerSignals)는 routes/edges 산출물에서 결정론적으로 도출한다.
 * 어떤 신호에도 걸리지 않으면 'unknown'(정직성: 조용히 끼워맞추지 않음).
 */
import { basename } from 'node:path';
/**
 * routes + edges (+ 선택 JPA 모델)로부터 결정론적으로 신호 집합을 구성.
 * JPA(보완 B): repository 파일 → DAO, @Entity 파일 → DB(table 레일). MyBatis 신호와
 * 병합되어 혼재 프로젝트(AC-16b)에서 둘 다 반영된다.
 */
export function buildLayerSignals(routes, edges, jpaModel) {
    const routeEntryFiles = new Set();
    for (const r of routes.routes)
        routeEntryFiles.add(r.filePath);
    for (const b of routes.batchEntries)
        routeEntryFiles.add(b.filePath);
    const daoFiles = new Set();
    const dbFiles = new Set();
    const serviceFiles = new Set();
    for (const e of edges.edges) {
        if (e.kind === 'mapper-xml') {
            daoFiles.add(e.source); // mapper 인터페이스
            dbFiles.add(e.target); // *.xml
        }
        else if (e.kind === 'mybatis') {
            daoFiles.add(e.target);
        }
        else if (e.kind === 'injection' || e.kind === 'impl') {
            serviceFiles.add(e.target);
        }
    }
    // JPA(보완 B, AC-35): repository → dao 레일, @Entity → db 레일.
    if (jpaModel) {
        for (const r of jpaModel.repositories)
            daoFiles.add(r.relPath);
        for (const e of jpaModel.entities)
            dbFiles.add(e.relPath);
    }
    return { routeEntryFiles, daoFiles, dbFiles, serviceFiles };
}
function nameToken(relPath, className) {
    return className ?? basename(relPath).replace(/\.[^.]+$/, '');
}
/**
 * 한 파일의 계층을 추론한다.
 * @param relPath census relPath
 * @param className 클래스명(없으면 파일명에서 도출)
 */
export function deriveStepLayer(relPath, className, signals) {
    const name = nameToken(relPath, className);
    // DB: 가장 강한 ground-truth(스키마/매핑 파일).
    if (relPath.endsWith('.sql') || /Mapper\.xml$/.test(relPath) || signals.dbFiles.has(relPath)) {
        return 'db';
    }
    // DAO: mybatis/mapper 신호 또는 이름 관례.
    if (signals.daoFiles.has(relPath) || /(Mapper|Dao|Repository)$/.test(name)) {
        return 'dao';
    }
    // API: 진입 파일 또는 이름/경로 관례.
    if (signals.routeEntryFiles.has(relPath) ||
        /(Controller|Resource|ActionBean|Endpoint)$/.test(name) ||
        /(^|\/)(controller|api|rest)(\/|$)/i.test(relPath)) {
        return 'api';
    }
    // SERVICE: 주입/구현 타겟 또는 이름 관례.
    if (signals.serviceFiles.has(relPath) || /(Service|ServiceImpl|Manager|Facade)$/.test(name)) {
        return 'service';
    }
    return 'unknown';
}
/**
 * 도달 파일들에 계층을 일괄 배정(결정론, relPath 정렬).
 * 반환: relPath -> layer 맵 + 사용된 계층 집합(동적 계층 증거, AC-2).
 */
export function assignLayers(relPaths, signals) {
    const byFile = {};
    const used = new Set();
    for (const rel of [...relPaths].sort()) {
        const layer = deriveStepLayer(rel, null, signals);
        byFile[rel] = layer;
        used.add(layer);
    }
    const order = ['api', 'service', 'dao', 'db', 'unknown'];
    return { byFile, layersUsed: order.filter((l) => used.has(l)) };
}
//# sourceMappingURL=step-layer.js.map