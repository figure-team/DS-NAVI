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
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Top: scrollable flow list */}
      <div
        className="overflow-y-auto shrink-0 border-b border-border-subtle"
        style={{
          padding: "28px 24px 20px",
          maxHeight: selectedFlow ? "52vh" : "100%",
        }}
      >
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <p
              className="uppercase text-text-muted mb-1.5"
              style={{ fontSize: 11, letterSpacing: "0.12em" }}
            >
              {/* FIX 5: "업무 도메인" → 도메인 지도로 이동 */}
              <button
                type="button"
                onClick={() => clearActiveDomain()}
                className="uppercase text-text-muted hover:text-accent transition-colors cursor-pointer"
                style={{ letterSpacing: "0.12em" }}
              >
                {t.flowList.eyebrow}
              </button>{" "}
              › {domainNode?.name ?? ""}
            </p>
            <h2
              className="font-heading text-text-primary mb-1"
              style={{ fontSize: 28 }}
            >
              {domainNode?.name ?? ""}
            </h2>
            <p className="text-text-secondary" style={{ fontSize: 13 }}>
              {t.flowList.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => clearActiveDomain()}
            className="flex items-center gap-1.5 shrink-0 rounded-md border border-border-subtle text-text-secondary hover:border-border-medium hover:text-accent transition-colors"
            style={{ padding: "8px 16px", fontSize: 12 }}
          >
            {t.flowList.back}
          </button>
        </div>

        {groups.map((group, gi) => (
          <div
            key={group.key}
            className="mb-6"
            style={{ animation: `fadeSlideIn 0.3s ease-out ${gi * 0.1}s both` }}
          >
            {!singleGroup && (
              <div
                className="flex items-center gap-2 uppercase text-text-muted mb-2.5"
                style={{ fontSize: 11, letterSpacing: "0.09em" }}
              >
                <span>{groupLabel[group.key]}</span>
                <span className="flex-1 h-px bg-border-subtle" />
              </div>
            )}
            <div className="flex flex-col gap-1.5" style={{ maxWidth: 860 }}>
              {group.flows.map((flow, fi) => {
                const isSelected = flow.id === selectedFlowId;
                return (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => setSelectedFlow(flow.id)}
                    className="flow-row flex items-center gap-3.5 text-left rounded-lg border cursor-pointer transition-colors"
                    style={{
                      padding: "14px 18px",
                      animation: `fadeSlideRight 0.25s ease-out ${gi * 0.1 + fi * 0.05}s both`,
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
                    <MethodBadge method={flow.method} />
                    <span
                      className="text-text-primary shrink-0 truncate"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        minWidth: 0,
                        maxWidth: 240,
                      }}
                      title={flow.path}
                    >
                      {flow.path}
                    </span>
                    <span
                      className="text-text-secondary flex-1 truncate"
                      style={{ fontSize: 12, minWidth: 0 }}
                      title={flow.desc}
                    >
                      {flow.desc}
                    </span>
                    <span
                      className="text-text-muted shrink-0"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
                    >
                      {t.flowList.stepCount.replace("{count}", String(flow.stepCount))}
                    </span>
                    <span
                      className="shrink-0 transition-colors"
                      style={{ fontSize: 12, color: isSelected ? "var(--color-accent)" : "var(--color-text-muted)" }}
                    >
                      ›
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: inline cross-layer graph panel (shown when a flow is selected) */}
      {selectedFlow && (
        <div
          className="flex-1 flex flex-col overflow-hidden bg-root"
          style={{ animation: "fadeSlideIn 0.28s ease-out" }}
        >
          {/* inline header */}
          <div className="flex items-center gap-2.5 shrink-0 bg-panel border-b border-border-subtle" style={{ padding: "10px 20px" }}>
            <MethodBadge method={selectedFlow.method} />
            <span
              className="text-text-primary"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
            >
              {selectedFlow.path}
            </span>
            <span className="text-text-secondary truncate" style={{ fontSize: 11, minWidth: 0 }}>
              — {selectedFlow.desc}
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
          {/* inline spine */}
          <div className="flex-1 min-h-0 relative">
            <FlowSpineView flowId={selectedFlow.id} hideBack />
          </div>
        </div>
      )}
    </div>
  );
}
