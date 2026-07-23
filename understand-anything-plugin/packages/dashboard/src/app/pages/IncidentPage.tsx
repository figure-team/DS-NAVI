import { lazy, Suspense } from "react";

const IncidentView = lazy(() => import("../../components/IncidentView")); // ktds (장애 분석)

/** 장애 분석 섹션 — DS-APM RCA 리포트 드롭 → 해결방안(INCIDENT_ANALYSIS_DESIGN §2.4). */
export default function IncidentPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <IncidentView />
      </Suspense>
    </div>
  );
}
