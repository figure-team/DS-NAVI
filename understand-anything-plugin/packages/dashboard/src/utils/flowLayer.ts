import type { GraphNode } from "@understand-anything/core/types";

/**
 * Cross-layer flow view — step → layer classifier (net-new heuristic).
 *
 * The engine emits NO per-step layer/role. `DomainMeta` (core types.ts:30-36)
 * carries only entryPoint/entryType/entities/businessRules — no layer, no
 * per-step role. So step→layer is a derived, measured outcome, not engine data
 * (see plan AC-4 / spec line 72: documented data gap).
 *
 * NOTE: ktds `classify.ts` LAYER_SEGMENTS/STOP_TOKENS are a flat SKIP-SET used
 * to strip layer/tech noise during *domain-token* extraction — they are NOT
 * api/service/dao/db buckets. They are borrowed here as token *vocabulary*
 * inspiration only; the bucketed classifier below is net-new.
 *
 * Match priority (strongest signal first): className → filePath/relPath
 * segments → name. `unknown` is a visible, honest outcome (rendered in the
 * "Other" lane), never a silent mis-bin.
 */

export type FlowLayer = "api" | "service" | "dao" | "db" | "unknown";

const FLOW_LAYERS: readonly FlowLayer[] = ["api", "service", "dao", "db", "unknown"];

/**
 * The ktds /understand-map engine now emits a per-step `layer` (ground truth
 * derived from routes/edges + filename — domain-map/step-layer.ts). When
 * present we trust it over the heuristic below: the engine knows e.g. a mybatis
 * edge = definitely DAO, which a filename scan can't. Read defensively (old
 * graphs / non-step nodes have no `layer`) and validate against the 5 enum
 * values; anything else falls through to the heuristic.
 */
function engineLayer(node: GraphNode): FlowLayer | null {
  const raw = (node as { layer?: unknown }).layer;
  return typeof raw === "string" && (FLOW_LAYERS as readonly string[]).includes(raw)
    ? (raw as FlowLayer)
    : null;
}

/**
 * Optional stronger identity signal that may ride along on a step node.
 * Mirrors ktds `StepSource` (domain-map/types.ts:348-354): className is the
 * primary input to layer derivation; relPath is the secondary path signal.
 * Step nodes in `domain-graph.json` carry this via schema passthrough as
 * `node.stepSource`.
 */
export interface StepSource {
  className: string | null;
  relPath: string;
}

// ── Classification vocabulary (net-new buckets) ─────────────────────────────

// db: UPPER_SNAKE_CASE table-like identifiers, e.g. ORDER_HEADER, TB_MEMBER.
// Requires ≥2 segments OR a table prefix to avoid matching ALLCAPS constants.
const TABLE_PREFIX_RE = /^(?:TB|TBL|T|MV|VW|V)_/;
const UPPER_SNAKE_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

// Path / token signals per bucket. Tested as lowercased, boundary-delimited
// path segments and as className suffix matches.
const DB_PATH_TOKENS = ["sql", "schema", "ddl", "table", "tables", "mybatis"];
const DAO_TOKENS = ["mapper", "mappers", "dao", "daos", "repository", "repositories", "persistence"];
const SERVICE_TOKENS = ["service", "services", "serviceimpl", "biz", "logic"];
const API_TOKENS = ["controller", "controllers", "rest", "web", "api", "action", "actions", "endpoint", "endpoints", "resource", "resources"];

// className suffix matchers (case-insensitive). className is the strongest
// signal, so we match on the conventional suffix shape.
//
// DECISION (documented): facade / manager / handler are NOT mapped to a clean
// `service`. In legacy Spring/ktds code these names denote orchestration glue,
// batch coordinators, or cross-cutting handlers whose layer is genuinely
// ambiguous — binning them as `service` would inflate a column with mislabeled
// nodes and hide the ambiguity. They fall through to `unknown` (the visible
// "Other" lane), keeping `unknown` honest per plan P2/AC-4. Only the clean
// *Service / *ServiceImpl suffixes classify as service.
function classNameToLayer(className: string): FlowLayer {
  const c = className.toLowerCase();
  // db: tables modeled as classes are unusual, but *Entity/*Table can appear
  if (/(?:mapper|dao|repository)$/.test(c)) return "dao";
  if (/serviceimpl$/.test(c) || /service$/.test(c)) return "service";
  if (/(?:controller|restcontroller|resource|action|endpoint)$/.test(c)) return "api";
  // facade / manager / handler / job → intentionally NOT clean service.
  return "unknown";
}

function tokenize(path: string): string[] {
  // Split on path separators, dots, and case-insensitive; keep alnum tokens.
  return path
    .toLowerCase()
    .split(/[\\/.\-_]+/)
    .filter((t) => t.length > 0);
}

function pathToLayer(path: string): FlowLayer {
  const lower = path.toLowerCase();
  // db: explicit .sql / *Mapper.xml files, or schema/sql/ddl path tokens.
  if (lower.endsWith(".sql")) return "db";
  if (lower.endsWith("mapper.xml") || lower.endsWith(".xml")) {
    // a *.xml under a mapper/sql path is a MyBatis mapper → db artifact
    const toks = tokenize(lower);
    if (toks.some((t) => DB_PATH_TOKENS.includes(t) || DAO_TOKENS.includes(t))) return "db";
  }
  const toks = tokenize(lower);
  // Priority within path: db > dao > service > api (most specific first).
  if (toks.some((t) => DB_PATH_TOKENS.includes(t))) return "db";
  if (toks.some((t) => DAO_TOKENS.includes(t))) return "dao";
  if (toks.some((t) => SERVICE_TOKENS.includes(t))) return "service";
  if (toks.some((t) => API_TOKENS.includes(t))) return "api";
  return "unknown";
}

function nameToLayer(name: string): FlowLayer {
  const trimmed = name.trim();
  // db: UPPER_SNAKE_CASE table-like names (ORDER_HEADER) or TB_/TBL_ prefixed.
  if (TABLE_PREFIX_RE.test(trimmed) || UPPER_SNAKE_RE.test(trimmed)) return "db";
  // Otherwise reuse the className suffix heuristic against the bare name,
  // then fall back to path-style token scan over the name.
  const bySuffix = classNameToLayer(trimmed);
  if (bySuffix !== "unknown") return bySuffix;
  return pathToLayer(trimmed);
}

/**
 * Derive the cross-layer column for a step node.
 *
 * Priority: stepSource.className → (node.filePath | stepSource.relPath) → name.
 * className wins on conflict (it is the strongest identity signal). A step
 * with no recognizable signal resolves to `unknown` (the "Other" lane).
 */
export function deriveLayer(node: GraphNode, stepSource?: StepSource): FlowLayer {
  // 0. Engine ground truth (strongest of all) — short-circuit when the node
  //    carries a valid `layer` from /understand-map. Old graphs lack it and
  //    fall through to the filename heuristic below (kept intact).
  const fromEngine = engineLayer(node);
  if (fromEngine) return fromEngine;

  // 1. className (strongest)
  if (stepSource?.className) {
    const byClass = classNameToLayer(stepSource.className);
    if (byClass !== "unknown") return byClass;
  }

  // 2. filePath / relPath segments
  const path = node.filePath ?? stepSource?.relPath;
  if (path) {
    const byPath = pathToLayer(path);
    if (byPath !== "unknown") return byPath;
  }

  // 3. name
  if (node.name) {
    const byName = nameToLayer(node.name);
    if (byName !== "unknown") return byName;
  }

  return "unknown";
}

// ── Step ordering ───────────────────────────────────────────────────────────

/**
 * A flow_step edge reduced to what ordering needs: the target step node id and
 * the raw edge weight (NOT rounded — see plan R5: DomainGraphView.tsx:239's
 * `Math.round(weight*10)` collapses order into 11 buckets and is the latent bug
 * this helper exists to avoid).
 */
export interface FlowStepRef {
  /** Target step node id. */
  id: string;
  /** Raw flow_step edge weight in [0,1]; may be NaN for malformed input. */
  weight: number;
}

/**
 * Order steps by raw `flow_step` weight ascending, tie-broken by stable node id.
 *
 * - Uses the RAW weight (never `Math.round(weight*10)`), so 100-step flows whose
 *   weights are `i/(N+1)` retain strict ordering.
 * - NaN / non-finite weights sort LAST deterministically (defensive: a malformed
 *   weight must not corrupt the ordering of well-formed steps).
 * - Returns a new array; does not mutate the input.
 */
export function orderFlowSteps<T extends FlowStepRef>(steps: readonly T[]): T[] {
  return [...steps].sort((a, b) => {
    const aBad = !Number.isFinite(a.weight);
    const bBad = !Number.isFinite(b.weight);
    if (aBad && bBad) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (aBad) return 1; // a sorts after b
    if (bBad) return -1; // b sorts after a
    if (a.weight !== b.weight) return a.weight - b.weight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
