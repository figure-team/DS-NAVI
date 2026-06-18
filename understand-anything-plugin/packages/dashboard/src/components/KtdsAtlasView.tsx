import { useEffect, useState } from "react";
import type { KnowledgeGraph } from "@understand-anything/core/types";
import { useDashboardStore } from "../store";
import FlowListView from "./FlowListView";
import DomainMapView from "./DomainMapView";
import type { DomainGraph } from "../ktds/flowModel";

/**
 * ktds Code Atlas container.
 *
 * Loads the raw `domain-graph.json` on demand (the raw file carries ktds step
 * fields like `layer` and does NOT satisfy the core KnowledgeGraph schema, so
 * it is intentionally parsed here rather than through the validated store
 * `domainGraph`). Registers the raw graph with the store so the existing
 * CodeViewer can resolve ktds step nodes for source jumps, then renders the
 * flow / domain sub-views which share the KtdsNodeDetail panel.
 */

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

type KtdsTab = "flows" | "domains";

function isDomainGraph(data: unknown): data is DomainGraph {
  return (
    !!data &&
    typeof data === "object" &&
    Array.isArray((data as DomainGraph).nodes) &&
    Array.isArray((data as DomainGraph).edges)
  );
}

function domainGraphUrl(token: string): string {
  if (DEMO_MODE) {
    const envUrl = import.meta.env.VITE_DOMAIN_GRAPH_URL;
    if (envUrl) return envUrl;
    const base = import.meta.env.BASE_URL || "/";
    return `${base.endsWith("/") ? base : `${base}/`}domain-graph.json`;
  }
  return `/domain-graph.json?token=${encodeURIComponent(token)}`;
}

export interface KtdsAtlasViewProps {
  accessToken: string;
}

export default function KtdsAtlasView({ accessToken }: KtdsAtlasViewProps) {
  const [graph, setGraph] = useState<DomainGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<KtdsTab>("flows");
  const openCodeViewer = useDashboardStore((s) => s.openCodeViewer);
  const setKtdsDomainGraph = useDashboardStore((s) => s.setKtdsDomainGraph);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(domainGraphUrl(accessToken), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        if (!isDomainGraph(data)) {
          setError("도메인 그래프(domain-graph.json)를 불러올 수 없습니다.");
          return;
        }
        setGraph(data);
        // Register raw nodes so CodeViewer can resolve ktds step source jumps.
        setKtdsDomainGraph({ nodes: data.nodes, edges: data.edges } as unknown as KnowledgeGraph);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accessToken, setKtdsDomainGraph]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm px-6 text-center">
        {error}
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Code Atlas 로딩 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-subtle bg-surface shrink-0">
        {(["flows", "domains"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              tab === t ? "bg-accent/20 text-accent" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t === "flows" ? "흐름뷰" : "도메인 지도"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "flows" ? (
          <FlowListView graph={graph} onOpenSource={openCodeViewer} />
        ) : (
          <DomainMapView graph={graph} onOpenSource={openCodeViewer} />
        )}
      </div>
    </div>
  );
}
