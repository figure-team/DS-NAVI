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

/** screens.json 화면 수 — 배열/{screens:[]} 둘 다 방어 파싱, 이탈은 null(섹션 숨김). */
function parseScreenCount(raw: unknown): number | null {
  if (Array.isArray(raw)) return raw.length;
  const o = raw as { screens?: unknown } | null;
  if (o && Array.isArray(o.screens)) return o.screens.length;
  return null;
}

/** system-map.json 소비 형태(P2 산출물 계약) — 알 수 없는 형태는 null로 degrade. */
interface SystemMapData {
  interfaces: { outboundCount: number; inboundCount: number; scanned: boolean; suspectCount: number };
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
      suspectCount: num(i.suspectCount),
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
  // 화면 수(screens.json, P6 프로토 '화면' 섹션). null = 산출물 없음(섹션 숨김).
  const [screenCount, setScreenCount] = useState<number | null>(null);

  useEffect(() => {
    // P3 fix: 자식 이펙트가 RootData 의 setAccessToken 이펙트보다 먼저 실행되므로,
    // 토큰 동기화 전(null)에는 fetch 를 보류한다 — 토큰 없는 transient 403 방지.
    // (RootData 는 항상 문자열 토큰을 가지므로 null 은 "아직 동기화 전"뿐이다.)
    if (accessToken === null) return;
    let cancelled = false;
    fetch(dataUrl("system-map.json", accessToken))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!cancelled) setSystemMap(parseSystemMap(data));
      })
      .catch(() => {
        if (!cancelled) setSystemMap(null);
      });
    fetch(dataUrl("screens.json", accessToken))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!cancelled) setScreenCount(parseScreenCount(data));
      })
      .catch(() => {
        if (!cancelled) setScreenCount(null);
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
      {/* 헤더 — pmpl-proto page-head(P6): eyebrow 브레드크럼 + 타이틀 + 인라인 통계 meta */}
      <header
        className="shrink-0 flex items-end gap-3.5 flex-wrap"
        style={{ padding: "16px 24px 12px" }}
      >
        <div className="min-w-0">
          <p
            className="text-text-muted font-bold"
            style={{ fontSize: 11.5, letterSpacing: "0.06em", marginBottom: 3 }}
          >
            {t.domainMap.breadcrumbRoot} · {domainGraph.project.name}
          </p>
          <h1 className="font-heading text-text-primary truncate font-bold" style={{ fontSize: 20, lineHeight: 1.25, letterSpacing: "-0.3px" }}>
            {t.domainMap.title}
          </h1>
        </div>
        <div className="text-text-muted" style={{ fontSize: 13, paddingBottom: 3 }}>
          {t.domainMap.statDomains} <b className="text-text-primary tabular-nums">{stats.domainCount}</b>
          {" · "}
          {t.domainMap.statFlows} <b className="text-text-primary tabular-nums">{stats.flowCount}</b>
          {" · "}
          {t.domainMap.statNodes} <b className="text-text-primary tabular-nums">{stats.stepCount}</b>
          {stats.language && (
            <span className="text-text-muted"> · {stats.language}{stats.framework ? ` / ${stats.framework}` : ""}</span>
          )}
        </div>
      </header>

      {/* 구성도 본문 — 프로토 work-land 그리드: 시스템 박스(1fr) + 연동 패널(280px) */}
      <div
        className="flex-1 min-h-0 grid items-stretch"
        style={{ padding: "0 24px 18px", gap: 14, gridTemplateColumns: "1fr 280px" }}
      >
        {/* 시스템 박스 */}
        <section
          className="min-w-0 flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-hidden"
          style={{ boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)" }}
        >
          <div
            className="shrink-0 flex items-center gap-2 border-b border-border-subtle"
            style={{ padding: "12px 18px", fontWeight: 650, fontSize: 13.5 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="3" />
            </svg>
            <span className="text-text-primary">
              {domainGraph.project.name} {t.domainMap.systemSuffix}
            </span>
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto grid"
            style={{
              padding: "16px 18px",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              alignContent: "start",
            }}
          >
            {cards.map((card, i) => {
              const flows = flowsByDomain.get(card.id) ?? [];
              const shown = flows.slice(0, CHIP_LIMIT);
              const rest = flows.length - shown.length;
              return (
                /* 프로토 .dom — 카드 전체 클릭 = 워크스페이스 진입, hover 시 accent 테두리 */
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/domains/${card.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/domains/${card.id}`);
                    }
                  }}
                  className="domain-card rounded-[10px] bg-panel border border-border-subtle hover:border-accent cursor-pointer transition-colors"
                  style={{
                    padding: "13px 14px",
                    animation: `fadeSlideIn 0.35s ease-out ${i * 0.05}s both`,
                  }}
                >
                  {/* .h — 아이콘 + 이름, 우측 기능·노드 수 + 상세(근거) 아이콘 */}
                  <div className="flex items-center gap-2 min-w-0" style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>
                    <span aria-hidden className="select-none shrink-0" style={{ fontSize: 14, lineHeight: 1 }}>
                      {card.icon}
                    </span>
                    <span className="text-text-primary truncate" title={card.name}>
                      {card.name}
                    </span>
                    <span
                      className="ml-auto text-text-muted whitespace-nowrap shrink-0"
                      style={{ fontSize: 11.5, fontWeight: 500 }}
                    >
                      {t.domainMap.flowCount.replace("{count}", String(card.flowCount))} ·{" "}
                      {t.domainMap.nodeCount.replace("{count}", String(card.nodeCount))}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailId(card.id);
                      }}
                      aria-haspopup="dialog"
                      aria-label={t.domainMap.detail}
                      title={t.domainMap.detail}
                      className="shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent transition-colors cursor-pointer"
                      style={{ width: 18, height: 18, fontSize: 10, lineHeight: 1 }}
                    >
                      ⤢
                    </button>
                  </div>
                  {/* .gr — 근거율 바(프로토: label + 녹색 바 + %) */}
                  {card.filled && card.groundedPct !== null && (
                    <div style={{ margin: "7px 0 9px" }}>
                      <GroundedBar pct={card.groundedPct} grounded={card.groundedCount} review={card.reviewCount} />
                    </div>
                  )}
                  {/* 기능 칩 — 프로토 .chip(pill). 클릭 = ?flow= 딥링크, +N = 도메인 진입. */}
                  <div className="flex flex-wrap gap-1.5" style={{ marginTop: card.filled ? 0 : 8 }}>
                    {shown.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/domains/${card.id}?flow=${encodeURIComponent(f.id)}`);
                        }}
                        className="rounded-full bg-elevated text-text-secondary hover:text-accent transition-colors cursor-pointer truncate"
                        style={{ padding: "3px 9px", fontSize: 12, maxWidth: "100%" }}
                        title={f.name}
                      >
                        {f.name}
                      </button>
                    ))}
                    {rest > 0 && (
                      <span
                        className="rounded-full bg-elevated text-text-muted"
                        style={{ padding: "3px 9px", fontSize: 12 }}
                        title={t.domainMap.viewFeatures}
                      >
                        {t.domainMap.moreFlows.replace("{count}", String(rest))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 타 시스템 연동 패널 — 프로토 .ext: 섹션 구분선 + kv 행 + 상태 배지/링크 */}
        <aside
          className="flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-y-auto"
          style={{ boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)" }}
        >
          {systemMap === undefined ? null : systemMap === null ? (
            <p className="text-text-muted" style={{ fontSize: 11.5, lineHeight: 1.55, padding: "13px 16px" }}>
              {t.domainMap.extUnavailable}
            </p>
          ) : (
            <>
              <ExtSection title={`${t.domainMap.extTitle} — ${t.domainMap.extInterfaces}`} first>
                <KvRow label={t.domainMap.extOutbound} value={systemMap.interfaces.outboundCount}
                  badge={systemMap.interfaces.outboundCount === 0 ? (systemMap.interfaces.scanned ? "ok" : "mut") : undefined}
                  badgeText={systemMap.interfaces.scanned ? t.domainMap.extScanBadge : t.domainMap.extUnscanned} t={t} />
                <KvRow label={t.domainMap.extInbound} value={systemMap.interfaces.inboundCount}
                  badge={systemMap.interfaces.inboundCount === 0 ? (systemMap.interfaces.scanned ? "ok" : "mut") : undefined}
                  badgeText={systemMap.interfaces.scanned ? t.domainMap.extScanBadge : t.domainMap.extUnscanned} t={t} />
                {/* 0건이어도 의심 신호가 있으면 "없음" 아닌 "탐지 못함" 가능성 표면화(정직성). */}
                {systemMap.interfaces.suspectCount > 0 && (
                  <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--color-status-warn)" }}>
                    {t.domainMap.extSuspect.replace("{count}", String(systemMap.interfaces.suspectCount))}
                  </p>
                )}
              </ExtSection>
              <ExtSection title={t.domainMap.extDb}>
                {systemMap.db ? (
                  <>
                    <div className="flex items-center" style={{ fontSize: 12.5, padding: "3px 0" }}>
                      <span className="text-text-secondary">
                        {systemMap.db.vendor ?? "—"}
                        {systemMap.db.embedded && (
                          <span className="text-text-muted" style={{ fontSize: 11 }}>
                            {" "}({t.domainMap.extEmbedded})
                          </span>
                        )}
                      </span>
                      <span className="ml-auto text-text-secondary">
                        <b className="tabular-nums text-text-primary">{systemMap.db.tableCount}</b>{" "}
                        {t.domainMap.extTablesUnit}
                      </span>
                    </div>
                    <div className="flex items-center" style={{ fontSize: 12.5, padding: "3px 0" }}>
                      <span className="text-text-muted">{t.domainMap.extCrud}</span>
                      <button
                        type="button"
                        onClick={() => navigate("/deliverables")}
                        className="ml-auto cursor-pointer hover:underline"
                        style={{ fontSize: 12, color: "var(--color-status-info)" }}
                      >
                        {t.domainMap.extView}
                      </button>
                    </div>
                  </>
                ) : (
                  <ExtNone scanned t={t} />
                )}
              </ExtSection>
              <ExtSection title={t.domainMap.extBatch}>
                <KvRow label={t.domainMap.extJobs} value={systemMap.batch.jobCount}
                  badge={systemMap.batch.jobCount === 0 ? (systemMap.batch.scanned ? "ok" : "mut") : undefined}
                  badgeText={systemMap.batch.scanned ? t.domainMap.extScanBadge : t.domainMap.extUnscanned} t={t} />
              </ExtSection>
              {screenCount !== null && (
                <ExtSection title={t.domainMap.extScreens}>
                  <div className="flex items-center" style={{ fontSize: 12.5, padding: "3px 0" }}>
                    <span className="text-text-secondary">
                      {t.domainMap.extScreenCount}{" "}
                      <b className="tabular-nums text-text-primary">{screenCount}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate("/screens")}
                      className="ml-auto cursor-pointer hover:underline"
                      style={{ fontSize: 12, color: "var(--color-status-info)" }}
                    >
                      {t.domainMap.extScreensLink}
                    </button>
                  </div>
                </ExtSection>
              )}
            </>
          )}
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

/** 프로토 .ext section — h4(12px 700) + 상단 구분선(첫 섹션 제외). */
function ExtSection({ title, first, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={first ? "" : "border-t border-border-subtle"}
      style={{ padding: "13px 16px" }}
    >
      <h4 className="text-text-secondary font-bold" style={{ fontSize: 12, marginBottom: 8 }}>
        {title}
      </h4>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** 프로토 .badge — ok(녹색)/mut(중립) 상태 배지. */
function StatusBadge({ kind, text }: { kind: "ok" | "mut"; text: string }) {
  return (
    <span
      className="font-bold whitespace-nowrap rounded"
      style={{
        fontSize: 11,
        padding: "2px 7px",
        color: kind === "ok" ? "var(--color-status-ok)" : "var(--color-text-muted)",
        background:
          kind === "ok"
            ? "color-mix(in srgb, var(--color-status-ok) 11%, transparent)"
            : "var(--color-elevated)",
      }}
    >
      {text}
    </span>
  );
}

/** 프로토 .kv — 라벨 + 굵은 수치, 우측 상태 배지(0건 정직 표기). */
function KvRow({
  label,
  value,
  badge,
  badgeText,
  t,
}: {
  label: string;
  value: number;
  badge?: "ok" | "mut";
  badgeText: string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="flex items-center gap-2 text-text-secondary" style={{ fontSize: 12.5, padding: "3px 0" }}>
      {label} <b className="tabular-nums text-text-primary">{t.domainMap.extCount.replace("{count}", String(value))}</b>
      {badge && (
        <span className="ml-auto">
          <StatusBadge kind={badge} text={badgeText} />
        </span>
      )}
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
