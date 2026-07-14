import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainCards } from "../../utils/domainData";
import type { ResolvedGroup } from "../../utils/domainGroups";
import {
  filterEdgesAmong,
  markFor,
  type AggregatedEdge,
  type CrossDomainEdge,
  type StructureRenderer,
} from "../../utils/structureGraph";
import StructureNetworkGraph, { type StructureGraphNode } from "./StructureNetworkGraph";
import StructureContainerGraphUA from "./StructureContainerGraphUA";
import EdgeEvidencePopover from "./EdgeEvidencePopover";

/**
 * 뎁스2 — 선택 그룹 + 서브도메인 그래프. `group === null` 은 groups 없는 프로젝트의
 * 전체 도메인 그래프(확정 ③ 폴백, 뎁스1 건너뛰기).
 */
export default function StructureDepth2View({
  group,
  crossDomainEdges,
  changedDomainIds,
  affectedDomainIds,
  renderer,
}: {
  group: ResolvedGroup | null;
  crossDomainEdges: CrossDomainEdge[] | null;
  changedDomainIds: Set<string>;
  affectedDomainIds: Set<string>;
  /** `?renderer=` 탭 — 카드형(기본)/그래프형(U-A). 뎁스3 은 무관하지만 브레드크럼으로
   * 돌아왔을 때 탭이 복원되도록 드릴다운 URL 에도 그대로 실어 보낸다. */
  renderer: StructureRenderer;
}) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [popover, setPopover] = useState<{ edge: AggregatedEdge; point: { x: number; y: number } } | null>(null);

  const cards = useMemo(() => {
    if (!domainGraph) return [];
    const { cards: all } = buildDomainCards(domainGraph);
    if (!group) return all;
    const order = new Map(group.memberDomainIds.map((id, i) => [id, i]));
    return all.filter((c) => order.has(c.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }, [domainGraph, group]);

  const domainIds = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);

  const edges = useMemo(
    () => (crossDomainEdges ? filterEdgesAmong(domainIds, crossDomainEdges) : []),
    [domainIds, crossDomainEdges],
  );

  const nodes = useMemo<StructureGraphNode[]>(
    () =>
      cards.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        statLine: t.domainMap.flowCount.replace("{count}", String(c.flowCount)),
        groundedPct: c.filled ? c.groundedPct : null,
        groundedCount: c.groundedCount,
        reviewCount: c.reviewCount,
        impact: markFor(c.id, changedDomainIds, affectedDomainIds),
      })),
    [cards, changedDomainIds, affectedDomainIds, t],
  );

  const nameById = useMemo(() => new Map(cards.map((c) => [c.id, c.name])), [cards]);

  const onOpenNode = (id: string) => {
    const suffix = renderer === "ua" ? "&renderer=ua" : "";
    navigate(`/structure?domain=${encodeURIComponent(id)}${suffix}`);
  };
  const emptyLabel = crossDomainEdges === null ? t.structure.crossDomainUnavailable : t.structure.noCrossGroupEdges;

  return (
    <div className="h-full w-full relative">
      {renderer === "ua" ? (
        <StructureContainerGraphUA
          groupKey={group?.key ?? null}
          groupName={group?.name ?? null}
          nodes={nodes}
          edges={edges}
          emptyLabel={emptyLabel}
          onOpenNode={onOpenNode}
          onEdgeClick={(edge, point) => setPopover({ edge, point })}
        />
      ) : (
        <StructureNetworkGraph
          nodes={nodes}
          edges={edges}
          emptyLabel={emptyLabel}
          onOpenNode={onOpenNode}
          onEdgeClick={(edge, point) => setPopover({ edge, point })}
        />
      )}
      {popover && (
        <EdgeEvidencePopover
          edge={popover.edge}
          anchor={popover.point}
          fromLabel={nameById.get(popover.edge.from) ?? popover.edge.from}
          toLabel={nameById.get(popover.edge.to) ?? popover.edge.to}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
