import type { FlowLayer } from "../utils/flowLayer";

/**
 * Cross-layer flow view — pure spine layout (Decision A2: JS-direct coordinates,
 * no ELK / no React Flow). Ported from the approved prototype `renderSpineLayout`
 * (flow-spine-prototype.html:1699-1724): x = layer-column index, y = accumulated
 * sibling height within that column.
 *
 * This module is intentionally framework-free so column assignment + within-column
 * y accumulation are unit-testable in isolation from React rendering.
 *
 * Branch-folding (progressive disclosure of the "Other"/`unknown` lane) is layered
 * on by {@link partitionSpine}, which splits the backbone (api/service/dao/db call
 * chain) from the domain-entity branches that hang off it. The backbone always
 * renders; branches fold under their calling backbone step and disclose on demand.
 * No engine data is fabricated — a branch is exactly an `unknown`-lane step, and a
 * branch's parent is the backbone step that actually `calls` it (real edge).
 */

/** Column order = pipeline order, left→right, with the visible "Other" lane last. */
export const SPINE_COLUMNS: readonly FlowLayer[] = ["api", "service", "dao", "db", "unknown"];

/**
 * The lane treated as foldable branches. `unknown` steps are the "Other" lane —
 * verified (jpetstore real data) to be 100% domain-entity POJOs threaded through
 * the call chain as data, not pipeline stages. Folding them declutters the spine
 * down to the api→service→dao→db backbone without hiding any backbone step.
 */
export const BRANCH_LAYER: FlowLayer = "unknown";

// ── Layout constants (mirror prototype lines 1689-1696) ─────────────────────
export const COL_W = 260; // layer-column width (x stride)
export const NODE_W = 210; // step-node box width
const NODE_PAD_X = 24; // left inset of a node inside its column
const NODE_PAD_Y = 20; // gap between the column header and the first node
const SIBLING_GAP = 34; // vertical gap between sibling nodes — room for the under-node method chip
export const HEADER_H = 44; // sticky column-header height
export const NODE_H = 78; // step-node box height (fixed in v1; no branch chips)

/** A single step resolved for layout: identity + the column it belongs to. */
export interface SpineStep {
  id: string;
  layer: FlowLayer;
}

/** Absolute placement of one step node within the spine canvas. */
export interface SpinePlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Column index into {@link SPINE_COLUMNS} (api=0 … unknown=4). */
  col: number;
  layer: FlowLayer;
}

export interface SpineLayout {
  /** Step id → absolute placement. Insertion order matches input step order. */
  placements: Map<string, SpinePlacement>;
  /** Canvas extent so the scroll container can size itself. */
  width: number;
  height: number;
  /** Number of steps per column, indexed like {@link SPINE_COLUMNS}. */
  columnCounts: number[];
}

const COLUMN_INDEX: Record<FlowLayer, number> = {
  api: 0,
  service: 1,
  dao: 2,
  db: 3,
  unknown: 4,
};

/** Column index for a layer (api=0 … unknown=4); unknown for anything off-map. */
export function spineColumnIndex(layer: FlowLayer): number {
  return COLUMN_INDEX[layer] ?? COLUMN_INDEX.unknown;
}

/**
 * Order a step sequence for spine display: by pipeline column (api→service→dao→
 * db→other), preserving the incoming order within a column as a stable tiebreak.
 *
 * The spine pins every step to its layer column, and the continuous edges connect
 * *consecutive* steps in this sequence — so if the sequence isn't column-monotone
 * the edges jump backwards (e.g. an api base class emitted after the service step
 * draws a line back to the api lane). Sorting by column makes every cross-layer
 * edge flow left→right. Callers pass steps already ordered by the engine's
 * flow_step weight (call order); that order survives as the within-column order.
 */
export function orderSpineSequence<T extends SpineStep>(steps: readonly T[]): T[] {
  return steps
    .map((step, i) => ({ step, i }))
    .sort((a, b) => spineColumnIndex(a.step.layer) - spineColumnIndex(b.step.layer) || a.i - b.i)
    .map(({ step }) => step);
}

/**
 * Compute absolute spine coordinates for an ordered step sequence.
 *
 * Pure: no DOM, no React. Each step is pinned to its derived-layer column;
 * x is fixed by the column, y accumulates per-column from prior siblings.
 * The output preserves every input step (step count is invariant — an
 * all-`unknown` flow simply stacks entirely in column 4 / the Other lane).
 */
export function computeSpineLayout(steps: readonly SpineStep[]): SpineLayout {
  // Per-column y cursor, seeded below the sticky header.
  const colY: number[] = SPINE_COLUMNS.map(() => HEADER_H + NODE_PAD_Y);
  const columnCounts: number[] = SPINE_COLUMNS.map(() => 0);
  const placements = new Map<string, SpinePlacement>();

  for (const stepNode of steps) {
    const col = COLUMN_INDEX[stepNode.layer] ?? COLUMN_INDEX.unknown;
    const x = col * COL_W + NODE_PAD_X;
    const y = colY[col];
    placements.set(stepNode.id, { x, y, w: NODE_W, h: NODE_H, col, layer: stepNode.layer });
    colY[col] += NODE_H + SIBLING_GAP;
    columnCounts[col] += 1;
  }

  const width = COL_W * SPINE_COLUMNS.length + 40;
  const height = Math.max(...colY, HEADER_H + NODE_PAD_Y) + 60;

  return { placements, width, height, columnCounts };
}

// ── Branch folding (progressive disclosure of the Other lane) ────────────────

/** A real step→step `calls` edge, reduced to the ids the partition needs. */
export interface SpineCallEdge {
  source: string;
  target: string;
}

/**
 * Split a flow's steps into the always-visible backbone and the foldable
 * domain-entity branches that hang off it.
 *
 * - `spine`   — every non-`unknown` step (api/service/dao/db), in input order.
 * - `branches`— `unknown`-lane steps that resolve to a backbone parent.
 * - `orphans` — `unknown`-lane steps with NO backbone ancestor; always rendered
 *               (we never hide data that has nowhere to fold into).
 * - `parentOf`        — branch id → its backbone parent step id.
 * - `branchesByParent`— backbone id → its branch ids (input order preserved).
 *
 * Parent resolution is data-honest: a branch's parent is the backbone step that
 * actually `calls` it. When several backbone steps call the same entity (fan-in,
 * e.g. an entity touched by both the ActionBean and the Service), the earliest
 * one in pipeline order wins (api before service before dao before db), so the
 * entity folds nearest the start of the chain. Branches reached only through
 * other branches climb the `calls` graph transitively to the nearest backbone
 * ancestor. Cycles are guarded.
 */
export interface SpinePartition {
  spine: SpineStep[];
  branches: SpineStep[];
  orphans: SpineStep[];
  parentOf: Map<string, string>;
  branchesByParent: Map<string, string[]>;
}

export function partitionSpine(
  steps: readonly SpineStep[],
  callEdges: readonly SpineCallEdge[],
): SpinePartition {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const inputIndex = new Map(steps.map((s, i) => [s.id, i] as const));
  const isBranch = (s: SpineStep) => s.layer === BRANCH_LAYER;

  // callers[target] = backbone/branch steps that call it (known steps only).
  const callers = new Map<string, string[]>();
  for (const e of callEdges) {
    if (!stepById.has(e.source) || !stepById.has(e.target)) continue;
    const list = callers.get(e.target);
    if (list) list.push(e.source);
    else callers.set(e.target, [e.source]);
  }

  // Earlier = smaller pipeline column, tie-broken by input order (stable).
  const isEarlier = (a: SpineStep, b: SpineStep) => {
    const ca = spineColumnIndex(a.layer);
    const cb = spineColumnIndex(b.layer);
    if (ca !== cb) return ca < cb;
    return (inputIndex.get(a.id) ?? 0) < (inputIndex.get(b.id) ?? 0);
  };

  // Nearest backbone ancestor reachable by walking `calls` edges upward.
  const resolveParent = (branchId: string): string | null => {
    const visited = new Set<string>([branchId]);
    let frontier = [...(callers.get(branchId) ?? [])];
    let best: SpineStep | null = null;
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        const node = stepById.get(id);
        if (!node) continue;
        if (isBranch(node)) {
          next.push(...(callers.get(id) ?? []));
        } else if (best === null || isEarlier(node, best)) {
          best = node;
        }
      }
      frontier = next;
    }
    return best?.id ?? null;
  };

  const spine: SpineStep[] = [];
  const branches: SpineStep[] = [];
  const orphans: SpineStep[] = [];
  const parentOf = new Map<string, string>();
  const branchesByParent = new Map<string, string[]>();

  for (const s of steps) {
    if (!isBranch(s)) {
      spine.push(s);
      continue;
    }
    const parent = resolveParent(s.id);
    if (parent === null) {
      orphans.push(s);
      continue;
    }
    branches.push(s);
    parentOf.set(s.id, parent);
    const list = branchesByParent.get(parent);
    if (list) list.push(s.id);
    else branchesByParent.set(parent, [s.id]);
  }

  return { spine, branches, orphans, parentOf, branchesByParent };
}
