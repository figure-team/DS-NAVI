import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainCards } from "../../utils/domainData";
import { buildGroupCards, type ResolvedGroup } from "../../utils/domainGroups";
import {
  aggregateGroupEdges,
  groupImpactMark,
  type CrossDomainEdge,
  type MergedStructureEdge,
} from "../../utils/structureGraph";
import StructureDomainGraphUA, { type DomainStyleGraphNode } from "./StructureDomainGraphUA";
import EdgeEvidencePanel from "./EdgeEvidencePanel";
import NodeInfoPanel from "./NodeInfoPanel";

/** 뎁스1 — 상단도메인(그룹) 그래프(설계 §3·§4), U-A Domain 탭 룩앤필(택1 확정). */
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
  const [selectedEdge, setSelectedEdge] = useState<MergedStructureEdge | null>(null);
  const [selectedNode, setSelectedNode] = useState<DomainStyleGraphNode | null>(null);

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
    navigate(`/structure?group=${encodeURIComponent(id)}`);
  };
  const emptyLabel = crossDomainEdges === null ? t.structure.crossDomainUnavailable : t.structure.noCrossGroupEdges;

  return (
    // relative 없음 — 아래 도킹 패널은 StructurePage 의 "탭 헤더+본문" 박스를 기준으로
    // 삼아 탭 헤더까지 덮는다(사용자 요청). 그래프는 자체 relative 를 갖고 있어 무관.
    <div className="h-full w-full">
      <StructureDomainGraphUA
        nodes={uaNodes}
        edges={groupEdges}
        emptyLabel={emptyLabel}
        onOpenNode={onOpenNode}
        onSelectNode={(id) => {
          setSelectedEdge(null);
          setSelectedNode(uaNodes.find((n) => n.id === id) ?? null);
        }}
        onEdgeClick={(edge) => {
          setSelectedNode(null);
          setSelectedEdge(edge);
        }}
        selectedNodeId={selectedNode?.id ?? null}
      />
      {selectedEdge && (
        <EdgeEvidencePanel
          edge={selectedEdge}
          labelOf={(id) => nameByKey.get(id) ?? id}
          onClose={() => setSelectedEdge(null)}
        />
      )}
      {selectedNode && <NodeInfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  );
}
