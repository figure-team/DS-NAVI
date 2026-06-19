import { useMemo } from "react";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import FlowSpineView from "./FlowSpineView";
import {
  buildDomainFlows,
  findDomain,
  flowGroupKey,
  type DomainFlow,
  type FlowGroupKey,
  type FlowMethod,
} from "../utils/domainData";

/**
 * Screen 2 — Flow list (master-detail). Faithful port of the approved prototype
 * (`#screen-flows`, `renderFlows()` / `openInlineGraph()`): a scrollable top
 * panel with the domain header + grouped flow rows, and a bottom inline panel
 * that renders the selected flow's cross-layer spine.
 *
 * - Back button (← domain map) → `clearActiveDomain()` (→ DomainMapView).
 * - Selecting a flow row shows the spine inline (reuses FlowSpineView with the
 *   `flowId` prop, so `activeFlowId` is NOT committed).
 * - "⤢ Fullscreen" on the inline header → `navigateToFlow(selectedFlowId)`
 *   (→ full-screen FlowSpineView, screen 3, already wired in App.tsx).
 *
 * USECASE GROUPING (documented choice): real domain-graph.json has no "usecase"
 * field, so flows are grouped by `entryType` into honest buckets (HTTP / Batch /
 * Event / Other). When all flows fall in a single bucket the group header is
 * suppressed and a flat list is rendered — avoids a noisy single-section label.
 */

// Method badge palette — ported from prototype `.method-*` classes.
const METHOD_STYLE: Record<FlowMethod, { bg: string; color: string }> = {
  GET: { bg: "rgba(90,158,111,0.2)", color: "#6ee7b7" },
  POST: { bg: "rgba(74,124,155,0.2)", color: "#7dd3fc" },
  PUT: { bg: "rgba(201,160,108,0.2)", color: "#fcd34d" },
  DELETE: { bg: "rgba(248,113,113,0.2)", color: "#f87171" },
  ANY: { bg: "rgba(203,213,225,0.18)", color: "#cbd5e1" },
  BATCH: { bg: "rgba(167,139,250,0.2)", color: "#a78bfa" },
  EVENT: { bg: "rgba(56,189,248,0.2)", color: "#38bdf8" },
  FLOW: { bg: "rgba(212,165,116,0.18)", color: "#d4a574" },
};

const GROUP_ORDER: FlowGroupKey[] = ["http", "batch", "event", "other"];

function MethodBadge({ method }: { method: FlowMethod }) {
  const s = METHOD_STYLE[method];
  return (
    <span
      className="font-bold text-center shrink-0 rounded"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        padding: "2px 7px",
        minWidth: 44,
        background: s.bg,
        color: s.color,
      }}
    >
      {method}
    </span>
  );
}

export default function FlowListView() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const clearActiveDomain = useDashboardStore((s) => s.clearActiveDomain);
  const navigateToFlow = useDashboardStore((s) => s.navigateToFlow);
  // FIX 3: inline selection now lives in the store so it survives the
  // fullscreen round-trip (this component unmounts while the full-screen spine
  // is shown, then remounts on back).
  const selectedFlowId = useDashboardStore((s) => s.selectedFlowId);
  const setSelectedFlow = useDashboardStore((s) => s.setSelectedFlow);
  const { t } = useI18n();

  const flows = useMemo<DomainFlow[]>(
    () =>
      domainGraph && activeDomainId
        ? buildDomainFlows(domainGraph, activeDomainId)
        : [],
    [domainGraph, activeDomainId],
  );

  const domainNode = useMemo(
    () => (domainGraph && activeDomainId ? findDomain(domainGraph, activeDomainId) : undefined),
    [domainGraph, activeDomainId],
  );

  // Inline-selection reset on domain switch is handled centrally in the store
  // (navigateToDomain / clearActiveDomain reset selectedFlowId) so the
  // fullscreen round-trip can preserve it — see FIX 3.

  // Group flows by entryType bucket, preserving graph order within a group.
  const groups = useMemo(() => {
    const map = new Map<FlowGroupKey, DomainFlow[]>();
    for (const f of flows) {
      const key = flowGroupKey(f.entryType);
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      key: k,
      flows: map.get(k)!,
    }));
  }, [flows]);

  const groupLabel: Record<FlowGroupKey, string> = {
    http: t.flowList.groupHttp,
    batch: t.flowList.groupBatch,
    event: t.flowList.groupEvent,
    other: t.flowList.groupOther,
  };

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) ?? null;
  const singleGroup = groups.length <= 1;

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* LEFT sidebar: flow list. Clicking a row selects the flow and renders its
          code graph in the center pane. */}
      <aside
        className="shrink-0 h-full flex flex-col border-r border-border-subtle bg-surface/40"
        style={{ width: 320 }}
      >
        {/* sidebar header — breadcrumb (navigation) + back button */}
        <div className="shrink-0 border-b border-border-subtle" style={{ padding: "16px 16px 14px" }}>
          <div className="flex items-center justify-between gap-3">
            <p
              className="uppercase text-text-muted truncate"
              style={{ fontSize: 11, letterSpacing: "0.1em", minWidth: 0 }}
            >
              <button
                type="button"
                onClick={() => clearActiveDomain()}
                className="uppercase text-text-muted hover:text-accent transition-colors cursor-pointer"
                style={{ letterSpacing: "0.1em" }}
              >
                {t.flowList.eyebrow}
              </button>{" "}
              › {domainNode?.name ?? ""}
            </p>
            <button
              type="button"
              onClick={() => clearActiveDomain()}
              className="flex items-center shrink-0 rounded-md border border-border-subtle text-text-secondary hover:border-border-medium hover:text-accent transition-colors"
              style={{ padding: "6px 10px", fontSize: 11 }}
            >
              {t.flowList.back}
            </button>
          </div>
        </div>

        {/* scrollable flow rows */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "12px" }}>
          {groups.map((group) => (
            <div key={group.key} className="mb-5 last:mb-0">
              {!singleGroup && (
                <div
                  className="flex items-center gap-2 uppercase text-text-muted mb-2"
                  style={{ fontSize: 10, letterSpacing: "0.09em" }}
                >
                  <span>{groupLabel[group.key]}</span>
                  <span className="flex-1 h-px bg-border-subtle" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {group.flows.map((flow) => {
                  const isSelected = flow.id === selectedFlowId;
                  return (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => setSelectedFlow(flow.id)}
                      className="flow-row flex flex-col gap-1.5 text-left rounded-lg border cursor-pointer transition-colors w-full"
                      style={{
                        padding: "10px 12px",
                        background: isSelected
                          ? "rgba(212,165,116,0.07)"
                          : "var(--color-elevated)",
                        borderColor: isSelected
                          ? "var(--color-accent)"
                          : "var(--color-border-subtle)",
                        boxShadow: isSelected
                          ? "0 0 0 1px rgba(212,165,116,0.18) inset"
                          : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <MethodBadge method={flow.method} />
                        <span
                          className="ml-auto shrink-0 text-text-muted"
                          style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
                        >
                          {t.flowList.stepCount.replace("{count}", String(flow.stepCount))}
                        </span>
                      </div>
                      {/* Full endpoint — wraps so every character stays visible. */}
                      <span
                        className="text-text-primary"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11.5,
                          wordBreak: "break-all",
                          lineHeight: 1.45,
                        }}
                      >
                        {flow.path}
                      </span>
                      {/* Function label ("어떤 기능인지") — not the long description. */}
                      <span className="text-text-secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>
                        {flow.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* CENTER + RIGHT: selected flow's code graph (FlowSpineView renders its own
          right sidebar, which now appears only when a node is clicked). */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-root">
        {selectedFlow ? (
          <>
            {/* center header — selected flow context + fullscreen */}
            <div
              className="flex items-center gap-2.5 shrink-0 bg-panel border-b border-border-subtle"
              style={{ padding: "10px 20px" }}
            >
              <MethodBadge method={selectedFlow.method} />
              <span
                className="text-text-primary whitespace-nowrap"
                style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
              >
                {selectedFlow.path}
              </span>
              <span className="text-text-secondary truncate" style={{ fontSize: 11, minWidth: 0 }}>
                — {selectedFlow.name}
              </span>
              <button
                type="button"
                onClick={() => navigateToFlow(selectedFlow.id)}
                className="flex items-center gap-1.5 shrink-0 ml-auto rounded border border-border-subtle text-text-muted hover:border-border-medium hover:text-accent transition-colors"
                style={{ padding: "5px 12px", fontSize: 11 }}
              >
                {t.flowList.fullscreen}
              </button>
            </div>
            {/* code graph */}
            <div className="flex-1 min-h-0 relative">
              <FlowSpineView flowId={selectedFlow.id} hideBack />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-8 text-center">
            <p className="text-text-muted" style={{ fontSize: 13 }}>
              {t.flowList.selectPrompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
