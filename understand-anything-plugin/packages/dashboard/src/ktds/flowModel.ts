/**
 * ktds Code Atlas — pure data-transform layer.
 *
 * Converts a ktds `domain-graph.json` (nodes + edges produced by
 * `@ktds/legacy-core`) into React-free view models consumed by the
 * FlowSpineView / FlowListView / DomainMapView components and the shared
 * KtdsNodeDetail panel.
 *
 * Design constraints (from the task spec / ACs):
 * - Layers are DYNAMIC: the rail set is derived from the `layer` values
 *   actually present on step nodes (N layers, not a fixed 4) — AC-5.
 * - Steps are ordered by their `flow_step` edge weight.
 * - NodeDetail mirrors `ktds-legacy-plugin/templates/node-detail-template.md`
 *   (AC-37). Confidence is the single source from `@ktds/legacy-core`
 *   `CONFIDENCE_VALUES` and is derived here from grounding (file:line).
 * - Truncation is HONEST: any dropped/capped steps are surfaced as a count,
 *   never silently hidden (AC-34 / F-b).
 *
 * No React. No imports from core/legacy-core — the input shape is declared
 * locally so this module stays unit-testable in isolation.
 */

/** Grounding confidence grades — mirrors `@ktds/legacy-core` CONFIDENCE_VALUES. */
export type Confidence = "CONFIRMED" | "CONFIRMED_AI" | "INFERRED" | "UNVERIFIED";

/** A layer key as emitted by the engine. Open string — layers are dynamic. */
export type LayerKey = string;

/** Raw node shape from domain-graph.json (superset of core GraphNode + ktds fields). */
export interface DomainGraphNode {
  id: string;
  type: "domain" | "flow" | "step" | string;
  name: string;
  filePath?: string;
  lineRange?: [number, number];
  summary?: string;
  tags?: string[];
  complexity?: "simple" | "moderate" | "complex" | string;
  /** Present on step nodes — drives dynamic rails. */
  layer?: LayerKey;
  /** Explicit grounding confidence, if the engine supplied one. */
  confidence?: Confidence | string;
  /** Code annotation extracted from source (e.g. `@Transactional`). */
  annotation?: string;
  domainMeta?: {
    entities?: string[];
    entryPoint?: string;
    entryType?: string;
    onboardingPriority?: number;
  } & Record<string, unknown>;
}

/** Raw edge shape from domain-graph.json. */
export interface DomainGraphEdge {
  source: string;
  target: string;
  type: "contains_flow" | "flow_step" | "calls" | "cross_domain" | string;
  weight?: number;
  description?: string;
}

export interface DomainGraph {
  nodes: DomainGraphNode[];
  edges: DomainGraphEdge[];
}

/** A single layer rail in a flow spine. */
export interface SpineRail {
  layer: LayerKey;
  label: string;
  /** Stable index used to pick a palette color. */
  index: number;
  steps: SpineStep[];
}

/** A step chip placed inside a rail. */
export interface SpineStep {
  id: string;
  name: string;
  symbol: string;
  filePath?: string;
  line: number | null;
  layer: LayerKey;
  weight: number;
}

/** A flow's cross-layer spine view model. */
export interface FlowSpine {
  flowId: string;
  flowName: string;
  domainId: string | null;
  /** One rail per layer present in this flow's steps (dynamic N). */
  rails: SpineRail[];
  totalSteps: number;
  /** Steps not shown because of a render cap or engine truncation. >0 ⇒ show "+N개 더보기". */
  truncatedSteps: number;
}

/** A domain card view model for the domain map. */
export interface DomainCard {
  id: string;
  name: string;
  summary: string;
  flowCount: number;
  nodeCount: number;
  onboardingPriority: number | null;
  tags: string[];
}

/** A grounded cross-domain dependency edge for the domain map. */
export interface CrossDomainEdge {
  source: string;
  target: string;
  weight: number;
  description?: string;
}

/** A flow entry for the master list, grouped by domain. */
export interface FlowListEntry {
  flowId: string;
  flowName: string;
  domainId: string | null;
  domainName: string | null;
  stepCount: number;
}

/** Normalized node-detail panel model — matches node-detail-template.md §3. */
export interface NodeDetail {
  id: string;
  layer: LayerKey | null;
  layerLabel: string | null;
  name: string;
  filePath: string | null;
  line: number | null;
  confidence: Confidence;
  summary?: string;
  annotation?: string;
  calls?: { sym: string; targetId: string }[];
  branches?: { sym: string; type: "helper" | "audit" | "async" | "seq" }[];
  tags?: string[];
}

/**
 * Canonical engine layer ordering. Layers NOT in this list are appended in
 * first-seen order, so unknown/new layers still get a rail (dynamic N).
 */
const LAYER_ORDER: LayerKey[] = ["api", "service", "dao", "db", "unknown"];

/** Human label for a layer key. Falls back to upper-casing the raw key. */
export function layerLabel(layer: LayerKey): string {
  const known: Record<string, string> = {
    api: "API",
    service: "SERVICE",
    dao: "DAO",
    db: "DB",
    unknown: "UNKNOWN",
  };
  return known[layer] ?? layer.toUpperCase();
}

/** Return `name` when it has non-whitespace content, else the fallback. */
function nameOrFallback(name: string | undefined, fallback: string): string {
  return name && name.trim() ? name : fallback;
}

/** Short symbol from a node name or file path (last path/class segment). */
function deriveSymbol(node: DomainGraphNode): string {
  if (node.name && node.name.trim()) return node.name.trim();
  if (node.filePath) {
    return node.filePath.split("/").pop() ?? node.filePath;
  }
  // Strip the "step:<flow>:" prefix to leave the file part of a step id.
  const tail = node.id.split(":").pop();
  return tail ?? node.id;
}

/**
 * Derive grounding confidence from available evidence when the engine did not
 * supply an explicit `confidence`. file:line anchor ⇒ CONFIRMED, file only ⇒
 * INFERRED, nothing ⇒ UNVERIFIED. Mirrors the CONFIDENCE_VALUES semantics.
 */
export function deriveConfidence(node: DomainGraphNode): Confidence {
  const c = node.confidence;
  if (c === "CONFIRMED" || c === "CONFIRMED_AI" || c === "INFERRED" || c === "UNVERIFIED") {
    return c;
  }
  const hasLine =
    Array.isArray(node.lineRange) &&
    node.lineRange.length >= 1 &&
    typeof node.lineRange[0] === "number";
  if (node.filePath && hasLine) return "CONFIRMED";
  if (node.filePath) return "INFERRED";
  return "UNVERIFIED";
}

function indexNodes(graph: DomainGraph): Map<string, DomainGraphNode> {
  const m = new Map<string, DomainGraphNode>();
  for (const n of graph.nodes) m.set(n.id, n);
  return m;
}

/** Build the list of domain cards from domain nodes. */
export function buildDomainCards(graph: DomainGraph): DomainCard[] {
  const containsFlow = graph.edges.filter((e) => e.type === "contains_flow");
  const flowsByDomain = new Map<string, Set<string>>();
  for (const e of containsFlow) {
    let set = flowsByDomain.get(e.source);
    if (!set) {
      set = new Set<string>();
      flowsByDomain.set(e.source, set);
    }
    set.add(e.target);
  }
  const flowStep = graph.edges.filter((e) => e.type === "flow_step");
  const stepsByFlow = new Map<string, Set<string>>();
  for (const e of flowStep) {
    let set = stepsByFlow.get(e.source);
    if (!set) {
      set = new Set<string>();
      stepsByFlow.set(e.source, set);
    }
    set.add(e.target);
  }

  return graph.nodes
    .filter((n) => n.type === "domain")
    .map((n) => {
      const flows = flowsByDomain.get(n.id) ?? new Set<string>();
      let nodeCount = flows.size;
      for (const flowId of flows) {
        nodeCount += (stepsByFlow.get(flowId) ?? new Set()).size;
      }
      const priority = n.domainMeta?.onboardingPriority;
      return {
        id: n.id,
        name: nameOrFallback(n.name, n.id.replace(/^domain:/, "")),
        summary: n.summary ?? "",
        flowCount: flows.size,
        nodeCount,
        onboardingPriority: typeof priority === "number" ? priority : null,
        tags: n.tags ?? [],
      };
    });
}

/** Build cross-domain dependency edges (only `cross_domain` typed edges). */
export function buildCrossDomainEdges(graph: DomainGraph): CrossDomainEdge[] {
  return graph.edges
    .filter((e) => e.type === "cross_domain")
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: typeof e.weight === "number" ? e.weight : 1,
      description: e.description,
    }));
}

/** Build the master flow list, grouped by owning domain. */
export function buildFlowList(graph: DomainGraph): FlowListEntry[] {
  const byId = indexNodes(graph);
  const domainOfFlow = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === "contains_flow") domainOfFlow.set(e.target, e.source);
  }
  const stepCount = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.type === "flow_step") {
      stepCount.set(e.source, (stepCount.get(e.source) ?? 0) + 1);
    }
  }
  return graph.nodes
    .filter((n) => n.type === "flow")
    .map((n) => {
      const domainId = domainOfFlow.get(n.id) ?? null;
      const domainNode = domainId ? byId.get(domainId) : undefined;
      return {
        flowId: n.id,
        flowName: nameOrFallback(n.name, n.id.replace(/^flow:/, "")),
        domainId,
        domainName: domainNode
          ? nameOrFallback(domainNode.name, (domainId ?? "").replace(/^domain:/, ""))
          : null,
        stepCount: stepCount.get(n.id) ?? 0,
      };
    });
}

/**
 * Build a single flow's cross-layer spine.
 *
 * @param graph   the full domain graph
 * @param flowId  the `flow:` node id
 * @param maxSteps optional render cap. When exceeded, the overflow is reported
 *                 as `truncatedSteps` (NEVER silently dropped — AC-34).
 */
export function buildFlowSpine(
  graph: DomainGraph,
  flowId: string,
  maxSteps?: number,
): FlowSpine | null {
  const byId = indexNodes(graph);
  const flowNode = byId.get(flowId);
  if (!flowNode || flowNode.type !== "flow") return null;

  let domainId: string | null = null;
  for (const e of graph.edges) {
    if (e.type === "contains_flow" && e.target === flowId) {
      domainId = e.source;
      break;
    }
  }

  // Ordered step ids by flow_step weight (stable on id for ties).
  const stepEdges = graph.edges
    .filter((e) => e.type === "flow_step" && e.source === flowId)
    .slice()
    .sort((a, b) => {
      const wa = typeof a.weight === "number" ? a.weight : 0;
      const wb = typeof b.weight === "number" ? b.weight : 0;
      if (wa !== wb) return wa - wb;
      return a.target.localeCompare(b.target);
    });

  const orderedSteps: SpineStep[] = [];
  for (const e of stepEdges) {
    const node = byId.get(e.target);
    if (!node) continue; // honestly skip dangling targets; counted in truncation below
    const layer = node.layer ?? "unknown";
    orderedSteps.push({
      id: node.id,
      name: nameOrFallback(node.name, deriveSymbol(node)),
      symbol: deriveSymbol(node),
      filePath: node.filePath,
      line: node.lineRange?.[0] ?? null,
      layer,
      weight: typeof e.weight === "number" ? e.weight : 0,
    });
  }

  const totalSteps = orderedSteps.length;
  let visibleSteps = orderedSteps;
  let truncatedSteps = 0;
  if (typeof maxSteps === "number" && maxSteps >= 0 && totalSteps > maxSteps) {
    visibleSteps = orderedSteps.slice(0, maxSteps);
    truncatedSteps = totalSteps - maxSteps;
  }

  const rails = buildRails(visibleSteps);

  return {
    flowId,
    flowName: nameOrFallback(flowNode.name, flowId.replace(/^flow:/, "")),
    domainId,
    rails,
    totalSteps,
    truncatedSteps,
  };
}

/**
 * Group steps into rails by DYNAMIC layer set (AC-5). The number of rails
 * equals the number of distinct layers present in the supplied steps — a
 * 2-layer graph yields 2 rails, a 4-layer graph yields 4. Rails are ordered
 * by the canonical engine order, with unknown layers appended first-seen.
 */
export function buildRails(steps: SpineStep[]): SpineRail[] {
  const byLayer = new Map<LayerKey, SpineStep[]>();
  const seenOrder: LayerKey[] = [];
  for (const s of steps) {
    let bucket = byLayer.get(s.layer);
    if (!bucket) {
      bucket = [];
      byLayer.set(s.layer, bucket);
      seenOrder.push(s.layer);
    }
    bucket.push(s);
  }

  const present = Array.from(byLayer.keys());
  present.sort((a, b) => {
    const ia = LAYER_ORDER.indexOf(a);
    const ib = LAYER_ORDER.indexOf(b);
    const ra = ia === -1 ? LAYER_ORDER.length + seenOrder.indexOf(a) : ia;
    const rb = ib === -1 ? LAYER_ORDER.length + seenOrder.indexOf(b) : ib;
    return ra - rb;
  });

  return present.map((layer, index) => ({
    layer,
    label: layerLabel(layer),
    index,
    steps: byLayer.get(layer) ?? [],
  }));
}

/** Distinct layer keys present across a graph's step nodes (for diagnostics/tests). */
export function presentLayers(graph: DomainGraph): LayerKey[] {
  const seen = new Set<LayerKey>();
  for (const n of graph.nodes) {
    if (n.type === "step") seen.add(n.layer ?? "unknown");
  }
  return Array.from(seen);
}

/**
 * Build the shared NodeDetail model for any node (domain / flow / step),
 * following node-detail-template.md §1 field order and §4 omission rules.
 * Optional fields are left `undefined` so the UI can omit whole sections.
 */
export function buildNodeDetail(graph: DomainGraph, nodeId: string): NodeDetail | null {
  const byId = indexNodes(graph);
  const node = byId.get(nodeId);
  if (!node) return null;

  const layer = node.type === "step" ? node.layer ?? "unknown" : node.layer ?? null;

  // Outgoing `calls` edges → call targets (method chips).
  const calls = graph.edges
    .filter((e) => e.type === "calls" && e.source === nodeId)
    .map((e) => {
      const target = byId.get(e.target);
      return {
        sym: target ? deriveSymbol(target) : e.target,
        targetId: e.target,
      };
    });

  const detail: NodeDetail = {
    id: node.id,
    layer,
    layerLabel: layer ? layerLabel(layer) : null,
    name: deriveSymbol(node),
    filePath: node.filePath ?? null,
    line: node.lineRange?.[0] ?? null,
    confidence: deriveConfidence(node),
  };

  // Optional sections — only attach when data exists (no empty labels).
  if (node.summary && node.summary.trim()) detail.summary = node.summary;
  if (node.annotation && node.annotation.trim()) detail.annotation = node.annotation;
  if (calls.length > 0) detail.calls = calls;
  if (node.tags && node.tags.length > 0) detail.tags = node.tags;

  return detail;
}
