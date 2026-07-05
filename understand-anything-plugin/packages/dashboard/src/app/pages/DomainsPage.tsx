import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router";
import { useDashboardStore } from "../../store";
import DomainMapView from "../../components/DomainMapView"; // ktds-fork: 도메인 지도 (화면 1)
import FlowListView from "../../components/FlowListView"; // ktds-fork: 기능 목록 + 인라인 스파인 (화면 2)

/**
 * 도메인 섹션 — 완전 독립 풀페이지 (ktds-fork).
 * P3: URL이 진실 — /domains(지도) ↔ /domains/:domainId(흐름 목록), 인라인 스파인
 * 선택은 ?flow=. 뷰들의 전환 버튼은 navigate()로 재배선됐고, 여기서는 URL→store
 * 단방향 동기화만 한다(뷰 내부 읽기는 기존 store 필드 그대로).
 */
export default function DomainsPage() {
  const { domainId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const selectedFlowId = useDashboardStore((s) => s.selectedFlowId);

  // URL(:domainId) → store — 기존 액션을 재사용해 리셋 의미론(흐름/선택 정리) 보존.
  // 딥링크 시 늦게 도착한 setGraph가 activeDomainId를 비울 수 있으므로 그래프 로드에도
  // 반응해 URL을 재적용한다(가드로 멱등).
  useEffect(() => {
    const s = useDashboardStore.getState();
    if (domainId && s.activeDomainId !== domainId) {
      s.navigateToDomain(domainId);
    } else if (!domainId && s.activeDomainId) {
      s.clearActiveDomain();
    }
  }, [domainId, graph, domainGraph]);

  // URL(?flow=) → store — 인라인 스파인 선택 복원. 그래프가 준비된 뒤 1회 적용.
  const flowApplied = useRef(false);
  useEffect(() => {
    if (flowApplied.current || !domainGraph || !domainId) return;
    flowApplied.current = true;
    const flow = searchParams.get("flow");
    if (flow && useDashboardStore.getState().selectedFlowId !== flow) {
      useDashboardStore.getState().setSelectedFlow(flow);
    }
  }, [domainGraph, domainId, searchParams]);

  // store(selectedFlowId) → URL(?flow=) — 공유 가능한 딥링크(replace, 히스토리 오염 없음).
  useEffect(() => {
    if (!domainId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedFlowId) next.set("flow", selectedFlowId);
        else next.delete("flow");
        return next;
      },
      { replace: true },
    );
  }, [selectedFlowId, domainId, setSearchParams]);

  return (
    <div className="h-full w-full relative bg-root text-text-primary">
      {activeDomainId ? <FlowListView /> : <DomainMapView />}
    </div>
  );
}
