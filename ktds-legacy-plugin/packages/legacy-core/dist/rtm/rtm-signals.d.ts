import { type RawSqlModel } from '../doc-generator/raw-sql.js';
import { type TestLinkModel } from './test-links.js';
import type { UaGraphNode } from '../domain-map/types.js';
export interface RtmSignals {
    rawSqlModel: RawSqlModel;
    testLinks: TestLinkModel;
    diag: {
        /** db-schema 테이블 수(코드 SQL 필터 근거). 0 = 데이터축 필터 불가. */
        knownTables: number;
        /** 코드 SQL 이 검출된(테이블 접근 있는) 도달 파일 수. */
        sqlLinkedFiles: number;
        /** 스캔한 테스트 파일 수. */
        testFiles: number;
        /** 그래프의 프로덕션 클래스 basename 수(테스트 링크 대조 집합). */
        prodClasses: number;
    };
}
/**
 * 데이터·테스트 축 신호를 수집한다. nodes 는 도메인 그래프의 노드(도달 step·프로덕션 클래스 유래).
 * MyBatis 프로젝트면 rawSqlModel 은 비어도 무방(build-rtm 이 MyBatis 경로를 우선한다).
 */
export declare function collectRtmSignals(projectRoot: string, nodes: UaGraphNode[]): RtmSignals;
//# sourceMappingURL=rtm-signals.d.ts.map