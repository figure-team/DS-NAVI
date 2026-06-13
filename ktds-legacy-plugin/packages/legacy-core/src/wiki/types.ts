/**
 * /understand-docs wiki (Stage-22, ADR-004) — 세분화 노트 vault 모델.
 *
 * 산출물은 두 가지(ADR-004 ID2):
 *   (a) Karpathy 패턴 마크다운 vault — `WikiNote[]` + `index.md` + 5 허브 링크섹션
 *       (옵시디언/`/understand-knowledge` 소비, 디스크 정본)
 *   (b) 결정론 `knowledge-graph.json`(`DashboardGraph`) — 대시보드 정본(ID10 직접 emit,
 *       U-A 파서/LLM/머지 미사용)
 *
 * 결정론 경계(ADR-004 ID4): skeleton(노트 집합·frontmatter·위키링크·근거 인용·index.md·
 * 허브 링크섹션)과 knowledge-graph.json은 그래프에서 순수함수로 산출 → byte-diff=0.
 * 노트 본문 산문만 host(Claude)가 ProseProvider로 주입(스냅샷 제외).
 */

import type { Claim } from "../types.js";

/**
 * 노트 계층. `overview`는 5 허브 그룹용 layer 식별자 — 허브는 `docs/0N.md`에 그대로
 * 남고 WikiNote로 만들지 않는다(ID6, 물리 이동 폐기). 노트는 feature/api/table/step.
 */
export type WikiLayer = "overview" | "feature" | "api" | "table" | "step";

/** 전방 위키링크 — targetRelPath는 항상 full relPath·`.md` 없이(ID5/T0). */
export interface WikiLink {
  /** 대상 노트의 relPath에서 `.md`를 뗀 형태, 예: `api/account` ([[api/account]]). */
  targetRelPath: string;
  /** 표시 라벨(대상 노트 제목). */
  label: string;
}

/** frontmatter 값 — 문자열/숫자/문자열 배열만(결정론 직렬화). */
export type FrontmatterValue = string | number | string[];

/** 세분화 노트 한 건. relPath는 디스크 경로(`.md` 포함), 위키링크는 `.md` 없이. */
export interface WikiNote {
  /** docs/ 기준 상대 디스크 경로(`.md` 포함), 예: `feature/account.md`. */
  relPath: string;
  layer: WikiLayer;
  /** 원천 CanonicalNode.uid. */
  nodeUid: string;
  title: string;
  /** 원천 노드 요약(article 노드 summary·검색용). */
  summary: string;
  /** 근거 승계 claim(claims.ts 헬퍼로 도출 — 5종과 동일 근거·태그·펜스). */
  claims: Claim[];
  /** 전방 위키링크(백링크는 옵시디언/대시보드 자동). */
  links: WikiLink[];
  /** 결정론 키 순서로 빌드된 frontmatter. */
  frontmatter: Record<string, FrontmatterValue>;
}

/** 5 허브(`docs/0N.md`)에 멱등 주입할 "## 세분화 항목" 링크섹션. */
export interface HubInjection {
  /** 허브 파일명, 예: `04_api-spec.md`. */
  hub: string;
  links: WikiLink[];
}

// ── 대시보드 knowledge-graph.json 스키마 (ID10 직접 emit) ────────────────────
// U-A `KnowledgeGraph`(packages/core/src/types.ts) 계약의 우리가 emit하는 부분집합.
// 대시보드 validateGraph 통과 + KnowledgeGraphView/NodeInfo/FileExplorer 소비 형태.
//
// 필드는 U-A `KnowledgeGraphSchema`(packages/core/src/schema.ts:421)와 **대조 검증됨**
// (T0, 리뷰 de-risk): node 필수=id/type/name/summary/tags/complexity, complexity·
// direction·kind enum 일치, project 6필드 필수, edge.weight ∈ [0,1](T6 emit 시 준수),
// related·categorized_under 둘 다 EdgeType 멤버. T11에서 실제 로드 재확인(Open Q#5).

export interface DashKnowledgeMeta {
  wikilinks?: string[];
  backlinks?: string[];
  category?: string;
  /** 전체 본문(U-A 파서의 text[:3000] 캡을 안 거치므로 무삭제 — ID10/F2). */
  content?: string;
}

export interface DashGraphNode {
  id: string;
  /** 우리는 article(노트)·topic(계층)만 emit. */
  type: "article" | "topic";
  name: string;
  /** article 노드는 실제 디스크 경로(Files 탭 트리 소스). topic은 생략. */
  filePath?: string;
  summary: string;
  tags: string[];
  complexity: "simple" | "moderate" | "complex";
  knowledgeMeta?: DashKnowledgeMeta;
}

export interface DashGraphEdge {
  source: string;
  target: string;
  /** related(위키링크) / categorized_under(article→topic). */
  type: "related" | "categorized_under";
  direction: "forward" | "backward" | "bidirectional";
  /** 0~1 (validateGraph: z.number().min(0).max(1)) — T6 emit 시 범위 준수. */
  weight: number;
}

export interface DashLayer {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
}

export interface DashProjectMeta {
  name: string;
  languages: string[];
  frameworks: string[];
  description: string;
  /** 비결정 IO 경계 스탬프 — byte-diff 골든에서 제외(T6). */
  analyzedAt: string;
  /** 비결정 — 골든에서 제외(T6). */
  gitCommitHash: string;
}

export interface DashTourStep {
  order: number;
  title: string;
  description: string;
  nodeIds: string[];
}

/** 대시보드가 `GRAPH_DIR=<proj>/docs`로 읽는 knowledge-graph.json. */
export interface DashboardGraph {
  version: string;
  kind: "knowledge";
  project: DashProjectMeta;
  nodes: DashGraphNode[];
  edges: DashGraphEdge[];
  layers: DashLayer[];
  tour: DashTourStep[];
}

/** 위키 산출 전체 — orchestrator(T7)가 합성, 발행 단계가 소비. */
export interface WikiVault {
  notes: WikiNote[];
  /** index.md 본문(옵시디언/`/understand-knowledge` 편의용). */
  index: string;
  hubInjections: HubInjection[];
  /** 대시보드 정본(ID10 직접 emit). */
  graph: DashboardGraph;
}
