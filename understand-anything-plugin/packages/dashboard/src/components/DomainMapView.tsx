import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDashboardStore } from "../store";
import { useNavigate } from "react-router";
import { useI18n } from "../contexts/I18nContext";
import { dataUrl } from "../shared/api/client";
import { buildDomainCards } from "../utils/domainData";
import { parseBusinessFlows, type BizProcess } from "../utils/businessFlow";
import { buildGroupCards, resolveGroups } from "../utils/domainGroups";
import { useGroupCardRowSizing } from "../hooks/useGroupCardRowSizing";
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

/** 접힘 상태에서 업무 칩이 차지하는 최대 줄 수 — 초과분은 "+N" 칩(줄 안에 포함). */
const CHIP_MAX_ROWS = 2;

type ExtSectionKey = "interfaces" | "db" | "batch" | "screens";

/**
 * 연동 패널 섹션 순서 — 값이 있는 섹션을 위로, 0건/없음은 아래로(안정 정렬:
 * 두 그룹 안에서는 기존 순서 유지). jpetstore 처럼 인터페이스·배치가 전부 0건인
 * 시스템에서 DB·화면 같은 실데이터가 묻히지 않게 한다.
 */
function buildExtSections(
  systemMap: SystemMapData,
  screenCount: number | null,
): { key: ExtSectionKey; menuPath: string }[] {
  const defs: { key: ExtSectionKey; menuPath: string; hasData: boolean }[] = [
    {
      key: "interfaces",
      menuPath: "/programs",
      hasData:
        systemMap.interfaces.outboundCount +
          systemMap.interfaces.inboundCount +
          systemMap.interfaces.suspectCount >
        0,
    },
    { key: "db", menuPath: "/data", hasData: systemMap.db !== null },
    { key: "batch", menuPath: "/programs", hasData: systemMap.batch.jobCount > 0 },
    ...(screenCount !== null
      ? [{ key: "screens" as const, menuPath: "/screens", hasData: screenCount > 0 }]
      : []),
  ];
  return [...defs.filter((d) => d.hasData), ...defs.filter((d) => !d.hasData)];
}

function sectionTitle(key: ExtSectionKey, t: ReturnType<typeof useI18n>["t"]): string {
  switch (key) {
    case "interfaces":
      return `${t.domainMap.extTitle} — ${t.domainMap.extInterfaces}`;
    case "db":
      return t.domainMap.extDb;
    case "batch":
      return t.domainMap.extBatch;
    case "screens":
      return t.domainMap.extScreens;
  }
}

export default function DomainMapView() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const domainGroupsRaw = useDashboardStore((s) => s.domainGroups);
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

  // 도메인별 업무 프로세스 목록(칩 렌더용) — 업무 흐름도 탭과 동일 소스
  // (parseBusinessFlows: businessFlows[] + 레거시 단수 하위호환).
  const processesByDomain = useMemo(() => {
    const m = new Map<string, BizProcess[]>();
    if (domainGraph) {
      for (const n of domainGraph.nodes) {
        if (n.type === "domain") m.set(n.id, parseBusinessFlows(n));
      }
    }
    return m;
  }, [domainGraph]);

  // 전 노드 공통 업무 목록 펼치기/접기 — 헤더 토글(기본 접힘 = 2줄 클램프).
  const [worksExpanded, setWorksExpanded] = useState(false);

  // 헤더 통계용 업무(프로세스) 총계 — 카드 표기와 동일 소스.
  const totalWorks = useMemo(
    () => [...processesByDomain.values()].reduce((sum, list) => sum + list.length, 0),
    [processesByDomain],
  );

  // DOMAIN_HIERARCHY §7 D2: 상단도메인(그룹) 랜딩 카드 — groups 부재/빈 배열이면
  // resolveGroups가 항상 []을 반환하므로 hasGroups=false, 아래 렌더는 완전히 기존
  // 평면 경로 그대로다(회귀 0).
  const resolvedGroups = useMemo(
    () => (domainGraph ? resolveGroups(domainGraph, domainGroupsRaw, t.domainMap.unclassified) : []),
    [domainGraph, domainGroupsRaw, t],
  );
  const workCountByDomain = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, list] of processesByDomain) m.set(id, list.length);
    return m;
  }, [processesByDomain]);
  const groupCards = useMemo(
    () => (data ? buildGroupCards(resolvedGroups, data.cards, workCountByDomain) : []),
    [resolvedGroups, data, workCountByDomain],
  );

  // 그룹 카드 행별 크기 정렬(§ 그룹 카드 그리드 전용) — 평면 카드는 영향 없음
  // (groupCards가 [] 이면 hook 내부에서 사실상 no-op).
  const groupCardKeys = useMemo(() => groupCards.map((g) => g.key), [groupCards]);
  const groupSizing = useGroupCardRowSizing(groupCardKeys);

  if (!domainGraph || !data) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {t.domainMap.empty}
      </div>
    );
  }

  const { stats, cards } = data;
  const detailCard = cards.find((c) => c.id === detailId) ?? null;
  const hasGroups = resolvedGroups.length > 0;

  // 업무/부속 분리 — 업무(프로세스) 0개 도메인(web.xml 등 기술 도메인)은 하단
  // 스트립으로 강등한다(PM 관점 위계). 업무가 전혀 없는 프로젝트(fill 전)는 분리
  // 자체가 무의미하므로 전 카드를 본 그리드에 유지. 그룹 랜딩(hasGroups)에서는
  // 카드 자체가 상단도메인이라 이 분리를 적용하지 않는다(§7 D2 — 카드=상단도메인만).
  const hasAnyWork = totalWorks > 0;
  const businessCards = hasAnyWork
    ? cards.filter((c) => (processesByDomain.get(c.id)?.length ?? 0) > 0)
    : cards;
  const supportCards = hasAnyWork
    ? cards.filter((c) => (processesByDomain.get(c.id)?.length ?? 0) === 0)
    : [];


  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* 헤더 — pmpl-proto page-head(P6): 타이틀 + 인라인 통계 meta.
          eyebrow(업무 지도 · 프로젝트명)는 TopBar 브레드크럼·시스템 박스 제목과
          중복이라 제거. */}
      <header
        className="shrink-0 flex items-end gap-3.5 flex-wrap"
        style={{ padding: "16px 24px 12px" }}
      >
        <div className="min-w-0">
          <h1 className="font-heading text-text-primary truncate font-bold" style={{ fontSize: 20, lineHeight: 1.25, letterSpacing: "-0.3px" }}>
            {t.domainMap.title}
          </h1>
        </div>
        <div className="text-text-muted" style={{ fontSize: 13, paddingBottom: 3 }}>
          {t.domainMap.statDomains} <b className="text-text-primary tabular-nums">{stats.domainCount}</b>
          {" · "}
          {t.domainMap.statWorks} <b className="text-text-primary tabular-nums">{totalWorks}</b>
          {" · "}
          {t.domainMap.statFlows} <b className="text-text-primary tabular-nums">{stats.flowCount}</b>
          {stats.language && (
            <span className="text-text-muted"> · {stats.language}{stats.framework ? ` / ${stats.framework}` : ""}</span>
          )}
        </div>
        {/* 전 노드 업무 목록 펼치기/접기 — 카드별이 아닌 화면 전역 토글. */}
        <button
          type="button"
          onClick={() => setWorksExpanded((v) => !v)}
          aria-pressed={worksExpanded}
          className="ml-auto shrink-0 rounded-md border border-border-subtle text-text-secondary hover:text-accent hover:border-border-medium transition-colors cursor-pointer"
          style={{ fontSize: 11.5, padding: "4px 10px", marginBottom: 2 }}
        >
          {worksExpanded ? t.domainMap.collapseAllWorks : t.domainMap.expandAllWorks}
        </button>
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
            ref={hasGroups ? groupSizing.containerRef : undefined}
            className="flex-1 min-h-0 overflow-y-auto grid"
            style={{
              padding: "16px 18px",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              alignContent: "start",
            }}
          >
            {hasGroups
              ? /* DOMAIN_HIERARCHY §7 D2 — 카드 = 상단도메인(그룹). 서브도메인 집계
                   (개수·기능 합계·근거율 합산) + 대표 서브도메인 칩(딥링크). 칩 노출
                   개수는 useGroupCardRowSizing 이 행 단위로 동적 결정(§ 행별 크기
                   정렬) — measuring(sizing 미확정) 동안은 전량을 3줄 높이로 클립해
                   렌더해야 측정이 가능하다. */
                groupCards.map((g, i) => {
                  const sized = groupSizing.sizing.get(g.key);
                  const measuring = sized === undefined;
                  const shownChips = measuring ? g.allMemberChips : g.allMemberChips.slice(0, sized.visible);
                  const hiddenCount = measuring ? 0 : sized.hidden;
                  return (
                    <div
                      key={g.key}
                      ref={groupSizing.registerCard(g.key)}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/domains/${g.key}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/domains/${g.key}`);
                        }
                      }}
                      className="domain-card rounded-[10px] bg-panel border border-border-subtle hover:border-accent cursor-pointer transition-colors"
                      style={{
                        padding: "13px 14px",
                        animation: `fadeSlideIn 0.35s ease-out ${i * 0.05}s both`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0" style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>
                        <span aria-hidden className="select-none shrink-0" style={{ fontSize: 14, lineHeight: 1 }}>
                          {g.icon}
                        </span>
                        <span className="text-text-primary truncate" title={g.name}>
                          {g.name}
                        </span>
                        <span
                          className="ml-auto text-text-muted whitespace-nowrap shrink-0"
                          style={{ fontSize: 11.5, fontWeight: 500 }}
                        >
                          {t.domainMap.subDomainCount.replace("{count}", String(g.subDomainCount))} ·{" "}
                          {t.domainMap.flowCount.replace("{count}", String(g.flowCount))}
                        </span>
                      </div>
                      {g.filled && g.groundedPct !== null && (
                        <div style={{ margin: "7px 0 9px" }}>
                          <GroundedBar pct={g.groundedPct} grounded={g.groundedCount} review={g.reviewCount} />
                        </div>
                      )}
                      <div
                        ref={groupSizing.registerChips(g.key)}
                        className="flex flex-wrap"
                        style={{
                          gap: 6,
                          marginTop: g.filled ? 0 : 8,
                          ...(measuring ? { maxHeight: 90, overflow: "hidden" } : {}),
                        }}
                      >
                        {shownChips.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/domains/${g.key}/${chip.id}`);
                            }}
                            className="rounded-full bg-elevated text-text-secondary hover:text-accent transition-colors cursor-pointer truncate"
                            style={{ padding: "3px 9px", fontSize: 12, maxWidth: "100%" }}
                            title={chip.name}
                          >
                            {chip.name}
                          </button>
                        ))}
                        {!measuring && hiddenCount > 0 && (
                          <span
                            className="rounded-full bg-elevated text-text-muted"
                            style={{ padding: "3px 9px", fontSize: 12 }}
                          >
                            {t.domainMap.moreFlows.replace("{count}", String(hiddenCount))}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              : businessCards.map((card, i) => {
              const processes = processesByDomain.get(card.id) ?? [];
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
                      {t.domainMap.workCount.replace("{count}", String(processes.length))} ·{" "}
                      {t.domainMap.flowCount.replace("{count}", String(card.flowCount))}
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
                  {/* 업무(프로세스) 칩 — 클릭 = 업무 흐름도 탭 딥링크(?view=business&bf=).
                      접힘: 2줄 클램프(+N 포함), 펼침: 전량(헤더 전역 토글). */}
                  <div style={{ marginTop: card.filled ? 0 : 8 }}>
                    <ProcessChips
                      processes={processes}
                      expanded={worksExpanded}
                      defaultTitle={t.flowList.bizProcessDefault}
                      onOpen={(p) =>
                        navigate(`/domains/${card.id}?view=business&bf=${p.index}`)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {/* 기술·부속 도메인 — 업무 0개(배포 설정 등)는 본 그리드와 위계를 분리해
              하단 스트립으로. 근거율 바는 본 카드와 동일하게 유지(표기 일관성). */}
          {!hasGroups && supportCards.length > 0 && (
            <div
              className="shrink-0 border-t border-border-subtle flex items-center flex-wrap"
              style={{ padding: "10px 18px", gap: 10 }}
            >
              <span className="text-text-muted font-bold shrink-0" style={{ fontSize: 11.5 }}>
                {t.domainMap.supportDomains}
              </span>
              {supportCards.map((card) => (
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
                  className="flex items-center rounded-lg border border-border-subtle bg-panel hover:border-accent cursor-pointer transition-colors"
                  style={{ gap: 8, padding: "6px 10px" }}
                >
                  <span aria-hidden className="select-none shrink-0" style={{ fontSize: 13, lineHeight: 1 }}>
                    {card.icon}
                  </span>
                  <span className="text-text-primary whitespace-nowrap" style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {card.name}
                  </span>
                  <span className="text-text-muted whitespace-nowrap" style={{ fontSize: 11 }}>
                    {t.domainMap.flowCount.replace("{count}", String(card.flowCount))}
                  </span>
                  {card.filled && card.groundedPct !== null && (
                    <div className="shrink-0" style={{ width: 120 }}>
                      <GroundedBar
                        pct={card.groundedPct}
                        grounded={card.groundedCount}
                        review={card.reviewCount}
                      />
                    </div>
                  )}
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
              ))}
            </div>
          )}
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
            buildExtSections(systemMap, screenCount).map((s, i) => (
              <ExtSection
                key={s.key}
                title={sectionTitle(s.key, t)}
                first={i === 0}
                onOpen={() => navigate(s.menuPath)}
                openLabel={t.domainMap.extOpenMenu}
              >
                {s.key === "interfaces" && (
                  <>
                    {/* 0건 배지는 미스캔일 때만 — 배지 없음 = 스캔 완료 0건(시각 소음 제거). */}
                    <KvRow label={t.domainMap.extOutbound} value={systemMap.interfaces.outboundCount}
                      badge={systemMap.interfaces.outboundCount === 0 && !systemMap.interfaces.scanned ? "mut" : undefined}
                      badgeText={t.domainMap.extUnscanned} t={t} />
                    <KvRow label={t.domainMap.extInbound} value={systemMap.interfaces.inboundCount}
                      badge={systemMap.interfaces.inboundCount === 0 && !systemMap.interfaces.scanned ? "mut" : undefined}
                      badgeText={t.domainMap.extUnscanned} t={t} />
                    {/* 0건이어도 의심 신호가 있으면 "없음" 아닌 "탐지 못함" 가능성 표면화(정직성). */}
                    {systemMap.interfaces.suspectCount > 0 && (
                      <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--color-status-warn)" }}>
                        {t.domainMap.extSuspect.replace("{count}", String(systemMap.interfaces.suspectCount))}
                      </p>
                    )}
                  </>
                )}
                {s.key === "db" &&
                  (systemMap.db ? (
                    /* CRUD 매트릭스 행은 제거(사용자 결정) — 타이틀 → 버튼이 데이터 메뉴로 안내. */
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
                  ) : (
                    <ExtNone scanned t={t} />
                  ))}
                {s.key === "batch" && (
                  <KvRow label={t.domainMap.extJobs} value={systemMap.batch.jobCount}
                    badge={systemMap.batch.jobCount === 0 && !systemMap.batch.scanned ? "mut" : undefined}
                    badgeText={t.domainMap.extUnscanned} t={t} />
                )}
                {s.key === "screens" && (
                  /* 행 내 화면설계서 링크는 타이틀 → 버튼으로 승격(중복 제거). */
                  <div className="flex items-center" style={{ fontSize: 12.5, padding: "3px 0" }}>
                    <span className="text-text-secondary">
                      {t.domainMap.extScreenCount}{" "}
                      <b className="tabular-nums text-text-primary">{screenCount}</b>
                    </span>
                  </div>
                )}
              </ExtSection>
            ))
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
function ExtSection({
  title,
  first,
  onOpen,
  openLabel,
  children,
}: {
  title: string;
  first?: boolean;
  /** 타이틀 우측 메뉴 이동 버튼(→) — 해당 데이터의 전용 메뉴로 점프. */
  onOpen?: () => void;
  openLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={first ? "" : "border-t border-border-subtle"}
      style={{ padding: "13px 16px" }}
    >
      <div className="flex items-center" style={{ marginBottom: 8 }}>
        <h4 className="text-text-secondary font-bold" style={{ fontSize: 12 }}>
          {title}
        </h4>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            title={openLabel}
            aria-label={openLabel}
            className="ml-auto shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent transition-colors cursor-pointer"
            style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1 }}
          >
            →
          </button>
        )}
      </div>
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

/**
 * 업무(프로세스) 칩 목록 — 접힘 시 CHIP_MAX_ROWS(2)줄 클램프.
 * 측정 패스(전량 렌더 → offsetTop 줄 판정)로 2줄에 들어가는 칩 수를 구하고,
 * 초과가 있으면 "+N" 칩까지 2줄 안에 들어가도록 뒤에서부터 줄인다(요구:
 * +N 도 2줄 안 포함). useLayoutEffect 라 페인트 전 확정 — 깜빡임 없음.
 * 카드 폭 변화(반응형 그리드·창 크기)는 ResizeObserver 로 재측정.
 */
function ProcessChips({
  processes,
  expanded,
  defaultTitle,
  onOpen,
}: {
  processes: BizProcess[];
  expanded: boolean;
  defaultTitle: string;
  onOpen: (p: BizProcess) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // null = 측정 패스(전량 렌더 후 클램프 계산 전).
  const [visible, setVisible] = useState<number | null>(null);

  useLayoutEffect(() => {
    setVisible(null);
  }, [processes, expanded]);

  useLayoutEffect(() => {
    if (expanded || visible !== null) return;
    const el = ref.current;
    if (!el) return;
    const chips = Array.from(el.children) as HTMLElement[];
    if (chips.length === 0) {
      setVisible(0);
      return;
    }
    const rowTops: number[] = [];
    for (const c of chips) if (!rowTops.includes(c.offsetTop)) rowTops.push(c.offsetTop);
    rowTops.sort((a, b) => a - b);
    if (rowTops.length <= CHIP_MAX_ROWS) {
      setVisible(chips.length);
      return;
    }
    const cutTop = rowTops[CHIP_MAX_ROWS];
    let k = chips.filter((c) => c.offsetTop < cutTop).length;
    // "+N" 칩 예약 폭 — 마지막 보이는 칩 뒤(2줄째 끝)에 들어갈 자리를 확보한다.
    const PLUS_W = 44;
    const width = el.clientWidth;
    while (k > 0) {
      const last = chips[k - 1];
      if (last.offsetLeft + last.offsetWidth + 6 + PLUS_W <= width) break;
      k--;
    }
    setVisible(Math.max(k, 1)); // 전부 "+N"이 되는 퇴행 방지 — 최소 1개는 노출.
  }, [expanded, visible, processes]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastW) {
        lastW = el.clientWidth;
        setVisible(null);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (processes.length === 0) return null;
  const measuring = !expanded && visible === null;
  const shown =
    expanded || measuring ? processes : processes.slice(0, visible ?? processes.length);
  const rest = processes.length - shown.length;
  return (
    <div
      ref={ref}
      className="flex flex-wrap"
      // 측정 패스 동안만 2줄 높이로 클립 — 카드 높이 출렁임 방지(측정엔 무영향).
      style={{ gap: 6, ...(measuring ? { maxHeight: 58, overflow: "hidden" } : {}) }}
    >
      {shown.map((p) => {
        const label = p.title ?? defaultTitle.replace("{n}", String(p.index + 1));
        return (
          <button
            key={p.index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(p);
            }}
            className="rounded-full bg-elevated text-text-secondary hover:text-accent transition-colors cursor-pointer truncate"
            style={{ padding: "3px 9px", fontSize: 12, maxWidth: "100%" }}
            title={label}
          >
            {label}
          </button>
        );
      })}
      {!measuring && rest > 0 && (
        <span
          className="rounded-full bg-elevated text-text-muted"
          style={{ padding: "3px 9px", fontSize: 12 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
