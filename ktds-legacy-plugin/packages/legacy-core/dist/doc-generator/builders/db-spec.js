import { claim } from '../claims.js';
import { displayName, edgesOfType, inferred, nodeClaim, nodesWithTag, summarySuffix, } from './shared.js';
/**
 * JPA(보완 B, AC-16) — entity↔table 애너테이션 경로 섹션. 명시 @Table/@Column = CONFIRMED,
 * 암묵 명명전략 = INFERRED([추정]). entity 선언 file:line 을 근거로. jpaModel 없으면 섹션 생략.
 */
function jpaSections(input) {
    const m = input.jpaModel;
    if (!m || m.entities.length === 0)
        return [];
    const tableClaims = m.entities.map((e) => claim(`엔티티↔테이블: ${e.className} → ${e.tableName}${e.tableExplicit ? '' : ' [암묵 명명전략]'}` +
        ` (컬럼 ${e.columns.length}, 관계 ${e.relations.length})`, e.tableConfidence, [{ file: e.relPath, line: e.line }]));
    const columnClaims = m.entities.flatMap((e) => e.columns.map((c) => claim(`컬럼: ${e.tableName}.${c.columnName}${c.explicit ? '' : ' [암묵]'} (${e.className}.${c.fieldName})`, c.confidence, [{ file: e.relPath, line: c.line }])));
    const fkClaims = m.entities.flatMap((e) => e.relations.map((r) => claim(`관계/FK: ${e.className}.${r.fieldName} ${r.kind} → ${r.targetType ?? '(미상)'}` +
        `${r.joinColumn ? ` (FK ${r.joinColumn})` : ''}`, r.confidence, [{ file: e.relPath, line: r.line }])));
    return [
        { heading: '엔티티↔테이블 매핑 (JPA)', claims: tableClaims },
        { heading: '컬럼 매핑 (JPA)', claims: columnClaims },
        { heading: '관계 / FK (JPA)', claims: fkClaims },
    ];
}
/**
 * DDL 스키마(PA3, db-schema.json) — 그래프 노드 목록보다 깊은 **물리 스키마**를
 * grounding 으로 싣는다. .sql 유래 행은 file:line 근거 동반(CONFIRMED, 합성 아님);
 * code-inferred 폴백(origin=jpa/mybatis)의 역추론 테이블은 INFERRED([추정])로 강등.
 * db-schema 없으면(맵 미실행/code-only) 섹션 생략 — 기존 노드 기반 목록은 유지.
 */
function ddlSchemaSections(input) {
    const m = input.dbSchema;
    if (!m || m.tables.length === 0)
        return [];
    // 역추론 테이블(코드 근사)은 CONFIRMED 로 실을 수 없다 — 근거는 매퍼 SQL/엔티티지 DDL 이 아님.
    const conf = (t) => (t.origin === 'jpa' || t.origin === 'mybatis' ? 'INFERRED' : 'CONFIRMED');
    const tableClaims = m.tables.map((t) => claim(`테이블: ${t.name}${t.comment ? ` — ${t.comment}` : ''} (컬럼 ${t.columns.length}` +
        `${t.primaryKey.length ? `, PK ${t.primaryKey.join('+')}` : ''}` +
        `${t.foreignKeys.length ? `, FK ${t.foreignKeys.length}` : ''}` +
        `${t.checks.length ? `, CHECK ${t.checks.length}` : ''}` +
        `${t.isCodeTable ? ', 코드테이블' : ''}` +
        `${t.origin === 'jpa' || t.origin === 'mybatis' ? `, ${t.origin} 역추론` : ''})`, conf(t), [{ file: t.relPath, line: t.line }]));
    const columnClaims = m.tables.flatMap((t) => t.columns.map((c) => claim(`${t.name}.${c.name} ${c.type}` +
        `${c.primaryKey ? ' [PK]' : ''}${!c.nullable ? ' [NOT NULL]' : ''}` +
        `${c.unique ? ' [UNIQUE]' : ''}${c.default !== null ? ` [기본값 ${c.default}]` : ''}` +
        `${c.comment ? ` — ${c.comment}` : ''}`, conf(t), [{ file: t.relPath, line: c.line }])));
    const constraintClaims = [
        ...m.tables.flatMap((t) => t.foreignKeys.map((fk) => claim(`FK: ${t.name}(${fk.columns.join(',')}) → ${fk.refTable}(${fk.refColumns.join(',')})`, 'CONFIRMED', [{ file: t.relPath, line: fk.line }]))),
        ...m.tables.flatMap((t) => t.checks.map((ck) => claim(`CHECK: ${t.name} — ${ck.expression}`, 'CONFIRMED', [{ file: t.relPath, line: ck.line }]))),
    ];
    // code-inferred 는 DDL 이 아니라 코드 역추론 — 헤딩에서 DDL 을 참칭하지 않는다.
    const label = m.tier === 'code-inferred' ? '코드 역추론' : 'DDL';
    const sections = [
        { heading: `DB 스키마 — 테이블 (${label}, tier=${m.tier})`, claims: tableClaims },
    ];
    if (columnClaims.length > 0)
        sections.push({ heading: 'DB 스키마 — 컬럼 (DDL)', claims: columnClaims });
    if (constraintClaims.length > 0) {
        sections.push({ heading: 'DB 스키마 — 제약 (FK/CHECK)', claims: constraintClaims });
    }
    return sections;
}
/** DB 명세 문서 모델을 조립한다(결정론: 노드 id / 엣지 자연키 정렬). */
export function buildDbSpec(input) {
    const tableNodes = nodesWithTag(input.nodes, 'table', 'schema');
    const tables = tableNodes.map((n) => nodeClaim(n, `테이블/스키마: ${displayName(n)}${summarySuffix(n)}`));
    // 데이터 접근(P6 확장 지점): 대상이 table/schema 노드인 calls 엣지를 추론으로 본다.
    const tableIds = new Set(tableNodes.map((n) => n.id));
    const access = edgesOfType(input.edges, 'calls')
        .filter((e) => tableIds.has(e.target))
        .map((e) => inferred(`데이터 접근: ${e.source} →접근→ ${e.target}`));
    return {
        docId: '05_db-spec',
        title: 'DB 명세',
        methodology: 'as-built',
        sections: [
            { heading: '테이블 / 스키마', claims: tables },
            ...ddlSchemaSections(input),
            { heading: '데이터 접근', claims: access },
            ...jpaSections(input),
        ],
    };
}
//# sourceMappingURL=db-spec.js.map