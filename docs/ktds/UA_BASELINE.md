# U-A Baseline — verified against v2.7.3 source (kg-reader 기준)

> 검증일: 2026-06-08 · upstream `Lum1104/Understand-Anything` · tag **v2.7.3** (`9d1318a`) · main HEAD 2.7.6
> 검증 방법: 체크아웃한 소스 직접 대조 (`git show v2.7.3:.../types.ts`, sample graph 파싱). plan §0.2 / A18.

## 결과 요약
- **types.ts는 v2.7.3 → main(2.7.6) 동일** (drift 없음). fingerprint baseline은 아래 타입 집합.
- 그래프 데이터 버전 필드는 **`version`** (값 `"1.0.0"`). `knowledge_graph_schema_version` 필드는 **없음**.
- 산출 경로: `.understand-anything/knowledge-graph.json`. top-level keys: `version, project, nodes, edges, layers, tour`.
- sample(`packages/dashboard/public/knowledge-graph.json`) = 97 nodes / 183 edges, version 1.0.0 → `fixtures/ua-sample-graph.v2_7_3.json`로 고정.

## GraphNode (실측)
```ts
interface GraphNode {
  id: string;                 // ordinal, e.g. "n_105" — ktds는 사용 안 함(uid 도출)
  type: NodeType;             // 21종 (아래)
  name: string;
  filePath?: string;          // camelCase
  lineRange?: [number, number]; // 튜플 — meta.startLine 아님. evidence.line = lineRange[0]
  summary: string;
  tags: string[];
  complexity: "simple" | "moderate" | "complex";
  languageNotes?: string;
  domainMeta?: { entities?; businessRules?; crossDomainInteractions?; entryPoint?; entryType? };
  knowledgeMeta?: { wikilinks?; backlinks?; category?; content? };
}
```

## NodeType — 21종 (검증)
`file, function, class, module, concept` · `config, document, service, table, endpoint, pipeline, schema, resource` · `domain, flow, step` · `article, entity, topic, claim, source`

## EdgeType — 35종 (검증). §2.3에서 쓰는 8개 **모두 존재 확인**:
`imports`, `depends_on`, `contains_flow`, `flow_step`, `routes`, `middleware`, `reads_from`, `writes_to`
전체: imports, exports, contains, inherits, implements, calls, subscribes, publishes, middleware, reads_from, writes_to, transforms, validates, depends_on, tested_by, configures, related, similar_to, deploys, serves, provisions, triggers, migrates, documents, routes, defines_schema, contains_flow, flow_step, cross_domain, cites, contradicts, builds_on, exemplifies, categorized_under, authored_by.

## GraphEdge (실측)
```ts
interface GraphEdge { source: string; target: string; type: EdgeType;
  direction: "forward" | "backward" | "bidirectional"; description?: string; weight: number; }
```

## Zod 정규화 (schema.ts)
on-disk 그래프는 U-A `schema.ts`가 이미 alias 정규화(`method→function`, `route/api→endpoint`, `db→table` 등) 후 기록 → ktds는 canonical 타입만 처리. 정규화 맵 스냅샷이 필요하면 `schema.ts`를 **코드 import 하지 말고** 데이터 스냅샷 + 재검증 테스트로(A17).

## 5종 문서 ↔ 타입 매핑 (plan §2.3, 검증 완료)
01_tech-stack ← project.languages/frameworks, module, imports · 02_architecture ← layers[], depends_on/imports · 03_feature-spec ← domain/flow/step, contains_flow/flow_step · 04_api-spec ← endpoint, routes/middleware · 05_db-spec ← table/schema, reads_from/writes_to.
