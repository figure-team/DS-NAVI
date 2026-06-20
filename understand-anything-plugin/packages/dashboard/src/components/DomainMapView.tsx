import { useEffect, useMemo, useState } from "react";

import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import { buildDomainCards } from "../utils/domainData";
import DomainCardDetail from "./DomainCardDetail";
import GroundedBar from "./GroundedBar";

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
  // 카드 상세 — '상세보기' 클릭 시 모달로 띄운다(화면2 노드 상세와 동형). null = 닫힘.
  const [detailId, setDetailId] = useState<string | null>(null);

  // Escape 로 모달 닫기.
  useEffect(() => {
    if (!detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detailId]);

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
  const detailCard = cards.find((c) => c.id === detailId) ?? null;

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
          {cards.map((card, i) => {
            const isOpen = detailId === card.id;
            return (
              <div
                key={card.id}
                className={`domain-card group relative rounded-xl bg-elevated border overflow-hidden transition-all ${
                  isOpen ? "border-border-medium" : "border-border-subtle hover:border-border-medium"
                }`}
                style={{
                  animation: `fadeSlideIn 0.35s ease-out ${i * 0.07}s both`,
                  ["--card-accent" as string]: card.color,
                }}
              >
                {/* top accent bar — always on when expanded, else on hover */}
                <span
                  className={`absolute top-0 left-0 right-0 transition-opacity ${
                    isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{ height: 2, background: card.color }}
                />
                {/* 우측 상단 '상세보기' 토글 — 근거 패널 인라인 확장. 본문 클릭과 분리(중첩 버튼 회피
                    위해 본문 버튼의 형제로 두고 절대배치 + z-10 으로 위에 올린다). */}
                <button
                  type="button"
                  onClick={() => setDetailId(card.id)}
                  aria-haspopup="dialog"
                  className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md border border-border-subtle bg-elevated/80 text-text-muted hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
                  style={{ padding: "4px 9px", fontSize: 11 }}
                  title={t.domainMap.detail}
                >
                  {t.domainMap.detail}
                  <span style={{ fontSize: 10, lineHeight: 1 }}>⤢</span>
                </button>
                {/* 본문 = 기능 보기(화면2)로 이동. 근거 상세는 우측 상단 '상세보기' 토글로 분리. */}
                <button
                  type="button"
                  onClick={() => navigateToDomain(card.id)}
                  className="w-full text-left cursor-pointer"
                  style={{ padding: 24 }}
                >
                  <div
                    className="flex items-center justify-center rounded-lg mb-3.5 select-none"
                    style={{ width: 36, height: 36, background: `${card.color}22`, fontSize: 18, lineHeight: 1 }}
                    aria-hidden="true"
                  >
                    {card.icon}
                  </div>
                  <div className="font-heading text-text-primary mb-1.5" style={{ fontSize: 20 }}>
                    {card.name}
                  </div>
                  {/* 신뢰도 한눈에 — 접힘 상태에서도 근거율 노출(채움된 도메인만). */}
                  {card.filled && card.groundedPct !== null && (
                    <div className="mb-2.5">
                      <GroundedBar pct={card.groundedPct} grounded={card.groundedCount} review={card.reviewCount} />
                    </div>
                  )}
                  <p className="text-text-secondary mb-4 line-clamp-3" style={{ fontSize: 12, lineHeight: 1.55 }}>
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
              </div>
            );
          })}
        </div>
      </div>

      {/* 도메인 카드 상세 — 모달(화면2 노드 상세와 동형). 배경 클릭/Escape 로 닫힘. */}
      {detailCard && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-root/80 backdrop-blur-sm p-4"
          onClick={() => setDetailId(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detailCard.name}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-border-medium rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: "min(640px, 100%)", maxHeight: "82vh", ["--card-accent" as string]: detailCard.color }}
          >
            <span style={{ height: 2, background: detailCard.color }} />
            {/* 헤더 — 아이콘 + 도메인명 + 닫기 */}
            <div className="flex items-center gap-2.5 shrink-0 border-b border-border-subtle" style={{ padding: "14px 18px" }}>
              <span
                className="flex items-center justify-center rounded-lg select-none"
                style={{ width: 30, height: 30, background: `${detailCard.color}22`, fontSize: 15, lineHeight: 1 }}
                aria-hidden="true"
              >
                {detailCard.icon}
              </span>
              <span className="font-heading text-text-primary" style={{ fontSize: 17 }}>
                {detailCard.name}
              </span>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                aria-label="닫기"
                className="ml-auto flex items-center justify-center rounded-md border border-border-subtle text-text-muted hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
                style={{ width: 28, height: 28, fontSize: 15, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            {/* 본문 — 스크롤. '기능 보기'는 도메인 이동 후 모달 닫기. */}
            <div className="overflow-y-auto min-h-0">
              <DomainCardDetail
                card={detailCard}
                onViewFeatures={() => {
                  setDetailId(null);
                  navigateToDomain(detailCard.id);
                }}
              />
            </div>
          </div>
        </div>
      )}
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
