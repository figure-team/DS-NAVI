import { useMemo, useState } from "react";
import { getLayerColor } from "./LayerLegend";
import KtdsNodeDetail from "./KtdsNodeDetail";
import {
  buildFlowSpine,
  buildNodeDetail,
  type DomainGraph,
  type LayerKey,
} from "../ktds/flowModel";

/**
 * Renders a single flow's cross-layer spine with DYNAMIC N rails (one rail per
 * layer present in the flow's steps — AC-5). Steps are method chips ordered by
 * `flow_step` weight. Clicking a chip opens the shared KtdsNodeDetail panel;
 * the file:line anchor in that panel jumps to source via `onOpenSource`
 * (wired to the existing CodeViewer in App).
 *
 * Honest truncation (AC-34 / F-b): an optional render cap surfaces a visible
 * "+N개 더보기" expand control — never a silent cap.
 */

const RENDER_CAP = 24;

export interface FlowSpineViewProps {
  graph: DomainGraph;
  flowId: string;
  onOpenSource: (nodeId: string) => void;
}

export default function FlowSpineView({ graph, flowId, onOpenSource }: FlowSpineViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const spine = useMemo(
    () => buildFlowSpine(graph, flowId, expanded ? undefined : RENDER_CAP),
    [graph, flowId, expanded],
  );

  // Stable layer→palette index map so chip + detail badge colors agree.
  const layerIndex = useMemo(() => {
    const m = new Map<LayerKey, number>();
    spine?.rails.forEach((r) => m.set(r.layer, r.index));
    return m;
  }, [spine]);

  const detail = useMemo(
    () => (selectedId ? buildNodeDetail(graph, selectedId) : null),
    [graph, selectedId],
  );

  if (!spine) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        흐름을 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Spine canvas */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border-subtle shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">{spine.flowName}</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            {spine.totalSteps} 스텝 · {spine.rails.length} 계층
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {/* N rails — one per present layer (dynamic) */}
          <div className="flex min-h-full" data-testid="spine-rails">
            {spine.rails.map((rail) => {
              const color = getLayerColor(rail.index);
              return (
                <div
                  key={rail.layer}
                  className="flex-1 min-w-[200px] border-r border-border-subtle last:border-r-0"
                  data-testid={`rail-${rail.layer}`}
                >
                  <div
                    className="sticky top-0 z-10 px-4 py-3 border-b border-border-subtle flex items-center gap-2 bg-surface"
                    style={{ backgroundColor: color.bg }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color.label }} />
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: color.label }}
                    >
                      {rail.label}
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-text-muted">{rail.steps.length}</span>
                  </div>

                  <div className="p-3 space-y-3">
                    {rail.steps.map((step) => {
                      const isSel = step.id === selectedId;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setSelectedId(step.id)}
                          className={`block w-full text-left rounded-lg border px-3 py-2 transition-all ${
                            isSel
                              ? "border-accent bg-accent/10"
                              : "border-border-subtle bg-elevated hover:border-border-medium"
                          }`}
                        >
                          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: color.label }}>
                            {rail.label}
                          </div>
                          <div className="font-mono text-xs text-text-primary break-words">{step.symbol}</div>
                          {step.filePath && (
                            <div className="text-[10px] font-mono text-text-muted mt-1 break-all">
                              {step.filePath.split("/").pop()}
                              {step.line != null ? `:${step.line}` : ""}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Honest truncation control — no silent cap (AC-34) */}
          {spine.truncatedSteps > 0 && (
            <div className="p-4 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-xs font-medium text-accent hover:text-accent-bright transition-colors"
                data-testid="show-more-steps"
              >
                +{spine.truncatedSteps}개 더보기
              </button>
            </div>
          )}
          {expanded && (
            <div className="p-4 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
              >
                접기
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Shared detail panel */}
      {detail && (
        <aside className="w-[300px] shrink-0 border-l border-border-subtle bg-surface overflow-auto">
          <KtdsNodeDetail
            detail={detail}
            layerIndex={layerIndex}
            onOpenSource={onOpenSource}
            onSelectNode={setSelectedId}
          />
        </aside>
      )}
    </div>
  );
}
