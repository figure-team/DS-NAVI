import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphIssue } from "@understand-anything/core/schema";
import { NODE_WIDTH, NODE_HEIGHT } from "./layout";

export interface ElkChild {
  id: string;
  width?: number;
  height?: number;
  /** Set by ELK after layout; absent on input. Downstream consumers must default. */
  x?: number;
  y?: number;
  children?: ElkChild[];
  parentId?: string;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  /** 엣지 단위 ELK 옵션(예: layered.priority.straightness) — elkjs 로 그대로 전달. */
  layoutOptions?: Record<string, string>;
}

export interface ElkPoint {
  x: number;
  y: number;
}

/** ELK edge routing geometry, present on edges in ELK's *output* graph. */
interface ElkEdgeSection {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}

/**
 * Pull the orthogonal routing polyline ELK computed for each edge out of a
 * positioned graph, keyed by edge id. Points are in the same absolute
 * coordinate frame as the (top-level) node positions, so they map directly to
 * React Flow flow coordinates. Edges without routing (or nested under a parent)
 * are simply omitted — the custom edge falls back to a smooth-step path.
 */
export function elkEdgePointMap(positioned: ElkInput): Map<string, ElkPoint[]> {
  const out = new Map<string, ElkPoint[]>();
  const edges =
    (positioned as { edges?: Array<{ id: string; sections?: ElkEdgeSection[] }> })
      .edges ?? [];
  for (const e of edges) {
    const section = e.sections?.[0];
    if (!section) continue;
    out.set(e.id, [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
  }
  return out;
}

export interface ElkInput {
  id: string;
  children: ElkChild[];
  edges: ElkEdge[];
  layoutOptions?: Record<string, string>;
}

interface ElkOutputNode {
  id: string;
  x?: number;
  y?: number;
  children?: ElkOutputNode[];
  edges?: Array<{
    id: string;
    sources?: string[];
    targets?: string[];
    sections?: ElkEdgeSection[];
  }>;
}

/**
 * Like {@link elkEdgePointMap} but for a *hierarchical* layout
 * (`elk.hierarchyHandling: INCLUDE_CHILDREN`): walks the whole node tree and
 * keys each edge's routing polyline by `"<source>|<target>"`. ELK reports edge
 * geometry relative to the edge's containing node, so points are offset by that
 * container's absolute position to land in the flat React Flow flow frame.
 *
 * Keying by endpoint pair (not edge id) lets the renderer attach routing to
 * edges it rebuilds with its own ids — the (source, target) pair is the stable
 * join key between the ELK graph and the rendered edges.
 */
export function elkEdgePointMapByEndpoint(
  positioned: ElkInput,
): Map<string, ElkPoint[]> {
  const out = new Map<string, ElkPoint[]>();
  const walk = (node: ElkOutputNode, originX: number, originY: number): void => {
    for (const e of node.edges ?? []) {
      const section = e.sections?.[0];
      const src = e.sources?.[0];
      const tgt = e.targets?.[0];
      if (!section || !src || !tgt) continue;
      const pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        .map((p) => ({ x: p.x + originX, y: p.y + originY }));
      out.set(`${src}|${tgt}`, pts);
    }
    for (const child of node.children ?? []) {
      walk(child, originX + (child.x ?? 0), originY + (child.y ?? 0));
    }
  };
  walk(positioned as unknown as ElkOutputNode, 0, 0);
  return out;
}

// Keep ELK fallback dimensions in lockstep with the dagre/force NODE
// dimensions in utils/layout.ts so layouts stay collision-consistent
// during the migration.
const DEFAULT_NODE_WIDTH = NODE_WIDTH;
const DEFAULT_NODE_HEIGHT = NODE_HEIGHT;

interface RepairOptions {
  strict?: boolean;
}

interface RepairResult {
  input: ElkInput;
  issues: GraphIssue[];
}

function makeIssue(
  level: GraphIssue["level"],
  category: string,
  message: string,
): GraphIssue {
  return { level, category, message };
}

function maybeThrow(strict: boolean | undefined, issue: GraphIssue): void {
  if (strict) throw new Error(`[ELK repair] ${issue.level}: ${issue.message}`);
}

export function repairElkInput(
  input: ElkInput,
  opts: RepairOptions = {},
): RepairResult {
  const issues: GraphIssue[] = [];
  const strict = opts.strict;

  // 1. ensureNodeDimensions
  let dimsAdded = 0;
  const fillDims = (children: ElkChild[]): ElkChild[] =>
    children.map((c) => {
      const next: ElkChild = { ...c };
      // Only leaf nodes get default dimensions. A node with children is a
      // compound/parent node whose size ELK computes from its contents — forcing
      // a fixed size there would break hierarchical (INCLUDE_CHILDREN) layout.
      const hasChildren = !!next.children && next.children.length > 0;
      if (!hasChildren && (next.width == null || next.height == null)) {
        next.width = next.width ?? DEFAULT_NODE_WIDTH;
        next.height = next.height ?? DEFAULT_NODE_HEIGHT;
        dimsAdded++;
      }
      if (next.children) next.children = fillDims(next.children);
      return next;
    });
  const childrenA = fillDims(input.children);
  if (dimsAdded > 0) {
    const issue = makeIssue(
      "auto-corrected",
      "elk-missing-dimensions",
      `Set default dimensions on ${dimsAdded} node(s) missing width/height.`,
    );
    issues.push(issue);
    maybeThrow(strict, issue);
  }

  // 2. dedupeNodeIds (per parent)
  let dupesRemoved = 0;
  const dedupe = (children: ElkChild[]): ElkChild[] => {
    const seen = new Set<string>();
    const out: ElkChild[] = [];
    for (const c of children) {
      if (seen.has(c.id)) {
        dupesRemoved++;
        continue;
      }
      seen.add(c.id);
      out.push({
        ...c,
        children: c.children ? dedupe(c.children) : undefined,
      });
    }
    return out;
  };
  const childrenB = dedupe(childrenA);
  if (dupesRemoved > 0) {
    const issue = makeIssue(
      "auto-corrected",
      "elk-duplicate-id",
      `Removed ${dupesRemoved} duplicate child id(s).`,
    );
    issues.push(issue);
    maybeThrow(strict, issue);
  }

  // 3. dropOrphanChildren — children whose parentId references nonexistent parent
  const allIds = new Set<string>();
  const walk = (children: ElkChild[]) => {
    for (const c of children) {
      allIds.add(c.id);
      if (c.children) walk(c.children);
    }
  };
  walk(childrenB);
  let orphanChildren = 0;
  const childrenC = childrenB.filter((c) => {
    if (c.parentId && !allIds.has(c.parentId)) {
      orphanChildren++;
      return false;
    }
    return true;
  });
  if (orphanChildren > 0) {
    const issue = makeIssue(
      "dropped",
      "elk-orphan-parent",
      `Dropped ${orphanChildren} child(ren) with missing parent reference.`,
    );
    issues.push(issue);
    maybeThrow(strict, issue);
  }

  // 4. dropOrphanEdges
  let orphanEdges = 0;
  const edges = input.edges.filter((e) => {
    const ok = e.sources.every((s) => allIds.has(s)) &&
      e.targets.every((t) => allIds.has(t));
    if (!ok) {
      orphanEdges++;
      return false;
    }
    return true;
  });
  if (orphanEdges > 0) {
    const issue = makeIssue(
      "dropped",
      "elk-orphan-edge",
      `Dropped ${orphanEdges} edge(s) referencing nonexistent nodes.`,
    );
    issues.push(issue);
    maybeThrow(strict, issue);
  }

  // 5. dropCircularContainment
  const parentOf = new Map<string, string>();
  const fillParents = (children: ElkChild[], parent?: string) => {
    for (const c of children) {
      if (parent) parentOf.set(c.id, parent);
      if (c.children) fillParents(c.children, c.id);
    }
  };
  fillParents(childrenC);
  let cyclesRemoved = 0;
  const isCyclic = (id: string): boolean => {
    const seen = new Set<string>();
    let cur = parentOf.get(id);
    while (cur) {
      if (cur === id || seen.has(cur)) return true;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };
  const stripCycles = (children: ElkChild[]): ElkChild[] =>
    children
      .filter((c) => {
        if (isCyclic(c.id)) {
          cyclesRemoved++;
          return false;
        }
        return true;
      })
      .map((c) => ({
        ...c,
        children: c.children ? stripCycles(c.children) : undefined,
      }));
  const childrenD = stripCycles(childrenC);
  if (cyclesRemoved > 0) {
    const issue = makeIssue(
      "dropped",
      "elk-containment-cycle",
      `Dropped ${cyclesRemoved} node(s) in containment cycles.`,
    );
    issues.push(issue);
    maybeThrow(strict, issue);
  }

  return {
    input: { ...input, children: childrenD, edges },
    issues,
  };
}

const elk = new ELK();

export interface ElkLayoutOptions {
  strict?: boolean;
}

export interface ElkLayoutResult {
  positioned: ElkInput;
  issues: GraphIssue[];
}

export async function applyElkLayout(
  input: ElkInput,
  opts: ElkLayoutOptions = {},
): Promise<ElkLayoutResult> {
  const { input: repaired, issues } = repairElkInput(input, opts);
  try {
    const positioned = (await elk.layout(repaired as never)) as ElkInput;
    return { positioned, issues };
  } catch (err) {
    const fatal: GraphIssue = {
      level: "fatal",
      category: "elk-layout-failed",
      message:
        `ELK layout failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `This looks like a dashboard rendering bug — please file an issue with the copied error.`,
    };
    if (opts.strict) throw err;
    return { positioned: { ...repaired, children: [], edges: [] }, issues: [...issues, fatal] };
  }
}
