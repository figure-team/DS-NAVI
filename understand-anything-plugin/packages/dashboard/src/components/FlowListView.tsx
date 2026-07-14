import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useDashboardStore } from "../store";
import { useNavigate, useSearchParams } from "react-router";
import { useI18n } from "../contexts/I18nContext";
import FlowSpineView from "./FlowSpineView";
import BusinessFlowView from "./BusinessFlowView";
import CitationChip from "./CitationChip";
import VerdictBadge from "./VerdictBadge";
import GroundedBar from "./GroundedBar";
import {
  buildSequentialFallback,
  businessFlowRejectedReason,
  parseBusinessFlows,
} from "../utils/businessFlow";
import {
  buildDomainFlows,
  buildFlowSections,
  domainIcon,
  filterFlows,
  findDomain,
  flowFacets,
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
import { findOwningGroup, resolveGroups } from "../utils/domainGroups";

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
 * field. Sections are built by `buildFlowSections` (domainData.ts): when a
 * domain has 2+ distinct sub-packages (filePath-derived, e.g. eGov `cop`'s
 * bbs/smt/adb/...), flows are sectioned by sub-package — avoids one flat
 * 200+ row list. Otherwise it falls back to the original `entryType` buckets
 * (HTTP / Batch / Event / Other), identical to pre-subgroup behavior.
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

/** 점진 windowing — 최초 렌더 행 수 / 센티널 도달 시 증가 폭 (§4-2 계측 후 채택). */
const WINDOW_INITIAL = 100;
const WINDOW_STEP = 100;

function MethodBadge({ method, size = "md" }: { method: FlowMethod; size?: "sm" | "md" }) {
  const s = METHOD_STYLE[method];
  // sm = 프로토 .m(목록 행), md = 중앙 헤더용.
  return (
    <span
      className="font-bold text-center shrink-0 rounded"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: size === "sm" ? 9.5 : 10,
        padding: size === "sm" ? "1px 5px" : "2px 7px",
        minWidth: size === "sm" ? undefined : 44,
        background: s.bg,
        color: s.color,
      }}
    >
      {method}
    </span>
  );
}

/** 필터 칩 — 프로토 .chip(pill): 기본 회색 배경, 활성 = 브랜드 틴트 + accent 글자. */
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
      className="shrink-0 rounded-full cursor-pointer transition-colors"
      style={{
        fontSize: 12,
        padding: "3px 9px",
        lineHeight: 1.5,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
        background: active
          ? "color-mix(in srgb, var(--color-accent) 9%, transparent)"
          : "var(--color-elevated)",
      }}
    >
      {label}
    </button>
  );
}

export default function FlowListView({ processPanel }: { processPanel?: ReactNode } = {}) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const domainGroupsRaw = useDashboardStore((s) => s.domainGroups);
  const navigate = useNavigate(); // P3: 지도 복귀는 URL로
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFlowId = useDashboardStore((s) => s.selectedFlowId);
  const setSelectedFlow = useDashboardStore((s) => s.setSelectedFlow);
  const { t } = useI18n();

  // DOMAIN_HIERARCHY §7: 그룹 소속 도메인이면 브레드크럼에 그룹명을 끼우고 "업무 지도"
  // 뒤로가기도 그룹 워크스페이스로 향한다(하위 워크스페이스 재사용 — 이 컴포넌트 자체는
  // 그룹 인지가 없어도 되도록, 소속 그룹만 조회). groups 없는 프로젝트는 항상 null.
  const owningGroup = useMemo(() => {
    if (!domainGraph || !activeDomainId || domainGroupsRaw.length === 0) return null;
    const resolved = resolveGroups(domainGraph, domainGroupsRaw, t.domainMap.unclassified);
    return findOwningGroup(resolved, activeDomainId) ?? null;
  }, [domainGraph, activeDomainId, domainGroupsRaw, t]);

  // 좌측 기능 목록 접기/펼치기 — 접으면 인라인 스파인이 폭 전체를 차지(화면3 전체화면 대체).
  // 기본 펼침: 도메인 재진입 시 FlowListView 가 remount 되며 자동으로 펼친 상태로 복귀.
  const [listCollapsed, setListCollapsed] = useState(false);

  // §4-2 검색/필터 — 전부 클라이언트 상태(결정론). 도메인 전환 시 리셋(remount).
  const [query, setQuery] = useState("");
  const [groupSel, setGroupSel] = useState<Set<FlowGroupKey>>(new Set());
  const [methodSel, setMethodSel] = useState<Set<FlowMethod>>(new Set());
  const [verdictSel, setVerdictSel] = useState<Set<FlowVerdictKey>>(new Set());
  // 섹션 키 — 서브그룹(예: "adb") 또는 폴백 entryType(FlowGroupKey) 둘 다 문자열.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const flows = useMemo<DomainFlow[]>(
    () =>
      domainGraph && activeDomainId
        ? buildDomainFlows(domainGraph, activeDomainId)
        : [],
    [domainGraph, activeDomainId],
  );
  // 비병합 인덱스 — 병합으로 목록에서 접힌 폼 흐름을 +폼 배지 클릭으로 선택했을
  // 때 스파인 헤더(method/path/name)를 해석하기 위한 조회 전용.
  const flowIndex = useMemo<DomainFlow[]>(
    () =>
      domainGraph && activeDomainId
        ? buildDomainFlows(domainGraph, activeDomainId, { mergeForms: false })
        : [],
    [domainGraph, activeDomainId],
  );

  // 최초엔 기능 목록을 전부 접힌 상태로 — 흐름이 많은 도메인(예 협업 216)에서 서브패키지
  // 헤더만 먼저 보이게 한다(사용자 요청). 도메인 전환마다 재적용하되, 섹션이 여러 개일
  // 때만(그룹화된 경우) 접는다 — 단일 섹션까지 접으면 목록이 통째로 숨어 어색하다.
  // useLayoutEffect = 216행을 펼쳐 그렸다 접는 깜빡임 차단(페인트 전 반영).
  useLayoutEffect(() => {
    const sections = buildFlowSections(flows);
    setCollapsedGroups(sections.length >= 2 ? new Set(sections.map((s) => s.key)) : new Set());
  }, [activeDomainId, flows]);

  const domainNode = useMemo(
    () => (domainGraph && activeDomainId ? findDomain(domainGraph, activeDomainId) : undefined),
    [domainGraph, activeDomainId],
  );
  const domainGrounding = useMemo(
    () => (domainNode ? parseDomainClaims(domainNode) : null),
    [domainNode],
  );

  // P4/B안: 업무 흐름도 데이터 — 프로세스 목록(businessFlows[], 레거시 단수 포함)
  // 우선, 전무하면 순차 폴백. useMemo 로 참조를 고정한다(매 렌더 재생성 시
  // BusinessFlowView 의 ELK 레이아웃이 재실행됨).
  const bizProcesses = useMemo(() => parseBusinessFlows(domainNode), [domainNode]);
  // ?bf= 딥링크 — 표시 순서 인덱스(URL 이 진실). 비숫자/범위 밖은 0 으로 클램프.
  const bfParam = Number.parseInt(searchParams.get("bf") ?? "", 10);
  const bfIdx = Number.isFinite(bfParam)
    ? Math.min(Math.max(bfParam, 0), Math.max(bizProcesses.length - 1, 0))
    : 0;
  const bizFlow = useMemo(() => {
    const proc = bizProcesses[bfIdx];
    if (proc) return proc.flow;
    return flows.length > 0
      ? buildSequentialFallback(flows, {
          start: t.flowList.bfStart,
          end: t.flowList.bfEnd,
          more: t.flowList.bfMore,
        })
      : null;
  }, [bizProcesses, bfIdx, flows, t]);
  const bizRejected = useMemo(() => businessFlowRejectedReason(domainNode), [domainNode]);
  const switchProcess = (i: number) => {
    // 탭 전환(switchView)과 동일 규약 — replace, 라이브 location 기준, 토큰 차단.
    const p = new URLSearchParams(window.location.search);
    if (i === 0) p.delete("bf");
    else p.set("bf", String(i));
    p.delete("token");
    setSearchParams(p, { replace: true });
  };

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

  // 섹션 기준(서브패키지 vs entryType)은 **전체 흐름** 기준 1회 판정 — 검색 중 부분집합으로
  // 재판정하면 결과가 한 서브패키지로 좁혀질 때 그룹핑이 "HTTP 엔드포인트"로 뒤집힌다(버그).
  const bySubGroup = useMemo(
    () => new Set(flows.map((f) => f.subGroup).filter((g): g is string => g !== null)).size >= 2,
    [flows],
  );

  // 서브패키지 또는 폴백 entryType 으로 섹션 구성(domainData.buildFlowSections).
  // 그룹은 필터 결과 위에서 재구성 — 그룹 접힘은 필터와 독립(모드는 전체 기준 고정).
  const groups = useMemo(() => buildFlowSections(filtered, bySubGroup), [filtered, bySubGroup]);

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

  const selectedFlow =
    flows.find((f) => f.id === selectedFlowId) ??
    flowIndex.find((f) => f.id === selectedFlowId) ??
    null;

  // 표시 순서(섹션 순회) 기준 1..N 번호 — **필터와 무관하게 전체 목록 기준**으로
  // 고정해, 필터 중에도 행 번호·접힘 레일 번호가 같은 기능을 가리킨다.
  const fullOrdered = useMemo(
    () => buildFlowSections(flows, bySubGroup).flatMap((g) => g.flows),
    [flows, bySubGroup],
  );
  const flowNumber = useMemo(() => {
    const m = new Map<string, number>();
    fullOrdered.forEach((f, i) => m.set(f.id, i + 1));
    return m;
  }, [fullOrdered]);

  // 접힘 레일도 필터 결과를 따른다(번호는 전체 기준 유지).
  const orderedFiltered = useMemo(() => groups.flatMap((g) => g.flows), [groups]);

  // §4-2 점진 windowing — 그룹 헤더+행을 평탄화한 렌더 목록에 센티널 기반 창을 적용.
  type RenderItem =
    | { kind: "header"; sectionKey: string; label: string; count: number; collapsed: boolean }
    | { kind: "flow"; flow: DomainFlow };
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    // pmpl-proto .fl-grp — 그룹 헤더는 단일 그룹이어도 항상 노출("HTTP 엔드포인트 (6)").
    for (const g of groups) {
      // 검색/필터 활성 시엔 접힘 무시하고 항상 펼침 — 결과가 접힌 헤더에 가려지지 않게.
      const collapsed = !filterOn && collapsedGroups.has(g.key);
      items.push({ kind: "header", sectionKey: g.key, label: g.label, count: g.flows.length, collapsed });
      if (!collapsed) for (const f of g.flows) items.push({ kind: "flow", flow: f });
    }
    return items;
  }, [groups, collapsedGroups, filterOn]);

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

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* ── 워크스페이스 헤더(§4 화면 B): 브레드크럼 + 도메인명 + 요약 + GroundedBar + 탭 ── */}
      {/* 프로토 page-head(P6): eyebrow 브레드크럼 · h1 20px · meta 요약 · 우측 근거율 gbar */}
      <header className="shrink-0 border-b border-border-subtle bg-panel" style={{ padding: "12px 20px 0" }}>
        <div className="flex items-end gap-3.5 flex-wrap min-w-0">
          <div className="min-w-0">
            <p className="text-text-muted font-bold truncate" style={{ fontSize: 11.5, letterSpacing: "0.06em", marginBottom: 3 }}>
              <button
                type="button"
                onClick={() => navigate("/domains")}
                className="text-text-muted hover:text-accent transition-colors cursor-pointer font-bold"
                style={{ letterSpacing: "0.06em" }}
              >
                {t.domainMap.breadcrumbRoot}
              </button>{" "}
              {owningGroup && (
                <>
                  ›{" "}
                  <button
                    type="button"
                    onClick={() => navigate(`/domains/${owningGroup.key}`)}
                    className="text-text-muted hover:text-accent transition-colors cursor-pointer font-bold"
                    style={{ letterSpacing: "0.06em" }}
                  >
                    {owningGroup.name}
                  </button>{" "}
                </>
              )}
              › {domainNode?.name ?? ""}
            </p>
            <h1 className="text-text-primary font-bold whitespace-nowrap" style={{ fontSize: 20, lineHeight: 1.25 }}>
              <span aria-hidden style={{ marginRight: 8 }}>
                {domainNode ? domainIcon(domainNode.name, domainNode.id) : ""}
              </span>
              {domainNode?.name ?? ""}
            </h1>
          </div>
          {domainNode?.summary && (
            <span className="text-text-muted truncate" style={{ fontSize: 13, minWidth: 0, paddingBottom: 3, flex: 1 }}>
              {domainNode.summary}
            </span>
          )}
          {domainGrounding?.filled && domainGrounding.groundedPct !== null && (
            <div className="shrink-0 ml-auto" style={{ width: 170, paddingBottom: 4 }}>
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
              { key: "business" as const, label: t.flowList.tabBusiness, count: null },
              {
                key: "code" as const,
                label: t.flowList.tabCode.replace("{count}", "").trim(),
                // 탭에는 갯수 비노출(사용자 결정) — 갯수는 목록 그룹 헤더가 담당.
                count: null,
              },
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
                className="cursor-pointer transition-colors border-b-2"
                style={{
                  fontSize: 13.5,
                  padding: "7px 10px 9px",
                  color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
                  borderBottomColor: active ? "var(--color-accent)" : "transparent",
                  fontWeight: active ? 650 : 550,
                }}
              >
                {tab.label}
                {tab.count !== null && (
                  <span
                    className="tabular-nums"
                    style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 4 }}
                  >
                    {tab.count}
                  </span>
                )}
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
          className="flex-1 min-h-0 flex overflow-hidden"
        >
          {bizFlow && activeDomainId ? (
            <>
              {/* B안: 업무 프로세스 목록 패널 — 그룹 워크스페이스는 이 자리에
                  서브도메인▸업무흐름도 트리(processPanel)를 주입한다(사용자 확정:
                  트리는 별도 외곽 컬럼이 아니라 기존 목록 위치). 주입이 없으면
                  기존 단일 도메인 프로세스 목록(2개 이상일 때만) 그대로. */}
              {processPanel ? (
                <aside
                  className="shrink-0 flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-hidden"
                  style={{
                    width: 300,
                    margin: "12px 0 12px 12px",
                    boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
                  }}
                >
                  {processPanel}
                </aside>
              ) : bizProcesses.length > 1 && (
                <aside
                  className="shrink-0 flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-hidden"
                  style={{
                    width: 300,
                    margin: "12px 0 12px 12px",
                    boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
                  }}
                >
                  <div
                    className="shrink-0 text-text-muted"
                    style={{ fontSize: 11, fontWeight: 700, padding: "12px 16px 6px" }}
                  >
                    {t.flowList.bizProcesses}{" "}
                    <span className="tabular-nums">({bizProcesses.length})</span>
                  </div>
                  <div className="flex-1 overflow-y-auto" style={{ padding: "0 10px 12px" }}>
                    {bizProcesses.map((p, i) => {
                      const active = i === bfIdx;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => switchProcess(i)}
                          aria-current={active}
                          className="flex items-center gap-2 text-left rounded-[7px] cursor-pointer transition-colors w-full hover:bg-elevated min-w-0"
                          style={{
                            padding: "7px 8px",
                            fontSize: 12.5,
                            fontWeight: active ? 600 : 400,
                            background: active
                              ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                              : undefined,
                          }}
                        >
                          <span className="text-text-primary truncate">
                            {p.title ??
                              t.flowList.bizProcessDefault.replace("{n}", String(i + 1))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </aside>
              )}
              {/* 그래프 카드 — 기능 탭 중앙 카드와 동일한 카드 언어(화면 통일). */}
              <div
                className="flex-1 min-w-0 flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-hidden"
                style={{
                  margin: 12,
                  boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
                }}
              >
                <div className="flex-1 min-h-0 relative">
                  {/* key=bfIdx — 프로세스 전환 시 ELK 레이아웃·노드 선택 상태 리셋. */}
                  <BusinessFlowView
                    key={bfIdx}
                    domainId={activeDomainId}
                    biz={bizFlow}
                    rejectedReason={bizRejected}
                    title={bizProcesses[bfIdx]?.title ?? null}
                    domainName={domainNode?.name ?? null}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center px-8 text-center">
              <p className="text-text-secondary" style={{ fontSize: 13 }}>
                {t.flowList.businessEmpty}
              </p>
            </div>
          )}
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
        className="shrink-0 flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-hidden"
        style={{
          width: 300,
          margin: "12px 0 12px 12px",
          boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
        }}
      >
        {/* sidebar header — pmpl-proto .fl-list: 검색(.fl-search) + 필터 칩 + 접기 버튼 */}
        <div className="shrink-0" style={{ padding: "10px 10px 0" }}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <svg
                aria-hidden
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute text-text-muted pointer-events-none"
                style={{ left: 9, top: "50%", transform: "translateY(-50%)" }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.flowList.searchPlaceholder}
                aria-label={t.flowList.searchPlaceholder}
                className="w-full border border-border-medium bg-panel text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                style={{ fontSize: 12.5, padding: "6px 10px 6px 28px", borderRadius: 7 }}
              />
            </div>
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
          {/* 필터 칩 — pmpl-proto: "전체" 칩 상시 + 이 도메인에 실존하는 값만.
              그룹(버킷 2+일 때만)·메소드(2+)·verdict(2+). */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <FilterChip
                label={t.flowList.chipAll}
                active={!filterOn}
                onToggle={clearFilters}
              />
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
        <div className="flex-1 overflow-y-auto" style={{ padding: "6px 10px 12px" }}>
          {filtered.length === 0 ? (
            <p className="text-text-muted text-center" style={{ fontSize: 12, padding: "24px 8px" }}>
              {t.flowList.noMatches}
            </p>
          ) : (
            <div className="flex flex-col">
              {visibleItems.map((item) =>
                item.kind === "header" ? (
                  <button
                    key={`h:${item.sectionKey}`}
                    type="button"
                    onClick={() =>
                      toggleIn(collapsedGroups, item.sectionKey, setCollapsedGroups)
                    }
                    aria-expanded={!item.collapsed}
                    className="flex items-center gap-1.5 text-text-muted mt-2 first:mt-0 cursor-pointer hover:text-text-secondary transition-colors w-full text-left"
                    style={{ fontSize: 11, fontWeight: 700, padding: "4px 6px 2px" }}
                  >
                    <span aria-hidden style={{ fontSize: 8 }}>
                      {item.collapsed ? "▶" : "▼"}
                    </span>
                    <span>
                      {/* 서브그룹 섹션은 label 이 채워져 그대로 렌더, entryType 폴백은
                          label="" 이라 groupLabel(i18n) 로 해석한다. */}
                      {item.label || groupLabel[item.sectionKey as FlowGroupKey]}{" "}
                      <span className="tabular-nums">({item.count})</span>
                    </span>
                  </button>
                ) : (
                  (() => {
                    const flow = item.flow;
                    // 병합된 폼 흐름 선택 중에도 소속 행(처리 흐름)을 하이라이트.
                    const isFormSelected = flow.formFlow?.id === selectedFlowId;
                    const isSelected = flow.id === selectedFlowId || isFormSelected;
                    return (
                    /* pmpl-proto .fl-item — 단일행: [메소드] 이름 경로(mono, 인라인).
                       스텝 수는 title 툴팁으로 이동(밀도 우선), 검토필요만 배지 표시. */
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => setSelectedFlow(flow.id)}
                      title={`${flow.path} — ${t.flowList.stepCount.replace("{count}", String(flow.stepCount))}`}
                      className="flow-row flex items-center gap-2 text-left rounded-[7px] cursor-pointer transition-colors w-full hover:bg-elevated min-w-0"
                      style={{
                        padding: "7px 8px",
                        fontWeight: isSelected ? 600 : 400,
                        background: isSelected
                          ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                          : undefined,
                      }}
                    >
                        <MethodBadge method={flow.method} size="sm" />
                        {/* 경로는 행에서 제외 — 선택 시 중앙 헤더에 표시(중복 제거). */}
                        <span className="text-text-primary truncate" style={{ fontSize: 12.5 }}>
                          {flow.name}
                        </span>
                        {/* A안: 병합된 폼 진입 흐름 표식 — 클릭하면 폼 흐름의
                            스파인으로 전환(행 클릭과 분리, 중첩 button 금지라 span). */}
                        {flow.formFlow && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFlow(flow.formFlow!.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedFlow(flow.formFlow!.id);
                              }
                            }}
                            title={t.flowList.formIncludedHint.replace("{name}", flow.formFlow.name)}
                            className={`shrink-0 rounded cursor-pointer transition-colors ${
                              isFormSelected
                                ? "text-accent"
                                : "bg-elevated text-text-muted hover:text-accent"
                            }`}
                            style={{
                              fontSize: 10,
                              padding: "1px 5px",
                              fontWeight: 600,
                              background: isFormSelected
                                ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                                : undefined,
                            }}
                          >
                            {t.flowList.formIncluded}
                          </span>
                        )}
                        {flow.grounding?.verdict === "NEEDS_REVIEW" && (
                          <span className="ml-auto shrink-0">
                            <VerdictBadge verdict="NEEDS_REVIEW" />
                          </span>
                        )}
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
          right sidebar, which now appears only when a node is clicked).
          pmpl-proto .ws — 좌측 목록과 동일한 카드 언어(라운드+보더+그림자)로 감싸
          두 패널이 한 화면으로 읽히게 한다(그래프 자체는 기존 그대로). */}
      <div
        className="flex-1 min-w-0 flex flex-col rounded-[10px] border border-border-subtle bg-panel overflow-hidden"
        style={{
          margin: 12,
          boxShadow: "0 1px 2px rgba(26,27,31,.04), 0 1px 3px rgba(26,27,31,.06)",
        }}
      >
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
