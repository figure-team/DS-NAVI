import { useDashboardStore } from "../../store";
import DomainMapView from "../../components/DomainMapView"; // ktds-fork: 도메인 지도 (화면 1)
import FlowListView from "../../components/FlowListView"; // ktds-fork: 기능 목록 + 인라인 스파인 (화면 2)

/**
 * 도메인 섹션 — 완전 독립 풀페이지 (ktds-fork).
 * 지도→흐름목록 전환은 store의 activeDomainId가 담당(P3에서 /domains/:domainId로 승격).
 * 브레드크럼은 셸 TopBar가 렌더한다.
 */
export default function DomainsPage() {
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  return (
    <div className="h-full w-full relative bg-root text-text-primary">
      {activeDomainId ? <FlowListView /> : <DomainMapView />}
    </div>
  );
}
