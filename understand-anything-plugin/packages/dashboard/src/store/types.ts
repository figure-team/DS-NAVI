// 공용 타입·상수 — 모든 슬라이스와 소비 컴포넌트가 공유한다.
// 병렬 워크트리 규약: 이 파일은 "추가만"(additive). 기존 타입 변경은 셸 소유 세션에서만.

export type NavigationLevel = "overview" | "layer-detail";
export type NodeType = "file" | "function" | "class" | "module" | "concept" | "config" | "document" | "service" | "table" | "endpoint" | "pipeline" | "schema" | "resource" | "domain" | "flow" | "step" | "article" | "entity" | "topic" | "claim" | "source";
export type Complexity = "simple" | "moderate" | "complex";
export type EdgeCategory = "structural" | "behavioral" | "data-flow" | "dependencies" | "semantic" | "infrastructure" | "domain" | "knowledge";
// 신설 6메뉴(pmpl-proto 메뉴 개편 2차): data/change/programs/quality/report/policy.
// wiki("문서")·knowledge(지식그래프) 모드는 2026-07-11 은퇴 — 내용은 업무지도·데이터·산출물이 흡수.
export type ViewMode =
  | "structural"
  | "domain"
  | "docs"
  | "rtm"
  | "screenspec"
  | "data"
  | "change"
  | "programs"
  | "quality"
  | "report"
  | "policy";

export interface FilterState {
  nodeTypes: Set<NodeType>;
  complexities: Set<Complexity>;
  layerIds: Set<string>;
  edgeCategories: Set<EdgeCategory>;
}

export const ALL_NODE_TYPES: NodeType[] = ["file", "function", "class", "module", "concept", "config", "document", "service", "table", "endpoint", "pipeline", "schema", "resource", "domain", "flow", "step", "article", "entity", "topic", "claim", "source"];
export const ALL_COMPLEXITIES: Complexity[] = ["simple", "moderate", "complex"];
export const ALL_EDGE_CATEGORIES: EdgeCategory[] = ["structural", "behavioral", "data-flow", "dependencies", "semantic", "infrastructure", "domain", "knowledge"];

export const EDGE_CATEGORY_MAP: Record<EdgeCategory, string[]> = {
  structural: ["imports", "exports", "contains", "inherits", "implements"],
  behavioral: ["calls", "subscribes", "publishes", "middleware"],
  "data-flow": ["reads_from", "writes_to", "transforms", "validates"],
  dependencies: ["depends_on", "tested_by", "configures"],
  semantic: ["related", "similar_to"],
  infrastructure: ["deploys", "serves", "provisions", "triggers", "migrates", "documents", "routes", "defines_schema"],
  domain: ["contains_flow", "flow_step", "cross_domain"],
  knowledge: ["cites", "contradicts", "builds_on", "exemplifies", "categorized_under", "authored_by"],
};

export const DOMAIN_EDGE_TYPES = EDGE_CATEGORY_MAP.domain;

/** Categories used for node type filter toggles. Single source of truth for NodeCategory. */
export type NodeCategory = "code" | "config" | "docs" | "infra" | "data" | "domain" | "knowledge";

/** 오버레이 채널 원본 (ktds) — generatedAt(ISO)으로 자동 활성 우선순위 결정. */
export interface OverlayChannelData {
  changed: string[];
  affected: string[];
  generatedAt: string;
}

/** 오버레이 채널 식별자 — diff(실측)/impact(예측)/risk(정적 품질, 토글 전용). */
export type OverlaySource = "diff" | "impact" | "risk";

/** ktds: 구조 탭 "영향도 분석"(claude -p /understand-impact) 실행 상태. */
export type ImpactJobStatus = "idle" | "running" | "done" | "failed";
export interface ImpactJobState {
  status: ImpactJobStatus;
  jobId: string | null;
  query: string | null;
  exitCode: number | null;
  error: string | null;
}

/**
 * P3: 노드 사용자 오버레이 레코드(node-overrides.json 의 값). 레코드 존재 = 그 노드
 * 확정(approver). editedClaims 키 = 편집된 의미 주장 필드("summary" | "detail:<id>").
 */
export interface NodeOverride {
  editedClaims: Record<string, string>;
  approver: string;
  at: string;
  audit?: Array<{ event: string; by: string; at: string }>;
}
