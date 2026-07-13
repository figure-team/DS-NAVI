import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainFlows, findDomain } from "../../utils/domainData";
import {
  buildSequentialFallback,
  businessFlowRejectedReason,
  parseBusinessFlows,
} from "../../utils/businessFlow";
import BusinessFlowView from "../BusinessFlowView";
import FlowSpineView from "../FlowSpineView";

/**
 * 뎁스4 — 업무 순서도(BusinessFlowView, 신규 렌더러 0개) + flowRef 배지 클릭 시
 * 기능흐름도(FlowSpineView) 병렬 패널(설계 §4). BusinessFlowView 는 그대로 재사용
 * 하되(내부 openFlow 는 `?flow=` 를 세팅할 뿐 — `view=code` 는 이 페이지에 없는
 * 개념이라 무시), 이 뷰가 `?flow=` 존재를 감지해 옆에 스파인을 띄운다.
 */
export default function StructureDepth4View({ domainId, bf }: { domainId: string; bf: number }) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const domainNode = useMemo(
    () => (domainGraph ? findDomain(domainGraph, domainId) : undefined),
    [domainGraph, domainId],
  );
  const flows = useMemo(
    () => (domainGraph ? buildDomainFlows(domainGraph, domainId) : []),
    [domainGraph, domainId],
  );
  const bizProcesses = useMemo(() => parseBusinessFlows(domainNode), [domainNode]);
  const bfIdx = Math.min(Math.max(bf, 0), Math.max(bizProcesses.length - 1, 0));
  const bizFlow = useMemo(() => {
    const proc = bizProcesses[bfIdx];
    if (proc) return proc.flow;
    return flows.length > 0
      ? buildSequentialFallback(flows, { start: t.flowList.bfStart, end: t.flowList.bfEnd, more: t.flowList.bfMore })
      : null;
  }, [bizProcesses, bfIdx, flows, t]);
  const rejected = useMemo(() => businessFlowRejectedReason(domainNode), [domainNode]);

  const flowRef = searchParams.get("flow");
  const closeSpine = () => {
    const p = new URLSearchParams(window.location.search);
    p.delete("flow");
    p.delete("view");
    setSearchParams(p, { replace: true });
  };

  if (!domainGraph || !domainNode || !bizFlow) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm px-6 text-center">
        {t.flowList.businessEmpty}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 border-b border-border-subtle bg-panel" style={{ padding: "8px 20px" }}>
        <button
          type="button"
          onClick={() => navigate(`/structure?domain=${encodeURIComponent(domainId)}`)}
          className="text-text-muted hover:text-accent transition-colors cursor-pointer font-semibold"
          style={{ fontSize: 12 }}
        >
          ← {t.structure.backToProcessList}
        </button>
        <span className="text-text-primary font-semibold truncate" style={{ fontSize: 13 }}>
          {bizProcesses[bfIdx]?.title ?? t.flowList.bizProcessDefault.replace("{n}", String(bfIdx + 1))}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          <BusinessFlowView
            key={bfIdx}
            domainId={domainId}
            biz={bizFlow}
            rejectedReason={rejected}
            title={bizProcesses[bfIdx]?.title ?? null}
            domainName={domainNode.name}
          />
        </div>
        {flowRef && (
          <div className="shrink-0 flex flex-col border-l border-border-subtle bg-surface" style={{ width: "42%", minWidth: 360 }}>
            <div className="shrink-0 flex items-center gap-2 border-b border-border-subtle" style={{ padding: "8px 14px" }}>
              <span className="text-text-secondary font-semibold" style={{ fontSize: 12 }}>
                {t.structure.relatedFlowSpine}
              </span>
              <button
                type="button"
                onClick={closeSpine}
                aria-label={t.structure.evidenceClose}
                className="ml-auto shrink-0 flex items-center justify-center rounded text-text-muted hover:text-accent transition-colors cursor-pointer"
                style={{ width: 20, height: 20, fontSize: 12, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <FlowSpineView flowId={flowRef} hideBack />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
