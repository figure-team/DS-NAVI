import type { EdgesReport, FlowLayer, RoutesReport } from './types.js';
import type { JpaModel } from '../jpa/types.js';
/** 계층 추론에 쓰는 파일 집합 신호. */
export interface LayerSignals {
    /** route/batch 진입 파일 → API. */
    routeEntryFiles: ReadonlySet<string>;
    /** mybatis/mapper-xml 엣지 참여 파일 + JPA repository 파일 → DAO. */
    daoFiles: ReadonlySet<string>;
    /** mapper-xml 타겟 / .sql / *Mapper.xml / JPA @Entity 파일 → DB. */
    dbFiles: ReadonlySet<string>;
    /** injection/impl 엣지 타겟 → SERVICE. */
    serviceFiles: ReadonlySet<string>;
}
/**
 * routes + edges (+ 선택 JPA 모델)로부터 결정론적으로 신호 집합을 구성.
 * JPA(보완 B): repository 파일 → DAO, @Entity 파일 → DB(table 레일). MyBatis 신호와
 * 병합되어 혼재 프로젝트(AC-16b)에서 둘 다 반영된다.
 */
export declare function buildLayerSignals(routes: RoutesReport, edges: EdgesReport, jpaModel?: JpaModel | null): LayerSignals;
/**
 * 한 파일의 계층을 추론한다.
 * @param relPath census relPath
 * @param className 클래스명(없으면 파일명에서 도출)
 */
export declare function deriveStepLayer(relPath: string, className: string | null, signals: LayerSignals): FlowLayer;
/**
 * 도달 파일들에 계층을 일괄 배정(결정론, relPath 정렬).
 * 반환: relPath -> layer 맵 + 사용된 계층 집합(동적 계층 증거, AC-2).
 */
export declare function assignLayers(relPaths: readonly string[], signals: LayerSignals): {
    byFile: Record<string, FlowLayer>;
    layersUsed: FlowLayer[];
};
//# sourceMappingURL=step-layer.d.ts.map