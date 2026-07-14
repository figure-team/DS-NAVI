import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainCards } from "../../utils/domainData";
import type { ResolvedGroup } from "../../utils/domainGroups";
import {
  filterEdgesAmong,
  markFor,
  type CrossDomainEdge,
  type MergedStructureEdge,
} from "../../utils/structureGraph";
import StructureDomainGraphUA, { type DomainStyleGraphNode } from "./StructureDomainGraphUA";
import EdgeEvidencePanel from "./EdgeEvidencePanel";

/**
 * 뎁스2 — 선택 그룹 + 서브도메인 그래프, U-A Domain 탭 룩앤필(택1 확정).
 * `group === null` 은 groups 없는 프로젝트의 전체 도메인 그래프(확정 ③ 폴백,
 * 뎁스1 건너뛰기).
 */
export default function StructureDepth2View({
  group,
  crossDomainEdges,
  changedDomainIds,
  affectedDomainIds,
}: {
  group: ResolvedGroup | null;
  crossDomainEdges: CrossDomainEdge[] | null;
  changedDomainIds: Set<string>;
  affectedDomainIds: Set<string>;
}) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [selectedEdge, setSelectedEdge] = useState<MergedStructureEdge | null>(null);

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

  const nameById = useMemo(() => new Map(cards.map((c) => [c.id, c.name])), [cards]);

  // 그래프형(U-A) — 원본 Domain 탭 카드(DomainClusterNode) 그대로: 요약=도메인 설명,
  // 칩=엔티티, 하단=기능 수(+근거율). 임팩트는 테두리 글로우(개수 칩은 뎁스1 전용).
  const uaNodes = useMemo<DomainStyleGraphNode[]>(
    () =>
      cards.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        summary: c.desc,
        // 채움(fill) 산출물의 엔티티는 "이름 — 설명" 프로즈일 수 있다 — 칩에는 이름만.
        chips: c.entities.map((e) => e.split(" — ")[0]),
        chipsLabel: t.nodeInfo.entities,
        footer: `${t.domainMap.flowCount.replace("{count}", String(c.flowCount))}${
          c.filled && c.groundedPct !== null ? ` · ${t.grounding.rate} ${c.groundedPct}%` : ""
        }`,
        impact: markFor(c.id, changedDomainIds, affectedDomainIds),
        diffChangedCount: 0,
        diffAffectedCount: 0,
      })),
    [cards, changedDomainIds, affectedDomainIds, t],
  );

  const onOpenNode = (id: string) => {
    navigate(`/structure?domain=${encodeURIComponent(id)}`);
  };
  const emptyLabel = crossDomainEdges === null ? t.structure.crossDomainUnavailable : t.structure.noCrossGroupEdges;

  return (
    <div className="h-full w-full relative">
      <StructureDomainGraphUA
        nodes={uaNodes}
        edges={edges}
        emptyLabel={emptyLabel}
        onOpenNode={onOpenNode}
        onEdgeClick={(edge) => setSelectedEdge(edge)}
      />
      {selectedEdge && (
        <EdgeEvidencePanel
          edge={selectedEdge}
          labelOf={(id) => nameById.get(id) ?? id}
          onClose={() => setSelectedEdge(null)}
        />
      )}
    </div>
  );
}
