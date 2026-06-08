/**
 * ktds canonical model — the stable interface between U-A's knowledge-graph.json
 * and ktds document generation.
 *
 * Integration rule (plan §0.2 / §7 원칙3): ktds reads the on-disk
 * `.understand-anything/knowledge-graph.json` contract, NOT U-A's internal TS API.
 * The verified U-A v2.7.3 source shape this maps from is in docs/ktds/UA_BASELINE.md.
 */

// ── 근거 계약 (plan §5 / 02 §3.2) ───────────────────────────────────────
export type Confidence =
  | "CONFIRMED_AI"
  | "CONFIRMED_HUMAN"
  | "INFERRED"
  | "NEEDS_REVIEW";

/** Rendering tag per confidence (plan §5.1). */
export const CONFIDENCE_TAG: Record<Confidence, string> = {
  CONFIRMED_AI: "[확정(AI)]",
  CONFIRMED_HUMAN: "[확정(담당자)]",
  INFERRED: "[추정]",
  NEEDS_REVIEW: "[확인 필요]",
};

export interface Evidence {
  path: string;
  symbol?: string;
  line?: number;
}

export interface Claim {
  claim: string;
  confidence: Confidence;
  /** CONFIRMED_AI requires >= 1 evidence, else the doc is RETURNED (plan §5.2 / A5). */
  evidence: Evidence[];
  requires_human_review: boolean;
}

// ── Canonical graph (kg-reader output) ─────────────────────────────────
/**
 * U-A NodeType (21 total), already canonicalized by U-A schema.ts before it
 * lands on disk. Verified against v2.7.3 types.ts (docs/ktds/UA_BASELINE.md).
 */
export type CanonicalKind =
  | "file" | "function" | "class" | "module" | "concept"
  | "config" | "document" | "service" | "table" | "endpoint"
  | "pipeline" | "schema" | "resource"
  | "domain" | "flow" | "step"
  | "article" | "entity" | "topic" | "claim" | "source";

export interface CanonicalNode {
  /** Stable derived id, e.g. "LoginController#login" — NOT U-A's ordinal `id`. plan §2.1 uid 정책 */
  uid: string;
  kind: CanonicalKind;
  name: string;
  evidence?: Evidence;
  summary: string;
  tags: string[];
}

export interface CanonicalEdge {
  sourceUid: string;
  targetUid: string;
  /** U-A EdgeType (35). */
  type: string;
  direction: "forward" | "backward" | "bidirectional";
  weight: number;
}

export interface CanonicalGraph {
  /** U-A graph data version (field name is `version`, e.g. "1.0.0"). plan §0.2 */
  sourceVersion: string;
  /** structural fingerprint for drift detection (plan §2.1 / A14). */
  fingerprint: string;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
}

// ── 검토/승인 상태기계 (plan §3.3 / 축③) ───────────────────────────────
export type DocState = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "RETURNED";
