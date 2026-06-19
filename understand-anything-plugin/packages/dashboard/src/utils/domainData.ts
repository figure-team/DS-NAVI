import type { KnowledgeGraph, GraphNode } from "@understand-anything/core/types";

/**
 * Shared domain-graph extraction for the prototype-faithful domain experience
 * (DomainMapView screen 1 + FlowListView screen 2). Reuses the same source of
 * truth as DomainGraphView's `buildDomainOverview` / `buildDomainDetail`:
 * domain nodes, `contains_flow` edges → flows, `flow_step` edges → steps, and
 * `flow.domainMeta` (entryPoint / entryType) for the method badge + path.
 *
 * Kept as a pure data layer (no React, no @xyflow) so both screens render the
 * exact card/row shapes the prototype mocks describe without inventing a new
 * data path.
 */

/** A flow's HTTP-style category, used for the method badge + usecase grouping. */
export type FlowMethod = "GET" | "POST" | "PUT" | "DELETE" | "ANY" | "BATCH" | "EVENT" | "FLOW";

export interface DomainFlow {
  /** Flow node id (= store activeFlowId target). */
  id: string;
  /** Method badge text (HTTP verb derived from entryPoint, or entryType label). */
  method: FlowMethod;
  /** Path / name shown in mono — entryPoint path or flow label. */
  path: string;
  /** Short function label (flow.name) — what the flow does, e.g. "계정 정보 수정 처리". */
  name: string;
  /** Long description (flow.summary). */
  desc: string;
  /** Number of `flow_step` steps in this flow. */
  stepCount: number;
  /** Raw entryType from domainMeta (http / cron / event / manual / …). */
  entryType: string;
  /** Flow-level verification (own ref grounding); null when unfilled/unverified. */
  grounding: FlowGrounding | null;
}

/** A citation backing a domain-level claim (embedded by emit's embedVerification). */
export interface DomainClaimCitation {
  filePath: string;
  line: number;
  /** verify.ts CitationStatus ('ok' | 'text-mismatch' | …). undefined → treat as ok. */
  status?: string;
}

/** A verified domain-level claim (summary / entity / businessRule / crossDomain). */
export interface DomainClaim {
  kind: "summary" | "entity" | "businessRule" | "crossDomain";
  text: string;
  verdict: "GROUNDED" | "NEEDS_REVIEW";
  citations: DomainClaimCitation[];
}

export interface DomainCard {
  /** Domain node id (= store navigateToDomain target). */
  id: string;
  /** Display name. */
  name: string;
  /** Domain summary / description. */
  desc: string;
  /** Deterministic accent color derived from the domain id. */
  color: string;
  /** Emoji icon — keyword-mapped from the domain name, deterministic fallback. */
  icon: string;
  /** Number of flows (`contains_flow` edges) in this domain. */
  flowCount: number;
  /** Total number of step nodes across this domain's flows. */
  nodeCount: number;
  /** Entity names from domainMeta (may be empty). */
  entities: string[];
  /**
   * Verified domain-level claims (from domainMeta.ktdsClaims). Empty when the
   * domain hasn't been LLM-filled (deterministic-label only) — `filled` is false.
   */
  claims: DomainClaim[];
  /** True when LLM-filled (has ktdsClaims) — drives "채움 전" vs detail rendering. */
  filled: boolean;
  /** Grounded ratio (%) over domain-level claims; null when unfilled. */
  groundedPct: number | null;
  /** GROUNDED claim count. */
  groundedCount: number;
  /** NEEDS_REVIEW claim count. */
  reviewCount: number;
}

const CLAIM_KINDS = new Set(["summary", "entity", "businessRule", "crossDomain"]);

/** Parse a raw `citations` array (VerifiedCitation[] shape) into DomainClaimCitation[]. */
function parseCitations(raw: unknown): DomainClaimCitation[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .map((x): DomainClaimCitation | null => {
      const ci = x as Record<string, unknown>;
      if (typeof ci.filePath !== "string" || typeof ci.line !== "number") return null;
      return {
        filePath: ci.filePath,
        line: ci.line,
        status: typeof ci.status === "string" ? ci.status : undefined,
      };
    })
    .filter((x): x is DomainClaimCitation => x !== null);
}

/** Read `domainMeta.ktdsClaims` as a raw array (embedded by emit's embedVerification). */
function readKtdsClaims(node: GraphNode): unknown[] {
  const meta = node.domainMeta as Record<string, unknown> | undefined;
  return Array.isArray(meta?.ktdsClaims) ? (meta!.ktdsClaims as unknown[]) : [];
}

/**
 * A flow/step node's single verification item — its own ref's grounding, embedded
 * by emit's embedVerification (`ktdsClaims: [VerifiedItem]` with kind 'flow'|'step').
 * Powers the screen-2 flow row badge + screen-3 step detail citations.
 */
export interface FlowGrounding {
  verdict: "GROUNDED" | "NEEDS_REVIEW";
  citations: DomainClaimCitation[];
}

/**
 * Parse a flow/step node's verification item from `domainMeta.ktdsClaims[0]`.
 * Returns null when the node hasn't been LLM-filled/verified (no flow/step claim)
 * — screens 2/3 then render structural detail only, with no grounding affordance.
 */
export function parseFlowStepClaim(node: GraphNode): FlowGrounding | null {
  const first = readKtdsClaims(node)[0] as Record<string, unknown> | undefined;
  if (!first || (first.kind !== "flow" && first.kind !== "step")) return null;
  return {
    verdict: first.verdict === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "GROUNDED",
    citations: parseCitations(first.citations),
  };
}

/**
 * A step node's template detail section (P2) — kind 'detail:<sectionId>', embedded
 * by emit's embedVerification alongside the step summary. Each is a verified LLM
 * semantic claim (e.g. 'role') with its own grounding + citations.
 */
export interface StepDetailSection {
  /** Template section id (e.g. "role"). */
  sectionId: string;
  text: string;
  verdict: "GROUNDED" | "NEEDS_REVIEW";
  citations: DomainClaimCitation[];
}

/**
 * Parse a step node's detail sections from `domainMeta.ktdsClaims` (items whose
 * kind is 'detail:<sectionId>'). Returns [] when the step has no filled detail.
 * Order is preserved as embedded (verify sorts by section id → deterministic).
 */
export function parseStepDetailSections(node: GraphNode): StepDetailSection[] {
  return readKtdsClaims(node)
    .map((raw): StepDetailSection | null => {
      const o = raw as Record<string, unknown>;
      const kind = typeof o.kind === "string" ? o.kind : "";
      if (!kind.startsWith("detail:")) return null;
      const text = typeof o.text === "string" ? o.text : "";
      if (!text) return null;
      return {
        sectionId: kind.slice("detail:".length),
        text,
        verdict: o.verdict === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "GROUNDED",
        citations: parseCitations(o.citations),
      };
    })
    .filter((x): x is StepDetailSection => x !== null);
}

/** Parse domainMeta.ktdsClaims (+ groundedPct/counts) embedded by emit's embedVerification. */
function parseDomainClaims(node: GraphNode): {
  claims: DomainClaim[];
  filled: boolean;
  groundedPct: number | null;
  groundedCount: number;
  reviewCount: number;
} {
  const meta = node.domainMeta as Record<string, unknown> | undefined;
  const claims: DomainClaim[] = readKtdsClaims(node)
    .map((c): DomainClaim | null => {
      const o = c as Record<string, unknown>;
      const kind = typeof o.kind === "string" && CLAIM_KINDS.has(o.kind) ? o.kind : null;
      const text = typeof o.text === "string" ? o.text : "";
      if (!kind || !text) return null;
      return {
        kind: kind as DomainClaim["kind"],
        text,
        verdict: o.verdict === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "GROUNDED",
        citations: parseCitations(o.citations),
      };
    })
    .filter((c): c is DomainClaim => c !== null);
  const filled = claims.length > 0;
  return {
    claims,
    filled,
    groundedPct: typeof meta?.groundedPct === "number" ? meta.groundedPct : null,
    groundedCount:
      typeof meta?.groundedCount === "number"
        ? meta.groundedCount
        : claims.filter((c) => c.verdict === "GROUNDED").length,
    reviewCount:
      typeof meta?.reviewCount === "number"
        ? meta.reviewCount
        : claims.filter((c) => c.verdict === "NEEDS_REVIEW").length,
  };
}

export interface DomainStats {
  domainCount: number;
  flowCount: number;
  stepCount: number;
  /** Joined languages, e.g. "Java" (empty string when unknown). */
  language: string;
  /** Joined frameworks, e.g. "Spring + MyBatis" (empty string when unknown). */
  framework: string;
}

/**
 * Deterministic per-domain accent palette (mirrors the prototype mock colors).
 * Hash the domain id so the same domain always gets the same lane-flavored hue,
 * matching DomainClusterNode's intent of a stable color per domain.
 */
const DOMAIN_PALETTE = [
  "#d4a574", // gold (api lane)
  "#38bdf8", // cyan (service lane)
  "#a78bfa", // violet (dao lane)
  "#f87171", // red (db lane)
  "#6ee7b7", // mint
  "#fcd34d", // amber
];

export function domainColor(domainId: string): string {
  let hash = 0;
  for (let i = 0; i < domainId.length; i++) {
    hash = (hash * 31 + domainId.charCodeAt(i)) >>> 0;
  }
  return DOMAIN_PALETTE[hash % DOMAIN_PALETTE.length];
}

/**
 * Keyword → emoji map for domain cards (prototype used per-domain emoji icons).
 * Matched case-insensitively against the domain name + id (Korean + English
 * synonyms). Unmatched domains get a deterministic fallback so every card still
 * shows an icon rather than a bare dot.
 */
const DOMAIN_ICON_RULES: Array<{ icon: string; kw: string[] }> = [
  { icon: "📦", kw: ["order", "주문", "구매", "purchase", "cart", "장바구니"] },
  { icon: "🏷️", kw: ["product", "상품", "item", "catalog", "카탈로그", "재고", "inventory", "stock"] },
  { icon: "👤", kw: ["member", "account", "user", "회원", "사용자", "고객", "customer", "auth", "인증", "login", "로그인"] },
  { icon: "💳", kw: ["payment", "결제", "billing", "정산", "settle", "환불", "refund", "pay", "ledger"] },
  { icon: "🚚", kw: ["delivery", "배송", "shipping", "물류", "logistics"] },
  { icon: "🔔", kw: ["notification", "알림", "message", "메시지", "mail", "메일"] },
  { icon: "📊", kw: ["report", "리포트", "통계", "stats", "analytics", "dashboard", "대시보드"] },
  { icon: "🔍", kw: ["search", "검색", "query"] },
  { icon: "⚙️", kw: ["admin", "관리", "설정", "config", "system", "시스템"] },
  { icon: "⭐", kw: ["review", "리뷰", "평점", "rating", "추천", "recommend"] },
];
const DOMAIN_ICON_FALLBACK = ["📁", "🗂️", "🧩", "📐", "🗃️", "🧱", "🔷", "📒"];

export function domainIcon(name: string, domainId: string): string {
  const hay = `${name} ${domainId}`.toLowerCase();
  for (const rule of DOMAIN_ICON_RULES) {
    if (rule.kw.some((k) => hay.includes(k))) return rule.icon;
  }
  let hash = 0;
  for (let i = 0; i < domainId.length; i++) {
    hash = (hash * 31 + domainId.charCodeAt(i)) >>> 0;
  }
  return DOMAIN_ICON_FALLBACK[hash % DOMAIN_ICON_FALLBACK.length];
}

function readEntryMeta(node: GraphNode): { entryPoint?: string; entryType?: string } {
  const meta = node.domainMeta as { entryPoint?: unknown; entryType?: unknown } | undefined;
  return {
    entryPoint: typeof meta?.entryPoint === "string" ? meta.entryPoint : undefined,
    entryType: typeof meta?.entryType === "string" ? meta.entryType : undefined,
  };
}

/**
 * Derive the flow's method badge + display path from its entry metadata.
 *
 * - http entry → HTTP verb parsed from `entryPoint` ("POST /orders" → POST,
 *   "/orders/{id}" path). A leading "ANY" (the engine's token for an entry with
 *   no fixed HTTP verb, e.g. event-dispatched Stripes actions) shows as ANY;
 *   a verb-less http entry also resolves to ANY (never a fabricated GET).
 * - cron / batch → BATCH, event → EVENT. Non-http entries show their
 *   `entryPoint` (job name) or the flow label as the path.
 */
function deriveMethodAndPath(
  node: GraphNode,
  entryPoint: string | undefined,
  entryType: string | undefined,
): { method: FlowMethod; path: string } {
  const type = (entryType ?? "").toLowerCase();
  if (type === "http") {
    const raw = (entryPoint ?? "").trim();
    const m = raw.match(/^(GET|POST|PUT|DELETE|PATCH|ANY)\b\s*(.*)$/i);
    if (m) {
      const verb = m[1].toUpperCase();
      // PATCH folds into the PUT badge; ANY and the real verbs pass through.
      const method = (verb === "PATCH" ? "PUT" : verb) as FlowMethod;
      return { method, path: m[2].trim() || node.name };
    }
    // Verb-less http entry → ANY (honest "no fixed HTTP verb"), not a guessed GET.
    return { method: "ANY", path: raw || node.name };
  }
  if (type === "cron" || type === "batch" || type === "schedule") {
    return { method: "BATCH", path: entryPoint || node.name };
  }
  if (type === "event" || type === "message" || type === "queue") {
    return { method: "EVENT", path: entryPoint || node.name };
  }
  return { method: "FLOW", path: entryPoint && entryPoint !== "TBD" ? entryPoint : node.name };
}

/** Public: method badge + display path for a single flow node (e.g. spine topbar). */
export function flowBadge(node: GraphNode): { method: FlowMethod; path: string } {
  const { entryPoint, entryType } = readEntryMeta(node);
  return deriveMethodAndPath(node, entryPoint, entryType);
}

/** Build the screen-1 stats bar + ordered domain cards from the domain graph. */
export function buildDomainCards(graph: KnowledgeGraph): {
  stats: DomainStats;
  cards: DomainCard[];
} {
  const domainNodes = graph.nodes.filter((n) => n.type === "domain");
  const flowNodes = graph.nodes.filter((n) => n.type === "flow");
  const stepNodes = graph.nodes.filter((n) => n.type === "step");

  // domain → flow ids
  const domainFlows = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type === "contains_flow") {
      const list = domainFlows.get(e.source) ?? [];
      list.push(e.target);
      domainFlows.set(e.source, list);
    }
  }
  // flow → step count
  const flowStepCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type === "flow_step") {
      flowStepCount.set(e.source, (flowStepCount.get(e.source) ?? 0) + 1);
    }
  }

  const cards: DomainCard[] = domainNodes.map((node) => {
    const flowIds = domainFlows.get(node.id) ?? [];
    const nodeCount = flowIds.reduce((sum, fid) => sum + (flowStepCount.get(fid) ?? 0), 0);
    const meta = node.domainMeta as { entities?: unknown } | undefined;
    const entities = Array.isArray(meta?.entities)
      ? (meta!.entities as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const verified = parseDomainClaims(node);
    return {
      id: node.id,
      name: node.name,
      desc: node.summary,
      color: domainColor(node.id),
      icon: domainIcon(node.name, node.id),
      flowCount: flowIds.length,
      nodeCount,
      entities,
      claims: verified.claims,
      filled: verified.filled,
      groundedPct: verified.groundedPct,
      groundedCount: verified.groundedCount,
      reviewCount: verified.reviewCount,
    };
  });

  const project = graph.project;
  const stats: DomainStats = {
    domainCount: domainNodes.length,
    flowCount: flowNodes.length,
    stepCount: stepNodes.length,
    language: (project?.languages ?? [])
      .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
      .join(", "),
    framework: (project?.frameworks ?? []).join(" + "),
  };

  return { stats, cards };
}

/** Build the screen-2 flow rows for one domain. */
export function buildDomainFlows(graph: KnowledgeGraph, domainId: string): DomainFlow[] {
  const flowIds = new Set(
    graph.edges
      .filter((e) => e.type === "contains_flow" && e.source === domainId)
      .map((e) => e.target),
  );
  const flowStepCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type === "flow_step" && flowIds.has(e.source)) {
      flowStepCount.set(e.source, (flowStepCount.get(e.source) ?? 0) + 1);
    }
  }

  return graph.nodes
    .filter((n) => flowIds.has(n.id))
    .map((node): DomainFlow => {
      const { entryPoint, entryType } = readEntryMeta(node);
      const { method, path } = deriveMethodAndPath(node, entryPoint, entryType);
      return {
        id: node.id,
        method,
        path,
        name: node.name,
        desc: node.summary,
        stepCount: flowStepCount.get(node.id) ?? 0,
        entryType: entryType ?? "",
        grounding: parseFlowStepClaim(node),
      };
    });
}

/** Look up a single domain node (for the FlowListView header). */
export function findDomain(graph: KnowledgeGraph, domainId: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === domainId && n.type === "domain");
}

/**
 * Group key for usecase sections. Real data has no "usecase" field, so we group
 * by `entryType` into honest, human-readable buckets. When every flow shares one
 * bucket the caller renders a single ungrouped list (see FlowListView).
 */
export type FlowGroupKey = "http" | "batch" | "event" | "other";

export function flowGroupKey(entryType: string): FlowGroupKey {
  const t = entryType.toLowerCase();
  if (t === "http") return "http";
  if (t === "cron" || t === "batch" || t === "schedule") return "batch";
  if (t === "event" || t === "message" || t === "queue") return "event";
  return "other";
}
