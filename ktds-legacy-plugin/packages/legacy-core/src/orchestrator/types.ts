import type { ProjectMeta, Layer } from "@understand-anything/core";

/**
 * A node in the additive ktds overlay (or a normalized projection of a UA
 * base node). A deliberately narrow shape: only the fields the dual-load
 * orchestrator reads or emits. domainMeta is kept open for ktds domain/flow/
 * step metadata.
 */
export interface OverlayNode {
  id: string;
  type: string;
  name: string;
  filePath?: string;
  lineRange?: [number, number];
  summary: string;
  tags: string[];
  domainMeta?: Record<string, unknown>;
}

/**
 * An edge in the additive overlay. Subset of the UA graph edge shape; only
 * source/target/type are required (the overlay emitter may omit the rest).
 */
export interface OverlayEdge {
  source: string;
  target: string;
  type: string;
  direction?: string;
  weight?: number;
  description?: string;
}

/**
 * The optional ktds overlay read from `.understand-anything/domain-graph.json`
 * (produced later in P2). A lenient subset of the UA graph shape.
 */
export interface OverlayGraph {
  nodes: OverlayNode[];
  edges: OverlayEdge[];
}

/**
 * Result of additively merging the UA native knowledge graph with the ktds
 * overlay. Counts and skippedIds make the merge auditable; outputs are sorted
 * for determinism.
 */
export interface MergedGraph {
  project: ProjectMeta;
  nodes: OverlayNode[];
  edges: OverlayEdge[];
  layers: Layer[];
  nativeNodeCount: number;
  overlayNodeCount: number;
  mergedNodeCount: number;
  skippedIds: string[];
}
