import { lazy, Suspense } from "react";

const ReportView = lazy(() => import("../../components/ReportView")); // ktds-fork (메뉴 개편 2차)

/** 실적 보고서(work-summary) 섹션 — pmpl-proto pg-report. */
export default function ReportPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <ReportView />
      </Suspense>
    </div>
  );
}
