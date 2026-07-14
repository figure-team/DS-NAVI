import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainCards } from "../../utils/domainData";
import { buildGroupCards, type ResolvedGroup } from "../../utils/domainGroups";
import {
  aggregateGroupEdges,
  groupImpactMark,
  type AggregatedEdge,
  type CrossDomainEdge,
  type StructureRenderer,
} from "../../utils/structureGraph";
import StructureNetworkGraph, { type StructureGraphNode } from "./StructureNetworkGraph";
import StructureDomainGraphUA, { type DomainStyleGraphNode } from "./StructureDomainGraphUA";
import EdgeEvidencePopover from "./EdgeEvidencePopover";

/** 뎁스1 — 상단도메인(그룹) 그래프(설계 §3·§4). */
export default function StructureDepth1View({
  groups,
  crossDomainEdges,
  changedDomainIds,
  affectedDomainIds,
  renderer,
}: {
  groups: ResolvedGroup[];
  crossDomainEdges: CrossDomainEdge[] | null;
  changedDomainIds: Set<string>;
  affectedDomainIds: Set<string>;
  /** `?renderer=` 탭 — 카드형(기본)/그래프형(U-A). 뎁스1·2 전환 시 URL에 유지된다. */
  renderer: StructureRenderer;
}) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [popover, setPopover] = useState<{ edge: AggregatedEdge; point: { x: number; y: number } } | null>(null);

  const groupCards = useMemo(() => {
    if (!domainGraph) return [];
    const { cards } = buildDomainCards(domainGraph);
    const workCountByDomain = new Map<string, number>(); // 뎁스1은 업무 지도 위계와 무관 — 0으로 두고 flowCount만 표기.
    return buildGroupCards(groups, cards, workCountByDomain);
  }, [groups, domainGraph]);

  const groupEdges = useMemo(
    () => (crossDomainEdges ? aggregateGroupEdges(groups, crossDomainEdges) : []),
    [groups, crossDomainEdges],
  );

  const nodes = useMemo<StructureGraphNode[]>(
    () =>
      groupCards.map((g) => ({
        id: g.key,
        name: g.name,
        icon: g.icon,
        color: g.color,
        statLine: `${t.domainMap.subDomainCount.replace("{count}", String(g.subDomainCount))} · ${t.domainMap.flowCount.replace("{count}", String(g.flowCount))}`,
        groundedPct: g.filled ? g.groundedPct : null,
        groundedCount: g.groundedCount,
        reviewCount: g.reviewCount,
        impact: groupImpactMark(groups.find((r) => r.key === g.key)!, changedDomainIds, affectedDomainIds),
      })),
    [groupCards, groups, changedDomainIds, affectedDomainIds, t],
  );

  const nameByKey = useMemo(() => new Map(groupCards.map((g) => [g.key, g.name])), [groupCards]);

  // 그래프형(U-A) — 원본 Domain 탭 카드(DomainClusterNode)에 맞춘 데이터: 요약=집계
  // 한 줄, 칩=소속 서브도메인(원본의 Entities 자리), diff 칩=그룹당 changed/affected
  // "개수"(단일 ImpactMark 보다 정보량이 많다 — DomainClusterNode ktds-fork 와 동일 형식).
  const uaNodes = useMemo<DomainStyleGraphNode[]>(
    () =>
      groupCards.map((g) => {
        const group = groups.find((r) => r.key === g.key)!;
        return {
          id: g.key,
          name: g.name,
          icon: g.icon,
          summary: `${t.domainMap.subDomainCount.replace("{count}", String(g.subDomainCount))} · ${t.domainMap.flowCount.replace("{count}", String(g.flowCount))}`,
          chips: g.allMemberChips.map((c) => c.name),
          chipsLabel: t.structure.chipSubDomains,
          footer: g.filled && g.groundedPct !== null ? `${t.grounding.rate} ${g.groundedPct}%` : "",
          impact: groupImpactMark(group, changedDomainIds, affectedDomainIds),
          diffChangedCount: group.memberDomainIds.filter((id) => changedDomainIds.has(id)).length,
          diffAffectedCount: group.memberDomainIds.filter((id) => affectedDomainIds.has(id)).length,
        };
      }),
    [groupCards, groups, changedDomainIds, affectedDomainIds, t],
  );

  const onOpenNode = (id: string) => {
    const suffix = renderer === "ua" ? "&renderer=ua" : "";
    navigate(`/structure?group=${encodeURIComponent(id)}${suffix}`);
  };
  const emptyLabel = crossDomainEdges === null ? t.structure.crossDomainUnavailable : t.structure.noCrossGroupEdges;

  return (
    <div className="h-full w-full relative">
      {renderer === "ua" ? (
        <StructureDomainGraphUA
          nodes={uaNodes}
          edges={groupEdges}
          emptyLabel={emptyLabel}
          onOpenNode={onOpenNode}
          onEdgeClick={(edge, point) => setPopover({ edge, point })}
        />
      ) : (
        <StructureNetworkGraph
          nodes={nodes}
          edges={groupEdges}
          emptyLabel={emptyLabel}
          onOpenNode={onOpenNode}
          onEdgeClick={(edge, point) => setPopover({ edge, point })}
        />
      )}
      {popover && (
        <EdgeEvidencePopover
          edge={popover.edge}
          anchor={popover.point}
          fromLabel={nameByKey.get(popover.edge.from) ?? popover.edge.from}
          toLabel={nameByKey.get(popover.edge.to) ?? popover.edge.to}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
