import { useEffect, useMemo, useRef, useState } from "react";

import { useDashboardStore } from "../store";
import { useNavigate, useSearchParams } from "react-router";
import { useI18n } from "../contexts/I18nContext";
import FlowSpineView from "./FlowSpineView";
import BusinessFlowView from "./BusinessFlowView";
import CitationChip from "./CitationChip";
import VerdictBadge from "./VerdictBadge";
import GroundedBar from "./GroundedBar";
import { buildSequentialFallback, parseBusinessFlow } from "../utils/businessFlow";
import {
  buildDomainFlows,
  domainColor,
  domainIcon,
  filterFlows,
  findDomain,
  flowFacets,
  flowGroupKey,
  hasBusinessFlow,
  isFilterActive,
  parseDomainClaims,
  resolveWorkspaceView,
  type DomainFlow,
  type FlowFilter,
  type FlowGroupKey,
  type FlowMethod,
  type FlowVerdictKey,
} from "../utils/domainData";

/**
 * 화면 B — 도메인 워크스페이스 (WORK_MAP §4).
 *
 * P3: 상단 워크스페이스 헤더(브레드크럼 › 도메인명 + 요약 + GroundedBar) + 탭
 * ([업무 흐름도 view=business] / [기능 N view=code]). URL이 진실 — `?view=` 미지정
 * 시 businessFlow 데이터가 있으면 business, 없으면 code. 기존 `?flow=` 딥링크는
 * code 탭으로 해석(하위호환 파손 0, resolveWorkspaceView).
 *
 * 기능 목록 스케일(§4-2): 검색(이름/경로/메소드 부분일치) + 필터 칩(그룹·메소드·
 * verdict, 전부 클라이언트 필터) + 그룹 접기 + 점진 windowing(IntersectionObserver
 * 센티널, eGov 216기능 실측 후 채택 — 계측치는 설계문서 §6). 번호 배지는 필터와
 * 무관하게 전체 목록 기준으로 고정되어 접힘 레일 번호와 항상 같은 기능을 가리킨다.
 *
 * business 탭 내용물(순서도)은 P4 — P3 는 데이터 없음 상태를 정직하게 표기한다.
 *
 * USECASE GROUPING (documented choice): real domain-graph.json has no "usecase"
 * field, so flows are grouped by `entryType` into honest buckets (HTTP / Batch /
 * Event / Other). When all flows fall in a single bucket the group header is
 * suppressed and a flat list is rendered — avoids a noisy single-section label.
 */

// Method badge palette — ported from prototype `.method-*` classes.
// P5: 모드별 가독을 테마 엔진(method-* 토큰)이 책임진다 — bg는 동일 색 15% 틴트.
const methodStyle = (m: FlowMethod) => ({
  bg: `color-mix(in srgb, var(--color-method-${m.toLowerCase()}) 15%, transparent)`,
  color: `var(--color-method-${m.toLowerCase()})`,
});
const METHOD_STYLE: Record<FlowMethod, { bg: string; color: string }> = {
  GET: methodStyle("GET"),
  POST: methodStyle("POST"),
  PUT: methodStyle("PUT"),
  DELETE: methodStyle("DELETE"),
  ANY: methodStyle("ANY"),
  BATCH: methodStyle("BATCH"),
  EVENT: methodStyle("EVENT"),
  FLOW: methodStyle("FLOW"),
};

const GROUP_ORDER: FlowGroupKey[] = ["http", "batch", "event", "other"];

/** 점진 windowing — 최초 렌더 행 수 / 센티널 도달 시 증가 폭 (§4-2 계측 후 채택). */
const WINDOW_INITIAL = 100;
const WINDOW_STEP = 100;

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

/** 필터 칩 — 다중 토글. 활성 = accent 테두리/틴트(기존 flow-row 선택 언어 재사용). */
function FilterChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`shrink-0 rounded-full border cursor-pointer transition-colors ${
        active
          ? "border-accent text-accent bg-accent/10"
          : "border-border-subtle text-text-muted hover:border-border-medium hover:text-text-secondary"
      }`}
      style={{ fontSize: 10, padding: "2px 9px", lineHeight: 1.6 }}
    >
      {label}
    </button>
  );
}

export default function FlowListView() {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const navigate = useNavigate(); // P3: 지도 복귀는 URL로
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFlowId = useDashboardStore((s) => s.selectedFlowId);
  const setSelectedFlow = useDashboardStore((s) => s.setSelectedFlow);
  const { t } = useI18n();

  // 좌측 기능 목록 접기/펼치기 — 접으면 인라인 스파인이 폭 전체를 차지(화면3 전체화면 대체).
  // 기본 펼침: 도메인 재진입 시 FlowListView 가 remount 되며 자동으로 펼친 상태로 복귀.
  const [listCollapsed, setListCollapsed] = useState(false);

  // §4-2 검색/필터 — 전부 클라이언트 상태(결정론). 도메인 전환 시 리셋(remount).
  const [query, setQuery] = useState("");
  const [groupSel, setGroupSel] = useState<Set<FlowGroupKey>>(new Set());
  const [methodSel, setMethodSel] = useState<Set<FlowMethod>>(new Set());
  const [verdictSel, setVerdictSel] = useState<Set<FlowVerdictKey>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<FlowGroupKey>>(new Set());

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
  const domainGrounding = useMemo(
    () => (domainNode ? parseDomainClaims(domainNode) : null),
    [domainNode],
  );

  // §3 탭 해석 — URL이 진실. ?flow= 딥링크(pre-P3)는 code 탭(하위호환).
  const view = resolveWorkspaceView(
    searchParams.get("view"),
    searchParams.get("flow"),
    hasBusinessFlow(domainNode),
  );
  const switchView = (next: "business" | "code") => {
    // 탭은 워크스페이스 내부 뷰 토글 — flow 선택 동기화와 동일하게 replace(히스토리
    // 오염 없음, 리뷰 C1). ?flow= 는 유지: business↔code 왕복 시 선택 보존(의도).
    // 라이브 location 기준(함수형 prev 는 렌더 스냅샷 — 라이터 경합 시 스테일).
    const p = new URLSearchParams(window.location.search);
    p.set("view", next);
    p.delete("token");
    setSearchParams(p, { replace: true });
  };

  // Inline-selection reset on domain switch is handled centrally in the store
  // (navigateToDomain / clearActiveDomain reset selectedFlowId) so the
  // fullscreen round-trip can preserve it — see FIX 3.

  const filter: FlowFilter = useMemo(
    () => ({ query, groups: groupSel, methods: methodSel, verdicts: verdictSel }),
    [query, groupSel, methodSel, verdictSel],
  );
  const filtered = useMemo(() => filterFlows(flows, filter), [flows, filter]);
  const filterOn = isFilterActive(filter);

  // Group flows by entryType bucket, preserving graph order within a group.
  // 그룹은 필터 결과 위에서 재구성 — 그룹 접힘은 필터와 독립.
  const groups = useMemo(() => {
    const map = new Map<FlowGroupKey, DomainFlow[]>();
    for (const f of filtered) {
      const key = flowGroupKey(f.entryType);
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      key: k,
      flows: map.get(k)!,
    }));
  }, [filtered]);

  const groupLabel: Record<FlowGroupKey, string> = {
    http: t.flowList.groupHttp,
    batch: t.flowList.groupBatch,
    event: t.flowList.groupEvent,
    other: t.flowList.groupOther,
  };
  const verdictLabel: Record<FlowVerdictKey, string> = {
    GROUNDED: t.flowList.verdictGrounded,
    NEEDS_REVIEW: t.flowList.verdictReview,
    none: t.flowList.verdictNone,
  };

  // 필터 칩 후보 — 이 도메인에 실존하는 값만(빈 칩 노출 금지). 파셋 계산은
  // domainData.flowFacets(단위테스트 대상 — 균일 데모에서 칩 비노출이 정상, 리뷰 C2).
  const facets = useMemo(() => flowFacets(flows), [flows]);
  const availableGroups = facets.groups;
  const availableMethods = facets.methods;
  const availableVerdicts = facets.verdicts;

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) ?? null;
  const singleGroup = groups.length <= 1;

  // 표시 순서(그룹 순회) 기준 1..N 번호 — **필터와 무관하게 전체 목록 기준**으로
  // 고정해, 필터 중에도 행 번호·접힘 레일 번호가 같은 기능을 가리킨다.
  const fullOrdered = useMemo(() => {
    const map = new Map<FlowGroupKey, DomainFlow[]>();
    for (const f of flows) {
      const key = flowGroupKey(f.entryType);
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).flatMap((k) => map.get(k)!);
  }, [flows]);
  const flowNumber = useMemo(() => {
    const m = new Map<string, number>();
    fullOrdered.forEach((f, i) => m.set(f.id, i + 1));
    return m;
  }, [fullOrdered]);

  // 접힘 레일도 필터 결과를 따른다(번호는 전체 기준 유지).
  const orderedFiltered = useMemo(() => groups.flatMap((g) => g.flows), [groups]);

  // §4-2 점진 windowing — 그룹 헤더+행을 평탄화한 렌더 목록에 센티널 기반 창을 적용.
  type RenderItem =
    | { kind: "header"; group: FlowGroupKey; count: number; collapsed: boolean }
    | { kind: "flow"; flow: DomainFlow };
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (const g of groups) {
      const collapsed = collapsedGroups.has(g.key);
      if (!singleGroup) items.push({ kind: "header", group: g.key, count: g.flows.length, collapsed });
      if (!collapsed || singleGroup) for (const f of g.flows) items.push({ kind: "flow", flow: f });
    }
    return items;
  }, [groups, collapsedGroups, singleGroup]);

  const [windowSize, setWindowSize] = useState(WINDOW_INITIAL);
  // 필터/도메인 변경 시 창 리셋 — 검색 결과 최상단부터 다시. 키는 JSON 직렬화로
  // 구분자 충돌 차단(query 에 "|" 포함 케이스, 리뷰 R4).
  const filterKey = JSON.stringify([activeDomainId, query, [...groupSel], [...methodSel], [...verdictSel]]);
  useEffect(() => {
    setWindowSize(WINDOW_INITIAL);
  }, [filterKey]);
  const visibleItems = renderItems.slice(0, windowSize);
  const hasMore = renderItems.length > windowSize;
  // 접힘 레일도 동일 창 적용 — 접는 순간 전량 DOM 이 올라가는 우회 차단(리뷰 C3).
  const visibleRail = orderedFiltered.slice(0, windowSize);
  const railHasMore = orderedFiltered.length > windowSize;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const railSentinelRef = useRef<HTMLDivElement | null>(null);
  const maxWindow = Math.max(renderItems.length, orderedFiltered.length);
  const anyMore = hasMore || railHasMore;
  useEffect(() => {
    if (!anyMore) return;
    // jsdom 등 IntersectionObserver 부재 환경에서는 전체 렌더로 강등(기능 보존).
    if (typeof IntersectionObserver === "undefined") {
      setWindowSize(maxWindow);
      return;
    }
    const els = [sentinelRef.current, railSentinelRef.current].filter(
      (el): el is HTMLDivElement => el !== null,
    );
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setWindowSize((s) => Math.min(s + WINDOW_STEP, maxWindow));
        }
      },
      { rootMargin: "240px" },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
    // windowSize 포함 — 창 성장 후 옵저버를 재생성해 초기 교차 상태를 재전달받는다.
    // (센티널이 뷰포트를 못 벗어난 경우 교차 이벤트가 재발화하지 않는 stall 차단.)
  }, [anyMore, maxWindow, windowSize]);

  const toggleIn = <T,>(set: Set<T>, v: T, apply: (next: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };
  const clearFilters = () => {
    setQuery("");
    setGroupSel(new Set());
    setMethodSel(new Set());
    setVerdictSel(new Set());
  };

  const accent = activeDomainId ? domainColor(activeDomainId) : "var(--color-accent)";

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* ── 워크스페이스 헤더(§4 화면 B): 브레드크럼 + 도메인명 + 요약 + GroundedBar + 탭 ── */}
      <header className="shrink-0 border-b border-border-subtle bg-panel" style={{ padding: "10px 20px 0" }}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="uppercase text-text-muted truncate" style={{ fontSize: 11, letterSpacing: "0.1em" }}>
              <button
                type="button"
                onClick={() => navigate("/domains")}
                className="uppercase text-text-muted hover:text-accent transition-colors cursor-pointer"
                style={{ letterSpacing: "0.1em" }}
              >
                {t.domainMap.breadcrumbRoot}
              </button>{" "}
              › {domainNode?.name ?? ""}
            </p>
            <div className="flex items-baseline gap-2.5 mt-0.5 min-w-0">
              <span aria-hidden style={{ fontSize: 15 }}>
                {domainNode ? domainIcon(domainNode.name, domainNode.id) : ""}
              </span>
              {/* 도메인명은 짧다 — 요약이 truncate 를 전담하고 이름은 보존(shrink-0). */}
              <h1 className="text-text-primary font-semibold shrink-0" style={{ fontSize: 18 }}>
                {domainNode?.name ?? ""}
              </h1>
              {domainNode?.summary && (
                <span className="text-text-secondary truncate" style={{ fontSize: 12, minWidth: 0 }}>
                  {domainNode.summary}
                </span>
              )}
            </div>
          </div>
          {domainGrounding?.filled && domainGrounding.groundedPct !== null && (
            <div className="shrink-0 mt-1" style={{ width: 240 }}>
              <GroundedBar
                pct={domainGrounding.groundedPct}
                grounded={domainGrounding.groundedCount}
                review={domainGrounding.reviewCount}
              />
            </div>
          )}
        </div>
        {/* 탭바 — view= 가 진실. 활성 탭 밑줄은 도메인 색. WAI-ARIA Tabs: roving
            tabindex + 화살표 키 + tab↔tabpanel 상호 연결(리뷰 C4). */}
        <div
          className="flex items-center gap-1 mt-2"
          role="tablist"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const next = view === "business" ? "code" : "business";
            switchView(next);
            document.getElementById(`workspace-tab-${next}`)?.focus();
          }}
        >
          {(
            [
              { key: "business" as const, label: t.flowList.tabBusiness },
              { key: "code" as const, label: t.flowList.tabCode.replace("{count}", String(flows.length)) },
            ]
          ).map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                id={`workspace-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`workspace-panel-${tab.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => switchView(tab.key)}
                className={`cursor-pointer transition-colors border-b-2 ${
                  active ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
                }`}
                style={{
                  fontSize: 12.5,
                  padding: "6px 12px 8px",
                  borderBottomColor: active ? accent : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── 탭 내용 ── */}
      {view === "business" ? (
        /* P4: 순서도 — fill 채움이면 businessFlow, 미채움이면 결정론 순차 폴백(배너).
           기능 0개 도메인은 그릴 것이 없어 데이터 없음 문구로 degrade. */
        <div
          id="workspace-panel-business"
          role="tabpanel"
          aria-labelledby="workspace-tab-business"
          className="flex-1 min-h-0"
        >
          {(() => {
            const parsed = parseBusinessFlow(domainNode);
            const biz =
              parsed ??
              (flows.length > 0
                ? buildSequentialFallback(flows, {
                    start: t.flowList.bfStart,
                    end: t.flowList.bfEnd,
                  })
                : null);
            return biz && activeDomainId ? (
              <BusinessFlowView domainId={activeDomainId} biz={biz} />
            ) : (
              <div className="h-full flex items-center justify-center px-8 text-center">
                <p className="text-text-secondary" style={{ fontSize: 13 }}>
                  {t.flowList.businessEmpty}
                </p>
              </div>
            );
          })()}
        </div>
      ) : (
      <div
        id="workspace-panel-code"
        role="tabpanel"
        aria-labelledby="workspace-tab-code"
        className="flex-1 min-h-0 flex overflow-hidden"
      >
      {/* LEFT: collapsed rail — » expand + numbered quick-nav. Replaces the
          old full-screen spine: collapse the list and the inline spine claims
          the full width. */}
      {listCollapsed ? (
      <aside
        className="shrink-0 h-full flex flex-col items-center border-r border-border-subtle bg-surface/40"
        style={{ width: 44 }}
      >
        <button
          type="button"
          onClick={() => setListCollapsed(false)}
          title={t.flowList.expandList}
          aria-label={t.flowList.expandList}
          className="shrink-0 mt-3 flex items-center justify-center rounded-md border border-border-subtle text-text-secondary hover:border-border-medium hover:text-accent transition-colors cursor-pointer"
          style={{ width: 28, height: 28, fontSize: 14, lineHeight: 1 }}
        >
          »
        </button>
        {/* 접힘 상태 번호 선택 — 펼치지 않고도 번호로 기능 전환(선택 번호 강조).
            필터 결과를 따르되 번호는 전체 목록 기준(펼침 행 배지와 동일 매핑). */}
        <div className="mt-3 flex-1 w-full overflow-y-auto flex flex-col items-center gap-1.5 pb-3">
          {visibleRail.map((f) => {
            const isSel = f.id === selectedFlowId;
            const n = flowNumber.get(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFlow(f.id)}
                title={`${n}. ${f.name}`}
                aria-label={`${n}. ${f.name}`}
                aria-current={isSel}
                className={`shrink-0 flex items-center justify-center rounded-md border font-mono transition-colors cursor-pointer ${
                  isSel
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border-subtle text-text-muted hover:border-border-medium hover:text-accent"
                }`}
                style={{ width: 28, height: 26, fontSize: 11 }}
              >
                {n}
              </button>
            );
          })}
          {railHasMore && <div ref={railSentinelRef} aria-hidden style={{ height: 1 }} />}
        </div>
      </aside>
      ) : (
      /* LEFT sidebar: flow list. Clicking a row selects the flow and renders its
          code graph in the center pane. */
      <aside
        className="shrink-0 h-full flex flex-col border-r border-border-subtle bg-surface/40"
        style={{ width: 320 }}
      >
        {/* sidebar header — §4-2 검색 + 필터 칩 + 접기 버튼 */}
        <div className="shrink-0 border-b border-border-subtle" style={{ padding: "12px 12px 10px" }}>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.flowList.searchPlaceholder}
              aria-label={t.flowList.searchPlaceholder}
              className="flex-1 min-w-0 rounded-md border border-border-subtle bg-elevated text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              style={{ fontSize: 12, padding: "6px 10px" }}
            />
            <button
              type="button"
              onClick={() => setListCollapsed(true)}
              title={t.flowList.collapseList}
              aria-label={t.flowList.collapseList}
              className="flex items-center justify-center shrink-0 rounded-md border border-border-subtle text-text-muted hover:border-border-medium hover:text-accent transition-colors cursor-pointer"
              style={{ width: 28, height: 28, fontSize: 14, lineHeight: 1 }}
            >
              «
            </button>
          </div>
          {/* 필터 칩 — 이 도메인에 실존하는 값만. 그룹(버킷 2+일 때만)·메소드(2+)·verdict(2+). */}
          {(availableGroups.length > 1 || availableMethods.length > 1 || availableVerdicts.length > 1) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {availableGroups.length > 1 &&
                availableGroups.map((g) => (
                  <FilterChip
                    key={`g:${g}`}
                    label={groupLabel[g]}
                    active={groupSel.has(g)}
                    onToggle={() => toggleIn(groupSel, g, setGroupSel)}
                  />
                ))}
              {availableMethods.length > 1 &&
                availableMethods.map((m) => (
                  <FilterChip
                    key={`m:${m}`}
                    label={m}
                    active={methodSel.has(m)}
                    onToggle={() => toggleIn(methodSel, m, setMethodSel)}
                  />
                ))}
              {availableVerdicts.length > 1 &&
                availableVerdicts.map((v) => (
                  <FilterChip
                    key={`v:${v}`}
                    label={verdictLabel[v]}
                    active={verdictSel.has(v)}
                    onToggle={() => toggleIn(verdictSel, v, setVerdictSel)}
                  />
                ))}
            </div>
          )}
          {/* 결과 카운트 + 초기화 — 필터 활성 시에만(정직한 축소 표기). */}
          {filterOn && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-text-muted tabular-nums" style={{ fontSize: 10.5 }}>
                {filtered.length} / {flows.length}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-text-muted hover:text-accent transition-colors cursor-pointer"
                style={{ fontSize: 10.5 }}
              >
                {t.flowList.clearFilters}
              </button>
            </div>
          )}
        </div>

        {/* scrollable flow rows — windowed render list (§4-2) */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "12px" }}>
          {filtered.length === 0 ? (
            <p className="text-text-muted text-center" style={{ fontSize: 12, padding: "24px 8px" }}>
              {t.flowList.noMatches}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visibleItems.map((item) =>
                item.kind === "header" ? (
                  <button
                    key={`h:${item.group}`}
                    type="button"
                    onClick={() =>
                      toggleIn(collapsedGroups, item.group, setCollapsedGroups)
                    }
                    aria-expanded={!item.collapsed}
                    className="flex items-center gap-2 uppercase text-text-muted mt-3 first:mt-0 mb-0.5 cursor-pointer hover:text-text-secondary transition-colors w-full"
                    style={{ fontSize: 10, letterSpacing: "0.09em" }}
                  >
                    <span aria-hidden style={{ fontSize: 8 }}>
                      {item.collapsed ? "▶" : "▼"}
                    </span>
                    <span>{groupLabel[item.group]}</span>
                    <span className="tabular-nums">({item.count})</span>
                    <span className="flex-1 h-px bg-border-subtle" />
                  </button>
                ) : (
                  (() => {
                    const flow = item.flow;
                    const isSelected = flow.id === selectedFlowId;
                    return (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => setSelectedFlow(flow.id)}
                      className="flow-row flex flex-col gap-1.5 text-left rounded-lg border cursor-pointer transition-colors w-full"
                      style={{
                        padding: "10px 12px",
                        background: isSelected
                          ? "color-mix(in srgb, var(--color-accent) 7%, transparent)"
                          : "var(--color-elevated)",
                        borderColor: isSelected
                          ? "var(--color-accent)"
                          : "var(--color-border-subtle)",
                        boxShadow: isSelected
                          ? "0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent) inset"
                          : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* 번호 — 접힘 레일 번호와 동일 매핑(번호로 기능 식별·선택).
                            필터 중에도 전체 목록 기준이라 비연속일 수 있다(리뷰 C7 — 툴팁 명시). */}
                        <span
                          title={t.flowList.numberHint}
                          className="shrink-0 inline-flex items-center justify-center rounded border border-border-subtle text-text-muted"
                          style={{ minWidth: 18, height: 18, fontSize: 10, fontFamily: "var(--font-mono)" }}
                        >
                          {flowNumber.get(flow.id)}
                        </span>
                        <MethodBadge method={flow.method} />
                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                          {flow.grounding && <VerdictBadge verdict={flow.grounding.verdict} />}
                          <span
                            className="text-text-muted"
                            style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}
                          >
                            {t.flowList.stepCount.replace("{count}", String(flow.stepCount))}
                          </span>
                        </span>
                      </div>
                      {/* Function label ("어떤 기능인지") first — human-readable name
                          leads, technical entry signature follows below. */}
                      <span className="text-text-primary" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                        {flow.name}
                      </span>
                      {/* Full endpoint / entry signature — wraps so every character stays visible. */}
                      <span
                        className="text-text-secondary"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          wordBreak: "break-all",
                          lineHeight: 1.45,
                        }}
                      >
                        {flow.path}
                      </span>
                    </button>
                    );
                  })()
                ),
              )}
              {/* windowing 센티널 — 근접 시 다음 청크 로드(스크롤 위치 보존). */}
              {hasMore && <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />}
            </div>
          )}
        </div>
      </aside>
      )}

      {/* CENTER + RIGHT: selected flow's code graph (FlowSpineView renders its own
          right sidebar, which now appears only when a node is clicked). */}
      <div className="flex-1 min-w-0 h-full flex flex-col bg-root">
        {selectedFlow ? (
          <>
            {/* center header — selected flow context + grounding */}
            <div
              className="flex flex-col gap-1.5 shrink-0 bg-panel border-b border-border-subtle"
              style={{ padding: "10px 20px" }}
            >
              <div className="flex items-center gap-2.5">
                <MethodBadge method={selectedFlow.method} />
                <span
                  className="text-text-primary whitespace-nowrap"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                >
                  {selectedFlow.path}
                </span>
                <span className="text-text-secondary truncate" style={{ fontSize: 11, minWidth: 0 }}>
                  — {selectedFlow.name}
                </span>
              </div>
              {selectedFlow.grounding && (
                <div className="flex items-center flex-wrap gap-1.5">
                  <VerdictBadge verdict={selectedFlow.grounding.verdict} />
                  <span className="uppercase text-text-muted" style={{ fontSize: 10, letterSpacing: "0.08em" }}>
                    {t.grounding.evidence}
                  </span>
                  {selectedFlow.grounding.citations.length > 0 ? (
                    selectedFlow.grounding.citations.map((c, i) => (
                      <CitationChip key={`${c.filePath}:${c.line}:${i}`} filePath={c.filePath} line={c.line} status={c.status} />
                    ))
                  ) : (
                    <span className="text-text-muted" style={{ fontSize: 10 }}>{t.grounding.noCitations}</span>
                  )}
                </div>
              )}
            </div>
            {/* code graph */}
            <div className="flex-1 min-h-0 relative">
              <FlowSpineView flowId={selectedFlow.id} hideBack />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-8 text-center">
            <p className="text-text-muted" style={{ fontSize: 13 }}>
              {t.flowList.selectPrompt}
            </p>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
