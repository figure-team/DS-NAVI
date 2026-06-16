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
 * v1 renders the linear ordered step sequence only. Branch-folding (prototype
 * `node.branches` / chips) is v2 and deliberately NOT modeled here.
 */

/** Column order = pipeline order, left→right, with the visible "Other" lane last. */
export const SPINE_COLUMNS: readonly FlowLayer[] = ["api", "service", "dao", "db", "unknown"];

// ── Layout constants (mirror prototype lines 1689-1696) ─────────────────────
export const COL_W = 260; // layer-column width (x stride)
export const NODE_W = 210; // step-node box width
const NODE_PAD_X = 24; // left inset of a node inside its column
const NODE_PAD_Y = 20; // gap between the column header and the first node
const SIBLING_GAP = 16; // vertical gap between sibling nodes in a column
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
