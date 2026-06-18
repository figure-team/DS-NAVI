import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { deriveLayer, orderFlowSteps } from "../utils/flowLayer";
import type { FlowLayer, StepSource } from "../utils/flowLayer";
import {
  computeSpineLayout,
  orderSpineSequence,
  partitionSpine,
  SPINE_COLUMNS,
  COL_W,
  HEADER_H,
  NODE_W,
  NODE_H,
} from "./flowSpineLayout";
import type { SpinePlacement, SpineStep, SpineCallEdge } from "./flowSpineLayout";
import { flowBadge } from "../utils/domainData";
import type { FlowMethod } from "../utils/domainData";
import type { GraphNode } from "@understand-anything/core/types";

const METHOD_COLOR: Record<FlowMethod, string> = {
  GET: "#38bdf8",
  POST: "#6ee7b7",
  PUT: "#fcd34d",
  DELETE: "#f87171",
  ANY: "#cbd5e1",
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

// Under-node "used methods" dropdown sizing — used to reserve column space so an
// open panel pushes lower siblings down (must track the dropdown markup below).
const METHOD_ROW_H = 28; // height of one method row (px-2 py-1 + gap)
const METHOD_PANEL_PAD = 18; // panel margin + container padding above/below rows

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
  const expandedBranchParents = useDashboardStore((s) => s.expandedBranchParents);
  const toggleBranchParent = useDashboardStore((s) => s.toggleBranchParent);
  const setBranchParentsExpanded = useDashboardStore((s) => s.setBranchParentsExpanded);
  const { t } = useI18n();

  // Which nodes have their "used methods" list expanded (view-local, ephemeral).
  const [openMethods, setOpenMethods] = useState<Set<string>>(() => new Set());
  const toggleMethods = (id: string) =>
    setOpenMethods((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const laneLabels: Record<FlowLayer, string> = {
    api: t.flowView.laneApi,
    service: t.flowView.laneService,
    dao: t.flowView.laneDao,
    db: t.flowView.laneDb,
    unknown: t.flowView.laneOther,
  };

  // Resolve every ordered, layer-derived step for the active flow (the full set,
  // before branch-folding hides anything).
  const allSteps = useMemo<ResolvedStep[]>(() => {
    if (!domainGraph || !activeFlowId) return [];
    const nodesById = new Map(domainGraph.nodes.map((n) => [n.id, n]));
    const refs = domainGraph.edges
      .filter((e) => e.type === "flow_step" && e.source === activeFlowId)
      .map((e) => ({ id: e.target, weight: e.weight }));
    // Raw-weight order, tie-broken by id, NaN last (plan R5 — never Math.round).
    const byWeight = orderFlowSteps(refs)
      .map((ref): ResolvedStep | null => {
        const node = nodesById.get(ref.id);
        if (!node) return null;
        return { id: node.id, layer: deriveLayer(node, readStepSource(node)), node };
      })
      .filter((s): s is ResolvedStep => s !== null);
    // Lay the sequence out in pipeline order (api→service→dao→db→other) so the
    // continuous cross-layer edges flow left→right; engine weight (call order)
    // is preserved as the within-column tiebreak.
    return orderSpineSequence(byWeight);
  }, [domainGraph, activeFlowId]);

  // Real step→step `calls` edges among this flow's steps — the topology that
  // partitions the backbone from its folded domain-entity branches.
  const callEdges = useMemo<SpineCallEdge[]>(() => {
    if (!domainGraph) return [];
    const ids = new Set(allSteps.map((s) => s.id));
    return domainGraph.edges
      .filter((e) => e.type === "calls" && ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));
  }, [domainGraph, allSteps]);

  // 곁가지 접기 (#4): split backbone (always shown) from foldable `unknown`-lane
  // branches. Each branch folds under the backbone step that calls it.
  const partition = useMemo(() => partitionSpine(allSteps, callEdges), [allSteps, callEdges]);

  // Rendered subset: backbone + orphan entities always; a folded branch appears
  // only while its parent backbone step is disclosed. Default (empty set) =
  // decluttered backbone-only spine; expanding a parent reveals its entities.
  const steps = useMemo<ResolvedStep[]>(() => {
    const byId = new Map(allSteps.map((s) => [s.id, s]));
    const rendered: ResolvedStep[] = [];
    for (const s of partition.spine) rendered.push(byId.get(s.id)!);
    for (const s of partition.orphans) rendered.push(byId.get(s.id)!);
    for (const b of partition.branches) {
      const parent = partition.parentOf.get(b.id);
      if (parent && expandedBranchParents.has(parent)) rendered.push(byId.get(b.id)!);
    }
    return orderSpineSequence(rendered);
  }, [allSteps, partition, expandedBranchParents]);

  // Per-node "used methods": the engine labels each calls edge with the ordered
  // methods the source invokes on the target (`description`). Aggregated onto the
  // TARGET node, that is exactly which of this class's methods the flow uses —
  // shown as an expandable chip under the node (prototype's branch-chip pattern,
  // repurposed for methods) instead of occluded on-line labels.
  const methodsByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!domainGraph) return map;
    const renderedIds = new Set(steps.map((s) => s.id));
    for (const e of domainGraph.edges) {
      if (e.type !== "calls" || !renderedIds.has(e.target)) continue;
      const desc = typeof e.description === "string" ? e.description.trim() : "";
      if (!desc) continue;
      let list = map.get(e.target);
      if (!list) map.set(e.target, (list = []));
      for (const m of desc.split("→").map((s) => s.trim()).filter(Boolean)) {
        if (!list.includes(m)) list.push(m);
      }
    }
    return map;
  }, [domainGraph, steps]);

  // Reserve vertical space below a node whose "used methods" dropdown is open so
  // the expanded panel pushes the column's lower siblings down instead of
  // overlapping them. Height ≈ one row per method + the panel's own padding.
  const extraBelow = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of openMethods) {
      const methods = methodsByNode.get(id);
      if (!methods || methods.length === 0) continue;
      m.set(id, methods.length * METHOD_ROW_H + METHOD_PANEL_PAD);
    }
    return m;
  }, [openMethods, methodsByNode]);

  const layout = useMemo(() => computeSpineLayout(steps, extraBelow), [steps, extraBelow]);

  // Backbone steps that have foldable branches (drives the global expand/collapse).
  const branchParents = useMemo(
    () => [...partition.branchesByParent.keys()],
    [partition],
  );
  const allBranchesExpanded =
    branchParents.length > 0 && branchParents.every((p) => expandedBranchParents.has(p));

  const edges = useMemo(() => {
    const out: Array<{ key: string; d: string; crossLayer: boolean; color: string }> = [];
    if (!domainGraph) return out;
    // Draw the REAL call/dependency topology (engine `calls` step→step edges),
    // not a synthetic consecutive-step chain. This shows fan-out honestly: an
    // ActionBean that calls two services renders two edges branching out, never
    // a fabricated service→service link (the old sequence chain's artifact).
    const stepIds = new Set(steps.map((s) => s.id));
    const layerById = new Map(steps.map((s) => [s.id, s.layer]));
    for (const e of domainGraph.edges) {
      if (e.type !== "calls" || !stepIds.has(e.source) || !stepIds.has(e.target)) continue;
      // Fold-aware edges: a disclosed entity draws ONLY its fold edge (entity ↔
      // its assigned parent backbone step). A fan-in entity is called by several
      // backbone steps, but it folds under exactly one; suppressing the other
      // callers' edges keeps each disclosed parent's branch visually its own
      // (the bug: expanding the API step also drew Service/DAO lines into the
      // shared entity). Orphan entities (no parent) keep their real edges.
      const srcEntity = (layerById.get(e.source) ?? "unknown") === "unknown";
      const tgtEntity = (layerById.get(e.target) ?? "unknown") === "unknown";
      if (tgtEntity && !srcEntity) {
        const parent = partition.parentOf.get(e.target);
        if (parent !== undefined && parent !== e.source) continue;
      }
      if (srcEntity && !tgtEntity) {
        const parent = partition.parentOf.get(e.source);
        if (parent !== undefined && parent !== e.target) continue;
      }
      const from = layout.placements.get(e.source);
      const to = layout.placements.get(e.target);
      if (!from || !to) continue;
      const { d, crossLayer } = buildEdgePath(from, to);
      out.push({
        key: `${e.source}->${e.target}`,
        d,
        crossLayer,
        // Edge takes the source step's layer color so the line stays continuous
        // with the node it leaves (cross-layer edges included).
        color: LAYER_COLOR[layerById.get(e.source) ?? "unknown"],
      });
    }
    return out;
  }, [domainGraph, steps, layout, partition]);

  const onStepKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectNode(id);
    }
  };

  const selectedStep = selectedNodeId ? allSteps.find((s) => s.id === selectedNodeId) ?? null : null;
  const flowNode = domainGraph?.nodes.find((n) => n.id === activeFlowId) ?? null;

  // Right sidebar: the selected node's detail card. Shown ONLY while a node is
  // selected (req: 노드를 눌렀을 때만 해당 노드 설명 표시) — with no selection the
  // sidebar is removed entirely so the graph claims the full width.
  const sidebar = selectedStep ? (
    <aside
      className="shrink-0 h-full overflow-y-auto border-l border-border-subtle bg-surface/40"
      style={{ width: 300 }}
    >
      <div className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
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
            <button
              type="button"
              onClick={() => selectNode(null)}
              className="shrink-0 -mt-0.5 -mr-1 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-elevated transition-colors"
              style={{ width: 22, height: 22, fontSize: 14, lineHeight: 1 }}
              aria-label={t.flowView.closeDetail}
              title={t.flowView.closeDetail}
            >
              ✕
            </button>
          </div>
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
      </div>
    </aside>
  ) : null;

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
      {branchParents.length > 0 && (
        <button
          type="button"
          onClick={() => setBranchParentsExpanded(allBranchesExpanded ? null : branchParents)}
          className="ml-auto shrink-0 flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 text-xs text-text-secondary hover:border-border-medium hover:text-accent transition-colors"
          aria-pressed={allBranchesExpanded}
          title={allBranchesExpanded ? t.flowView.collapseAllBranches : t.flowView.expandAllBranches}
        >
          <span style={{ fontSize: 11 }}>{allBranchesExpanded ? "－" : "＋"}</span>
          {allBranchesExpanded ? t.flowView.collapseAllBranches : t.flowView.expandAllBranches}
        </button>
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
              // 곁가지 접기: backbone steps with folded entity branches get a
              // disclosure badge ("＋N" folded / "－N" disclosed).
              const branchIds = partition.branchesByParent.get(step.id) ?? [];
              const branchExpanded = expandedBranchParents.has(step.id);
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
                  {branchIds.length > 0 && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleBranchParent(step.id);
                      }}
                      onKeyDown={(ev) => ev.stopPropagation()}
                      className="absolute flex items-center gap-0.5 rounded-full border font-semibold transition-colors hover:brightness-125"
                      style={{
                        top: 6,
                        right: 6,
                        padding: "1px 6px",
                        fontSize: 10,
                        lineHeight: 1.4,
                        color,
                        borderColor: `${color}66`,
                        background: `${color}1f`,
                      }}
                      aria-expanded={branchExpanded}
                      aria-label={`${branchIds.length} ${t.flowView.branchBadge}`}
                      title={`${branchIds.length} ${t.flowView.branchBadge}`}
                    >
                      <span>{branchExpanded ? "－" : "＋"}</span>
                      <span>{branchIds.length}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Used-methods chips — one per node that the flow invokes methods on.
              "ƒ N 메서드" toggles a list of the actual methods used (engine-labeled
              call order). Replaces the occluded on-line labels with the prototype's
              branch-chip pattern, repurposed for methods. */}
          <div className="absolute top-0 left-0 w-full" style={{ zIndex: 4, pointerEvents: "none" }}>
            {steps.map((step) => {
              const p = layout.placements.get(step.id);
              const methods = methodsByNode.get(step.id);
              if (!p || !methods || methods.length === 0) return null;
              const color = LAYER_COLOR[step.layer];
              const open = openMethods.has(step.id);
              return (
                <div
                  key={`${step.id}-methods`}
                  className="absolute"
                  style={{
                    left: p.x + 10,
                    top: p.y + NODE_H + 3,
                    width: NODE_W - 20,
                    zIndex: open ? 6 : 5,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleMethods(step.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed transition-colors hover:brightness-125"
                    style={{
                      padding: "2px 9px",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      lineHeight: 1.4,
                      color,
                      borderColor: `${color}55`,
                      background: "var(--color-panel, var(--color-surface))",
                      pointerEvents: "auto",
                    }}
                    aria-expanded={open}
                    aria-label={`${methods.length} ${t.flowView.methodsUsed}`}
                  >
                    <span style={{ fontStyle: "italic", opacity: 0.85 }}>ƒ</span>
                    <span>
                      {methods.length} {t.flowView.methodsUsed}
                    </span>
                    <span style={{ fontSize: 8 }}>{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div
                      className="flex flex-col gap-1 mt-1 rounded-md border p-1.5"
                      style={{
                        borderColor: "var(--color-border-subtle)",
                        background: "var(--color-panel, var(--color-surface))",
                        pointerEvents: "auto",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                      }}
                    >
                      {methods.map((m, i) => (
                        <div
                          key={m}
                          className="flex items-center gap-2 rounded px-2 py-1"
                          style={{ background: "var(--color-surface)" }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontFamily: "var(--font-mono)",
                              color: "var(--color-text-muted)",
                              minWidth: 12,
                            }}
                          >
                            {i + 1}
                          </span>
                          <span
                            className="truncate"
                            style={{ fontSize: 11, fontFamily: "var(--font-mono)", color }}
                            title={m}
                          >
                            {m}
                          </span>
                        </div>
                      ))}
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
