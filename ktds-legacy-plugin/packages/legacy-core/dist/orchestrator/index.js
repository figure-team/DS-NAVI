import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadGraph } from "@understand-anything/core";
import { normalizeKgPath } from "./normalize-path.js";
export { normalizeKgPath } from "./normalize-path.js";
const UA_DIR = ".understand-anything";
const DOMAIN_GRAPH_FILE = "domain-graph.json";
/**
 * Read the OPTIONAL ktds overlay at `.understand-anything/domain-graph.json`
 * (the skeleton/emit output produced later in P2). Absent file -> null (not
 * fatal). Validation is lenient: only nodes/edges that carry the minimal
 * required keys (node: id+name; edge: source+target+type) are retained.
 */
export function readDomainGraphOverlay(projectRoot) {
    const filePath = join(projectRoot, UA_DIR, DOMAIN_GRAPH_FILE);
    if (!existsSync(filePath))
        return null;
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    if (typeof raw !== "object" || raw === null)
        return null;
    const obj = raw;
    const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
    const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
    const nodes = [];
    for (const candidate of rawNodes) {
        if (typeof candidate !== "object" || candidate === null)
            continue;
        const n = candidate;
        if (typeof n.id !== "string" || typeof n.name !== "string")
            continue;
        const node = {
            id: n.id,
            type: typeof n.type === "string" ? n.type : "concept",
            name: n.name,
            summary: typeof n.summary === "string" ? n.summary : "",
            tags: Array.isArray(n.tags) ? n.tags.filter((t) => typeof t === "string") : [],
        };
        if (typeof n.filePath === "string")
            node.filePath = n.filePath;
        if (isLineRange(n.lineRange))
            node.lineRange = [n.lineRange[0], n.lineRange[1]];
        if (typeof n.domainMeta === "object" && n.domainMeta !== null) {
            node.domainMeta = n.domainMeta;
        }
        nodes.push(node);
    }
    const edges = [];
    for (const candidate of rawEdges) {
        if (typeof candidate !== "object" || candidate === null)
            continue;
        const e = candidate;
        if (typeof e.source !== "string" ||
            typeof e.target !== "string" ||
            typeof e.type !== "string") {
            continue;
        }
        const edge = { source: e.source, target: e.target, type: e.type };
        if (typeof e.direction === "string")
            edge.direction = e.direction;
        if (typeof e.weight === "number")
            edge.weight = e.weight;
        if (typeof e.description === "string")
            edge.description = e.description;
        edges.push(edge);
    }
    return { nodes, edges };
}
function isLineRange(value) {
    return (Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number");
}
/** Project a UA base node into the narrow OverlayNode shape. */
function baseNodeToOverlay(node, projectRoot) {
    const out = {
        id: node.id,
        type: node.type,
        name: node.name,
        summary: node.summary,
        tags: [...node.tags],
    };
    // base from loadGraph is already relative; pass through normalizeKgPath for
    // safety/idempotence (relative paths are returned unchanged).
    if (typeof node.filePath === "string") {
        out.filePath = normalizeKgPath(node.filePath, projectRoot);
    }
    if (node.lineRange)
        out.lineRange = [node.lineRange[0], node.lineRange[1]];
    if (node.domainMeta)
        out.domainMeta = { ...node.domainMeta };
    return out;
}
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
export function mergeOverlay(base, overlay, projectRoot = "") {
    const baseNodes = base.nodes.map((n) => baseNodeToOverlay(n, projectRoot));
    const nodeById = new Map();
    for (const n of baseNodes)
        nodeById.set(n.id, n);
    const nativeNodeCount = baseNodes.length;
    const overlayNodeCount = overlay ? overlay.nodes.length : 0;
    const addedIds = new Set();
    const skippedIds = [];
    if (overlay) {
        for (const node of overlay.nodes) {
            if (nodeById.has(node.id)) {
                skippedIds.push(node.id);
                continue;
            }
            nodeById.set(node.id, node);
            addedIds.add(node.id);
        }
    }
    const mergedEdges = [];
    if (overlay) {
        for (const edge of overlay.edges) {
            const sourceExists = nodeById.has(edge.source);
            const targetExists = nodeById.has(edge.target);
            if (!sourceExists || !targetExists)
                continue;
            const touchesNewNode = addedIds.has(edge.source) || addedIds.has(edge.target);
            if (!touchesNewNode)
                continue;
            mergedEdges.push(edge);
        }
    }
    const nodes = [...nodeById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const edges = mergedEdges.sort((a, b) => {
        if (a.source !== b.source)
            return a.source < b.source ? -1 : 1;
        if (a.target !== b.target)
            return a.target < b.target ? -1 : 1;
        if (a.type !== b.type)
            return a.type < b.type ? -1 : 1;
        return 0;
    });
    return {
        project: base.project,
        nodes,
        edges,
        layers: base.layers,
        nativeNodeCount,
        overlayNodeCount,
        mergedNodeCount: nodes.length,
        skippedIds: [...skippedIds].sort(),
    };
}
/**
 * Load the UA native knowledge graph via core's `loadGraph`, read the optional
 * ktds overlay, and return the additively merged graph.
 *
 * Throws a clear, actionable error when no UA KG exists.
 */
export async function loadProjectGraph(projectRoot) {
    const base = loadGraph(projectRoot);
    if (base === null) {
        throw new Error("no UA knowledge-graph.json; run /understand first");
    }
    const overlay = readDomainGraphOverlay(projectRoot);
    return mergeOverlay(base, overlay, projectRoot);
}
//# sourceMappingURL=index.js.map