import { useEffect, useMemo, useState } from "react";

import { useDashboardStore } from "../store";
import { useNavigate } from "react-router";
import { useI18n } from "../contexts/I18nContext";
import { dataUrl } from "../shared/api/client";
import { buildDomainCards, buildDomainFlows, type DomainFlow } from "../utils/domainData";
import DomainCardDetail from "./DomainCardDetail";
import GroundedBar from "./GroundedBar";

/**
 * Screen A — 업무 지도 landing = 시스템 구성도 (WORK_MAP_DESIGN §4 화면 A).
 * 문서형 카드 그리드(구 화면1)를 뷰포트 맞춤 구성도로 재설계: 좌측 시스템 박스(도메인
 * 박스 + 기능 칩, 내부 스크롤만) + 우측 타 시스템 연동 패널(인터페이스/DB/배치).
 * 페이지 스크롤 금지(AC-1) — 디자인 토큰·컴포넌트 언어는 기존 그대로.
 *
 * 도메인 박스 클릭 → `/domains/:id` (워크스페이스), 기능 칩 클릭 → `?flow=` 딥링크.
 * ⤢ 상세보기 → 기존 DomainCardDetail 모달 재사용.
 *
 * 연동 패널 데이터는 system-map.json(P2 산출물). P1에서는 fetch 실패 시
 * "연동 데이터 없음" degrade — 0건과 미스캔을 구분해 정직 표기(AC-3).
 */

/** system-map.json 소비 형태(P2 산출물 계약) — 알 수 없는 형태는 null로 degrade. */
interface SystemMapData {
  interfaces: { outboundCount: number; inboundCount: number; scanned: boolean };
  db: { vendor: string | null; tableCount: number; embedded: boolean } | null;
  batch: { jobCount: number; scanned: boolean };
}

function parseSystemMap(raw: unknown): SystemMapData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const i = o.interfaces as Record<string, unknown> | undefined;
  const d = o.db as Record<string, unknown> | undefined | null;
  const b = o.batch as Record<string, unknown> | undefined;
  if (!i || !b) return null;
  const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return {
    interfaces: {
      outboundCount: num(i.outboundCount ?? (Array.isArray(i.outbound) ? i.outbound.length : 0)),
      inboundCount: num(i.inboundCount ?? (Array.isArray(i.inbound) ? i.inbound.length : 0)),
      scanned: i.scanned === true,
    },
    db: d
      ? {
          vendor: typeof d.vendor === "string" ? d.vendor : null,
          tableCount: num(d.tableCount ?? (Array.isArray(d.tables) ? d.tables.length : 0)),
          embedded: d.embedded === true,
        }
      : null,
    batch: {
      jobCount: num(b.jobCount ?? (Array.isArray(b.jobs) ? b.jobs.length : 0)),
      scanned: b.scanned === true,
    },
  };
}

/** 도메인 박스에 노출할 기능 칩 수 — 초과분은 "+N" 칩(도메인 진입)으로 접는다. */
const CHIP_LIMIT = 4;

export default function DomainMapView() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const accessToken = useDashboardStore((s) => s.accessToken);
  const navigate = useNavigate();
  const { t } = useI18n();
  // 카드 상세 — '상세보기' 클릭 시 모달로 띄운다(워크스페이스 노드 상세와 동형). null = 닫힘.
  const [detailId, setDetailId] = useState<string | null>(null);
  // 타 시스템 연동(system-map.json). undefined = 로딩 전, null = 없음(degrade).
  const [systemMap, setSystemMap] = useState<SystemMapData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(dataUrl("system-map.json", accessToken))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!cancelled) setSystemMap(parseSystemMap(data));
      })
      .catch(() => {
        if (!cancelled) setSystemMap(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

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

  // 도메인별 기능 목록(칩 렌더용) — 화면2와 동일 소스(buildDomainFlows).
  const flowsByDomain = useMemo(() => {
    const m = new Map<string, DomainFlow[]>();
    if (domainGraph && data) {
      for (const card of data.cards) m.set(card.id, buildDomainFlows(domainGraph, card.id));
    }
    return m;
  }, [domainGraph, data]);

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
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* 컴팩트 헤더 1줄 — 타이틀 좌측, 시스템 통계 우측 인라인(AC-1: 세로 공간 다이어트) */}
      <header
        className="shrink-0 flex items-end gap-6 border-b border-border-subtle bg-panel"
        style={{ padding: "12px 24px 10px" }}
      >
        <div className="min-w-0">
          <p
            className="uppercase text-accent"
            style={{ fontSize: 10, letterSpacing: "0.12em", marginBottom: 2 }}
          >
            {t.domainMap.eyebrow} — {domainGraph.project.name}
          </p>
          <h1 className="font-heading text-text-primary truncate" style={{ fontSize: 20, lineHeight: 1.25 }}>
            {t.domainMap.title}
          </h1>
        </div>
        <div className="ml-auto flex items-end gap-6 shrink-0">
          <StatItem value={String(stats.domainCount)} label={t.domainMap.statDomains} />
          <StatItem value={String(stats.flowCount)} label={t.domainMap.statFlows} />
          <StatItem value={String(stats.stepCount)} label={t.domainMap.statNodes} />
          {(stats.language || stats.framework) && (
            <StatItem value={stats.language || "—"} label={stats.framework || " "} />
          )}
        </div>
      </header>

      {/* 구성도 본문 — 시스템 박스(내부 스크롤) + 연결 화살표 + 타 시스템 연동 패널 */}
      <div className="flex-1 min-h-0 flex items-stretch" style={{ padding: 16, gap: 10 }}>
        {/* 시스템 박스 */}
        <section className="flex-1 min-w-0 flex flex-col rounded-xl border border-border-subtle bg-panel overflow-hidden">
          <div
            className="shrink-0 flex items-center gap-2 border-b border-border-subtle bg-elevated"
            style={{ padding: "9px 16px" }}
          >
            <span className="rounded-full shrink-0 bg-accent" style={{ width: 6, height: 6 }} />
            <span className="font-heading text-text-primary" style={{ fontSize: 13 }}>
              {domainGraph.project.name} {t.domainMap.systemSuffix}
            </span>
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto grid"
            style={{
              padding: 14,
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              alignContent: "start",
            }}
          >
            {cards.map((card, i) => {
              const flows = flowsByDomain.get(card.id) ?? [];
              const shown = flows.slice(0, CHIP_LIMIT);
              const rest = flows.length - shown.length;
              return (
                <div
                  key={card.id}
                  className="domain-card group relative rounded-xl bg-elevated border border-border-subtle hover:border-border-medium overflow-hidden transition-all"
                  style={{
                    animation: `fadeSlideIn 0.35s ease-out ${i * 0.05}s both`,
                    ["--card-accent" as string]: card.color,
                  }}
                >
                  <span
                    className="absolute top-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ height: 2, background: card.color }}
                  />
                  {/* 우측 상단 '상세보기' — 근거 상세 모달(기존 동선 유지) */}
                  <button
                    type="button"
                    onClick={() => setDetailId(card.id)}
                    aria-haspopup="dialog"
                    className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-md border border-border-subtle bg-elevated/80 text-text-muted hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
                    style={{ padding: "3px 8px", fontSize: 10.5 }}
                    title={t.domainMap.detail}
                  >
                    {t.domainMap.detail}
                    <span style={{ fontSize: 9, lineHeight: 1 }}>⤢</span>
                  </button>
                  {/* 본문 = 도메인 워크스페이스 진입 */}
                  <button
                    type="button"
                    onClick={() => navigate(`/domains/${card.id}`)}
                    className="w-full text-left cursor-pointer"
                    style={{ padding: "14px 16px 12px" }}
                  >
                    {/* paddingRight — 우상단 절대배치 '상세보기' 버튼과 긴 도메인명 겹침 방지 */}
                    <div className="flex items-center gap-2.5 mb-2" style={{ paddingRight: 72 }}>
                      <span
                        className="flex items-center justify-center rounded-lg select-none shrink-0"
                        style={{ width: 28, height: 28, background: `${card.color}22`, fontSize: 14, lineHeight: 1 }}
                        aria-hidden="true"
                      >
                        {card.icon}
                      </span>
                      <span className="font-heading text-text-primary truncate" style={{ fontSize: 16 }} title={card.name}>
                        {card.name}
                      </span>
                    </div>
                    {card.filled && card.groundedPct !== null && (
                      <div className="mb-2">
                        <GroundedBar pct={card.groundedPct} grounded={card.groundedCount} review={card.reviewCount} />
                      </div>
                    )}
                    <div className="flex gap-3 mb-2.5">
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
                  {/* 기능 칩 — 상위 N개 + "+N"(도메인 진입). 칩 클릭 = ?flow= 딥링크. */}
                  <div className="flex flex-wrap gap-1.5" style={{ padding: "0 16px 14px" }}>
                    {shown.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => navigate(`/domains/${card.id}?flow=${encodeURIComponent(f.id)}`)}
                        className="rounded-md border border-border-subtle bg-panel text-text-secondary hover:text-accent hover:border-border-medium transition-colors cursor-pointer truncate"
                        style={{ padding: "3px 8px", fontSize: 11, maxWidth: "100%" }}
                        title={f.name}
                      >
                        {f.name}
                      </button>
                    ))}
                    {rest > 0 && (
                      <button
                        type="button"
                        onClick={() => navigate(`/domains/${card.id}`)}
                        className="rounded-md border border-border-subtle text-text-muted hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
                        style={{ padding: "3px 8px", fontSize: 11, fontFamily: "var(--font-mono)" }}
                        title={t.domainMap.viewFeatures}
                      >
                        {t.domainMap.moreFlows.replace("{count}", String(rest))}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 연결 화살표 — 시스템 ↔ 외부 연동 (구성도 어휘) */}
        <div className="shrink-0 self-center text-text-muted select-none" aria-hidden="true" style={{ fontSize: 15 }}>
          ⇄
        </div>

        {/* 타 시스템 연동 패널 */}
        <aside
          className="shrink-0 flex flex-col rounded-xl border border-border-subtle bg-panel overflow-hidden"
          style={{ width: 230 }}
        >
          <div
            className="shrink-0 flex items-center gap-2 border-b border-border-subtle bg-elevated"
            style={{ padding: "9px 14px" }}
          >
            <span className="font-heading text-text-primary" style={{ fontSize: 13 }}>
              {t.domainMap.extTitle}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 14 }}>
            {systemMap === undefined ? null : systemMap === null ? (
              <p className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                {t.domainMap.extUnavailable}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <ExtSection title={t.domainMap.extInterfaces}>
                  {systemMap.interfaces.outboundCount === 0 && systemMap.interfaces.inboundCount === 0 ? (
                    <ExtNone scanned={systemMap.interfaces.scanned} t={t} />
                  ) : (
                    <>
                      <ExtRow label={t.domainMap.extOutbound} value={String(systemMap.interfaces.outboundCount)} />
                      <ExtRow label={t.domainMap.extInbound} value={String(systemMap.interfaces.inboundCount)} />
                    </>
                  )}
                </ExtSection>
                <ExtSection title={t.domainMap.extDb}>
                  {systemMap.db ? (
                    <>
                      <div className="text-text-primary" style={{ fontSize: 12 }}>
                        {systemMap.db.vendor ?? "—"}
                        {systemMap.db.embedded && (
                          <span className="text-text-muted" style={{ fontSize: 10.5 }}>
                            {" "}
                            ({t.domainMap.extEmbedded})
                          </span>
                        )}
                      </div>
                      <div className="text-text-secondary" style={{ fontSize: 11 }}>
                        {t.domainMap.extTables.replace("{count}", String(systemMap.db.tableCount))}
                      </div>
                    </>
                  ) : (
                    <ExtNone scanned t={t} />
                  )}
                </ExtSection>
                <ExtSection title={t.domainMap.extBatch}>
                  {systemMap.batch.jobCount === 0 ? (
                    <ExtNone scanned={systemMap.batch.scanned} t={t} />
                  ) : (
                    <ExtRow label={t.domainMap.extBatch} value={String(systemMap.batch.jobCount)} />
                  )}
                </ExtSection>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 도메인 카드 상세 — 모달(기존 재사용). 배경 클릭/Escape 로 닫힘. */}
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
            <div className="overflow-y-auto min-h-0">
              <DomainCardDetail
                card={detailCard}
                onViewFeatures={() => {
                  setDetailId(null);
                  navigate(`/domains/${detailCard.id}`);
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
    <div className="flex flex-col items-end gap-0.5">
      <span
        className="text-accent font-semibold"
        style={{ fontFamily: "var(--font-mono)", fontSize: 16, lineHeight: 1.1 }}
      >
        {value}
      </span>
      <span className="uppercase text-text-muted whitespace-nowrap" style={{ fontSize: 9, letterSpacing: "0.08em" }}>
        {label}
      </span>
    </div>
  );
}

function MetaItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-text-muted" style={{ fontSize: 11 }}>
      <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: color }} />
      {label}
    </div>
  );
}

function ExtSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 uppercase text-text-muted mb-1.5"
        style={{ fontSize: 10, letterSpacing: "0.09em" }}
      >
        <span>{title}</span>
        <span className="flex-1 h-px bg-border-subtle" />
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function ExtRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between" style={{ fontSize: 11.5 }}>
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary" style={{ fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
    </div>
  );
}

/** 0건 정직 표기 — 스캔 완료(음성)와 데이터 부재를 구분한다(AC-3). */
function ExtNone({ scanned, t }: { scanned: boolean; t: ReturnType<typeof useI18n>["t"] }) {
  return (
    <p className="text-text-muted" style={{ fontSize: 11.5 }}>
      {scanned ? t.domainMap.extNone : t.domainMap.extUnavailable}
    </p>
  );
}
