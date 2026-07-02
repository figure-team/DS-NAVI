import { lazy, Suspense } from "react";

const RtmView = lazy(() => import("../../components/RtmView")); // ktds-fork (R2)

/** 요구사항 추적표(RTM) 섹션 — 자체 툴바를 가진 풀페이지. */
export default function RtmPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <RtmView />
      </Suspense>
    </div>
  );
}
