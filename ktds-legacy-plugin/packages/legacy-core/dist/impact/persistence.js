import { cmp } from '../utils/cmp.js';
const MAPPER_EDGE_KINDS = new Set(['mybatis', 'mapper-xml']);
export const PERSISTENCE_NOTE = 'SQL 파일은 콜체인 간선에 등장하지 않아 도달성 밖입니다(census 인벤토리로만 후보화). ' +
    '매퍼 XML이 건드리는 테이블/컬럼은 tableCandidateSlots의 SQL 슬라이스에서 인용 의무로 추출하세요.';
/**
 * dataImpactSet 에 든 @Entity 파일의 entity↔table 영향(AC-16). 명시 @Table = CONFIRMED,
 * 암묵 명명전략 = INFERRED. 컬럼도 명시/암묵 신뢰도를 승계. entity 선언 라인을 앵커로.
 */
function computeJpaTables(dataImpactSet, jpaModel) {
    if (!jpaModel)
        return [];
    const out = [];
    for (const e of jpaModel.entities) {
        if (!dataImpactSet.has(e.relPath))
            continue;
        out.push({
            entityClass: e.className,
            relPath: e.relPath,
            tableName: e.tableName,
            tableExplicit: e.tableExplicit,
            confidence: e.tableConfidence,
            citation: { filePath: e.relPath, line: e.line },
            columns: [...e.columns]
                .map((c) => ({ column: c.columnName, confidence: c.confidence, line: c.line }))
                .sort((a, b) => cmp(a.column, b.column)),
        });
    }
    return out.sort((a, b) => cmp(a.relPath, b.relPath) || cmp(a.entityClass, b.entityClass));
}
export function computePersistenceImpact(
/** 정방향(downstream) 폐포 ∪ 시드 — 시드가 도달하는 데이터 계층. */
dataImpactSet, edges, census, inputs = {}) {
    const nsByPath = inputs.mapperNamespaceByPath ?? new Map();
    const lineCounts = inputs.mapperLineCounts ?? new Map();
    const ownByFile = new Map((inputs.ownership ?? []).map((o) => [o.relPath, o.owners]));
    // 매퍼 XML: mapper-xml/mybatis 간선의 target ∩ dataImpactSet. 가장 이른 근거
    // 간선(작은 라인)을 인용으로 — filePath=간선 source(매퍼를 부르는 곳).
    const mapperCitation = new Map();
    const mapperPaths = new Set();
    for (const e of edges) {
        if (!MAPPER_EDGE_KINDS.has(e.kind))
            continue;
        if (!dataImpactSet.has(e.target))
            continue;
        mapperPaths.add(e.target);
        if (e.line !== null) {
            const prev = mapperCitation.get(e.target);
            if (!prev || e.line < prev.line || (e.line === prev.line && e.source < prev.filePath)) {
                mapperCitation.set(e.target, { filePath: e.source, line: e.line });
            }
        }
    }
    const mappers = [...mapperPaths].sort(cmp).map((relPath) => ({
        relPath,
        namespace: nsByPath.get(relPath) ?? null,
        owners: [...(ownByFile.get(relPath) ?? [])].sort(cmp),
        citation: mapperCitation.get(relPath) ?? null,
    }));
    // SQL 파일: census lang=sql ∩ dataImpactSet(도달성 밖이라 보통 비어 있음).
    const sqlFiles = census
        .filter((f) => f.lang === 'sql' && dataImpactSet.has(f.relPath))
        .map((f) => ({ relPath: f.relPath, lang: f.lang }))
        .sort((a, b) => cmp(a.relPath, b.relPath));
    // host 인용 추출 닻: 각 영향 매퍼의 전체 SQL 본문 위치. 라인 수 미상(읽기
    // 실패) 매퍼는 [1,1] 가짜 닻을 만들지 않고 슬롯을 생략(엔진이 needsReview 로 노출).
    const tableCandidateSlots = mappers.flatMap((m) => {
        const endLine = lineCounts.get(m.relPath);
        if (typeof endLine !== 'number' || endLine < 1)
            return [];
        return [{ mapperRelPath: m.relPath, sqlSlice: { filePath: m.relPath, startLine: 1, endLine } }];
    });
    const kgTableCatalog = [...(inputs.kgTableCatalog ?? [])].sort((a, b) => cmp(a.name, b.name));
    const jpaTables = computeJpaTables(dataImpactSet, inputs.jpaModel);
    return { mappers, sqlFiles, tableCandidateSlots, kgTableCatalog, jpaTables, note: PERSISTENCE_NOTE };
}
//# sourceMappingURL=persistence.js.map