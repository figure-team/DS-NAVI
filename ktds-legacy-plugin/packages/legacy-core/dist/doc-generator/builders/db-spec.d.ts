/**
 * 05_db-spec.md — DB 명세 빌더(template §1).
 *
 * 섹션 순서·헤딩(AC-36): 테이블 / 스키마 / 데이터 접근.
 *
 * grounding(§3.4): table/schema 태그 노드는 노드 근거(file:line) 승계.
 *
 * P6 확장 지점(정직성): 블루프린트 template 은 reads_from/writes_to 엣지를 데이터
 * 접근 근거로 쓰지만, 현 그래프 모델(UaGraphEdge)에는 그 종류가 없다. 따라서 데이터
 * 접근은 대상이 table/schema 노드인 `calls` 엣지로 추론(INFERRED)한다. JPA(@Table/
 * @Column)·MyBatis(Mapper XML SQL 슬라이스) 컬럼 단위 enrichment 는 P6 에서 이
 * 빌더에 reads_from/writes_to 추출 결과를 주입하는 형태로 확장한다(여기서 합성 금지).
 */
import type { GeneratedDoc } from '../types.js';
import { type DocInput } from './shared.js';
/** DB 명세 문서 모델을 조립한다(결정론: 노드 id / 엣지 자연키 정렬). */
export declare function buildDbSpec(input: DocInput): GeneratedDoc;
//# sourceMappingURL=db-spec.d.ts.map