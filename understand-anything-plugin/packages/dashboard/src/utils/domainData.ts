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
export type FlowMethod = "GET" | "POST" | "PUT" | "DELETE" | "BATCH" | "EVENT" | "FLOW";

export interface DomainFlow {
  /** Flow node id (= store activeFlowId target). */
  id: string;
  /** Method badge text (HTTP verb derived from entryPoint, or entryType label). */
  method: FlowMethod;
  /** Path / name shown in mono — entryPoint path or flow label. */
  path: string;
  /** Short description (flow.summary). */
  desc: string;
  /** Number of `flow_step` steps in this flow. */
  stepCount: number;
  /** Raw entryType from domainMeta (http / cron / event / manual / …). */
  entryType: string;
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
 *   "/orders/{id}" path). Falls back to GET when no verb is present.
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
    const m = raw.match(/^(GET|POST|PUT|DELETE|PATCH)\b\s*(.*)$/i);
    if (m) {
      const verb = m[1].toUpperCase();
      const method = (verb === "PATCH" ? "PUT" : verb) as FlowMethod;
      return { method, path: m[2].trim() || node.name };
    }
    return { method: "GET", path: raw || node.name };
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
    return {
      id: node.id,
      name: node.name,
      desc: node.summary,
      color: domainColor(node.id),
      icon: domainIcon(node.name, node.id),
      flowCount: flowIds.length,
      nodeCount,
      entities,
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
        desc: node.summary,
        stepCount: flowStepCount.get(node.id) ?? 0,
        entryType: entryType ?? "",
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
