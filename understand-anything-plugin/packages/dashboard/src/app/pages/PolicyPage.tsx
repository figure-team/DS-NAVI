import { lazy, Suspense } from "react";

const PolicyView = lazy(() => import("../../components/PolicyView")); // ktds-fork (메뉴 개편 2차)

/** 정책서(policy-signals · 도메인 정책 · 대조) 섹션 — pmpl-proto pg-policy. */
export default function PolicyPage() {
  return (
    <div className="h-full w-full flex flex-col bg-root text-text-primary">
      <Suspense fallback={<div className="flex-1" />}>
        <PolicyView />
      </Suspense>
    </div>
  );
}
