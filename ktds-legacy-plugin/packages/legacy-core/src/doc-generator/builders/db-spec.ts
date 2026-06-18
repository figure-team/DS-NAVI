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
import type { Claim, GeneratedDoc } from '../types.js'
import {
  type DocInput,
  displayName,
  edgesOfType,
  inferred,
  nodeClaim,
  nodesWithTag,
  summarySuffix,
} from './shared.js'

/** DB 명세 문서 모델을 조립한다(결정론: 노드 id / 엣지 자연키 정렬). */
export function buildDbSpec(input: DocInput): GeneratedDoc {
  const tableNodes = nodesWithTag(input.nodes, 'table', 'schema')
  const tables = tableNodes.map((n): Claim =>
    nodeClaim(n, `테이블/스키마: ${displayName(n)}${summarySuffix(n)}`),
  )

  // 데이터 접근(P6 확장 지점): 대상이 table/schema 노드인 calls 엣지를 추론으로 본다.
  const tableIds = new Set(tableNodes.map((n) => n.id))
  const access = edgesOfType(input.edges, 'calls')
    .filter((e) => tableIds.has(e.target))
    .map((e): Claim => inferred(`데이터 접근: ${e.source} →접근→ ${e.target}`))

  return {
    docId: '05_db-spec',
    title: 'DB 명세',
    methodology: 'as-built',
    sections: [
      { heading: '테이블 / 스키마', claims: tables },
      { heading: '데이터 접근', claims: access },
    ],
  }
}
