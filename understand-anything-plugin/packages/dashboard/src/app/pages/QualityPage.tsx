import { lazy, Suspense } from "react";

const QualityView = lazy(() => import("../../components/QualityView")); // ktds-fork (메뉴 개편 2차)

/** 품질·위험(risk-report · coverage · 골든셋) 섹션 — pmpl-proto pg-quality. */
export default function QualityPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <QualityView />
      </Suspense>
    </div>
  );
}
