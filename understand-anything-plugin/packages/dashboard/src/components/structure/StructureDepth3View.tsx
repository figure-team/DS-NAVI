import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainFlows, findDomain } from "../../utils/domainData";
import { parseBusinessFlows } from "../../utils/businessFlow";
import {
  buildFlowFileMap,
  deriveProcessSharedFileEdges,
  type AggregatedEdge,
  type MergedStructureEdge,
} from "../../utils/structureGraph";
import StructureDomainGraphUA, { type DomainStyleGraphNode } from "./StructureDomainGraphUA";
import EdgeEvidencePanel from "./EdgeEvidencePanel";
import NodeInfoPanel from "./NodeInfoPanel";

/**
 * 뎁스3 — 선택 서브도메인 + 업무 프로세스(businessFlows[]) 그래프(설계 §4, 사용자
 * 요청으로 제목 카드 그리드 → 뎁스1·2와 같은 연결 그래프로 승격). 노드 = 업무
 * 프로세스 카드(활동 요약 + 참조 기능 칩), 엣지 = 두 프로세스가 같은 파일을 만질 때
 * (공유 파일 수 = weight, 클릭 = 근거 팝오버 — deriveProcessSharedFileEdges).
 * 카드 클릭 = 뎁스4(`&bf=<index>`). 프로세스가 전무해도 이 도메인에 기능(flow)이
 * 있으면 결정론 순차 근사 1건으로 진입 가능하게 한다(FlowListView 의 폴백 관례와
 * 동일 — "미채움"과 "그릴 것이 아예 없음"을 구분).
 */
export default function StructureDepth3View({ domainId }: { domainId: string }) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [selectedEdge, setSelectedEdge] = useState<MergedStructureEdge | null>(null);
  const [selectedNode, setSelectedNode] = useState<DomainStyleGraphNode | null>(null);

  const domainNode = useMemo(
    () => (domainGraph ? findDomain(domainGraph, domainId) : undefined),
    [domainGraph, domainId],
  );
  const processes = useMemo(() => parseBusinessFlows(domainNode), [domainNode]);
  const hasAnyFlow = useMemo(
    () => (domainGraph ? buildDomainFlows(domainGraph, domainId).length > 0 : false),
    [domainGraph, domainId],
  );

  const flowNameById = useMemo(
    () => new Map((domainGraph?.nodes ?? []).filter((n) => n.type === "flow").map((n) => [n.id, n.name])),
    [domainGraph],
  );

  const processTitle = (index: number) =>
    processes.find((p) => p.index === index)?.title ??
    t.flowList.bizProcessDefault.replace("{n}", String(index + 1));

  // 그래프 노드 — 카드 본문은 활동 체인 요약, 칩은 참조 기능(코드 근거의 축).
  const uaNodes = useMemo<DomainStyleGraphNode[]>(
    () =>
      processes.map((p) => {
        const activities = p.flow.nodes.filter((n) => n.kind === "activity" || n.kind === "decision");
        const flowRefs = [...new Set(p.flow.nodes.map((n) => n.flowRef).filter((r): r is string => !!r))];
        return {
          id: `bf:${p.index}`,
          name: p.title ?? t.flowList.bizProcessDefault.replace("{n}", String(p.index + 1)),
          icon: "",
          summary: activities.map((n) => n.label).join(" → "),
          chips: flowRefs.map((r) => flowNameById.get(r) ?? r),
          chipsLabel: t.nodeInfo.flows,
          footer: t.structure.bfNodeCount.replace("{count}", String(p.flow.nodes.length)),
          impact: null,
          diffChangedCount: 0,
          diffAffectedCount: 0,
        };
      }),
    [processes, flowNameById, t],
  );

  // 프로세스 간 엣지 — 공유 파일(citations + flowRef→기능·스텝 파일) 결정론 도출.
  const uaEdges = useMemo<AggregatedEdge[]>(() => {
    if (!domainGraph || processes.length < 2) return [];
    const fileMap = buildFlowFileMap(domainGraph.nodes, domainGraph.edges);
    return deriveProcessSharedFileEdges(
      processes.map((p) => ({
        id: `bf:${p.index}`,
        flowRefs: p.flow.nodes.map((n) => n.flowRef).filter((r): r is string => !!r),
        citationFiles: p.flow.nodes.flatMap((n) => n.citations.map((c) => c.filePath)),
      })),
      fileMap,
    );
  }, [domainGraph, processes]);

  if (!domainGraph || !domainNode) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {t.domainMap.empty}
      </div>
    );
  }

  const openBf = (index: number) => navigate(`/structure?domain=${encodeURIComponent(domainId)}&bf=${index}`);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {processes.length > 0 ? (
        <div className="flex-1 min-h-0 relative">
          <StructureDomainGraphUA
            nodes={uaNodes}
            edges={uaEdges}
            emptyLabel={t.flowList.businessEmpty}
            onOpenNode={(id) => openBf(Number(id.slice(3)))}
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
              labelOf={(id) => processTitle(Number(id.slice(3)))}
              onClose={() => setSelectedEdge(null)}
            />
          )}
          {selectedNode && <NodeInfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 20 }}>
          {hasAnyFlow ? (
            <button
              type="button"
              onClick={() => openBf(0)}
              className="text-left rounded-[10px] border border-border-subtle bg-panel hover:border-accent cursor-pointer transition-colors"
              style={{ padding: "14px 16px", maxWidth: 320 }}
            >
              <span className="text-text-primary font-semibold" style={{ fontSize: 13.5 }}>
                {t.structure.sequentialFallbackCard}
              </span>
              <p className="text-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {t.flowList.businessFallbackBanner}
              </p>
            </button>
          ) : (
            <p className="text-text-muted" style={{ fontSize: 13 }}>{t.flowList.businessEmpty}</p>
          )}
        </div>
      )}
    </div>
  );
}
