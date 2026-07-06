import { lazy, Suspense } from "react";

const ChangeImpactView = lazy(() => import("../../components/ChangeImpactView")); // ktds-fork (메뉴 개편 2차)

/** 변경·영향 분석(impact.json CR 단위) 섹션 — pmpl-proto pg-change. */
export default function ChangePage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <ChangeImpactView />
      </Suspense>
    </div>
  );
}
