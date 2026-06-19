import { useMemo } from "react";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { buildDomainCards } from "../utils/domainData";

/**
 * Screen 1 — Domain map landing. Faithful port of the approved prototype
 * (`#screen-domains`, `renderDomains()`): eyebrow / serif title / subtitle, a
 * system stats bar, and a deterministic-color domain card grid. Replaces the
 * React Flow `DomainGraphView` as the domain-mode entry point.
 *
 * Card click → `navigateToDomain(domainId)` (→ FlowListView, screen 2).
 * Real data is extracted via the shared `buildDomainCards` helper — same
 * source of truth as DomainGraphView's `buildDomainOverview`.
 */
export default function DomainMapView() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const navigateToDomain = useDashboardStore((s) => s.navigateToDomain);
  const { t } = useI18n();

  const data = useMemo(
    () => (domainGraph ? buildDomainCards(domainGraph) : null),
    [domainGraph],
  );

  if (!domainGraph || !data) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {t.domainMap.empty}
      </div>
    );
  }

  const { stats, cards } = data;

  return (
    <div className="h-full w-full overflow-auto">
      <div className="px-4 py-8 sm:px-8 sm:py-12">
        {/* Landing header */}
        <header className="mb-8 sm:mb-12">
          <p
            className="uppercase text-accent mb-2.5"
            style={{ fontSize: 11, letterSpacing: "0.12em" }}
          >
            {t.domainMap.eyebrow} — {domainGraph.project.name}
          </p>
          <h1
            className="font-heading text-text-primary mb-3"
            style={{ fontSize: 34, lineHeight: 1.2 }}
          >
            {t.domainMap.title}
          </h1>
          <p
            className="text-text-secondary"
            style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}
          >
            {t.domainMap.subtitle}
          </p>
        </header>

        {/* System stats bar */}
        <div
          className="flex flex-wrap gap-x-8 gap-y-4 mb-10 rounded-lg bg-panel border border-border-subtle"
          style={{ padding: "16px 20px", maxWidth: 640 }}
        >
          <StatItem value={String(stats.domainCount)} label={t.domainMap.statDomains} />
          <StatItem value={String(stats.flowCount)} label={t.domainMap.statFlows} />
          <StatItem value={String(stats.stepCount)} label={t.domainMap.statNodes} />
          {(stats.language || stats.framework) && (
            <StatItem
              value={stats.language || "—"}
              label={stats.framework || " "}
            />
          )}
        </div>

        {/* Domain card grid */}
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            maxWidth: 1100,
          }}
        >
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              onClick={() => navigateToDomain(card.id)}
              className="domain-card group relative text-left rounded-xl bg-elevated border border-border-subtle cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:border-border-medium"
              style={{
                padding: 24,
                animation: `fadeSlideIn 0.35s ease-out ${i * 0.07}s both`,
                ["--card-accent" as string]: card.color,
              }}
            >
              {/* top accent bar on hover */}
              <span
                className="absolute top-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ height: 2, background: card.color }}
              />
              <div
                className="flex items-center justify-center rounded-lg mb-3.5 select-none"
                style={{
                  width: 36,
                  height: 36,
                  background: `${card.color}22`,
                  fontSize: 18,
                  lineHeight: 1,
                }}
                aria-hidden="true"
              >
                {card.icon}
              </div>
              <div
                className="font-heading text-text-primary mb-1.5"
                style={{ fontSize: 20 }}
              >
                {card.name}
              </div>
              <p
                className="text-text-secondary mb-4 line-clamp-3"
                style={{ fontSize: 12, lineHeight: 1.55 }}
              >
                {card.desc}
              </p>
              <div className="flex gap-3">
                <MetaItem
                  color={card.color}
                  label={t.domainMap.flowCount.replace("{count}", String(card.flowCount))}
                />
                <MetaItem
                  color={`${card.color}55`}
                  label={t.domainMap.nodeCount.replace("{count}", String(card.nodeCount))}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-accent font-semibold"
        style={{ fontFamily: "var(--font-mono)", fontSize: 20 }}
      >
        {value}
      </span>
      <span
        className="uppercase text-text-muted"
        style={{ fontSize: 10, letterSpacing: "0.08em" }}
      >
        {label}
      </span>
    </div>
  );
}

function MetaItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-text-muted" style={{ fontSize: 11 }}>
      <span
        className="rounded-full shrink-0"
        style={{ width: 6, height: 6, background: color }}
      />
      {label}
    </div>
  );
}
