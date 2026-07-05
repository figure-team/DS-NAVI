import { lazy, Suspense } from "react";

const ScreenSpecView = lazy(() => import("../../components/ScreenSpecView")); // ktds-fork (S4): 화면설계서

/** 화면설계서 섹션 — 캡처+배지+범례 풀페이지. */
export default function ScreenspecPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <ScreenSpecView />
      </Suspense>
    </div>
  );
}
