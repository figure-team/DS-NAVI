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
} from "../../utils/structureGraph";
import StructureNetworkGraph, { type StructureGraphNode } from "./StructureNetworkGraph";
import EdgeEvidencePopover from "./EdgeEvidencePopover";

/** 뎁스1 — 상단도메인(그룹) 그래프(설계 §3·§4). */
export default function StructureDepth1View({
  groups,
  crossDomainEdges,
  changedDomainIds,
  affectedDomainIds,
}: {
  groups: ResolvedGroup[];
  crossDomainEdges: CrossDomainEdge[] | null;
  changedDomainIds: Set<string>;
  affectedDomainIds: Set<string>;
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
    [groupCards, groups, changedDomainIds, affectedDomainIds],
  );

  const nameByKey = useMemo(() => new Map(groupCards.map((g) => [g.key, g.name])), [groupCards]);

  return (
    <div className="h-full w-full relative">
      <StructureNetworkGraph
        nodes={nodes}
        edges={groupEdges}
        emptyLabel={crossDomainEdges === null ? t.structure.crossDomainUnavailable : t.structure.noCrossGroupEdges}
        onOpenNode={(id) => navigate(`/structure?group=${encodeURIComponent(id)}`)}
        onEdgeClick={(edge, point) => setPopover({ edge, point })}
      />
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
