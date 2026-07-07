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
  /**
   * 병합된 폼 표시 흐름(JSP/Stripes `?xxxForm` — 서비스 호출 없이 화면만 forward).
   * 업무 관점에서 처리 흐름(`?xxx`)의 화면 진입 단계이므로 목록에서 접고 여기로
   * 승계한다. null = 대응 폼 흐름 없음.
   */
  formFlow: { id: string; name: string } | null;
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
export function parseCitations(raw: unknown): DomainClaimCitation[] {
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

/**
 * Parse domainMeta.ktdsClaims (+ groundedPct/counts) embedded by emit's
 * embedVerification. Exported for the workspace header GroundedBar (P3) —
 * same source of truth as the landing cards.
 */
export function parseDomainClaims(node: GraphNode): {
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
  "var(--color-layer-api)", // api lane
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

const VERB_RE = /^(GET|POST|PUT|DELETE|PATCH|ANY)\b\s*(.*)$/i;

/** PATCH folds into the PUT badge; ANY and the real verbs pass through. */
function toMethod(verb: string): FlowMethod {
  const v = verb.toUpperCase();
  return (v === "PATCH" ? "PUT" : v) as FlowMethod;
}

/**
 * For http flows the real route URL lives in the node id, which the engine emits
 * as `flow:<METHOD> <path>` (e.g. "flow:ANY /actions/Account.action?signon").
 * Return that URL so the list shows the endpoint, not the handler signature that
 * `entryPoint` carries (e.g. "AccountActionBean#signonForm"). Returns null when
 * the id isn't in that shape — e.g. the bundled demo graph uses slug ids
 * ("flow:order-create"), where the URL is in entryPoint instead.
 */
function httpPathFromId(node: GraphNode): { method: FlowMethod; path: string } | null {
  const body = node.id.startsWith("flow:") ? node.id.slice("flow:".length) : node.id;
  // Path must start with "/" — guards against slugs and FQN/servlet patterns.
  const m = body.match(/^(GET|POST|PUT|DELETE|PATCH|ANY)\s+(\/\S.*)$/i);
  if (!m) return null;
  return { method: toMethod(m[1]), path: m[2].trim() };
}

/**
 * Derive the flow's method badge + display path from its entry metadata.
 *
 * - http entry → prefer the real route URL from the node id; otherwise the HTTP
 *   verb parsed from `entryPoint` ("POST /orders" → POST, "/orders" path). A
 *   leading "ANY" (the engine's token for an entry with no fixed HTTP verb, e.g.
 *   event-dispatched Stripes actions) shows as ANY; a verb-less http entry also
 *   resolves to ANY (never a fabricated GET).
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
    // The route URL is the meaningful "feature path" for screen 2; entryPoint
    // often holds the handler signature (Stripes/Spring), so the id wins first.
    const fromId = httpPathFromId(node);
    if (fromId) return fromId;
    const raw = (entryPoint ?? "").trim();
    const m = raw.match(VERB_RE);
    if (m) return { method: toMethod(m[1]), path: m[2].trim() || node.name };
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

/**
 * 폼 표시 흐름 병합 맵 (A안 — 표시 레벨 병합).
 *
 * JSP/Stripes 계열에서 `…Form` 핸들러는 서비스 호출 없이 화면(JSP)으로
 * forward 만 하는 화면 진입 핸들러다. 같은 베이스 URL에 처리 흐름 `?xxx` 가
 * 실존할 때만 폼 흐름을 그 처리 흐름에 접는다(결정론, 짝이 없으면 독립 유지):
 * - `?xxxForm` 이벤트 라우트 → `?xxx` (id 형태 `flow:<METHOD> <path>?<event>`)
 * - 베이스 라우트(@DefaultHandler)인데 entryPoint 핸들러명이 `#xxxForm` 인
 *   경우 → `?xxx` (예: Account.action 의 signonForm → ?signon 로그인 처리)
 * 그래프 데이터는 건드리지 않으므로 RTM·영향분석 등 다른 소비처는 무영향.
 *
 * @returns formFlowId → primaryFlowId
 */
export function buildFormMergeMap(nodes: readonly GraphNode[]): Map<string, string> {
  const flowNodes = nodes.filter((n) => n.type === "flow");
  const flowIds = new Set(flowNodes.map((n) => n.id));
  const map = new Map<string, string>();
  const RE_EVENT = /^(flow:(?:GET|POST|PUT|DELETE|PATCH|ANY)\s+\/\S*?)\?(\w+)Form$/i;
  const RE_BASE = /^flow:(?:GET|POST|PUT|DELETE|PATCH|ANY)\s+\/[^?\s]+$/i;
  for (const node of flowNodes) {
    const m = node.id.match(RE_EVENT);
    if (m) {
      const primary = `${m[1]}?${m[2]}`;
      if (flowIds.has(primary)) map.set(node.id, primary);
      continue;
    }
    if (RE_BASE.test(node.id)) {
      const { entryPoint } = readEntryMeta(node);
      const h = entryPoint?.match(/#(\w+)Form$/);
      if (h) {
        const primary = `${node.id}?${h[1]}`;
        if (flowIds.has(primary)) map.set(node.id, primary);
      }
    }
  }
  return map;
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

  // 폼 표시 흐름 병합(A안) — 기능 수는 병합 후 기준(폼+처리 짝 = 기능 1개).
  // 분석 노드 수(step)는 실존 노드 그대로 둔다(정직 표기).
  const formMerge = buildFormMergeMap(flowNodes);
  // 카드와 동일 기준(짝이 같은 도메인일 때만 병합)으로 전역 통계도 계산한다.
  const flowDomain = new Map<string, string>();
  for (const [domainId, ids] of domainFlows) for (const id of ids) flowDomain.set(id, domainId);
  let mergedCount = 0;
  for (const [formId, primaryId] of formMerge) {
    if (flowDomain.get(formId) !== undefined && flowDomain.get(formId) === flowDomain.get(primaryId)) {
      mergedCount++;
    }
  }

  const cards: DomainCard[] = domainNodes.map((node) => {
    const allFlowIds = domainFlows.get(node.id) ?? [];
    const domainIdSet = new Set(allFlowIds);
    // 짝(primary)이 같은 도메인에 있을 때만 접는다 — 경계가 갈리면 독립 유지.
    const flowIds = allFlowIds.filter(
      (fid) => !(formMerge.has(fid) && domainIdSet.has(formMerge.get(fid)!)),
    );
    const nodeCount = allFlowIds.reduce((sum, fid) => sum + (flowStepCount.get(fid) ?? 0), 0);
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
    flowCount: flowNodes.length - mergedCount,
    stepCount: stepNodes.length,
    language: (project?.languages ?? [])
      .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
      .join(", "),
    framework: (project?.frameworks ?? []).join(" + "),
  };

  return { stats, cards };
}

/**
 * Build the screen-2 flow rows for one domain.
 * `mergeForms: false` 는 병합 없이 전 흐름을 돌려준다 — 병합으로 목록에서
 * 접힌 폼 흐름을 배지 클릭으로 선택했을 때의 조회용 인덱스(스파인 헤더).
 */
export function buildDomainFlows(
  graph: KnowledgeGraph,
  domainId: string,
  opts: { mergeForms?: boolean } = {},
): DomainFlow[] {
  const mergeForms = opts.mergeForms !== false;
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

  // 폼 표시 흐름 병합(A안) — 이 도메인 안에서 짝이 맞는 `?xxxForm` 은 행에서
  // 접고, 처리 흐름 행에 formFlow 로 승계한다(카드 flowCount 와 동일 기준).
  const domainFlowNodes = graph.nodes.filter((n) => flowIds.has(n.id));
  const formMerge = mergeForms ? buildFormMergeMap(domainFlowNodes) : new Map<string, string>();
  const formByPrimary = new Map<string, GraphNode>();
  for (const [formId, primaryId] of formMerge) {
    const formNode = domainFlowNodes.find((n) => n.id === formId);
    if (formNode) formByPrimary.set(primaryId, formNode);
  }

  return domainFlowNodes
    .filter((n) => !formMerge.has(n.id))
    .map((node): DomainFlow => {
      const { entryPoint, entryType } = readEntryMeta(node);
      const { method, path } = deriveMethodAndPath(node, entryPoint, entryType);
      const formNode = formByPrimary.get(node.id);
      return {
        id: node.id,
        method,
        path,
        name: node.name,
        desc: node.summary,
        stepCount: flowStepCount.get(node.id) ?? 0,
        entryType: entryType ?? "",
        grounding: parseFlowStepClaim(node),
        formFlow: formNode ? { id: formNode.id, name: formNode.name } : null,
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

/** Flow verdict bucket for the filter chips — "none" = unfilled (no grounding). */
export type FlowVerdictKey = "GROUNDED" | "NEEDS_REVIEW" | "none";

export function flowVerdictKey(flow: DomainFlow): FlowVerdictKey {
  return flow.grounding ? flow.grounding.verdict : "none";
}

/**
 * Workspace list filter (§4-2) — all-client, deterministic. Empty sets mean
 * "no restriction" for that facet (the UI treats zero selected chips as All).
 */
export interface FlowFilter {
  /** Case-insensitive substring over name / path / method. */
  query: string;
  groups: ReadonlySet<FlowGroupKey>;
  methods: ReadonlySet<FlowMethod>;
  verdicts: ReadonlySet<FlowVerdictKey>;
}

export const EMPTY_FLOW_FILTER: FlowFilter = {
  query: "",
  groups: new Set(),
  methods: new Set(),
  verdicts: new Set(),
};

export function isFilterActive(f: FlowFilter): boolean {
  return f.query.trim() !== "" || f.groups.size > 0 || f.methods.size > 0 || f.verdicts.size > 0;
}

/** Apply the workspace filter. Preserves input order (graph order). */
export function filterFlows(flows: DomainFlow[], f: FlowFilter): DomainFlow[] {
  // NFC 정규화 — IME 에 따라 한글이 NFD 로 들어오면 동일 표기가 불일치한다(리뷰 R5).
  const q = f.query.trim().normalize("NFC").toLowerCase();
  return flows.filter((flow) => {
    if (f.groups.size > 0 && !f.groups.has(flowGroupKey(flow.entryType))) return false;
    if (f.methods.size > 0 && !f.methods.has(flow.method)) return false;
    if (f.verdicts.size > 0 && !f.verdicts.has(flowVerdictKey(flow))) return false;
    if (q) {
      const hay = `${flow.name}\n${flow.path}\n${flow.method}`.normalize("NFC").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const FACET_GROUP_ORDER: FlowGroupKey[] = ["http", "batch", "event", "other"];
const FACET_VERDICT_ORDER: FlowVerdictKey[] = ["GROUNDED", "NEEDS_REVIEW", "none"];

/**
 * 필터 칩 후보 파셋(§4-2) — 이 도메인에 실존하는 값만, 결정론 순서로.
 * UI 규칙: 파셋 값이 2종 이상일 때만 칩 노출(값 1종 = 필터 무의미, 빈 칩 금지).
 * jpetstore·eGov 데모는 세 파셋 모두 균일(http·ANY·GROUNDED)이라 칩이 비노출이
 * **정상**이다 — 발현 검증은 이 함수의 단위테스트가 담당한다(리뷰 C2).
 */
export function flowFacets(flows: DomainFlow[]): {
  groups: FlowGroupKey[];
  methods: FlowMethod[];
  verdicts: FlowVerdictKey[];
} {
  const groups = new Set(flows.map((f) => flowGroupKey(f.entryType)));
  const methods: FlowMethod[] = [];
  for (const f of flows) if (!methods.includes(f.method)) methods.push(f.method);
  const verdicts = new Set(flows.map((f) => flowVerdictKey(f)));
  return {
    groups: FACET_GROUP_ORDER.filter((k) => groups.has(k)),
    methods,
    verdicts: FACET_VERDICT_ORDER.filter((k) => verdicts.has(k)),
  };
}

/** Workspace tab (§3): business = 업무 흐름도, code = 기능(코드 흐름). */
export type WorkspaceView = "business" | "code";

/**
 * True when the domain node carries an LLM-filled business flow
 * (`domainMeta.businessFlow` — P4 pipeline output). P3 wires the check so the
 * default-tab rule below is already data-driven when P4 lands.
 */
export function hasBusinessFlow(node: GraphNode | undefined): boolean {
  const meta = node?.domainMeta as { businessFlow?: unknown; businessFlows?: unknown } | undefined;
  // B안(복수화) — 신형 businessFlows[] 우선, 레거시 단수도 계속 인식(하위호환).
  if (Array.isArray(meta?.businessFlows) && (meta!.businessFlows as unknown[]).length > 0) {
    return true;
  }
  const bf = meta?.businessFlow as { nodes?: unknown } | undefined;
  return Array.isArray(bf?.nodes) && (bf!.nodes as unknown[]).length > 0;
}

/**
 * Resolve the active workspace tab from the URL (§3, URL is truth):
 * - explicit `?view=` wins (unknown values fall back like unspecified);
 * - `?flow=` deep links (pre-P3 URLs) mean the code tab — 하위호환 파손 0;
 * - otherwise business when the domain has a filled businessFlow, else code.
 */
export function resolveWorkspaceView(
  viewParam: string | null,
  flowParam: string | null,
  domainHasBusinessFlow: boolean,
): WorkspaceView {
  if (viewParam === "business" || viewParam === "code") return viewParam;
  if (flowParam) return "code";
  return domainHasBusinessFlow ? "business" : "code";
}
