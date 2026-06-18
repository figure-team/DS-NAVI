import { useMemo, useState } from "react";
import FlowSpineView from "./FlowSpineView";
import { buildFlowList, type DomainGraph, type FlowListEntry } from "../ktds/flowModel";

/**
 * Master-detail flow browser (per flow-spine-prototype.html):
 * a left rail lists flows grouped by domain; selecting one renders its
 * cross-layer spine on the right.
 */

export interface FlowListViewProps {
  graph: DomainGraph;
  onOpenSource: (nodeId: string) => void;
}

export default function FlowListView({ graph, onOpenSource }: FlowListViewProps) {
  const flows = useMemo(() => buildFlowList(graph), [graph]);

  // Group flows by domain (preserving first-seen domain order).
  const groups = useMemo(() => {
    const map = new Map<string, { domainName: string; flows: FlowListEntry[] }>();
    for (const f of flows) {
      const key = f.domainId ?? "__none__";
      let g = map.get(key);
      if (!g) {
        g = { domainName: f.domainName ?? "기타", flows: [] };
        map.set(key, g);
      }
      g.flows.push(f);
    }
    return Array.from(map.values());
  }, [flows]);

  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(
    flows.length > 0 ? flows[0].flowId : null,
  );

  if (flows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        흐름 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Master list */}
      <aside className="w-[260px] shrink-0 border-r border-border-subtle bg-surface overflow-auto">
        <div className="p-3 space-y-4">
          {groups.map((g) => (
            <div key={g.domainName}>
              <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5 px-1">
                {g.domainName}
              </h3>
              <ul className="space-y-0.5">
                {g.flows.map((f) => {
                  const isSel = f.flowId === selectedFlowId;
                  return (
                    <li key={f.flowId}>
                      <button
                        type="button"
                        onClick={() => setSelectedFlowId(f.flowId)}
                        className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                          isSel
                            ? "bg-accent/15 text-accent"
                            : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                        }`}
                      >
                        <div className="text-xs font-medium break-words">{f.flowName}</div>
                        <div className="text-[10px] text-text-muted">{f.stepCount} 스텝</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>

      {/* Detail spine */}
      <div className="flex-1 min-w-0 min-h-0">
        {selectedFlowId ? (
          <FlowSpineView graph={graph} flowId={selectedFlowId} onOpenSource={onOpenSource} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            흐름을 선택하세요.
          </div>
        )}
      </div>
    </div>
  );
}
