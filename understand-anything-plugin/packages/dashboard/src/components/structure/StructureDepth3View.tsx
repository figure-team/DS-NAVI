import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import { useI18n } from "../../contexts/I18nContext";
import { buildDomainFlows, domainIcon, findDomain, parseDomainClaims } from "../../utils/domainData";
import { parseBusinessFlows } from "../../utils/businessFlow";
import GroundedBar from "../GroundedBar";

/**
 * 뎁스3 — 선택 서브도메인 + 업무 프로세스(businessFlows[]) 제목 카드(설계 §4).
 * 카드 클릭 = 뎁스4(`&bf=<index>`). 프로세스가 전무해도 이 도메인에 기능(flow)이
 * 있으면 결정론 순차 근사 1건으로 진입 가능하게 한다(FlowListView 의 폴백 관례와
 * 동일 — "미채움"과 "그릴 것이 아예 없음"을 구분).
 */
export default function StructureDepth3View({ domainId }: { domainId: string }) {
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const navigate = useNavigate();
  const { t } = useI18n();

  const domainNode = useMemo(
    () => (domainGraph ? findDomain(domainGraph, domainId) : undefined),
    [domainGraph, domainId],
  );
  const grounding = useMemo(() => (domainNode ? parseDomainClaims(domainNode) : null), [domainNode]);
  const processes = useMemo(() => parseBusinessFlows(domainNode), [domainNode]);
  const hasAnyFlow = useMemo(
    () => (domainGraph ? buildDomainFlows(domainGraph, domainId).length > 0 : false),
    [domainGraph, domainId],
  );

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
      <header className="shrink-0 border-b border-border-subtle bg-panel" style={{ padding: "16px 24px" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
            {domainIcon(domainNode.name, domainNode.id)}
          </span>
          <h1 className="text-text-primary font-bold truncate" style={{ fontSize: 20 }}>
            {domainNode.name}
          </h1>
          {grounding?.filled && grounding.groundedPct !== null && (
            <div className="ml-auto shrink-0" style={{ width: 170 }}>
              <GroundedBar pct={grounding.groundedPct} grounded={grounding.groundedCount} review={grounding.reviewCount} />
            </div>
          )}
        </div>
        {domainNode.summary && (
          <p className="text-text-muted" style={{ fontSize: 13, marginTop: 6 }}>
            {domainNode.summary}
          </p>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 20 }}>
        {processes.length > 0 ? (
          <div className="grid" style={{ gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {processes.map((p) => (
              <button
                key={p.index}
                type="button"
                onClick={() => openBf(p.index)}
                className="text-left rounded-[10px] border border-border-subtle bg-panel hover:border-accent cursor-pointer transition-colors"
                style={{ padding: "14px 16px" }}
              >
                <span className="text-text-primary font-semibold" style={{ fontSize: 13.5 }}>
                  {p.title ?? t.flowList.bizProcessDefault.replace("{n}", String(p.index + 1))}
                </span>
                <p className="text-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {t.structure.bfNodeCount.replace("{count}", String(p.flow.nodes.length))}
                </p>
              </button>
            ))}
          </div>
        ) : hasAnyFlow ? (
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
    </div>
  );
}
