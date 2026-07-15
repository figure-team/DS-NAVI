import { useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { useCrossDomainGraph } from "../../hooks/useCrossDomainGraph";
import { findOwningGroup, resolveGroups } from "../../utils/domainGroups";
import { findDomain } from "../../utils/domainData";
import { parseBusinessFlows } from "../../utils/businessFlow";
import {
  buildFileToDomainId,
  mapImpactToDomains,
  resolveStructureRoute,
} from "../../utils/structureGraph";
import StructureBreadcrumb, { type StructureCrumb } from "./StructureBreadcrumb";
import StructureDepth1View from "./StructureDepth1View";
import StructureDepth2View from "./StructureDepth2View";
import StructureDepth3View from "./StructureDepth3View";
import StructureDepth4View from "./StructureDepth4View";

/**
 * 구조 탭 본문 (STRUCTURE_FROM_MAP_DESIGN v2) — 업무 지도 메뉴의 「구조」탭.
 * 라우트 통일(2026-07-15): 구조는 별도 라우트 `/structure` 가 아니라 업무 지도와
 * 같은 `/domains?tab=structure` 로 산다(다른 메뉴처럼 1라우트+쿼리 탭). 셸(WorkMapTabs·
 * 정보 팝오버)은 DomainsPage 가 소유하고, 이 컴포넌트는 탭 본문(브레드크럼+뎁스 뷰)만 낸다.
 *
 * 도메인 계층 4뎁스 드릴다운. URL이 진실:
 *   ?tab=structure                          → 뎁스1 (그룹 그래프, groups 없으면 뎁스2로 폴백)
 *   ?tab=structure&group=g:common           → 뎁스2 (그룹+서브도메인)
 *   ?tab=structure&domain=domain:com        → 뎁스3 (서브도메인+업무흐름도 목록)
 *   ?tab=structure&domain=…&bf=<fillIndex>  → 뎁스4 (업무흐름도+기능흐름도)
 * 구 딥링크 `?node=&level=`(KG 뷰 전용)은 무조건 뎁스1로 폴백(overlay는 보존).
 */
export default function StructureTab() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const domainGroupsRaw = useDashboardStore((s) => s.domainGroups);
  const diffMode = useDashboardStore((s) => s.diffMode);
  const overlaySource = useDashboardStore((s) => s.overlaySource);
  const changedNodeIds = useDashboardStore((s) => s.changedNodeIds);
  const affectedNodeIds = useDashboardStore((s) => s.affectedNodeIds);
  const crossDomainEdges = useCrossDomainGraph();

  useOverlayParam();

  const resolvedGroups = useMemo(
    () => (domainGraph ? resolveGroups(domainGraph, domainGroupsRaw, t.domainMap.unclassified) : []),
    [domainGraph, domainGroupsRaw, t],
  );
  const domainIds = useMemo(
    () => new Set((domainGraph?.nodes ?? []).filter((n) => n.type === "domain").map((n) => n.id)),
    [domainGraph],
  );

  const route = useMemo(
    () =>
      resolveStructureRoute(
        {
          group: searchParams.get("group"),
          domain: searchParams.get("domain"),
          bf: searchParams.get("bf"),
          node: searchParams.get("node"),
          level: searchParams.get("level"),
        },
        resolvedGroups,
        domainIds,
      ),
    [searchParams, resolvedGroups, domainIds],
  );

  useEffect(() => {
    // domainGraph 로딩 전(첫 마운트)엔 resolvedGroups/domainIds 가 항상 빈 값이라
    // 어떤 group=/domain= 도 "존재하지 않음"으로 오판된다 — 데이터 도착 전 성급한
    // 리다이렉트가 파라미터를 영구히(replace) 지워버리는 것을 막는다.
    if (!domainGraph) return;
    if (route.kind !== "redirect") return;
    // route.to 는 이미 "/domains?tab=structure" — overlay 는 뎁스와 무관한 별개 관례라 보존.
    const overlay = searchParams.get("overlay");
    navigate(route.to + (overlay ? `&overlay=${encodeURIComponent(overlay)}` : ""), { replace: true });
  }, [route, navigate, searchParams, domainGraph]);

  // 임팩트 오버레이(파일/설정 단위)를 도메인 id로 번역 — 뎁스1~3 노드 하이라이트 재이식(§6).
  const fileToDomainId = useMemo(
    () => (domainGraph ? buildFileToDomainId(domainGraph.nodes) : new Map<string, Set<string>>()),
    [domainGraph],
  );
  const showImpact = diffMode && overlaySource === "impact";
  const changedDomainIds = useMemo(
    () => (showImpact ? mapImpactToDomains(fileToDomainId, changedNodeIds) : new Set<string>()),
    [showImpact, fileToDomainId, changedNodeIds],
  );
  const affectedDomainIds = useMemo(
    () => (showImpact ? mapImpactToDomains(fileToDomainId, affectedNodeIds) : new Set<string>()),
    [showImpact, fileToDomainId, affectedNodeIds],
  );

  const crumbs = useMemo<StructureCrumb[]>(() => {
    const root: StructureCrumb = {
      label: t.structure.root,
      href: route.kind === "depth1" ? null : "/domains?tab=structure",
    };
    if (route.kind === "depth1") return [{ ...root, href: null }];
    if (route.kind === "depth2") {
      if (!route.group) return [{ ...root, href: null }];
      return [root, { label: route.group.name, href: null }];
    }
    if (route.kind === "depth3" || route.kind === "depth4") {
      const domainNode = domainGraph ? findDomain(domainGraph, route.domainId) : undefined;
      const owning = findOwningGroup(resolvedGroups, route.domainId);
      const list: StructureCrumb[] = [root];
      if (owning) {
        list.push({
          label: owning.name,
          href: `/domains?tab=structure&group=${encodeURIComponent(owning.key)}`,
        });
      }
      if (route.kind === "depth3") {
        list.push({ label: domainNode?.name ?? route.domainId, href: null });
      } else {
        list.push({
          label: domainNode?.name ?? route.domainId,
          href: `/domains?tab=structure&domain=${encodeURIComponent(route.domainId)}`,
        });
        const procs = domainNode ? parseBusinessFlows(domainNode) : [];
        const title = procs[route.bf]?.title ?? t.flowList.bizProcessDefault.replace("{n}", String(route.bf + 1));
        list.push({ label: title, href: null });
      }
      return list;
    }
    return [root];
  }, [route, domainGraph, resolvedGroups, t]);

  if (!domainGraph) {
    return (
      <div className="h-full w-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {t.domainMap.empty}
      </div>
    );
  }

  return (
    // 탭 헤더 + 본문을 한 relative 박스로 — 노드/엣지 클릭 시 뜨는 우측 도킹 패널
    // (NodeInfoPanel·EdgeEvidencePanel)이 이 박스 기준 inset-y-0 이라 탭 헤더까지 덮는다.
    <div className="flex-1 min-h-0 flex flex-col relative">
      <StructureBreadcrumb crumbs={crumbs} />
      <div className="flex-1 min-h-0">
        {route.kind === "depth1" && (
          <StructureDepth1View
            groups={resolvedGroups}
            crossDomainEdges={crossDomainEdges ?? null}
            changedDomainIds={changedDomainIds}
            affectedDomainIds={affectedDomainIds}
          />
        )}
        {route.kind === "depth2" && (
          <StructureDepth2View
            group={route.group}
            crossDomainEdges={crossDomainEdges ?? null}
            changedDomainIds={changedDomainIds}
            affectedDomainIds={affectedDomainIds}
          />
        )}
        {route.kind === "depth3" && <StructureDepth3View domainId={route.domainId} />}
        {route.kind === "depth4" && <StructureDepth4View domainId={route.domainId} bf={route.bf} />}
      </div>
    </div>
  );
}

/**
 * ktds: ?overlay=risk|diff|impact — 다른 화면(품질·위험 등)에서 딥링크로 특정 오버레이를
 * 켠 채 진입. 채널 데이터가 비동기 적재되므로 데이터 도착을 기다렸다가 1회 활성 후
 * 파라미터를 제거한다(원샷). 뎁스와 무관하게 항상 유효.
 */
function useOverlayParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const diffData = useDashboardStore((s) => s.diffOverlayData);
  const impactData = useDashboardStore((s) => s.impactOverlayData);
  const riskData = useDashboardStore((s) => s.riskOverlayData);

  useEffect(() => {
    const want = searchParams.get("overlay");
    if (want !== "risk" && want !== "diff" && want !== "impact") return;
    const data = want === "risk" ? riskData : want === "diff" ? diffData : impactData;
    if (!data || data.changed.length === 0) return; // 데이터 도착 대기(부재 시 no-op — 정직).
    const s = useDashboardStore.getState();
    if (!(s.overlaySource === want && s.diffMode)) s.toggleOverlay(want);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("overlay");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, diffData, impactData, riskData, setSearchParams]);
}
