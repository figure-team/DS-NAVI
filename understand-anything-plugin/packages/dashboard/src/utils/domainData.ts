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
  /**
   * 도메인 내부 서브패키지 코드(예: "adb") — filePath 의 `/<domainKey>/<seg>/`
   * 세그먼트에서 파생(층 세그먼트는 제외). null = 파생 불가(filePath 없음/미매치).
   */
  subGroup: string | null;
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

/** 화면1 구성도의 도메인 간 관계선 — 방향 있는 상호작용(같은 쌍·방향은 병합). */
export interface DomainRelation {
  /** 출발 도메인 노드 id. */
  source: string;
  /** 도착 도메인 노드 id. */
  target: string;
  /** 상호작용 원문 설명(콜론 뒤) — 관계선 툴팁용. */
  texts: string[];
}

/** "A → B: 설명" — 화살표는 →/->, 콜론은 반각/전각 허용. */
const RELATION_RE = /^\s*(.+?)\s*(?:→|->)\s*(.+?)\s*[:：]\s*(\S[\s\S]*)$/;

/**
 * `domainMeta.crossDomainInteractions`(fill 이 쓰는 "A → B: 설명" 자유서술)에서
 * 도메인 간 관계 엣지를 파싱한다 — 화면1 구성도 관계선의 유일한 데이터 소스.
 * 토큰은 도메인 키(id 접미사)·표시명(name) **완전일치**로만 해석하고, 화살표가
 * 없거나 해석 불가한 문장은 조용히 버린다(날조 0 — 관계선은 파싱 성공분만).
 * 결과는 source→target 사전순 정렬(결정론).
 */
export function buildDomainRelations(graph: KnowledgeGraph): DomainRelation[] {
  const domains = graph.nodes.filter((n) => n.type === "domain");
  // 토큰 해석 테이블 — 키("account")와 표시명("계정/회원") 둘 다 등록.
  const byToken = new Map<string, string>();
  for (const d of domains) {
    byToken.set(domainKeyFromId(d.id).toLowerCase(), d.id);
    if (d.name) byToken.set(d.name.trim().toLowerCase(), d.id);
  }
  const acc = new Map<string, DomainRelation>();
  for (const d of domains) {
    const meta = d.domainMeta as { crossDomainInteractions?: unknown } | undefined;
    const raw = meta?.crossDomainInteractions;
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const m = item.match(RELATION_RE);
      if (!m) continue;
      const source = byToken.get(m[1].trim().toLowerCase());
      const target = byToken.get(m[2].trim().toLowerCase());
      if (!source || !target || source === target) continue;
      const key = `${source} ${target}`;
      const rel = acc.get(key) ?? { source, target, texts: [] };
      const text = m[3].trim();
      // 같은 상호작용을 양쪽 도메인이 중복 서술한 경우 대비 — 동일 문장 1회만.
      if (!rel.texts.includes(text)) rel.texts.push(text);
      acc.set(key, rel);
    }
  }
  return [...acc.values()].sort(
    (a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  );
}

/** 층(layer) 세그먼트 — sub-group 후보로 매치돼도 실제 기능 그룹이 아니므로 제외. */
const LAYER_SEGMENTS = new Set([
  "web",
  "service",
  "dao",
  "impl",
  "mapper",
  "vo",
  "controller",
  "api",
  "com",
]);

/**
 * `domainId`(예: "domain:cop")에서 도메인 키("cop")를 파싱한다. 접두사가 없으면
 * 원본을 그대로 키로 취급(방어적 폴백).
 */
function domainKeyFromId(domainId: string): string {
  return domainId.startsWith("domain:") ? domainId.slice("domain:".length) : domainId;
}

/**
 * filePath 의 `/<domainKey>/<seg>/` 세그먼트에서 서브패키지 코드를 파생한다.
 * 층 세그먼트(web/service/dao/…)는 실제 기능 그룹이 아니므로 null 로 취급한다
 * (예: `.../cmm/web/...` 은 "web" 이 아니라 서브그룹 없음).
 */
function deriveSubGroup(filePath: string | undefined, domainKey: string): string | null {
  if (!filePath || !domainKey) return null;
  // 도메인 키는 경로/파일명 토큰 유래라 대부분 [a-z0-9]지만, 메타문자가 섞인 키가
  // 그대로 패턴에 들어가면 RegExp 생성이 던져 도메인 화면이 죽는다 — 이스케이프.
  const escaped = domainKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`/${escaped}/([a-z0-9]+)/`, "i");
  const m = filePath.match(re);
  if (!m) return null;
  const seg = m[1].toLowerCase();
  return LAYER_SEGMENTS.has(seg) ? null : seg;
}

/**
 * eGovFrame 공통컴포넌트 서브패키지 코드 → 업무 라벨(best-effort). 미매핑은 코드
 * 대문자 폴백.
 */
export const SUBGROUP_LABELS: Record<string, string> = {
  // cop 협업
  bbs: "게시판", smt: "일정관리", cmy: "커뮤니티", ems: "이메일", adb: "주소록",
  cmt: "댓글", ncm: "알림", tpl: "템플릿", scp: "스크랩", sms: "SMS", stf: "직원/서식", com: "공통",
  // uss 사용자지원
  ion: "정보제공", olp: "온라인설문", olh: "온라인도움말", umt: "사용자·회원관리", sam: "회원가입",
  // sym 시스템관리
  ccm: "공통코드", log: "로그", bat: "배치", mnu: "메뉴", tbm: "게시판템플릿", sym: "시스템",
  // sec 보안 / uat 인증 / ssi 연계 / ext 확장
  ram: "역할관리", pki: "인증서", drm: "권한", gmt: "그룹관리", rgm: "등록관리", rmt: "원격관리",
  uap: "인증정책", uia: "통합인증", syi: "시스템연계",
  captcha: "캡차", ldapumt: "LDAP", oauth: "OAuth", msg: "메시지",
  // dam 자료 / utl 유틸 / sts 통계
  map: "지도", spe: "명세", sys: "시스템유틸", sim: "네트워크/시뮬", wed: "웹에디터", jso: "JSON",
};

export function subGroupLabel(code: string): string {
  return SUBGROUP_LABELS[code] ?? code.toUpperCase();
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
  const domainKey = domainKeyFromId(domainId);
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
        subGroup: deriveSubGroup(node.filePath, domainKey),
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

const GROUP_SECTION_ORDER: FlowGroupKey[] = ["http", "batch", "event", "other"];

/** One collapsible section in the flow list — a sub-package group, or (fallback) an entryType group. */
export interface FlowSection {
  key: string;
  label: string;
  flows: DomainFlow[];
}

/**
 * 도메인 내부 서브패키지 그룹핑(§ domain-internal sub-package grouping).
 * eGov 처럼 216개 흐름이 전부 entryType=http 인 도메인은 flowGroupKey 로 나누면
 * 단일 버킷(평면 목록)이 되어 압도적이다 — filePath 기반 subGroup 이 2종 이상
 * 실존할 때는 그걸로 섹션을 나누고, 아니면(0/1종) 기존 entryType 폴백을 그대로
 * 유지한다(jpetstore·eGov cmm 등 소규모 도메인은 오늘과 동일 동작).
 *
 * `forceSubGroup` — 섹션 기준(서브패키지 vs entryType)을 호출측이 강제한다. 검색/필터
 * 결과처럼 부분집합에 대해 섹션을 만들 때, 부분집합의 subGroup 종수로 모드를 재판정하면
 * 검색 도중 그룹핑이 뒤집힌다(서브패키지→"HTTP"). 그래서 FlowListView 는 **전체 흐름**
 * 기준으로 모드를 1회 정해 두 호출(전체·필터결과)에 동일하게 넘긴다. 미지정이면 자동판정.
 */
export function buildFlowSections(flows: DomainFlow[], forceSubGroup?: boolean): FlowSection[] {
  const distinctSubGroups = new Set(
    flows.map((f) => f.subGroup).filter((g): g is string => g !== null),
  );
  const bySubGroup = forceSubGroup ?? distinctSubGroups.size >= 2;

  if (bySubGroup) {
    const map = new Map<string, DomainFlow[]>();
    const other: DomainFlow[] = [];
    for (const f of flows) {
      if (f.subGroup === null) {
        other.push(f);
        continue;
      }
      const list = map.get(f.subGroup) ?? [];
      list.push(f);
      map.set(f.subGroup, list);
    }
    const sections: FlowSection[] = [...map.entries()]
      // 내림차순 개수, 동률은 key 오름차순 — 결정론.
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([key, list]) => ({ key, label: subGroupLabel(key), flows: list }));
    if (other.length > 0) {
      sections.push({ key: "__other", label: "기타", flows: other });
    }
    return sections;
  }

  // 폴백: 기존 entryType 그룹핑. label 은 빈 문자열로 남겨 호출측(FlowListView)이
  // t.flowList.group* i18n 라벨을 그대로 쓰게 한다(다국어 유지, key=FlowGroupKey).
  const map = new Map<FlowGroupKey, DomainFlow[]>();
  for (const f of flows) {
    const key = flowGroupKey(f.entryType);
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  return GROUP_SECTION_ORDER.filter((k) => map.has(k)).map((k) => ({
    key: k,
    label: "",
    flows: map.get(k)!,
  }));
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
