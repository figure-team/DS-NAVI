import { useMemo } from "react";
import type { KeyboardEvent } from "react";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { deriveLayer, orderFlowSteps } from "../utils/flowLayer";
import type { FlowLayer, StepSource } from "../utils/flowLayer";
import {
  computeSpineLayout,
  SPINE_COLUMNS,
  COL_W,
  HEADER_H,
  NODE_W,
  NODE_H,
} from "./flowSpineLayout";
import type { SpinePlacement, SpineStep } from "./flowSpineLayout";
import { flowBadge } from "../utils/domainData";
import type { FlowMethod } from "../utils/domainData";
import type { GraphNode } from "@understand-anything/core/types";

const METHOD_COLOR: Record<FlowMethod, string> = {
  GET: "#38bdf8",
  POST: "#6ee7b7",
  PUT: "#fcd34d",
  DELETE: "#f87171",
  BATCH: "#a78bfa",
  EVENT: "#d4a574",
  FLOW: "#94a3b8",
};

/**
 * Cross-layer flow view (Decision A2: JS-direct coordinates — no ELK, no React
 * Flow). Renders a selected flow's ordered backend step chain as a horizontal
 * spine traversing layer columns API→Service→DAO→DB(+Other), with continuous
 * cross-layer SVG edges. Ported from the approved prototype `renderSpineLayout`
 * / `generateSpineEdges`, adapted to real `domain-graph.json` data.
 *
 * v1 renders the flat ordered step sequence only — NO branch chips (v2, the
 * engine emits no per-step branch data). First-paint DOM step-node count ==
 * number of spine steps (no hidden/pre-mounted nodes) per plan AC-5.
 */

// Theme tokens (US-007). Fallbacks keep the lane colors resolving before the
// theme layer lands; promote the prototype's hardcoded rgba to CSS vars.
const LAYER_COLOR: Record<FlowLayer, string> = {
  api: "var(--color-layer-api, #d4a574)",
  service: "var(--color-layer-service, #38bdf8)",
  dao: "var(--color-layer-dao, #a78bfa)",
  db: "var(--color-layer-db, #f87171)",
  unknown: "var(--color-layer-other, #94a3b8)",
};

/**
 * `stepSource` rides along on domain-graph step nodes via schema passthrough; it
 * is not a typed `GraphNode` field. Read it defensively as the strongest layer
 * signal (plan Step 5 runtime dependency note).
 */
function readStepSource(node: GraphNode): StepSource | undefined {
  const raw = (node as { stepSource?: unknown }).stepSource;
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as { className?: unknown; relPath?: unknown };
  if (typeof src.relPath !== "string") return undefined;
  return {
    relPath: src.relPath,
    className: typeof src.className === "string" ? src.className : null,
  };
}

interface ResolvedStep extends SpineStep {
  node: GraphNode;
}

/** A spine edge between two consecutive steps, in absolute canvas coordinates. */
function buildEdgePath(from: SpinePlacement, to: SpinePlacement): { d: string; crossLayer: boolean } {
  const crossLayer = from.col !== to.col;
  if (crossLayer) {
    // source-right → target-left horizontal S-curve.
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const cx = x1 + (x2 - x1) * 0.5;
    return { d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`, crossLayer };
  }
  // same column siblings: bottom-center → top-center vertical link.
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  return { d: `M ${x1} ${y1} L ${x2} ${y2}`, crossLayer };
}

interface FlowSpineViewProps {
  /**
   * Render the spine for this flow instead of the store's `activeFlowId`. Lets
   * FlowListView (screen 2) render an inline spine for a locally-selected flow
   * without committing `activeFlowId` (which would promote to the full-screen
   * spine). Omit to preserve the original full-screen behavior.
   */
  flowId?: string;
  /**
   * Hide the floating "back to flows" button (the inline panel has its own
   * header). Defaults to false (full-screen behavior).
   */
  hideBack?: boolean;
}

export default function FlowSpineView({ flowId, hideBack }: FlowSpineViewProps = {}) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const storeFlowId = useDashboardStore((s) => s.activeFlowId);
  const activeFlowId = flowId ?? storeFlowId;
  const clearActiveFlow = useDashboardStore((s) => s.clearActiveFlow);
  const selectNode = useDashboardStore((s) => s.selectNode);
  const selectedNodeId = useDashboardStore((s) => s.selectedNodeId);
  const { t } = useI18n();

  const laneLabels: Record<FlowLayer, string> = {
    api: t.flowView.laneApi,
    service: t.flowView.laneService,
    dao: t.flowView.laneDao,
    db: t.flowView.laneDb,
    unknown: t.flowView.laneOther,
  };

  // Resolve ordered, layer-derived steps for the active flow.
  const steps = useMemo<ResolvedStep[]>(() => {
    if (!domainGraph || !activeFlowId) return [];
    const nodesById = new Map(domainGraph.nodes.map((n) => [n.id, n]));
    const refs = domainGraph.edges
      .filter((e) => e.type === "flow_step" && e.source === activeFlowId)
      .map((e) => ({ id: e.target, weight: e.weight }));
    // Raw-weight order, tie-broken by id, NaN last (plan R5 — never Math.round).
    return orderFlowSteps(refs)
      .map((ref): ResolvedStep | null => {
        const node = nodesById.get(ref.id);
        if (!node) return null;
        return { id: node.id, layer: deriveLayer(node, readStepSource(node)), node };
      })
      .filter((s): s is ResolvedStep => s !== null);
  }, [domainGraph, activeFlowId]);

  const layout = useMemo(() => computeSpineLayout(steps), [steps]);

  const edges = useMemo(() => {
    const out: Array<{ key: string; d: string; crossLayer: boolean; color: string }> = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const from = layout.placements.get(steps[i].id);
      const to = layout.placements.get(steps[i + 1].id);
      if (!from || !to) continue;
      const { d, crossLayer } = buildEdgePath(from, to);
      out.push({
        key: `${steps[i].id}->${steps[i + 1].id}`,
        d,
        crossLayer,
        // Edge takes the source step's layer color so the line stays continuous
        // with the node it leaves (cross-layer edges included).
        color: LAYER_COLOR[steps[i].layer],
      });
    }
    return out;
  }, [steps, layout]);

  const onStepKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectNode(id);
    }
  };

  // Right sidebar: layer legend (counts per lane) + selected-node detail.
  // Replaces the U-A NodeInfo sidebar that the full-bleed domain page hides;
  // ports the prototype `flowview-sidebar` (legend + detail card) to the right.
  const selectedStep = selectedNodeId ? steps.find((s) => s.id === selectedNodeId) ?? null : null;
  // FIX 4: which flow is being viewed (prototype sidebar-header). Lane headers
  // already carry the layer legend, so the sidebar legend block is dropped (FIX 1).
  const flowNode = domainGraph?.nodes.find((n) => n.id === activeFlowId) ?? null;
  const flowEntry = (() => {
    const meta = flowNode?.domainMeta as { entryPoint?: unknown } | undefined;
    return typeof meta?.entryPoint === "string" && meta.entryPoint !== "TBD" ? meta.entryPoint : null;
  })();

  const sidebar = (
    <aside
      className="shrink-0 h-full overflow-y-auto border-l border-border-subtle bg-surface/40"
      style={{ width: 300 }}
    >
      {/* Selected flow header (FIX 4) */}
      {flowNode && (
        <div className="p-4 border-b border-border-subtle">
          <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1">
            {t.flowView.selectedFlow}
          </p>
          <p className="text-sm font-medium text-text-primary break-words">{flowNode.name}</p>
          {flowEntry && (
            <p
              className="text-[11px] text-text-muted break-all mt-0.5"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {flowEntry}
            </p>
          )}
        </div>
      )}

      {/* Selected node detail */}
      <div className="p-4">
        {!selectedStep ? (
          <div className="text-xs text-text-muted leading-relaxed py-6 text-center">
            {t.flowView.detailEmpty}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span
              className="self-start uppercase font-semibold rounded px-1.5 py-0.5"
              style={{
                fontSize: 9,
                letterSpacing: "0.08em",
                color: LAYER_COLOR[selectedStep.layer],
                background: `${LAYER_COLOR[selectedStep.layer]}1f`,
              }}
            >
              {laneLabels[selectedStep.layer]}
            </span>
            <p className="text-sm font-medium text-text-primary break-words">{selectedStep.node.name}</p>
            {selectedStep.node.filePath && (
              <p className="text-[11px] text-text-muted break-all" style={{ fontFamily: "var(--font-mono)" }}>
                {selectedStep.node.filePath}
                {selectedStep.node.lineRange ? `:${selectedStep.node.lineRange[0]}` : ""}
              </p>
            )}
            {selectedStep.node.summary && (
              <>
                <p className="text-[11px] uppercase tracking-wider text-text-muted mt-2">
                  {t.flowView.detailSummary}
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">{selectedStep.node.summary}</p>
              </>
            )}
            {selectedStep.node.tags && selectedStep.node.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedStep.node.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  const badge = flowNode ? flowBadge(flowNode) : null;

  // Full-screen top bar (prototype `flowview-topbar`): back + method + path + desc.
  // Inline use (hideBack) gets no top bar — FlowListView provides its own header.
  const topbar = hideBack ? null : (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle shrink-0 bg-surface/60">
      <button
        type="button"
        onClick={() => clearActiveFlow()}
        className="flex items-center gap-1.5 shrink-0 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-border-medium hover:text-accent transition-colors"
      >
        {t.flowView.backToFlows}
      </button>
      {badge && (
        <span
          className="shrink-0 uppercase font-semibold rounded px-1.5 py-0.5"
          style={{
            fontSize: 10,
            letterSpacing: "0.05em",
            color: METHOD_COLOR[badge.method],
            background: `${METHOD_COLOR[badge.method]}22`,
          }}
        >
          {badge.method}
        </span>
      )}
      {badge && (
        <span className="text-text-primary truncate" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
          {badge.path}
        </span>
      )}
      {flowNode?.summary && (
        <span className="text-text-secondary truncate hidden md:inline" style={{ fontSize: 12 }}>
          {flowNode.summary}
        </span>
      )}
    </div>
  );

  // Empty state: 0-step flow (e.g. flow:product-empty).
  if (steps.length === 0) {
    return (
      <div
        className="h-full w-full flex flex-col"
        style={hideBack ? undefined : { animation: "fadeSlideIn 0.3s ease-out" }}
      >
        {topbar}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 relative">
            <div className="h-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
              {t.flowView.emptyFlow}
            </div>
          </div>
          {sidebar}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full flex flex-col"
      style={hideBack ? undefined : { animation: "fadeSlideIn 0.3s ease-out" }}
    >
      {topbar}
      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 relative">
      <div className="h-full w-full overflow-auto">
        <div
          className="relative"
          style={{ minWidth: layout.width, minHeight: layout.height }}
        >
          {/* Layer rail columns (headers + background). pointer-events disabled
              so step nodes/edges above stay interactive. */}
          <div className="absolute inset-0 flex pointer-events-none">
            {SPINE_COLUMNS.map((layer, li) => (
              <div
                key={layer}
                role="group"
                aria-label={laneLabels[layer]}
                style={{
                  width: COL_W,
                  flexShrink: 0,
                  background: li % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                  borderRight: "1px solid var(--color-border-subtle)",
                }}
              >
                <div
                  className="sticky top-0 flex items-center gap-2 px-3.5"
                  style={{
                    height: HEADER_H,
                    background: "var(--color-panel, var(--color-surface))",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    zIndex: 10,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: LAYER_COLOR[layer],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="font-semibold uppercase"
                    style={{ fontSize: 11, letterSpacing: "0.08em", color: LAYER_COLOR[layer] }}
                  >
                    {laneLabels[layer]}
                  </span>
                  <span
                    className="ml-auto text-text-muted"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
                  >
                    ×{layout.columnCounts[li]}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Continuous cross-layer edges. */}
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: layout.width,
              height: layout.height,
              overflow: "visible",
              pointerEvents: "none",
              zIndex: 1,
            }}
          >
            <defs>
              <marker
                id="flowspine-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M0,1 L0,7 L7,4 z" fill="context-stroke" />
              </marker>
            </defs>
            {edges.map((e) => (
              <path
                key={e.key}
                d={e.d}
                fill="none"
                stroke={e.color}
                strokeWidth={e.crossLayer ? 2 : 1.5}
                strokeDasharray={e.crossLayer ? undefined : "5 3"}
                markerEnd="url(#flowspine-arrow)"
                opacity={0.85}
              />
            ))}
          </svg>

          {/* Spine step nodes — exactly one DOM node per spine step (AC-5). */}
          <div className="absolute top-0 left-0 w-full" style={{ zIndex: 2 }}>
            {steps.map((step) => {
              const p = layout.placements.get(step.id);
              if (!p) return null;
              const color = LAYER_COLOR[step.layer];
              const isSelected = selectedNodeId === step.id;
              return (
                <div
                  key={step.id}
                  className={`spine-node absolute rounded-lg border bg-surface cursor-pointer${isSelected ? " spine-node-selected" : ""}`}
                  data-nodeid={step.id}
                  role="button"
                  tabIndex={0}
                  aria-label={step.node.name}
                  onClick={() => selectNode(step.id)}
                  onKeyDown={(e) => onStepKeyDown(e, step.id)}
                  style={{
                    left: p.x,
                    top: p.y,
                    width: NODE_W,
                    height: NODE_H,
                    borderColor: isSelected ? color : "var(--color-border-subtle)",
                    borderLeft: `3px solid ${color}`,
                    padding: "8px 12px",
                    overflow: "hidden",
                    ["--node-accent" as string]: color,
                  }}
                >
                  <div
                    className="uppercase font-semibold mb-1"
                    style={{ fontSize: 9, letterSpacing: "0.08em", color }}
                  >
                    {laneLabels[step.layer]}
                  </div>
                  <div
                    className="text-text-primary font-medium truncate"
                    style={{ fontSize: 12 }}
                    title={step.node.name}
                  >
                    {step.node.name}
                  </div>
                  {step.node.filePath && (
                    <div
                      className="text-text-muted truncate"
                      style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                      title={step.node.filePath}
                    >
                      {step.node.filePath.split("/").pop()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
      {sidebar}
      </div>
    </div>
  );
}
