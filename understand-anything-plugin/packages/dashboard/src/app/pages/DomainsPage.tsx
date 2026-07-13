import { useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router";
import { useDashboardStore } from "../../store";
import DomainMapView from "../../components/DomainMapView"; // ktds-fork: 도메인 지도 (화면 1)
import FlowListView from "../../components/FlowListView"; // ktds-fork: 기능 목록 + 인라인 스파인 (화면 2)
import GroupWorkspaceView from "../../components/GroupWorkspaceView"; // DOMAIN_HIERARCHY §7: 그룹 워크스페이스
import { resolveDomainRoute, resolveGroups } from "../../utils/domainGroups";
import { useI18n } from "../../contexts/I18nContext";

/**
 * 도메인 섹션 — 완전 독립 풀페이지 (ktds-fork).
 * P3: URL이 진실 — /domains(지도) ↔ /domains/:domainId(흐름 목록), 인라인 스파인
 * 선택은 ?flow=. 뷰들의 전환 버튼은 navigate()로 재배선됐고, 여기서는 URL→store
 * 단방향 동기화만 한다(뷰 내부 읽기는 기존 store 필드 그대로).
 *
 * DOMAIN_HIERARCHY §7: ktdsMap.groups가 있는 프로젝트는 세 번째 형태가 추가된다 —
 * /domains/:groupKey/:domainId(그룹 워크스페이스). 라우트 해석은 resolveDomainRoute
 * (순수 함수, domainGroups.ts)가 전담하고, 이 컴포넌트는 그 결과를 렌더/리다이렉트로
 * 옮기기만 한다. groups가 비어 있으면 resolveDomainRoute가 항상 "flat"을 반환하므로
 * 기존 평면 동작은 완전히 그대로다(회귀 0, D2 폴백 규약).
 */
export default function DomainsPage() {
  const params = useParams<{ domainId?: string; groupKey?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const activeDomainId = useDashboardStore((s) => s.activeDomainId);
  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const domainGroups = useDashboardStore((s) => s.domainGroups);
  const selectedFlowId = useDashboardStore((s) => s.selectedFlowId);

  // ?flow= 복원 1회 게이트 — 아래 세 이펙트가 공유(선언은 사용보다 앞서 둔다).
  const flowApplied = useRef(false);

  const resolvedGroups = useMemo(
    () => (domainGraph ? resolveGroups(domainGraph, domainGroups, t.domainMap.unclassified) : []),
    [domainGraph, domainGroups, t],
  );

  const resolved = useMemo(
    () => resolveDomainRoute(params, resolvedGroups),
    [params.domainId, params.groupKey, resolvedGroups],
  );

  const effectiveDomainId =
    resolved.kind === "flat" || resolved.kind === "group" ? resolved.domainId : null;

  // 딥링크 리다이렉트(§7): 그룹 랜딩(/domains/g:x)의 첫 서브도메인 자동 선택,
  // 구 딥링크(/domains/domain:x)의 소속 그룹 워크스페이스로 이동. ?flow=/?view=
  // 의미는 현재 쿼리스트링을 그대로 옮겨 보존한다(라이브 location 기준 — 기존 관례).
  useEffect(() => {
    if (resolved.kind !== "redirect") return;
    navigate({ pathname: resolved.to, search: window.location.search }, { replace: true });
  }, [resolved, navigate]);

  // URL(effectiveDomainId) → store — 기존 액션을 재사용해 리셋 의미론(흐름/선택 정리) 보존.
  // 딥링크 시 늦게 도착한 setGraph가 activeDomainId를 비울 수 있으므로 그래프 로드에도
  // 반응해 URL을 재적용한다(가드로 멱등).
  useEffect(() => {
    const s = useDashboardStore.getState();
    if (effectiveDomainId && s.activeDomainId !== effectiveDomainId) {
      // 도메인이 바뀌면 ?flow= 복원 1회 게이트를 재무장한다 — /domains/:id 는 단일
      // 라우트라 A→B 직행(교차 도메인 링크·뒤로가기)에서 remount 가 없다(리뷰 R2).
      flowApplied.current = false;
      s.navigateToDomain(effectiveDomainId);
    } else if (!effectiveDomainId && s.activeDomainId) {
      s.clearActiveDomain();
    }
  }, [effectiveDomainId, graph, domainGraph]);

  // URL(?flow=) → store — 인라인 스파인 선택 복원. 그래프가 준비된 뒤 1회 적용.
  useEffect(() => {
    if (flowApplied.current || !domainGraph || !effectiveDomainId) return;
    flowApplied.current = true;
    const flow = searchParams.get("flow");
    if (flow && useDashboardStore.getState().selectedFlowId !== flow) {
      useDashboardStore.getState().setSelectedFlow(flow);
    }
  }, [domainGraph, effectiveDomainId, searchParams]);

  // store(selectedFlowId) → URL(?flow=) — 공유 가능한 딥링크(replace, 히스토리 오염 없음).
  // P3 fix: 첫 로드(그래프 도착 전)에는 selectedFlowId 가 아직 null 이므로, 복원
  // 효과(flowApplied)가 실행되기 전에 ?flow= 를 지우면 딥링크 복원이 무산된다 —
  // 복원 시도 전에는 삭제를 보류한다(하위호환 파손 0, WORK_MAP AC).
  useEffect(() => {
    if (!effectiveDomainId) return;
    // 라이브 location 기준으로 쓴다 — react-router 함수형 updater 의 prev 는 렌더
    // 시점 스냅샷이라, 직전 틱의 navigate(예: 순서도 드릴다운의 view=code)를 스테일
    // 값으로 덮어쓴다(라이터 경합). history 반영은 동기이므로 window.location 이 진실.
    const next = new URLSearchParams(window.location.search);
    if (selectedFlowId) next.set("flow", selectedFlowId);
    else if (flowApplied.current) next.delete("flow");
    // 게이트가 history.replaceState 로 지운 ?token= 을 라우터의 초기 location
    // 스냅샷이 되살리는 것을 차단(토큰은 sessionStorage 가 진실).
    next.delete("token");
    setSearchParams(next, { replace: true });
  }, [selectedFlowId, effectiveDomainId, setSearchParams]);

  // P3: :domainId 딥링크는 store 동기화 전 한 프레임 동안 랜딩을 스치지 않는다 —
  // DomainMapView 의 system-map fetch 가 토큰 해석 전에 발사되는 transient 403 방지.
  // 리다이렉트 판정도 같은 이유로 빈 화면(전이 상태) — 목적지가 즉시 이펙트로 반영된다.
  return (
    <div className="h-full w-full relative bg-root text-text-primary">
      {resolved.kind === "landing" && <DomainMapView />}
      {resolved.kind === "flat" && (activeDomainId ? <FlowListView /> : null)}
      {resolved.kind === "group" && (
        <GroupWorkspaceView group={resolved.group} selectedDomainId={resolved.domainId} />
      )}
    </div>
  );
}
