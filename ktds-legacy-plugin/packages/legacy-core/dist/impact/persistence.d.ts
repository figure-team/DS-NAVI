/**
 * DB/영속성 영향 — DOWNSTREAM(정방향). 시드가 *건드리는* 매퍼/테이블은 시드가
 * 의존하는 하류이지 호출자가 아니다 → 입력 dataImpactSet = 정방향 폐포 ∪ 시드.
 *
 * 결정론 신호만 엔진이 산출:
 *   매퍼 XML = edges.json kind∈(mybatis,mapper-xml)의 target ∩ dataImpactSet.
 *   SQL 파일 = census lang=sql ∩ dataImpactSet(보통 비어 있음 — 도달성 밖).
 * 테이블/컬럼은 엔진이 만들지 않는다: tableCandidateSlots(매퍼 SQL 슬라이스 위치)를
 * host 에게 인용 추출 닻으로 넘기고, KG table 노드(kgTableCatalog)로 DDL 근거를 붙인다.
 */
import type { CensusReport, EdgeRecord, Ownership } from '../domain-map/types.js';
import type { JpaModel } from '../jpa/types.js';
import type { KgTableEntry, PersistenceImpact } from './types.js';
export declare const PERSISTENCE_NOTE: string;
export interface PersistenceInputs {
    /** relPath → MyBatis namespace(엔진이 매퍼 XML 에서 산출). */
    mapperNamespaceByPath?: Map<string, string>;
    /** relPath → 파일 라인 수(tableCandidateSlots.endLine; 엔진이 매퍼 읽을 때 계산). */
    mapperLineCounts?: Map<string, number>;
    ownership?: readonly Ownership[];
    kgTableCatalog?: readonly KgTableEntry[];
    /** JPA 모델(보완 B) — entity↔table 영향 grounding 용. 없으면 jpaTables=[]. */
    jpaModel?: JpaModel | null;
}
export declare function computePersistenceImpact(
/** 정방향(downstream) 폐포 ∪ 시드 — 시드가 도달하는 데이터 계층. */
dataImpactSet: ReadonlySet<string>, edges: readonly EdgeRecord[], census: CensusReport['files'], inputs?: PersistenceInputs): PersistenceImpact;
//# sourceMappingURL=persistence.d.ts.map