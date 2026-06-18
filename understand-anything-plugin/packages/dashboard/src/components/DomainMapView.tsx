import { useMemo, useState } from "react";
import KtdsNodeDetail from "./KtdsNodeDetail";
import {
  buildDomainCards,
  buildCrossDomainEdges,
  buildNodeDetail,
  type DomainGraph,
} from "../ktds/flowModel";

/**
 * Domain map (P3.5): domain cards (name, flowCount, nodeCount, onboarding
 * priority when present) plus grounded cross-domain dependency edges (AC-33).
 *
 * Cross-domain edges are listed explicitly as grounded dependencies rather
 * than free-floating arrows — each edge names its source/target domains and
 * (when present) a description, so the dependency is legible and grounded.
 * Clicking a card opens the shared KtdsNodeDetail panel (AC-37).
 */

export interface DomainMapViewProps {
  graph: DomainGraph;
  onOpenSource: (nodeId: string) => void;
}

export default function DomainMapView({ graph, onOpenSource }: DomainMapViewProps) {
  const cards = useMemo(() => buildDomainCards(graph), [graph]);
  const crossEdges = useMemo(() => buildCrossDomainEdges(graph), [graph]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) m.set(c.id, c.name);
    return m;
  }, [cards]);

  const detail = useMemo(
    () => (selectedId ? buildNodeDetail(graph, selectedId) : null),
    [graph, selectedId],
  );

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        도메인 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 overflow-auto p-5">
        {/* Domain cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => {
            const isSel = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  isSel
                    ? "border-accent bg-accent/10"
                    : "border-border-subtle bg-surface hover:border-border-medium"
                }`}
                data-testid={`domain-card-${c.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary break-words">{c.name}</h3>
                  {c.onboardingPriority != null && (
                    <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-accent/15 text-accent">
                      #{c.onboardingPriority}
                    </span>
                  )}
                </div>
                {c.summary && (
                  <p className="text-[11px] text-text-secondary mt-1.5 line-clamp-3">{c.summary}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-[11px] font-mono text-text-muted">
                  <span>{c.flowCount} 흐름</span>
                  <span>·</span>
                  <span>{c.nodeCount} 노드</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Grounded cross-domain dependency edges (AC-33) */}
        {crossEdges.length > 0 && (
          <section className="mt-6">
            <h4 className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
              도메인 간 의존성
            </h4>
            <ul className="space-y-1.5" data-testid="cross-domain-edges">
              {crossEdges.map((e) => (
                <li
                  key={`${e.source}->${e.target}`}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  <span className="font-medium text-text-primary">
                    {nameById.get(e.source) ?? e.source.replace(/^domain:/, "")}
                  </span>
                  <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span className="font-medium text-text-primary">
                    {nameById.get(e.target) ?? e.target.replace(/^domain:/, "")}
                  </span>
                  {e.description && <span className="text-text-muted">— {e.description}</span>}
                  <span className="ml-auto text-[10px] font-mono text-text-muted">w={e.weight}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Shared detail panel */}
      {detail && (
        <aside className="w-[300px] shrink-0 border-l border-border-subtle bg-surface overflow-auto">
          <KtdsNodeDetail detail={detail} onOpenSource={onOpenSource} onSelectNode={setSelectedId} />
        </aside>
      )}
    </div>
  );
}
