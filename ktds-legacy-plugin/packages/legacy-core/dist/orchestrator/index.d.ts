import type { KnowledgeGraph } from "@understand-anything/core";
import type { OverlayGraph, MergedGraph } from "./types.js";
export { normalizeKgPath } from "./normalize-path.js";
export type { OverlayNode, OverlayEdge, OverlayGraph, MergedGraph, } from "./types.js";
/**
 * Read the OPTIONAL ktds overlay at `.understand-anything/domain-graph.json`
 * (the skeleton/emit output produced later in P2). Absent file -> null (not
 * fatal). Validation is lenient: only nodes/edges that carry the minimal
 * required keys (node: id+name; edge: source+target+type) are retained.
 */
export declare function readDomainGraphOverlay(projectRoot: string): OverlayGraph | null;
/**
 * Additive merge of the UA native KG with the ktds overlay, keyed by node id.
 *
 *  - Start from UA base nodes (normalized).
 *  - For each overlay node: id already present -> SKIP (recorded); else ADD.
 *    Domain-overlay ids use natural-key prefixes (domain:/flow:/step:) that do
 *    not collide with UA ids, so additions are the common case.
 *  - Edge rule: include an overlay edge ONLY IF both endpoints exist in the
 *    final node set AND at least one endpoint is a newly-added overlay node.
 *    This prevents overlay edges from silently rebinding base-only nodes.
 *  - Deterministic: nodes sorted by id, edges by (source, target, type).
 *
 * The base graph's own edges are NOT included here — this orchestrator emits
 * the additive overlay edges layered onto the native node set. (Native edges
 * are read directly from the base graph by consumers that need them.)
 */
export declare function mergeOverlay(base: KnowledgeGraph, overlay: OverlayGraph | null, projectRoot?: string): MergedGraph;
/**
 * Load the UA native knowledge graph via core's `loadGraph`, read the optional
 * ktds overlay, and return the additively merged graph.
 *
 * Throws a clear, actionable error when no UA KG exists.
 */
export declare function loadProjectGraph(projectRoot: string): Promise<MergedGraph>;
//# sourceMappingURL=index.d.ts.map