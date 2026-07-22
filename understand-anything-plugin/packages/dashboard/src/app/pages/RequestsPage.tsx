import { lazy, Suspense } from "react";

const RtmView = lazy(() => import("../../components/RtmView")); // 셸 공유 — variant 로 세션 워크스페이스만 렌더

/**
 * 작업 요청 섹션 — 요청 세션 워크스페이스(6단계 인테이크 + 세션 원장).
 * 추적표 "요청 세션" 탭에서 메뉴로 승격(2026-07-22) — 세션 원장·세션별 문서가 고유 산출물이 되어
 * 메뉴=산출물 1:1 관례를 충족한다. 셸은 RtmView 를 공유한다: ⑤·⑥이 rtm.json 과 상호작용하고
 * IntakePanel 서브트리가 RtmContext 를 소비하므로, 컨텍스트 분리보다 variant 렌더가 최소 침습.
 */
export default function RequestsPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <RtmView variant="requests" />
      </Suspense>
    </div>
  );
}
